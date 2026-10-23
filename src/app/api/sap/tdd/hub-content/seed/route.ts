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
import { getSapProduct, getSapServices } from "@/lib/sap-public/tdd-connector";
import { classifyApiTypeById, isHubContentType, serviceApiId, type HubContentType } from "@/lib/sap-public/hub-content";
import { BUNDLED_HUB_CONTENT, BUNDLED_HUB_TYPES, COUNT_ONLY_HUB_TYPES } from "@/lib/sap-public/hub-content-bundled";
import { refreshApiProvenance } from "@/lib/sap-public/hub-probe-store";
import { normalizeHubRowForType } from "@/lib/sap-public/hub-import";
import { hubLifecycleFields } from "@/lib/sap-public/hub-import";
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
  /*
   * EVERY ADDRESSABLE ROW, NOT JUST PUBLIC. The projection filtered
   * `appliesToPublic: true` and then stamped every projected row
   * Public/false/false — so the private and on-prem catalogues SAP publishes
   * (and the importer correctly flags) never existed in SapHubContent, and
   * the SuccessFactors/Ariba rows (no edition flag, product tag only) were
   * unreachable by construction. The per-product filtering now happens at
   * READ time via hubCatalogueScope; the projection's job is to carry each
   * row's real identity. A row with no edition flag and no product tag is
   * addressable by no scope and is left out rather than stored dark.
   */
  const apis = await prisma.sapApiReference.findMany({
    where: {
      OR: [
        { appliesToPublic: true },
        { appliesToPrivate: true },
        { appliesToOnPrem: true },
        { productTags: { not: null } },
      ],
    },
    select: {
      apiId: true,
      apiName: true,
      description: true,
      status: true,
      apiType: true,
      communicationScenarios: true,
      scopeItemCodes: true,
      apiHubUrl: true,
      appliesToPublic: true,
      appliesToPrivate: true,
      appliesToOnPrem: true,
      productTags: true,
      hubState: true,
      hubVersion: true,
      hubModifiedAt: true,
      hubSubType: true,
      catalogueRelease: true,
      successorExternalId: true,
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

  /*
   * Preserve tenant-keyed probe status across a rebuild. The API-slice upsert
   * refreshes metadata, but its rawMetadataJson ({source, apiId}) must NOT wipe
   * the stored probes[tenantKey] written by Probe-all — else "Rebuild from API
   * reference" would reset every Activated row to Not-checked.
   *
   * NOT BY SNAPSHOT (audit A23). This used to read every API row's
   * rawMetadataJson once, here, and write `{ ...thatCopy, source, apiId }` back
   * over each row as the loop reached it. Every probe stored after the copy was
   * taken — by any organization's Probe-all running alongside — was reverted to
   * the copy's version, for every organization at once. So the update below no
   * longer writes rawMetadataJson at all, and the two keys the Rebuild owns are
   * merged into each row's CURRENT value afterwards (refreshApiProvenance).
   */
  let imported = 0;
  let apiTypeBackfilled = 0;
  const byLob: Record<string, number> = {};
  // The Rebuild is an import: every row it projects or injects is stamped
  // with when (P0.3, A29). Catalogue Health reads this, never `updatedAt`,
  // which every capability probe moves too.
  const importedAt = new Date();
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
      // The row's REAL identity, from the importer's classification — never a
      // blanket Public stamp (see the projection comment above).
      appliesToPublic: a.appliesToPublic,
      appliesToPrivate: a.appliesToPrivate,
      appliesToOnPrem: a.appliesToOnPrem,
      productTags: a.productTags,
      status: a.status,
      apiType: a.apiType ?? classifyApiTypeById(a.apiId),
      communicationScenarios: a.communicationScenarios,
      scopeItemCodes: a.scopeItemCodes,
      itemCount: null,
      importedAt,
      // Projected from real SapApiReference rows — SAP-published, not seed.
      illustrative: false,
      hubUrl: a.apiHubUrl,
      /*
       * P0.8 — SAP'S LIFECYCLE TRAVELS WITH THE ROW. The projection never
       * copied it, so a Rebuild left every API row's hubState null and the
       * deprecated ones read as live services. Copied only when the reference
       * HAS a state: a reference imported before the lifecycle columns must not
       * erase what the deploy-time stamp (scripts/apply-hub-lifecycle.ts) put
       * on the catalogue row; a recorded successor is never cleared either.
       */
      ...(a.hubState
        ? {
            hubState: a.hubState,
            hubVersion: a.hubVersion,
            hubModifiedAt: a.hubModifiedAt,
            hubSubType: a.hubSubType,
            catalogueRelease: a.catalogueRelease,
            ...(a.successorExternalId ? { successorExternalId: a.successorExternalId } : {}),
          }
        : {}),
    };
    // A NEW row has no stored probe to preserve, so it is created with freshRaw.
    // An EXISTING row's rawMetadataJson is left alone here: probes (and any
    // sibling keys) stay exactly as the database holds them, and source/apiId
    // are merged in below.
    await prisma.sapHubContent.upsert({
      where: { contentType_externalId: { contentType: API, externalId: a.apiId } },
      create: { contentType: API, externalId: a.apiId, ...data, rawMetadataJson: freshRaw as Prisma.InputJsonValue },
      update: data,
    });
    imported++;
  }
  await refreshApiProvenance(apis.map((a) => a.apiId));

  // Inject the curated known-exposed services (S4HANA_SERVICES) as API rows.
  const s4 = getSapProduct("s4hana");
  const curated = s4 ? getSapServices(s4) : [];
  let injected = 0;
  for (const svc of curated) {
    // 2608 WS4: a V4 path ends in a version segment, so the apiId is the
    // declared hubApiId (CE_PURCHASEORDER_0001), and apiType follows protocol.
    const apiId = serviceApiId(svc);
    const apiType = svc.protocol ?? "ODATAV2";
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
        apiType,
        communicationScenarios: svc.scenario ? [svc.scenario] : [],
        scopeItemCodes: [],
        // Curated = services this repo has really called, not placeholders.
        illustrative: false,
        hubUrl: `https://api.sap.com/api/${apiId}`,
        rawMetadataJson: { source: "curated", key: svc.key } as Prisma.InputJsonValue,
        importedAt,
      },
      update: { apiType, packageId: lob, importedAt },
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
      productTags: norm.productTags,
      status: norm.status,
      apiType: norm.apiType,
      communicationScenarios: norm.communicationScenarios,
      scopeItemCodes: norm.scopeItemCodes,
      itemCount: norm.itemCount,
      illustrative: norm.illustrative,
      hubUrl: norm.hubUrl,
      ...hubLifecycleFields(norm),
      // The import time Catalogue Health judges freshness from (P0.3, A29).
      importedAt: new Date(importedAt),
      // Provenance; release = the Hub package release when the row carries it.
      rawMetadataJson: { source: `bundled:${type}`, release: norm.catalogueRelease, importedAt, raw: norm.rawJson } as Prisma.InputJsonValue,
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
        assessmentId: null,
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
