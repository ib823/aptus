import { NextResponse, type NextRequest } from "next/server";
import {
  getConfiguredSapTenants,
  getSapOperations,
  getSapProduct,
  getSapService,
  previewSapEntitySet,
  type SapOdataProduct,
  type SapOperationConfig,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";
import { getLiveCache, setLiveCache } from "@/lib/sap-public/live-cache";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { circuitOutcomeForFanOut, consoleRefusalBody, consoleRefusalInit, openConsoleCall } from "@/lib/governed/console";
import { circuitOutcomeForConsoleRead, type Refusal } from "@/lib/governed/pipeline";
import { getCurrentUser } from "@/lib/auth/session";
import { failureReasonFromHttp } from "@/lib/northbound/failure-reason";
import { answeredReadAuditStatus, consoleReadFailure } from "@/lib/sap-public/console-read-failure";
import { SapHttpError } from "@/lib/sap-public/upstream-failure";
import {
  readTenantRefusalResponse,
  resolveReadTenant,
  type ReadTenantRefusal,
  type ResolvedReadTenant,
} from "@/lib/sap-public/tenant-for-read";
import { ERROR_CODES } from "@/types/api";

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const sapDate = value.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
    if (sapDate?.[1]) {
      const millis = Number.parseInt(sapDate[1], 10);
      if (Number.isFinite(millis)) return new Date(millis).toISOString().slice(0, 10);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function chooseFields(rows: Array<Record<string, unknown>>, preferredFields: string[]): string[] {
  const preferred = preferredFields.filter((field) =>
    rows.some((row) => row[field] !== null && row[field] !== undefined && row[field] !== ""),
  );
  if (preferred.length > 0) return preferred.slice(0, 8);
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
}

/**
 * One dashboard section, and the status its read is RECORDED as — kept beside
 * the section rather than in it, so the response shape is unchanged. SAP's own
 * refusal when it answered (answeredReadAuditStatus — a 429 is a 502, not
 * CoreEdge throttling); consoleReadFailure's when the read threw (audit A26):
 * a refused section is a 401/403/404, not a tenant 5xx. And the failureReason
 * beside it, as /preview records it: without one, a row of SAP 429s read 502
 * and nothing else, indistinguishable from a 5xx or a timeout.
 *
 * And what the section tells the console circuit, by the preview's own rule
 * (circuitOutcomeForConsoleRead with SAP's status): a section SAP answered
 * 429 is recorded 502 but is SAP answering, not failing (P0.14b review).
 */
async function loadOperationSection(
  product: SapOdataProduct,
  tenant: SapTenant,
  config: SapOperationConfig,
) {
  const service = getSapService(product, config.serviceKey);
  if (!service) {
    throw new Error(`Unknown SAP service: ${config.serviceKey}`);
  }

  try {
    const preview = await previewSapEntitySet(
      product.envPrefix,
      tenant,
      service,
      config.entitySet,
      config.limit,
    );
    const fields = chooseFields(preview.rows, config.fields);
    const auditStatus = answeredReadAuditStatus(preview.ok, preview.status);
    return {
      auditStatus,
      circuit: circuitOutcomeForConsoleRead(auditStatus, preview.status),
      failureReason: failureReasonFromHttp(preview.status),
      section: {
        key: config.key,
        title: config.title,
        serviceLabel: service.label,
        scenario: service.scenario,
        entitySet: config.entitySet,
        ok: preview.ok,
        // Reachable-but-empty is NOT a healthy "read available" — flag it so the UI
        // shows amber ("reachable, no data"), not a false-green heartbeat.
        empty: preview.ok && preview.rows.length === 0,
        status: preview.status,
        durationMs: preview.durationMs,
        rowCount: preview.rows.length,
        fields,
        rows: preview.rows.map((row) =>
          Object.fromEntries(fields.map((field) => [field, displayValue(row[field])])),
        ),
        error: null,
      },
    };
  } catch (error) {
    const failure = consoleReadFailure(error, "SAP section load failed");
    return {
      auditStatus: failure.auditStatus,
      circuit: circuitOutcomeForConsoleRead(failure.auditStatus, error instanceof SapHttpError ? error.status : null),
      failureReason: failure.failureReason,
      section: {
        key: config.key,
        title: config.title,
        serviceLabel: service.label,
        scenario: service.scenario,
        entitySet: config.entitySet,
        ok: false,
        empty: false,
        status: 0,
        durationMs: 0,
        rowCount: 0,
        fields: config.fields.slice(0, 8),
        rows: [],
        error: error instanceof Error ? error.message : "SAP section load failed",
      },
    };
  }
}

/**
 * Tenant resolution, standardized with /entities:
 *   - a tenant param present + INVALID → null → the caller returns 400
 *   - a tenant param OMITTED → the first configured tenant (documented default,
 *     so the dashboard's initial heartbeat load needs no explicit tenant).
 */
async function resolveTenant(
  product: SapOdataProduct,
  request: NextRequest,
  organizationId: string | null,
): Promise<ResolvedReadTenant | ReadTenantRefusal | null> {
  const tenantKey = request.nextUrl.searchParams.get("tenant");
  if (tenantKey) {
    return (await resolveReadTenant(product.envPrefix, product.key, organizationId, tenantKey)) ?? null;
  }
  // The documented default: the deployment's first configured tenant, which has
  // no stored connection behind it.
  const configured = getConfiguredSapTenants(product.envPrefix)[0];
  return configured ? { tenant: configured, source: "deployment", connection: null } : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }

  // This route calls previewSapEntitySet — several times, one per section — so
  // it is a LIVE READ of a customer tenant like /preview and /entities, and takes
  // the same role gate. It was found by checking the siblings of the two routes
  // where the gap was reported, which is the only reliable way to close a
  // per-route omission: the omission is never in the route you were told about.
  const refusal = await refuseUnlessMayProbeTenant({ appliesSandboxDeveloperCeiling: true });
  if (refusal) return refusal;

  const viewer = await getCurrentUser();
  // The probe guard above has already established a session; this keeps the
  // audit row's actor non-null, and a read we cannot attribute must not run.
  if (!viewer) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }
  const resolved = await resolveTenant(product, request, viewer.organizationId ?? null);
  if (resolved && "refused" in resolved) {
    return readTenantRefusalResponse(resolved, request.nextUrl.searchParams.get("tenant") ?? "");
  }
  if (!resolved) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No SAP tenant is configured" } },
      { status: 400 },
    );
  }
  const tenant = resolved.tenant;

  /*
   * ONE ROW FOR THE WHOLE DASHBOARD LOAD. This route runs one live read per
   * curated section — four on S/4HANA today — against the same tenant in one
   * request. `-operations-` is the scope sentinel (the convention the northbound
   * routes use for `-discovery-` and `-schema-`), and `rowCount` carries how many
   * sections actually reached the tenant, which is the number that says how much
   * load this request caused.
   *
   * ON THE GOVERNED PIPELINE (P0.14b, governed/console.ts): the ceilings, the
   * deployment tenant's host check and the console circuit are its steps, each
   * refusal audited by it, and the sections are read inside its `callSap`,
   * which writes the one row.
   */
  const call = openConsoleCall({
    viewer,
    target: { kind: "odata", product, resolved },
    route: "/api/sap/tdd/operations",
    externalId: "-operations-",
  });
  const correlationId = call.correlationId;
  const refuse = (r: Refusal) => NextResponse.json(consoleRefusalBody(r, correlationId), consoleRefusalInit(r));

  const authorised = await call.authorise();
  if (!authorised.ok) return refuse(authorised.refusal);
  const bound = await call.bind();
  if (!bound.ok) return refuse(bound.refusal);

  // Short-TTL cache: 4 live SAP reads per request is expensive; a warm instance
  // serves repeats from cache. ?refresh=1 forces a live re-read. generatedAt is
  // the freshness timestamp the UI shows. Filed under the system that answered
  // (`resolved`), not the bare tenant key, which another organization may share
  // — see live-cache.
  const cacheKey = `ops:${product.key}`;
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const tenantIdentity = { key: tenant.key, label: tenant.label };

  if (!refresh) {
    const cached = getLiveCache<{ sections: unknown; generatedAt: string }>(resolved, cacheKey);
    if (cached) {
      // A cache hit reached no tenant, so there is nothing to audit — the row
      // would claim load this request did not cause.
      return NextResponse.json({
        data: { tenant: tenantIdentity, generatedAt: cached.value.generatedAt, sections: cached.value.sections, fromCache: true, correlationId },
      });
    }
  }

  const contained = await call.contain();
  if (!contained.ok) return refuse(contained.refusal);

  // loadOperationSection never throws: a failed section is a section with an
  // error, recorded at its own status.
  const run = await call.callSap(
    () => Promise.all(getSapOperations(product).map((config) => loadOperationSection(product, tenant, config))),
    {
      // Every section that answered at all counts as load on the tenant, whether
      // it returned rows or an error: the request left and was served.
      //
      // THE STATUS IS THE SECTIONS' OWN (audit A26), not a flat 502 whenever none
      // was ok: every section refused 403 is SAP saying "not set up", and was
      // counted by the upstream-errors incident as the tenant failing. A 5xx (or
      // no answer) from any section still makes the row a 502. The failureReason
      // is that of the section whose status the row carries, so SAP's own answer
      // — a 429 among them — is still on the row.
      answered: (loaded) => {
        const decisive = loaded.some((l) => l.auditStatus === 200)
          ? null
          : (loaded.find((l) => l.auditStatus >= 500) ?? loaded[0]);
        return {
          status: decisive === null ? 200 : decisive === undefined || decisive.auditStatus >= 500 ? 502 : decisive.auditStatus,
          rowCount: loaded.length,
          failureReason: decisive?.failureReason ?? null,
          // The circuit hears what the sections were answered, not the row's
          // status: every section refused 429 is a 502 row and a healthy
          // system; every section failing 5xx is one failure.
          circuit: circuitOutcomeForFanOut(loaded.map((l) => l.circuit)),
        };
      },
      failed: () => ({ status: 502, rowCount: null }),
    },
  );
  if (!run.ok) throw run.error;
  const sections = run.value.map((l) => l.section);
  const generatedAt = new Date().toISOString();
  setLiveCache(resolved, cacheKey, { sections, generatedAt });

  return NextResponse.json({
    data: {
      // Never leak the SAP host — return only the tenant identity the UI renders.
      tenant: tenantIdentity,
      generatedAt,
      sections,
      fromCache: false,
      correlationId,
    },
  });
}
