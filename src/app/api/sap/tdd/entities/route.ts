import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConfiguredSapTenants,
  getSapProduct,
  getSapTenant,
  inspectSapService,
  isSapTddPublicAccessEnabled,
  probeSapEntitySets,
} from "@/lib/sap-public/tdd-connector";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import { getLiveCache, setLiveCache } from "@/lib/sap-public/live-cache";
import { ERROR_CODES } from "@/types/api";

/** Reject array / duplicate query params (?tenant=a&tenant=b) instead of silently coercing. */
function singleParam(params: URLSearchParams, name: string): string | null | undefined {
  const all = params.getAll(name);
  if (all.length > 1) return undefined; // signal "duplicated" → 400
  return all[0] ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  // Input hygiene: reject array/duplicate params rather than silently picking one.
  const productParam = singleParam(params, "product");
  const tenantParam = singleParam(params, "tenant");
  const serviceParam = singleParam(params, "service");
  const probeParam = singleParam(params, "probe");
  if (productParam === undefined || tenantParam === undefined || serviceParam === undefined || probeParam === undefined) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Duplicate query parameters are not allowed" } },
      { status: 400 },
    );
  }
  // probe accepts only "0"/"1" (absent = off); anything else is rejected, not coerced.
  if (probeParam !== null && probeParam !== "0" && probeParam !== "1") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'probe must be "0" or "1"' } },
      { status: 400 },
    );
  }

  const product = getSapProduct(productParam);
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }

  if (!isSapTddPublicAccessEnabled(product.envPrefix) && !(await getCurrentUser())) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  // Standardized with /operations: omitted tenant → the first configured tenant;
  // an INVALID tenant key → 400 (never silently fall back).
  const tenantKey = tenantParam ?? getConfiguredSapTenants(product.envPrefix)[0]?.key ?? "";
  const tenant = getSapTenant(product.envPrefix, tenantKey);
  const service = await resolveHubService(product, serviceParam ?? "");
  const probe = probeParam === "1";

  if (!tenant || !service) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Valid tenant and service are required" } },
      { status: 400 },
    );
  }

  try {
    // Short-TTL cache: inspect (+ probe, the ~3.6s path) is expensive; a warm
    // instance serves repeats. ?refresh=1 forces a live re-read.
    const cacheKey = `ent:${product.key}:${tenant.key}:${service.key}:${probe ? "1" : "0"}`;
    const refresh = params.get("refresh") === "1";
    if (!refresh) {
      const cached = getLiveCache<{ entitySets: unknown; probes: unknown }>(cacheKey);
      if (cached) {
        return NextResponse.json({ data: { ...cached.value, generatedAt: new Date(cached.at).toISOString(), fromCache: true } });
      }
    }
    const { entitySets } = await inspectSapService(product.envPrefix, tenant, service);
    const probes = probe
      ? await probeSapEntitySets(
          product.envPrefix,
          tenant,
          service,
          entitySets.map((entitySet) => entitySet.name),
        )
      : [];
    const at = setLiveCache(cacheKey, { entitySets, probes });
    return NextResponse.json({ data: { entitySets, probes, generatedAt: new Date(at).toISOString(), fromCache: false } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "SAP metadata request failed",
        },
      },
      { status: 502 },
    );
  }
}
