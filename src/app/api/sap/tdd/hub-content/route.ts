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
import { prisma } from "@/lib/db/prisma";
import {
  getConfiguredSapTenants,
  getSapProduct,
  getSapTenant,
  isSapTddPublicAccessEnabled,
} from "@/lib/sap-public/tdd-connector";
import { probeTenantCapabilities } from "@/lib/sap-public/capability-probe";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  hubApiToService,
  isHubContentType,
  isRuntimeType,
  resolveHubStatus,
  type HubContentType,
  type HubStatus,
} from "@/lib/sap-public/hub-content";
import { ERROR_CODES } from "@/types/api";

const RUNTIME_TYPES = HUB_CONTENT_TYPES.filter(isRuntimeType);
const REFERENCE_TYPES = HUB_CONTENT_TYPES.filter((t) => !isRuntimeType(t));
const PROBE_CAP = 60; // bound the live probe like the capabilities route

/** Probe the tenant's probeable OData V2 APIs; return the set that returned 200. */
async function probeActivatedApiIds(prefix: string, tenant: { key: string; label: string; baseUrl: string }): Promise<Set<string>> {
  const apis = await prisma.sapHubContent.findMany({
    where: { appliesToPublic: true, contentType: "API", apiType: "ODATAV2" },
    select: { contentType: true, apiType: true, externalId: true, title: true, packageId: true, communicationScenarios: true },
    orderBy: { externalId: "asc" },
    take: PROBE_CAP,
  });
  const services = apis
    .map((a) => hubApiToService({ ...a, contentType: a.contentType as HubContentType }))
    .filter((s): s is NonNullable<typeof s> => s !== null);
  if (services.length === 0) return new Set();
  const rows = await probeTenantCapabilities(prefix, tenant, services);
  return new Set(rows.filter((r) => r.exposed).map((r) => r.service));
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
      },
    });
  }

  // ── resolve the tenant + activated set (bounded live probe) ────────────
  const tenantKey = params.get("tenant") ?? getConfiguredSapTenants(product.envPrefix)[0]?.key;
  const tenant = tenantKey ? getSapTenant(product.envPrefix, tenantKey) : null;
  let activated = new Set<string>();
  if (tenant && probeEnabled) {
    try {
      activated = await probeActivatedApiIds(product.envPrefix, tenant);
    } catch {
      activated = new Set(); // probe failure → nothing ACTIVATED (honest); everything runtime AVAILABLE
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
    itemCount: r.itemCount,
    hubUrl: r.hubUrl,
    status: resolveHubStatus({ contentType: r.contentType as HubContentType, apiType: r.apiType, externalId: r.externalId }, activated),
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

  return NextResponse.json({
    data: {
      items,
      total,
      page,
      limit,
      counts: { byType, byStatus },
      catalogueImported: true,
      tenant: tenant?.label ?? null,
      typeMeta: HUB_CONTENT_TYPE_META,
    },
  });
}
