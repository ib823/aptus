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
import { getDynamicOdataServices, mergeProbeTargets } from "@/lib/sap-public/dynamic-catalog";
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

  // Probe the curated (known-configured) services first — the ones this product
  // has wired up and the tenant is most likely to have activated — then top up
  // from the dynamic catalogue. Without curated-first, a naive alphabetical
  // take(60) samples only the API_A…/B… head and misses the activated services.
  const dynamic = await getDynamicOdataServices({ edition: "PUBLIC", limit: 60 });
  const services = mergeProbeTargets(product.services, dynamic, 60);
  if (services.length === 0) {
    return NextResponse.json({
      data: {
        note: "No probeable OData services — import the catalogue (drop the api.sap.com export at sap-references/api-hub-catalog.json and run `pnpm sap:catalog:import`).",
        summary: null,
      },
    });
  }

  const rows = await probeTenantCapabilities(product.envPrefix, tenant, services);
  const summary = { ...summarize(tenant.label, rows), catalogueImported: dynamic.length > 0 };

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
