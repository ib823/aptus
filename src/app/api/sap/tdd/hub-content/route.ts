/**
 * SAP Capability Catalogue — GET /api/sap/tdd/hub-content
 *
 * Serves every Business Accelerator Hub content type SAP publishes for S/4HANA
 * Cloud Public Edition, each with an honest status badge:
 *   ACTIVATED  — runtime endpoint probed live and returned 200
 *   AVAILABLE  — SAP publishes it, tenant hasn't activated it ("imagine activated")
 *   REFERENCE  — design-time content, not a tenant endpoint
 *
 * Filters: ?contentType= &status= &q= &page= &limit= &probe=0
 * Guarded exactly like the other SAP read routes. Read-only.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  getConfiguredSapTenants,
  getSapProduct,
  getSapTenant,
  isSapTddPublicAccessEnabled,
} from "@/lib/sap-public/tdd-connector";
import { probeTenantCapabilities } from "@/lib/sap-public/capability-probe";
import { mergeProbeTargets } from "@/lib/sap-public/dynamic-catalog";
import type { SapServiceDefinition } from "@/lib/sap-public/tdd-connector";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  hubApiToService,
  hubAvailabilityQualifier,
  httpToRuntimeStatus,
  isHubContentType,
  isRuntimeType,
  pathToApiId,
  resolveHubStatus,
  type HubContentType,
  type HubStatus,
} from "@/lib/sap-public/hub-content";
import { ERROR_CODES } from "@/types/api";

const RUNTIME_TYPES = HUB_CONTENT_TYPES.filter(isRuntimeType);
// Runtime types that carry a probeable read endpoint (everything runtime except
// EVENTs, which are subscribe-only → AVAILABLE and never NOT_CHECKED).
const RUNTIME_PROBEABLE_TYPES = RUNTIME_TYPES.filter((t) => t !== "EVENT");
const REFERENCE_TYPES = HUB_CONTENT_TYPES.filter((t) => !isRuntimeType(t));
const PROBE_CAP = 60; // bound the live probe like the capabilities route

/**
 * ONE probe = one source of truth. Probe the SAME curated-first set the working
 * Tenant Capabilities panel uses (curated S4HANA_SERVICES known-good paths FIRST
 * — regardless of alphabetical position or apiType classification — then the
 * dynamic OData V2 rows), and return the exposed set keyed by apiId so it maps
 * back to SapHubContent.externalId. Never ACTIVATED without a real 200.
 */
async function probeActivatedApiIds(
  prefix: string,
  tenant: { key: string; label: string; baseUrl: string },
  product: { services: SapServiceDefinition[] },
  dataProbe: boolean,
): Promise<{ outcomes: Map<string, number>; dataConfirmed: Set<string>; probed: number }> {
  const select = { contentType: true, apiType: true, externalId: true, title: true, packageId: true, communicationScenarios: true } as const;
  // Sample both V2 (reliable path) and V4 (best-effort path) so V4 rows can also
  // reach ACTIVATED — alphabetical ordering alone never reaches the CE_* (V4) set.
  const [v2rows, v4rows] = await Promise.all([
    prisma.sapHubContent.findMany({
      where: { appliesToPublic: true, contentType: { in: ["API", "CDS_VIEW"] }, apiType: "ODATAV2" },
      select,
      orderBy: { externalId: "asc" },
      take: 45,
    }),
    prisma.sapHubContent.findMany({
      where: { appliesToPublic: true, contentType: { in: ["API", "CDS_VIEW"] }, apiType: "ODATAV4" },
      select,
      orderBy: { externalId: "asc" },
      take: 25,
    }),
  ]);
  const dynamic = [...v2rows, ...v4rows]
    .map((a) => hubApiToService({ ...a, contentType: a.contentType as HubContentType }))
    .filter((s): s is NonNullable<typeof s> => s !== null);
  // Curated FIRST, re-keyed by apiId (last path segment) so an exposed result's
  // `service` equals the SapHubContent externalId, not the display key.
  const curated = product.services.map((s) => ({ ...s, key: pathToApiId(s.path) }));
  const targets = mergeProbeTargets(curated, dynamic, PROBE_CAP);
  if (targets.length === 0) return { outcomes: new Map(), dataConfirmed: new Set(), probed: 0 };
  const results = await probeTenantCapabilities(prefix, tenant, targets, 4, { dataProbe });
  // Keep the FULL outcome (HTTP status) per probed service — not just the 200s —
  // so the badge can distinguish 200/403/404, and un-probed stays NOT_CHECKED.
  const outcomes = new Map<string, number>();
  for (const r of results) outcomes.set(r.service, r.status);
  return {
    outcomes,
    dataConfirmed: new Set(results.filter((r) => r.dataConfirmed).map((r) => r.service)),
    probed: targets.length,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const product = getSapProduct(params.get("product"));
  if (!product) {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!isSapTddPublicAccessEnabled(product.envPrefix) && !user) {
    return NextResponse.json({ error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } }, { status: 401 });
  }
  // Lets the client show the admin-only rebuild control (server still enforces).
  const isAdmin = Boolean(user) && isAdminRole(user!.role);

  // ── parse filters ──────────────────────────────────────────────────────
  const typeParam = params.get("contentType");
  const contentType: HubContentType | null = typeParam && isHubContentType(typeParam) ? typeParam : null;
  const statusParam = (params.get("status") ?? "ALL").toUpperCase();
  const VALID_STATUS: HubStatus[] = ["ACTIVATED", "NEEDS_SETUP", "NOT_FOUND", "NOT_CHECKED", "AVAILABLE", "REFERENCE"];
  const status: HubStatus | "ALL" = (VALID_STATUS as string[]).includes(statusParam) ? (statusParam as HubStatus) : "ALL";
  const q = (params.get("q") ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
  const probeEnabled = params.get("probe") !== "0";

  // ── empty-catalogue note ───────────────────────────────────────────────
  const totalRows = await prisma.sapHubContent.count({ where: { appliesToPublic: true } });
  if (totalRows === 0) {
    return NextResponse.json({
      data: {
        note: "SapHubContent is empty — import the catalogue: `pnpm sap:hub:import` (ships an illustrative seed) or drop hub-content exports in sap-references/.",
        items: [],
        total: 0,
        page,
        limit,
        counts: { byType: {}, byStatus: { ACTIVATED: 0, NEEDS_SETUP: 0, NOT_FOUND: 0, NOT_CHECKED: 0, AVAILABLE: 0, REFERENCE: 0 } },
        catalogueImported: false,
        tenant: null,
        isAdmin,
      },
    });
  }

  // ── resolve the tenant + activated set (bounded live probe) ────────────
  const tenantKey = params.get("tenant") ?? getConfiguredSapTenants(product.envPrefix)[0]?.key;
  const tenant = tenantKey ? getSapTenant(product.envPrefix, tenantKey) : null;
  const dataProbe = params.get("dataProbe") === "1"; // opt-in 1-row read to data-confirm
  let outcomes = new Map<string, number>();
  let dataConfirmed = new Set<string>();
  let probed = 0;
  if (tenant && probeEnabled) {
    try {
      const r = await probeActivatedApiIds(product.envPrefix, tenant, product, dataProbe);
      outcomes = r.outcomes;
      dataConfirmed = r.dataConfirmed;
      probed = r.probed;
    } catch {
      outcomes = new Map(); // probe failure → nothing probed (honest); runtime rows → NOT_CHECKED
      dataConfirmed = new Set();
      probed = 0;
    }
  }
  // Partition the probed services by their confirmed HTTP outcome. Only these
  // ids carry a definite status; every other runtime row is NOT_CHECKED.
  const activatedIds: string[] = [];
  const needsSetupIds: string[] = [];
  const notFoundIds: string[] = [];
  for (const [svc, http] of outcomes) {
    const s = httpToRuntimeStatus(http);
    if (s === "ACTIVATED") activatedIds.push(svc);
    else if (s === "NEEDS_SETUP") needsSetupIds.push(svc);
    else if (s === "NOT_FOUND") notFoundIds.push(svc);
  }
  // Conclusively-probed = the three definite buckets; anything else runtime is
  // NOT_CHECKED (includes inconclusive 0/5xx probes and everything beyond the cap).
  const conclusiveIds = [...activatedIds, ...needsSetupIds, ...notFoundIds];

  // ── build the WHERE from filters (status pre-filters at SQL level) ─────
  const and: Prisma.SapHubContentWhereInput[] = [{ appliesToPublic: true }];
  if (contentType) and.push({ contentType });
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { externalId: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (status === "REFERENCE") {
    and.push({ contentType: { in: REFERENCE_TYPES } });
  } else if (status === "AVAILABLE") {
    // AVAILABLE now means subscribe-only EVENTs (no read endpoint to probe).
    and.push({ contentType: "EVENT" });
  } else if (status === "ACTIVATED") {
    and.push(activatedIds.length ? { externalId: { in: activatedIds } } : { id: "__none__" });
  } else if (status === "NEEDS_SETUP") {
    and.push(needsSetupIds.length ? { externalId: { in: needsSetupIds } } : { id: "__none__" });
  } else if (status === "NOT_FOUND") {
    and.push(notFoundIds.length ? { externalId: { in: notFoundIds } } : { id: "__none__" });
  } else if (status === "NOT_CHECKED") {
    // Probeable runtime rows we could NOT confirm (beyond the cap / inconclusive).
    and.push({ contentType: { in: RUNTIME_PROBEABLE_TYPES } });
    if (conclusiveIds.length) and.push({ NOT: { externalId: { in: conclusiveIds } } });
  }
  const where: Prisma.SapHubContentWhereInput = { AND: and };

  // ── page of items + total ──────────────────────────────────────────────
  const [total, rows] = await Promise.all([
    prisma.sapHubContent.count({ where }),
    prisma.sapHubContent.findMany({
      where,
      orderBy: [{ contentType: "asc" }, { itemCount: "desc" }, { title: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    contentType: r.contentType,
    externalId: r.externalId,
    title: r.title,
    description: r.description,
    packageId: r.packageId,
    apiType: r.apiType,
    communicationScenarios: r.communicationScenarios,
    scopeItemCodes: r.scopeItemCodes,
    itemCount: r.itemCount,
    hubUrl: r.hubUrl,
    status: resolveHubStatus({ contentType: r.contentType as HubContentType, apiType: r.apiType, externalId: r.externalId }, outcomes),
    availabilityNote: hubAvailabilityQualifier(r.contentType as HubContentType),
    dataConfirmed: dataConfirmed.has(r.externalId),
  }));

  // ── counts across the full edition set (ignoring the type/status filter
  //    so the chips always show the whole menu) ──────────────────────────
  const grouped = await prisma.sapHubContent.groupBy({
    by: ["contentType"],
    where: q
      ? {
          appliesToPublic: true,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { externalId: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : { appliesToPublic: true },
    _count: { _all: true },
  });
  const byType: Record<string, number> = {};
  let runtimeTotal = 0;
  let referenceTotal = 0;
  for (const g of grouped) {
    byType[g.contentType] = g._count._all;
    if (isRuntimeType(g.contentType as HubContentType)) runtimeTotal += g._count._all;
    else referenceTotal += g._count._all;
  }
  // Reconcile counts with the outcome taxonomy. EVENTs are the only AVAILABLE
  // rows; every other runtime row is either conclusively probed or NOT_CHECKED.
  const eventCount = byType["EVENT"] ?? 0;
  const probeableRuntimeRows = Math.max(0, runtimeTotal - eventCount);
  const activatedCount = activatedIds.length;
  const needsSetupCount = needsSetupIds.length;
  const notFoundCount = notFoundIds.length;
  const notCheckedCount = Math.max(0, probeableRuntimeRows - activatedCount - needsSetupCount - notFoundCount);
  const byStatus: Record<HubStatus, number> = {
    ACTIVATED: activatedCount,
    NEEDS_SETUP: needsSetupCount,
    NOT_FOUND: notFoundCount,
    NOT_CHECKED: notCheckedCount,
    AVAILABLE: eventCount,
    REFERENCE: referenceTotal,
  };

  // Honest scorecard denominator: discrete probeable runtime services (API + CDS
  // as OData V2 reliably, or V4 best-effort) — NOT events, NOT grouped CDS sums.
  const probeableRuntime = await prisma.sapHubContent.count({
    where: { appliesToPublic: true, contentType: { in: ["API", "CDS_VIEW"] }, apiType: { in: ["ODATAV2", "ODATAV4"] } },
  });

  return NextResponse.json({
    data: {
      items,
      total,
      page,
      limit,
      counts: { byType, byStatus, probeableRuntime, probed, dataConfirmed: dataConfirmed.size, dataProbe },
      catalogueImported: true,
      tenant: tenant?.label ?? null,
      isAdmin,
      typeMeta: HUB_CONTENT_TYPE_META,
    },
  });
}
