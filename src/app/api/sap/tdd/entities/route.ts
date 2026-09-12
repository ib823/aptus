import { NextResponse, type NextRequest } from "next/server";
import {
  getConfiguredSapTenants,
  getSapProduct,
  inspectSapService,
  probeSapEntitySets,
} from "@/lib/sap-public/tdd-connector";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import { getLiveCache, setLiveCache } from "@/lib/sap-public/live-cache";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import {
  decideConsoleRead,
  DEPLOYMENT_AUDIT_SCOPE,
  newCorrelationId,
  recordConsoleRead,
} from "@/lib/sap-public/console-read-guard";
import { resolveReadTenant, unknownTenantMessage } from "@/lib/sap-public/tenant-for-read";
import { getCurrentUser } from "@/lib/auth/session";
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

  // Inspecting a service is a LIVE READ of a customer tenant — and with
  // ?probe=1 it is many of them — so the gate is a role, not merely a session.
  // Same guard as /preview, deliberately shared: see refuseUnlessMayProbeTenant.
  const refusal = await refuseUnlessMayProbeTenant();
  if (refusal) return refusal;

  // Standardized with /operations: omitted tenant → the first configured tenant;
  // an INVALID tenant key → 400 (never silently fall back).
  const tenantKey = tenantParam ?? getConfiguredSapTenants(product.envPrefix)[0]?.key ?? "";
  // BOTH REGISTRIES. A key from the Studio tenant switcher is a CONNECTION key,
  // not a deployment key — see tenant-for-read.
  const viewer = await getCurrentUser();
  // The probe guard above has already established a session; this keeps the
  // audit row's actor non-null, and a read we cannot attribute must not run.
  if (!viewer) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }
  const resolved = await resolveReadTenant(
    product.envPrefix,
    product.key,
    viewer.organizationId ?? null,
    tenantKey,
  );
  const tenant = resolved?.tenant ?? null;
  const service = await resolveHubService(product, serviceParam ?? "");
  const probe = probeParam === "1";

  if (!tenant || !service) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: tenant ? "A valid service is required" : unknownTenantMessage(tenantKey),
        },
      },
      { status: 400 },
    );
  }

  const correlationId = newCorrelationId();
  const conn = resolved?.connection ?? null;
  const auditEnvironment = conn?.environment ?? `deployment:${tenant.key}`;

  /*
   * WHAT THE AUDIT ROW COUNTS, and why `?probe=1` is recorded differently.
   *
   * Without probe, this is ONE metadata request: `rowCount` is the number of
   * entity sets the service declared, and `externalId` is the service.
   *
   * With probe, it is one metadata request PLUS one live read per entity set —
   * the most amplifying thing this console can do to a tenant, and the thing
   * that previously left no trace at all. That fan-out is recorded as its own
   * row, under the `-probe-fanout-` scope sentinel (the same convention the
   * northbound routes use for `-discovery-` and `-schema-`), with `rowCount`
   * carrying how many probes were actually made. One row per fan-out rather than
   * one per probe: the operations board is answering "how much load did this put
   * on the tenant", and sixty rows that must be summed to answer it is a worse
   * answer than one row that states it.
   */
  const audit = (
    externalId: string,
    status: number,
    rowCount: number | null,
    extra: { durationMs?: number } = {},
  ) =>
    recordConsoleRead({
      organizationId: viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE,
      actorUserId: viewer.id,
      externalId,
      environment: auditEnvironment,
      status,
      rowCount,
      correlationId,
      connectionId: conn?.id ?? null,
      connectionEnvironment: conn?.environment ?? null,
      ...extra,
    });

  // The environment ceiling. Only a stored connection has a landscape to cap.
  if (conn && viewer.organizationId) {
    /*
     * BOTH CONDITIONS, AND THE SECOND IS NOT DEFENSIVE PADDING. `conn` is only
     * ever set when `resolveReadTenant` matched a stored connection, and it will
     * not look for one without an organization — so a connection implies an
     * organization. Naming it here is what lets the guard take a real
     * organization id rather than a fallback: a grant query against a sentinel
     * would return nothing and refuse, which looks like a policy decision and is
     * actually a missing value.
     */
    const decision = await decideConsoleRead({
      organizationId: viewer.organizationId,
      environment: conn.environment,
    });
    if (!decision.allowed) {
      await audit(service.key, 403, null);
      return NextResponse.json(
        { error: { code: ERROR_CODES.FORBIDDEN, message: decision.message, correlationId } },
        { status: 403 },
      );
    }
  }

  const startedAt = Date.now();
  try {
    // Short-TTL cache: inspect (+ probe, the ~3.6s path) is expensive; a warm
    // instance serves repeats. ?refresh=1 forces a live re-read.
    const cacheKey = `ent:${product.key}:${tenant.key}:${service.key}:${probe ? "1" : "0"}`;
    const refresh = params.get("refresh") === "1";
    if (!refresh) {
      const cached = getLiveCache<{ entitySets: unknown; probes: unknown }>(cacheKey);
      if (cached) {
        // A cache hit reached no tenant, so there is nothing to audit: the row
        // would claim load this request did not cause. The read it was served
        // from was audited when it happened.
        return NextResponse.json({ data: { ...cached.value, generatedAt: new Date(cached.at).toISOString(), fromCache: true, correlationId } });
      }
    }
    const { entitySets } = await inspectSapService(product.envPrefix, tenant, service);
    await audit(service.key, 200, entitySets.length, { durationMs: Date.now() - startedAt });

    const probes = probe
      ? await probeSapEntitySets(
          product.envPrefix,
          tenant,
          service,
          entitySets.map((entitySet) => entitySet.name),
        )
      : [];
    if (probe) {
      await audit(`-probe-fanout-${service.key}`, 200, probes.length, {
        durationMs: Date.now() - startedAt,
      });
    }
    const at = setLiveCache(cacheKey, { entitySets, probes });
    return NextResponse.json({ data: { entitySets, probes, generatedAt: new Date(at).toISOString(), fromCache: false, correlationId } });
  } catch (error) {
    console.error("[sap/tdd/entities] request failed:", error);
    await audit(service.key, 502, null, { durationMs: Date.now() - startedAt });
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "SAP metadata request failed",
          correlationId,
        },
      },
      { status: 502 },
    );
  }
}
