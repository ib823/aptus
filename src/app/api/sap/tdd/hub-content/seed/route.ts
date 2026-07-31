/**
 * POST /api/sap/tdd/hub-content/seed — admin-gated rebuild of the Capability
 * Catalogue. Body: { confirmation, contentType? }.
 *
 *   contentType absent | "API"   → project the REAL public SapApiReference rows
 *                                   into SapHubContent (contentType=API) + inject
 *                                   the curated S4HANA_SERVICES. (unchanged)
 *   contentType = a bundled type → import that type from the repo-bundled
 *                                   sap-references/hub-content/<TYPE>.json.
 *   contentType = "ALL"          → the API slice + every bundled non-API type.
 *   CDS_VIEW / BADI              → refused: count-only (too large to bundle);
 *                                   import via `pnpm sap:hub:import` to a dev DB.
 *
 * Runs IN the deployment runtime (ambient DATABASE_URL — no secret moves).
 * Additive + idempotent (upsert by contentType+externalId). Never deletes or
 * mutates SapApiReference; never fabricates rows.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma, SapHubContentType } from "@prisma/client";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { classifyApiTypeById, isHubContentType, pathToApiId, type HubContentType } from "@/lib/sap-public/hub-content";
import { BUNDLED_HUB_CONTENT, BUNDLED_HUB_TYPES, COUNT_ONLY_HUB_TYPES } from "@/lib/sap-public/hub-content-bundled";
import { normalizeHubRowForType } from "@/lib/sap-public/hub-import";
import { resolveLineOfBusiness } from "@/lib/sap-public/hub-lob";
import { resolveActivePublicCatalogVersionId } from "@/lib/sap-public/hub-dependencies";
import { logDecision } from "@/lib/audit/decision-logger";
import type { DecisionAction, UserRole } from "@/types/assessment";
import { ERROR_CODES } from "@/types/api";

const CONFIRMATION = "REBUILD SAP HUB CATALOGUE";
const API: SapHubContentType = "API" as SapHubContentType;

interface ApiSliceStats {
  imported: number;
  injected: number;
  apiTypeBackfilled: number;
  apiTotal: number;
  total: number;
  byLob: Record<string, number>;
}

/** Project SapApiReference → SapHubContent(API) + inject curated services. */
async function rebuildApiSlice(): Promise<ApiSliceStats> {
  const apis = await prisma.sapApiReference.findMany({
    where: { appliesToPublic: true },
    select: {
      apiId: true,
      apiName: true,
      description: true,
      status: true,
      apiType: true,
      communicationScenarios: true,
      scopeItemCodes: true,
      apiHubUrl: true,
    },
  });

  // One ScopeItem lookup → scopeCode → functionalArea map (for real LoB).
  const allCodes = [...new Set(apis.flatMap((a) => a.scopeItemCodes))];
  const versionId = await resolveActivePublicCatalogVersionId(prisma);
  const scopeItems = allCodes.length
    ? await prisma.scopeItem.findMany({
        where: { scopeCode: { in: allCodes }, ...(versionId ? { catalogVersionId: versionId } : {}) },
        select: { scopeCode: true, functionalArea: true },
      })
    : [];
  const codeToFA = new Map<string, string>();
  for (const si of scopeItems) if (si.functionalArea && !codeToFA.has(si.scopeCode)) codeToFA.set(si.scopeCode, si.functionalArea);

  // Preserve tenant-keyed probe status across a rebuild. The API-slice upsert
  // refreshes metadata, but its rawMetadataJson ({source, apiId}) must NOT wipe
  // the stored probes[tenantKey] written by Probe-all — else "Rebuild from API
  // reference" would reset every Activated row to Not-checked. Read each row's
  // existing rawMetadataJson first, then MERGE on update (see below).
  const existingRaw = new Map<string, Record<string, unknown>>();
  const existingApiRows = await prisma.sapHubContent.findMany({
    where: { contentType: API },
    select: { externalId: true, rawMetadataJson: true },
  });
  for (const r of existingApiRows) {
    if (r.rawMetadataJson && typeof r.rawMetadataJson === "object" && !Array.isArray(r.rawMetadataJson)) {
      existingRaw.set(r.externalId, r.rawMetadataJson as Record<string, unknown>);
    }
  }

  let imported = 0;
  let apiTypeBackfilled = 0;
  const byLob: Record<string, number> = {};
  for (const a of apis) {
    if (a.apiType == null && classifyApiTypeById(a.apiId) != null) apiTypeBackfilled++;
    const fas = a.scopeItemCodes.map((c) => codeToFA.get(c)).filter((f): f is string => Boolean(f));
    const lob = resolveLineOfBusiness(fas, a.apiName);
    byLob[lob] = (byLob[lob] ?? 0) + 1;
    const freshRaw = { source: "SapApiReference", apiId: a.apiId };
    const data = {
      title: a.apiName,
      description: a.description ?? "",
      packageId: lob,
      appliesToPublic: true,
      appliesToPrivate: false,
      appliesToOnPrem: false,
      status: a.status,
      apiType: a.apiType ?? classifyApiTypeById(a.apiId),
      communicationScenarios: a.communicationScenarios,
      scopeItemCodes: a.scopeItemCodes,
      itemCount: null,
      // Projected from real SapApiReference rows — SAP-published, not seed.
      illustrative: false,
      hubUrl: a.apiHubUrl,
      rawMetadataJson: freshRaw as Prisma.InputJsonValue,
    };
    // On UPDATE, spread the existing rawMetadataJson first so probes (and any
    // sibling keys) survive; freshRaw only refreshes source/apiId.
    const prevRaw = existingRaw.get(a.apiId);
    const mergedRaw = (prevRaw ? { ...prevRaw, ...freshRaw } : freshRaw) as Prisma.InputJsonValue;
    await prisma.sapHubContent.upsert({
      where: { contentType_externalId: { contentType: API, externalId: a.apiId } },
      create: { contentType: API, externalId: a.apiId, ...data },
      update: { ...data, rawMetadataJson: mergedRaw },
    });
    imported++;
  }

  // Inject the curated known-exposed services (S4HANA_SERVICES) as API rows.
  const curated = getSapProduct("s4hana")?.services ?? [];
  let injected = 0;
  for (const svc of curated) {
    const apiId = pathToApiId(svc.path);
    const lob = svc.domain || resolveLineOfBusiness([], svc.label);
    await prisma.sapHubContent.upsert({
      where: { contentType_externalId: { contentType: API, externalId: apiId } },
      create: {
        contentType: API,
        externalId: apiId,
        title: svc.label,
        description: "",
        packageId: lob,
        appliesToPublic: true,
        status: "Active",
        apiType: "ODATAV2",
        communicationScenarios: svc.scenario ? [svc.scenario] : [],
        scopeItemCodes: [],
        // Curated = services this repo has really called, not placeholders.
        illustrative: false,
        hubUrl: `https://api.sap.com/api/${apiId}`,
        rawMetadataJson: { source: "curated", key: svc.key } as Prisma.InputJsonValue,
      },
      update: { apiType: "ODATAV2", packageId: lob },
    });
    injected++;
  }

  const total = await prisma.sapHubContent.count();
  const apiTotal = await prisma.sapHubContent.count({ where: { contentType: API } });
  return { imported, injected, apiTypeBackfilled, apiTotal, total, byLob };
}

interface TypeImportStats {
  contentType: HubContentType;
  inserted: number;
  updated: number;
  skipped: number;
}

/** Import one bundled non-API type from its repo-bundled JSON. Never touches API. */
async function importBundledType(type: HubContentType, importedAt: string): Promise<TypeImportStats> {
  const ct = type as SapHubContentType;
  const raw = BUNDLED_HUB_CONTENT[type] ?? [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of raw) {
    const norm = normalizeHubRowForType(row, type);
    if (!norm) {
      skipped++;
      continue;
    }
    const data = {
      title: norm.title,
      description: norm.description,
      packageId: norm.packageId,
      appliesToPublic: norm.appliesToPublic,
      appliesToPrivate: norm.appliesToPrivate,
      appliesToOnPrem: norm.appliesToOnPrem,
      status: norm.status,
      apiType: norm.apiType,
      communicationScenarios: norm.communicationScenarios,
      scopeItemCodes: norm.scopeItemCodes,
      itemCount: norm.itemCount,
      illustrative: norm.illustrative,
      hubUrl: norm.hubUrl,
      // Provenance; release intentionally NOT pinned (counts are indicative).
      rawMetadataJson: { source: `bundled:${type}`, release: null, importedAt, raw: norm.rawJson } as Prisma.InputJsonValue,
    };
    const existing = await prisma.sapHubContent.findUnique({
      where: { contentType_externalId: { contentType: ct, externalId: norm.externalId } },
      select: { id: true, illustrative: true },
    });
    if (existing) {
      /*
       * AN ILLUSTRATIVE ROW MUST NOT REPLACE A REAL ONE — same rule as the
       * local script (scripts/import-sap-hub-content.ts), because this is the
       * same upsert against the same key and the hazard travels with it.
       * Whichever import ran last used to win, and the illustrative seed
       * carries placeholder text for ids that are genuinely published.
       */
      if (norm.illustrative && existing.illustrative === false) {
        skipped++;
        continue;
      }
      await prisma.sapHubContent.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.sapHubContent.create({ data: { contentType: ct, externalId: norm.externalId, ...data } });
      inserted++;
    }
  }
  return { contentType: type, inserted, updated, skipped };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  let body: { confirmation?: unknown; contentType?: unknown };
  try {
    body = (await request.json()) as { confirmation?: unknown; contentType?: unknown };
  } catch {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } }, { status: 400 });
  }
  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Confirmation phrase required: "${CONFIRMATION}"` } },
      { status: 400 },
    );
  }

  const target =
    typeof body.contentType === "string" && body.contentType.trim()
      ? body.contentType.toUpperCase().replace(/[\s-]+/g, "_")
      : "API";
  const importedAt = new Date().toISOString();
  const actor = auth.user; // narrowed above (isAdminError guard) — capture for the closure

  async function logImport(action: DecisionAction, newValue: Prisma.InputJsonValue): Promise<void> {
    try {
      await logDecision({
        assessmentId: "system",
        entityType: "sap_hub_seed",
        entityId: "hub-content-rebuild",
        action,
        newValue,
        actor: actor.email ?? "system",
        actorRole: (actor.role ?? "system") as UserRole,
      });
    } catch {
      /* audit is best-effort */
    }
  }

  // ── API slice (default / back-compat) ──────────────────────────────────────
  if (target === "API") {
    const stats = await rebuildApiSlice();
    await logImport("SAP_HUB_SEED_IMPORTED", { source: "SapApiReference", ...stats });
    return NextResponse.json({ data: { ...stats, source: "SapApiReference" } });
  }

  // ── all: API slice + every bundled non-API type ────────────────────────────
  if (target === "ALL") {
    const api = await rebuildApiSlice();
    const types: TypeImportStats[] = [];
    for (const t of BUNDLED_HUB_TYPES) types.push(await importBundledType(t, importedAt));
    await logImport("SAP_HUB_SEED_IMPORTED", { source: "all", api: { ...api }, types } as unknown as Prisma.InputJsonValue);
    return NextResponse.json({ data: { source: "all", api: { ...api, source: "SapApiReference" }, types } });
  }

  // ── count-only types: refused by design (never baked into the function) ────
  if ((COUNT_ONLY_HUB_TYPES as string[]).includes(target)) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `${target} is count-only (too large to bundle). Import it via \`pnpm sap:hub:import\` to a dev DB; the published-count tile is the honest resting state.`,
        },
      },
      { status: 400 },
    );
  }

  // ── one bundled non-API type ───────────────────────────────────────────────
  if (isHubContentType(target) && (BUNDLED_HUB_TYPES as string[]).includes(target)) {
    const stats = await importBundledType(target, importedAt);
    await logImport("SAP_HUB_TYPE_IMPORTED", { source: `bundled:${target}`, ...stats } as unknown as Prisma.InputJsonValue);
    return NextResponse.json({ data: { source: `bundled:${target}`, ...stats } });
  }

  return NextResponse.json(
    {
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Unknown contentType "${target}". Use "API", "ALL", or one of: ${BUNDLED_HUB_TYPES.join(", ")}.`,
      },
    },
    { status: 400 },
  );
}
