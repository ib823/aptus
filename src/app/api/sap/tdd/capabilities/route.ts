/**
 * Move 2 — GET /api/sap/tdd/capabilities?product=s4hana[&tenant=<key>]
 *
 * Returns the tenant's real capability map: which published OData services the
 * configured tenant (e.g. ABeam TDD) actually exposes. Read-only ($metadata).
 * Guarded exactly like the other SAP read routes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConfiguredSapTenants,
  getSapProduct,
  getSapTenant,
  isSapTddPublicAccessEnabled,
} from "@/lib/sap-public/tdd-connector";
import { getDynamicOdataServices } from "@/lib/sap-public/dynamic-catalog";
import { probeTenantCapabilities, summarize } from "@/lib/sap-public/capability-probe";
import { auditCapabilityProbe } from "@/lib/sap-public/capability-audit";
import { ERROR_CODES } from "@/types/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  if (!isSapTddPublicAccessEnabled(product.envPrefix) && !user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const tenantKey =
    request.nextUrl.searchParams.get("tenant") ??
    getConfiguredSapTenants(product.envPrefix)[0]?.key;
  const tenant = tenantKey ? getSapTenant(product.envPrefix, tenantKey) : null;
  if (!tenant) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No configured tenant" } },
      { status: 400 },
    );
  }

  const services = await getDynamicOdataServices({ edition: "PUBLIC", limit: 60 });
  if (services.length === 0) {
    return NextResponse.json({
      data: {
        note: "SapApiReference is empty — import the catalogue first (drop the api.sap.com export at sap-references/api-hub-catalog.json and run `pnpm sap:catalog:import`).",
        summary: null,
      },
    });
  }

  const rows = await probeTenantCapabilities(product.envPrefix, tenant, services);
  const summary = summarize(tenant.label, rows);

  // Append-only audit of the probe (tenant label + counts, never secrets).
  // Best-effort — a failed audit write must not break the read response.
  try {
    await auditCapabilityProbe(
      { key: product.key, label: product.label },
      summary,
      { email: user?.email ?? null, role: user?.role ?? null },
    );
  } catch {
    // swallow — audit is non-critical to the capability read
  }

  return NextResponse.json({ data: summary });
}
