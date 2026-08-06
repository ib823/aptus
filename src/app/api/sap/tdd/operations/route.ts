import { NextResponse, type NextRequest } from "next/server";
import {
  getConfiguredSapTenants,
  getSapProduct,
  getSapService,
  previewSapEntitySet,
  type SapOdataProduct,
  type SapOperationConfig,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";
import { getLiveCache, setLiveCache } from "@/lib/sap-public/live-cache";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveReadTenant } from "@/lib/sap-public/tenant-for-read";
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
): Promise<SapTenant | null> {
  const tenantKey = request.nextUrl.searchParams.get("tenant");
  if (tenantKey) return (await resolveReadTenant(product.envPrefix, product.key, organizationId, tenantKey))?.tenant ?? null;
  return getConfiguredSapTenants(product.envPrefix)[0] ?? null;
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
  const tenant = await resolveTenant(product, request, viewer?.organizationId ?? null);
  if (!tenant) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No SAP tenant is configured" } },
      { status: 400 },
    );
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
      return NextResponse.json({
        data: { tenant: tenantIdentity, generatedAt: cached.value.generatedAt, sections: cached.value.sections, fromCache: true },
      });
    }
  }

  const sections = await Promise.all(
    product.operations.map((config) => loadOperationSection(product, tenant, config)),
  );
  const generatedAt = new Date().toISOString();
  setLiveCache(cacheKey, { sections, generatedAt });

  return NextResponse.json({
    data: {
      // Never leak the SAP host — return only the tenant identity the UI renders.
      tenant: tenantIdentity,
      generatedAt,
      sections,
      fromCache: false,
    },
  });
}
