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
  isHubContentType,
  isRuntimeType,
  pathToApiId,
  resolveHubStatus,
  type HubContentType,
  type HubStatus,
} from "@/lib/sap-public/hub-content";
import { ERROR_CODES } from "@/types/api";

const RUNTIME_TYPES = HUB_CONTENT_TYPES.filter(isRuntimeType);
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
): Promise<{ activated: Set<string>; probed: number }> {
  const rows = await prisma.sapHubContent.findMany({
    where: { appliesToPublic: true, contentType: { in: ["API", "CDS_VIEW"] }, apiType: "ODATAV2" },
    select: { contentType: true, apiType: true, externalId: true, title: true, packageId: true, communicationScenarios: true },
    orderBy: { externalId: "asc" },
    take: PROBE_CAP,
  });
  const dynamic = rows
    .map((a) => hubApiToService({ ...a, contentType: a.contentType as HubContentType }))
    .filter((s): s is NonNullable<typeof s> => s !== null);
  // Curated FIRST, re-keyed by apiId (last path segment) so an exposed result's
  // `service` equals the SapHubContent externalId, not the display key.
  const curated = product.services.map((s) => ({ ...s, key: pathToApiId(s.path) }));
  const targets = mergeProbeTargets(curated, dynamic, PROBE_CAP);
  if (targets.length === 0) return { activated: new Set(), probed: 0 };
  const results = await probeTenantCapabilities(prefix, tenant, targets);
  return { activated: new Set(results.filter((r) => r.exposed).map((r) => r.service)), probed: targets.length };
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
  const status: HubStatus | "ALL" =
    statusParam === "ACTIVATED" || statusParam === "AVAILABLE" || statusParam === "REFERENCE" ? statusParam : "ALL";
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
        counts: { byType: {}, byStatus: { ACTIVATED: 0, AVAILABLE: 0, REFERENCE: 0 } },
        catalogueImported: false,
        tenant: null,
        isAdmin,
      },
    });
  }

  // ── resolve the tenant + activated set (bounded live probe) ────────────
  const tenantKey = params.get("tenant") ?? getConfiguredSapTenants(product.envPrefix)[0]?.key;
  const tenant = tenantKey ? getSapTenant(product.envPrefix, tenantKey) : null;
  let activated = new Set<string>();
  let probed = 0;
  if (tenant && probeEnabled) {
    try {
      const r = await probeActivatedApiIds(product.envPrefix, tenant, product);
      activated = r.activated;
      probed = r.probed;
    } catch {
      activated = new Set(); // probe failure → nothing ACTIVATED (honest); everything runtime AVAILABLE
      probed = 0;
    }
  }
  const activatedIds = [...activated];

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
  } else if (status === "ACTIVATED") {
    and.push(activatedIds.length ? { contentType: "API", externalId: { in: activatedIds } } : { id: "__none__" });
  } else if (status === "AVAILABLE") {
    and.push({ contentType: { in: RUNTIME_TYPES } });
    if (activatedIds.length) and.push({ NOT: { externalId: { in: activatedIds } } });
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
    status: resolveHubStatus({ contentType: r.contentType as HubContentType, apiType: r.apiType, externalId: r.externalId }, activated),
    availabilityNote: hubAvailabilityQualifier(r.contentType as HubContentType),
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
  const activatedCount = activatedIds.length;
  const byStatus = {
    ACTIVATED: activatedCount,
    AVAILABLE: Math.max(0, runtimeTotal - activatedCount),
    REFERENCE: referenceTotal,
  };

  // Honest scorecard denominator: discrete probeable runtime services only
  // (API + CDS exposed as OData V2) — NOT events, NOT grouped CDS itemCount sums.
  const probeableRuntime = await prisma.sapHubContent.count({
    where: { appliesToPublic: true, contentType: { in: ["API", "CDS_VIEW"] }, apiType: "ODATAV2" },
  });

  return NextResponse.json({
    data: {
      items,
      total,
      page,
      limit,
      counts: { byType, byStatus, probeableRuntime, probed },
      catalogueImported: true,
      tenant: tenant?.label ?? null,
      isAdmin,
      typeMeta: HUB_CONTENT_TYPE_META,
    },
  });
}
