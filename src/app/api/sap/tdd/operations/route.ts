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
import {
  decideConsoleRead,
  DEPLOYMENT_AUDIT_SCOPE,
  newCorrelationId,
  recordConsoleRead,
} from "@/lib/sap-public/console-read-guard";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveReadTenant, type ResolvedReadTenant } from "@/lib/sap-public/tenant-for-read";
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
    return {
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
    };
  } catch (error) {
    return {
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
): Promise<ResolvedReadTenant | null> {
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
  const refusal = await refuseUnlessMayProbeTenant();
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
  if (!resolved) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No SAP tenant is configured" } },
      { status: 400 },
    );
  }
  const tenant = resolved.tenant;
  const conn = resolved.connection;

  const correlationId = newCorrelationId();
  const auditEnvironment = conn?.environment ?? `deployment:${tenant.key}`;
  /*
   * ONE ROW FOR THE WHOLE DASHBOARD LOAD. This route runs one live read per
   * curated section — four on S/4HANA today — against the same tenant in one
   * request. `-operations-` is the scope sentinel (the convention the northbound
   * routes use for `-discovery-` and `-schema-`), and `rowCount` carries how many
   * sections actually reached the tenant, which is the number that says how much
   * load this request caused.
   */
  const audit = (status: number, rowCount: number | null, durationMs?: number) =>
    recordConsoleRead({
      organizationId: viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE,
      actorUserId: viewer.id,
      externalId: "-operations-",
      environment: auditEnvironment,
      status,
      rowCount,
      correlationId,
      connectionId: conn?.id ?? null,
      connectionEnvironment: conn?.environment ?? null,
      ...(durationMs === undefined ? {} : { durationMs }),
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
      await audit(403, null);
      return NextResponse.json(
        { error: { code: ERROR_CODES.FORBIDDEN, message: decision.message, correlationId } },
        { status: 403 },
      );
    }
  }

  // Short-TTL cache: 4 live SAP reads per request is expensive; a warm instance
  // serves repeats from cache. ?refresh=1 forces a live re-read. generatedAt is
  // the freshness timestamp the UI shows.
  const cacheKey = `ops:${product.key}:${tenant.key}`;
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const tenantIdentity = { key: tenant.key, label: tenant.label };

  if (!refresh) {
    const cached = getLiveCache<{ sections: unknown; generatedAt: string }>(cacheKey);
    if (cached) {
      // A cache hit reached no tenant, so there is nothing to audit — the row
      // would claim load this request did not cause.
      return NextResponse.json({
        data: { tenant: tenantIdentity, generatedAt: cached.value.generatedAt, sections: cached.value.sections, fromCache: true, correlationId },
      });
    }
  }

  const startedAt = Date.now();
  const sections = await Promise.all(
    getSapOperations(product).map((config) => loadOperationSection(product, tenant, config)),
  );
  const generatedAt = new Date().toISOString();
  setLiveCache(cacheKey, { sections, generatedAt });

  // Every section that answered at all counts as load on the tenant, whether it
  // returned rows or an error: the request left and was served.
  await audit(
    sections.some((section) => section.ok) ? 200 : 502,
    sections.length,
    Date.now() - startedAt,
  );

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
