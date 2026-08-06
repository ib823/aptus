/**
 * Move 2 — GET /api/sap/tdd/capabilities?product=s4hana[&tenant=<key>]
 *
 * Returns the tenant's real capability map: which published OData services the
 * configured tenant (e.g. ABeam TDD) actually exposes. Read-only ($metadata).
 *
 * Guarded by refuseUnlessMayProbeTenant, like the other SAP read routes. That
 * sentence used to be here as a bare claim while the route checked PUBLIC_ACCESS
 * instead — see the comment on the guard call below.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConfiguredSapTenants,
  getSapProduct,
} from "@/lib/sap-public/tdd-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { getDynamicOdataServices, mergeProbeTargets } from "@/lib/sap-public/dynamic-catalog";
import { probeTenantCapabilities, summarize } from "@/lib/sap-public/capability-probe";
import { auditCapabilityProbe } from "@/lib/sap-public/capability-audit";
import { resolveReadTenant } from "@/lib/sap-public/tenant-for-read";
import { ERROR_CODES } from "@/types/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }

  /*
   * THIS ROUTE PROBES A REAL SAP TENANT ON EVERY CALL, SO IT USES THE GUARD.
   *
   * The header above says "Guarded exactly like the other SAP read routes." It
   * was not. `operations`, `entities` and `preview` call
   * refuseUnlessMayProbeTenant; this one checked PUBLIC_ACCESS instead — and
   * that flag is explicitly ENABLED on this deployment, so `!user` never
   * mattered and the route answered anyone on the internet with HTTP 200.
   *
   * What that returned: the tenant label ("Customizing X5M/100"), how many
   * services are exposed versus not activated, and a per-entity CRUD map
   * (readable/creatable/updatable/deletable) of a live customer system. And
   * because `probeTenantCapabilities` runs before the response is built, every
   * anonymous request ISSUED LIVE OData CALLS to that tenant — consuming its
   * quota and appearing in its logs, in CoreEdge's name, on behalf of nobody.
   *
   * probe-guard.ts already states the rule and the reason, and records the
   * previous time this same flag made a guard unreachable: "an anonymous caller
   * is the LAST caller who should reach it", and "the rule now has no
   * exception". The rule had an exception; it was this file.
   *
   * Found by an unauthenticated curl during a browser-agent audit — the same
   * way the earlier incident in that file was found.
   */
  const refusal = await refuseUnlessMayProbeTenant(product.envPrefix);
  if (refusal) return refusal;

  const user = await getCurrentUser();
  if (!user) {
    // Unreachable: the guard above already 401s without a session. Kept so the
    // narrowing below is a fact rather than an assumption.
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const tenantKey =
    request.nextUrl.searchParams.get("tenant") ??
    getConfiguredSapTenants(product.envPrefix)[0]?.key;
  const tenant = tenantKey
    ? (await resolveReadTenant(product.envPrefix, product.key, user?.organizationId ?? null, tenantKey))?.tenant ?? null
    : null;
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
  //
  // THE TOP-UP IS THE PRODUCT'S OWN EDITION, and only for edition products.
  // This hardcoded `edition: "PUBLIC"` — the field SAP_ODATA_PRODUCTS carries
  // for exactly this call site went unread, so a RISE or on-prem tenant was
  // probed with the PUBLIC published set, and a SuccessFactors tenant with
  // manufactured /sap/opu/odata/sap/* URLs that 404 by construction
  // (dynamic-catalog.ts's own warning). Non-edition products probe their
  // curated services only.
  const dynamic = product.edition
    ? await getDynamicOdataServices({ edition: product.edition, limit: 60 })
    : [];
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
