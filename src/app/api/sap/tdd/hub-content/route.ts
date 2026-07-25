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
  deriveReadWrite,
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
  pathToApiId,
  readStoredProbe,
  resolveHubStatus,
  type HubContentType,
  type HubStatus,
} from "@/lib/sap-public/hub-content";
import { ERROR_CODES } from "@/types/api";

// This read endpoint must ALWAYS reflect the latest stored probe — never a
// cached/static response (which served a stale pre-probe state per-URL on prod).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Responses carry no-store so neither Next nor a CDN caches the probe state. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

const PROBE_CAP = 60; // bound the OPT-IN live overlay (dataProbe=1) like before

/** All-zero byStatus, so every status key is always present in counts. */
function emptyByStatus(): Record<HubStatus, number> {
  return { ACTIVATED: 0, NEEDS_SETUP: 0, NOT_FOUND: 0, NOT_CHECKED: 0, NOT_PROBEABLE: 0, AVAILABLE: 0, REFERENCE: 0 };
}

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
): Promise<{
  outcomes: Map<string, number>;
  dataConfirmed: Set<string>;
  capabilities: Map<string, { read: boolean; write: boolean }>;
  probed: number;
}> {
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
  if (targets.length === 0) return { outcomes: new Map(), dataConfirmed: new Set(), capabilities: new Map(), probed: 0 };
  const results = await probeTenantCapabilities(prefix, tenant, targets, 4, { dataProbe });
  // Keep the FULL outcome (HTTP status) per probed service — not just the 200s —
  // so the badge can distinguish 200/403/404, and un-probed stays NOT_CHECKED.
  const outcomes = new Map<string, number>();
  // Real read/write from the SAME probe, via the shared deriveReadWrite — so the
  // 47 activated rows show correct CRUD in the list WITHOUT a click, and the
  // collapsed chip matches the expanded detail exactly.
  const capabilities = new Map<string, { read: boolean; write: boolean }>();
  for (const r of results) {
    outcomes.set(r.service, r.status);
    if (r.entities && r.entities.length > 0) capabilities.set(r.service, deriveReadWrite(r.entities));
  }
  return {
    outcomes,
    dataConfirmed: new Set(results.filter((r) => r.dataConfirmed).map((r) => r.service)),
    capabilities,
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
  const VALID_STATUS: HubStatus[] = ["ACTIVATED", "NEEDS_SETUP", "NOT_FOUND", "NOT_CHECKED", "NOT_PROBEABLE", "AVAILABLE", "REFERENCE"];
  const status: HubStatus | "ALL" = (VALID_STATUS as string[]).includes(statusParam) ? (statusParam as HubStatus) : "ALL";
  const q = (params.get("q") ?? "").trim();
  // Source/domain facets (rawMetadataJson.raw): "sap" = SAP-only (exclude
  // partner); "AI" = only AI-domain rows. Read-only JSON-path filters.
  const sourceFilter = params.get("source") === "sap" ? "sap" : null;
  const domainFilter = params.get("domain") ? params.get("domain")!.trim() : null;
  // Line-of-business facet (Studio's business-domain lens). Filters `packageId`,
  // where the resolved LoB actually lives.
  const lobFilter = params.get("lob") ? params.get("lob")!.trim() : null;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50));

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
        counts: {
          byType: Object.fromEntries(HUB_CONTENT_TYPES.map((t) => [t, 0])),
          byStatus: emptyByStatus(),
          byLob: {},
        },
        catalogueImported: false,
        tenant: null,
        isAdmin,
      },
    }, { headers: NO_STORE });
  }

  // ── tenant + PERSISTED probe (per-tenant; no cross-tenant leak, no hammering) ──
  const configuredTenants = getConfiguredSapTenants(product.envPrefix);
  const defaultTenantKey = configuredTenants[0]?.key;
  const tenantKey = params.get("tenant") ?? defaultTenantKey;
  const tenant = tenantKey ? getSapTenant(product.envPrefix, tenantKey) : null;
  const dataProbe = params.get("dataProbe") === "1"; // opt-in LIVE overlay (freshness + data-confirm)

  // Load the persisted probe for the FULL catalogue (rawMetadataJson.probes is
  // small). This is the source of truth — the admin Probe-all populates it PER
  // TENANT; a row's status here is ONLY the requested tenant's stored result.
  const allRows = await prisma.sapHubContent.findMany({
    where: { appliesToPublic: true },
    select: { externalId: true, contentType: true, apiType: true, itemCount: true, rawMetadataJson: true },
  });
  // Headline ITEM volume, not grouped-row count: a grouped row (BAdI, CDS LoB,
  // integration package) stands for itemCount items; an individual row is 1.
  const byTypeItems: Record<string, number> = Object.fromEntries(HUB_CONTENT_TYPES.map((t) => [t, 0]));
  let aiApis = 0;
  for (const r of allRows) {
    byTypeItems[r.contentType] = (byTypeItems[r.contentType] ?? 0) + (r.itemCount ?? 1);
    const raw = r.rawMetadataJson;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const inner = (raw as Record<string, unknown>).raw as Record<string, unknown> | undefined;
      if (inner?.domain === "AI") aiApis++;
    }
  }
  const outcomes = new Map<string, number>();
  const capabilities = new Map<string, { read: boolean; write: boolean }>();
  let lastProbedAt: string | null = null;
  let probed = 0;
  for (const r of allRows) {
    const p = tenantKey ? readStoredProbe(r.rawMetadataJson, tenantKey, defaultTenantKey) : null;
    if (!p) continue;
    if (typeof p.http === "number") {
      outcomes.set(r.externalId, p.http);
      probed++;
    }
    if (typeof p.read === "boolean") capabilities.set(r.externalId, { read: p.read, write: p.write === true });
    if (p.at && (!lastProbedAt || p.at > lastProbedAt)) lastProbedAt = p.at;
  }

  // Opt-in LIVE overlay: a bounded (~60) fresh probe that WINS over stored, and
  // adds the 1-row data-confirm. Default loads never trigger it (no hammering).
  let dataConfirmed = new Set<string>();
  if (tenant && dataProbe) {
    try {
      const r = await probeActivatedApiIds(product.envPrefix, tenant, product, true);
      for (const [k, v] of r.outcomes) outcomes.set(k, v);
      for (const [k, v] of r.capabilities) capabilities.set(k, v);
      dataConfirmed = r.dataConfirmed;
    } catch {
      /* overlay is best-effort; stored results stand */
    }
  }

  // Classify EVERY row's tenant status from the outcomes (stored+overlay). This
  // gives exact byStatus counts across the whole edition AND the id-sets used to
  // pre-filter the paged query by status (uniform for all 7 statuses).
  const byStatus = emptyByStatus();
  const idsByStatus: Record<HubStatus, string[]> = {
    ACTIVATED: [], NEEDS_SETUP: [], NOT_FOUND: [], NOT_CHECKED: [], NOT_PROBEABLE: [], AVAILABLE: [], REFERENCE: [],
  };
  for (const r of allRows) {
    const s = resolveHubStatus(
      { contentType: r.contentType as HubContentType, apiType: r.apiType, externalId: r.externalId },
      outcomes,
    );
    byStatus[s]++;
    idsByStatus[s].push(r.externalId);
  }

  // ── build the WHERE from filters (status pre-filters via the classified ids) ──
  const and: Prisma.SapHubContentWhereInput[] = [{ appliesToPublic: true }];
  if (contentType) and.push({ contentType });
  // SAP-only: exclude rows explicitly stamped partner (rawMetadataJson.raw.source).
  if (sourceFilter === "sap") {
    and.push({ NOT: { rawMetadataJson: { path: ["raw", "source"], equals: "partner" } } });
  }
  if (domainFilter) {
    and.push({ rawMetadataJson: { path: ["raw", "domain"], equals: domainFilter } });
  }
  // Line-of-business facet. LoB is persisted on `packageId` (resolveLineOfBusiness
  // at seed time) — NOT on rawMetadataJson.raw.domain, which carries SAP's own
  // taxonomy ("AI"). They are different fields with different vocabularies; the
  // grouped list you see is grouped by THIS one.
  if (lobFilter) {
    and.push({ packageId: lobFilter });
  }
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { externalId: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (status !== "ALL") {
    const ids = idsByStatus[status];
    and.push(ids.length ? { externalId: { in: ids } } : { id: "__none__" });
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

  const items = rows.map((r) => {
    // source (sap|partner) + domain (AI) are stamped in rawMetadataJson.raw at
    // import time. API/curated rows carry no `raw` → default source "sap".
    const inner =
      r.rawMetadataJson && typeof r.rawMetadataJson === "object" && !Array.isArray(r.rawMetadataJson)
        ? ((r.rawMetadataJson as Record<string, unknown>).raw as Record<string, unknown> | undefined)
        : undefined;
    const source = inner?.source === "partner" ? "partner" : "sap";
    const domain = typeof inner?.domain === "string" ? inner.domain : null;
    return {
    id: r.id,
    contentType: r.contentType,
    externalId: r.externalId,
    title: r.title,
    description: r.description,
    packageId: r.packageId,
    apiType: r.apiType,
    source,
    domain,
    communicationScenarios: r.communicationScenarios,
    scopeItemCodes: r.scopeItemCodes,
    itemCount: r.itemCount,
    hubUrl: r.hubUrl,
    status: resolveHubStatus({ contentType: r.contentType as HubContentType, apiType: r.apiType, externalId: r.externalId }, outcomes),
    availabilityNote: hubAvailabilityQualifier(r.contentType as HubContentType),
    dataConfirmed: dataConfirmed.has(r.externalId),
    // Real read/write for the ~60 probed rows (else undefined → "not probed").
    capability: capabilities.get(r.externalId) ?? null,
    };
  });

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
  // Emit ALL 12 type keys (0 allowed) so every tile renders with honest context,
  // not just the types that happen to have rows. (byStatus is computed above from
  // the full-catalogue classification.)
  const byType: Record<string, number> = Object.fromEntries(HUB_CONTENT_TYPES.map((t) => [t, 0]));
  for (const g of grouped) byType[g.contentType] = g._count._all;

  // Honest scorecard denominator: discrete probeable runtime services (API + CDS
  // as OData V2 reliably, or V4 best-effort) — NOT events, NOT grouped CDS sums.
  const probeableRuntime = await prisma.sapHubContent.count({
    where: { appliesToPublic: true, contentType: { in: ["API", "CDS_VIEW"] }, apiType: { in: ["ODATAV2", "ODATAV4"] } },
  });

  // Line-of-business counts, so a business-domain lens can offer the domains that
  // ACTUALLY exist with their real sizes, instead of a hardcoded taxonomy that
  // would silently show empty buckets (or hide real ones) as the catalogue moves.
  const groupedByLob = await prisma.sapHubContent.groupBy({
    by: ["packageId"],
    where: { appliesToPublic: true },
    _count: { _all: true },
  });
  const byLob: Record<string, number> = {};
  for (const g of groupedByLob) {
    if (g.packageId) byLob[g.packageId] = g._count._all;
  }

  return NextResponse.json({
    data: {
      items,
      total,
      page,
      limit,
      counts: { byType, byTypeItems, aiApis, byStatus, byLob, probeableRuntime, probed, lastProbedAt, dataConfirmed: dataConfirmed.size, dataProbe },
      catalogueImported: true,
      tenant: tenant?.label ?? null,
      tenantKey: tenantKey ?? null,
      isAdmin,
      typeMeta: HUB_CONTENT_TYPE_META,
    },
  }, { headers: NO_STORE });
}
