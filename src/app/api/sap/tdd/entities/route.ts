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
import { consoleRefusalBody, consoleRefusalInit, openConsoleCall } from "@/lib/governed/console";
import type { Refusal } from "@/lib/governed/pipeline";
import {
  readTenantRefusalResponse,
  resolveReadTenant,
  unknownTenantMessage,
} from "@/lib/sap-public/tenant-for-read";
import { getCurrentUser } from "@/lib/auth/session";
import { consoleReadFailure } from "@/lib/sap-public/console-read-failure";
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
  const refusal = await refuseUnlessMayProbeTenant({ appliesSandboxDeveloperCeiling: true });
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
  if (resolved && "refused" in resolved) return readTenantRefusalResponse(resolved, tenantKey);
  const tenant = resolved?.tenant ?? null;
  const service = await resolveHubService(product, serviceParam ?? "");
  const probe = probeParam === "1";

  if (!resolved || !tenant || !service) {
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
   *
   * ON THE GOVERNED PIPELINE (P0.14b, governed/console.ts): the ceilings, the
   * deployment tenant's host check and the console circuit are its steps, each
   * refusal audited by it, and each of the two reads below is made inside its
   * `callSap`, which writes the row.
   */
  const call = openConsoleCall({
    viewer,
    target: { kind: "odata", product, resolved },
    route: "/api/sap/tdd/entities",
    externalId: service.key,
    servicePath: service.path,
    request: { probe },
  });
  const correlationId = call.correlationId;
  const refuse = (r: Refusal) => NextResponse.json(consoleRefusalBody(r, correlationId), consoleRefusalInit(r));

  const authorised = await call.authorise();
  if (!authorised.ok) return refuse(authorised.refusal);
  const bound = await call.bind();
  if (!bound.ok) return refuse(bound.refusal);

  // Short-TTL cache: inspect (+ probe, the ~3.6s path) is expensive; a warm
  // instance serves repeats. ?refresh=1 forces a live re-read. Filed under the
  // system that answered, not the bare tenant key, which another organization
  // may share — see live-cache.
  const cacheOwner = { tenant, connection: call.connection };
  const cacheKey = `ent:${product.key}:${service.key}:${probe ? "1" : "0"}`;
  const refresh = params.get("refresh") === "1";
  if (!refresh) {
    const cached = getLiveCache<{ entitySets: unknown; probes: unknown }>(cacheOwner, cacheKey);
    if (cached) {
      // A cache hit reached no tenant, so there is nothing to audit: the row
      // would claim load this request did not cause. The read it was served
      // from was audited when it happened.
      return NextResponse.json({ data: { ...cached.value, generatedAt: new Date(cached.at).toISOString(), fromCache: true, correlationId } });
    }
  }

  const contained = await call.contain();
  if (!contained.ok) return refuse(contained.refusal);

  /*
   * SAP's 401 on $metadata is an expired password, not "SAP metadata request
   * failed", and a credential CoreEdge could not build reached no tenant at
   * all — both were a 502 response and a 502 audit row (audit A26). The
   * generic sentence stays for what is genuinely a failure.
   */
  const failed = (error: unknown) => {
    const failure = consoleReadFailure(error, "SAP metadata request failed");
    return { status: failure.auditStatus, rowCount: null, failureReason: failure.failureReason };
  };
  const failure = (error: unknown) => {
    console.error("[sap/tdd/entities] request failed:", error);
    const answer = consoleReadFailure(error, "SAP metadata request failed");
    return NextResponse.json(
      { error: { code: answer.code, message: answer.message, correlationId } },
      { status: answer.status },
    );
  };

  const inspected = await call.callSap(() => inspectSapService(product.envPrefix, tenant, service), {
    answered: ({ entitySets }) => ({ status: 200, rowCount: entitySets.length }),
    failed,
  });
  if (!inspected.ok) return failure(inspected.error);
  const { entitySets } = inspected.value;

  let probes: Awaited<ReturnType<typeof probeSapEntitySets>> = [];
  if (probe) {
    const fanOut = await call.callSap(
      () =>
        probeSapEntitySets(
          product.envPrefix,
          tenant,
          service,
          entitySets.map((entitySet) => entitySet.name),
        ),
      {
        answered: (made) => ({ status: 200, rowCount: made.length, externalId: `-probe-fanout-${service.key}` }),
        // A fan-out that threw is recorded against the service, as before.
        failed,
      },
    );
    if (!fanOut.ok) return failure(fanOut.error);
    probes = fanOut.value;
  }
  const at = setLiveCache(cacheOwner, cacheKey, { entitySets, probes });
  return NextResponse.json({ data: { entitySets, probes, generatedAt: new Date(at).toISOString(), fromCache: false, correlationId } });
}
