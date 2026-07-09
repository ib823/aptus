import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConfiguredSapTenants,
  getSapProduct,
  getSapService,
  getSapTenant,
  isSapTddPublicAccessEnabled,
  previewSapEntitySet,
  type SapOdataProduct,
  type SapOperationConfig,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";
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
      status: 0,
      durationMs: 0,
      rowCount: 0,
      fields: config.fields.slice(0, 8),
      rows: [],
      error: error instanceof Error ? error.message : "SAP section load failed",
    };
  }
}

function resolveTenant(product: SapOdataProduct, request: NextRequest): SapTenant | null {
  const tenantKey = request.nextUrl.searchParams.get("tenant");
  if (tenantKey) return getSapTenant(product.envPrefix, tenantKey);
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

  if (!isSapTddPublicAccessEnabled(product.envPrefix) && !(await getCurrentUser())) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const tenant = resolveTenant(product, request);
  if (!tenant) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No SAP tenant is configured" } },
      { status: 400 },
    );
  }

  const sections = await Promise.all(
    product.operations.map((config) => loadOperationSection(product, tenant, config)),
  );

  return NextResponse.json({
    data: {
      tenant: {
        key: tenant.key,
        label: tenant.label,
        baseHost: new URL(tenant.baseUrl).host,
      },
      generatedAt: new Date().toISOString(),
      sections,
    },
  });
}
