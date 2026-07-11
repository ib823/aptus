/**
 * POST /api/sap/tdd/hub-content/seed — admin-gated rebuild of the API slice of
 * the Capability Catalogue.
 *
 * 1. Projects the REAL public SapApiReference rows into SapHubContent
 *    (contentType=API), deriving a real line of business per row
 *    (ScopeItem.functionalArea via scope codes → keyword classifier → "Other")
 *    and storing it in packageId — so grouping isn't all "Other".
 * 2. Injects the curated S4HANA_SERVICES (the known tenant-exposed services)
 *    as API rows with apiType=ODATAV2, so every service the tenant demonstrably
 *    exposes has a row that badges ACTIVATED and the scorecard + list agree.
 *
 * Runs IN the deployment runtime (ambient DATABASE_URL — no secret moves).
 * Additive + idempotent (upsert by contentType+externalId). Non-API content
 * types are never fabricated.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma, SapHubContentType } from "@prisma/client";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { classifyApiTypeById, pathToApiId } from "@/lib/sap-public/hub-content";
import { resolveLineOfBusiness } from "@/lib/sap-public/hub-lob";
import { resolveActivePublicCatalogVersionId } from "@/lib/sap-public/hub-dependencies";
import { logDecision } from "@/lib/audit/decision-logger";
import type { UserRole } from "@/types/assessment";
import { ERROR_CODES } from "@/types/api";

const CONFIRMATION = "REBUILD SAP HUB CATALOGUE";
const API: SapHubContentType = "API" as SapHubContentType;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  let body: { confirmation?: unknown };
  try {
    body = (await request.json()) as { confirmation?: unknown };
  } catch {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } }, { status: 400 });
  }
  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Confirmation phrase required: "${CONFIRMATION}"` } },
      { status: 400 },
    );
  }

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

  let imported = 0;
  let apiTypeBackfilled = 0;
  const byLob: Record<string, number> = {};
  for (const a of apis) {
    if (a.apiType == null && classifyApiTypeById(a.apiId) != null) apiTypeBackfilled++;
    const fas = a.scopeItemCodes.map((c) => codeToFA.get(c)).filter((f): f is string => Boolean(f));
    const lob = resolveLineOfBusiness(fas, a.apiName);
    byLob[lob] = (byLob[lob] ?? 0) + 1;
    const data = {
      title: a.apiName,
      description: a.description ?? "",
      packageId: lob,
      appliesToPublic: true,
      appliesToPrivate: false,
      appliesToOnPrem: false,
      status: a.status,
      // Backfill apiType from the technical-id convention when the export left
      // it null (never a type that yields a broken probe path; else stays null).
      apiType: a.apiType ?? classifyApiTypeById(a.apiId),
      communicationScenarios: a.communicationScenarios,
      scopeItemCodes: a.scopeItemCodes,
      itemCount: null,
      hubUrl: a.apiHubUrl,
      rawMetadataJson: { source: "SapApiReference", apiId: a.apiId } as Prisma.InputJsonValue,
    };
    await prisma.sapHubContent.upsert({
      where: { contentType_externalId: { contentType: API, externalId: a.apiId } },
      create: { contentType: API, externalId: a.apiId, ...data },
      update: data,
    });
    imported++;
  }

  // Inject the curated known-exposed services (S4HANA_SERVICES) as API rows so
  // every service the tenant demonstrably exposes has a row that can badge
  // ACTIVATED. apiType=ODATAV2 makes them probeable + consistent with the 128.
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
        hubUrl: `https://api.sap.com/api/${apiId}`,
        rawMetadataJson: { source: "curated", key: svc.key } as Prisma.InputJsonValue,
      },
      // For rows that already exist (from SapApiReference), keep their data but
      // make them probeable + give them the curated LoB.
      update: { apiType: "ODATAV2", packageId: lob },
    });
    injected++;
  }

  const total = await prisma.sapHubContent.count();
  const apiTotal = await prisma.sapHubContent.count({ where: { contentType: API } });
  try {
    await logDecision({
      assessmentId: "system",
      entityType: "sap_hub_seed",
      entityId: "hub-content-api-rebuild",
      action: "SAP_HUB_SEED_IMPORTED",
      newValue: { source: "SapApiReference", imported, injected, apiTypeBackfilled, apiTotal, total, byLob },
      actor: auth.user.email ?? "system",
      actorRole: (auth.user.role ?? "system") as UserRole,
    });
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json({ data: { imported, injected, apiTypeBackfilled, apiTotal, total, byLob, source: "SapApiReference" } });
}
