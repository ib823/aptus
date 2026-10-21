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
  getSapServices,
} from "@/lib/sap-public/tdd-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { getDynamicOdataServices, mergeProbeTargets } from "@/lib/sap-public/dynamic-catalog";
import { probeTenantCapabilities, summarize } from "@/lib/sap-public/capability-probe";
import { auditCapabilityProbe } from "@/lib/sap-public/capability-audit";
import { circuitOutcomeForProbes, consoleRefusalBody, consoleRefusalInit, openConsoleCall } from "@/lib/governed/console";
import type { Refusal } from "@/lib/governed/pipeline";
import { readTenantRefusalResponse, resolveReadTenant } from "@/lib/sap-public/tenant-for-read";
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
  const refusal = await refuseUnlessMayProbeTenant({ appliesSandboxDeveloperCeiling: true });
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
  const resolved = tenantKey
    ? await resolveReadTenant(product.envPrefix, product.key, user.organizationId ?? null, tenantKey)
    : null;
  if (resolved && "refused" in resolved) return readTenantRefusalResponse(resolved, tenantKey ?? "");
  const tenant = resolved?.tenant ?? null;
  if (!resolved || !tenant) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No configured tenant" } },
      { status: 400 },
    );
  }

  /*
   * THE CONSOLE CEILING AND THE CONSOLE ROW, AS /entities HAS THEM (audit A24).
   *
   * This route sends up to sixty $metadata requests to the system it resolves,
   * and it resolves the caller's STORED connections through the same
   * resolveReadTenant /entities does — yet it had the role gate and nothing
   * else. An organization refused 403 NO_APPROVED_GRANT on /entities for its
   * PROD connection got the same system's service list and per-entity CRUD map
   * from here, and no NorthboundAuditEvent row said the reads happened. The
   * rule is console-read-guard.ts's: Sandbox and Dev freely; TEST, PROD or an
   * undeclared landscape only under a live grant for it. A deployment tenant
   * has no connection and so no landscape to cap; it is still recorded.
   */
  // ON THE GOVERNED PIPELINE (P0.14b, governed/console.ts): the ceilings and
  // the deployment tenant's host check are its steps, each refusal audited by
  // it under the -capabilities- scope sentinel; the probe runs inside its
  // `callSap` below, which writes the one row for the fan-out, rowCount
  // carrying how many probes were made — the -probe-fanout- convention
  // /entities uses.
  const call = openConsoleCall({
    viewer: user,
    target: { kind: "odata", product, resolved },
    route: "/api/sap/tdd/capabilities",
    externalId: "-capabilities-",
  });
  const correlationId = call.correlationId;
  const refuse = (r: Refusal) => NextResponse.json(consoleRefusalBody(r, correlationId), consoleRefusalInit(r));
  const authorised = await call.authorise();
  if (!authorised.ok) return refuse(authorised.refusal);
  const bound = await call.bind();
  if (!bound.ok) return refuse(bound.refusal);

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
  const services = mergeProbeTargets(getSapServices(product), dynamic, 60);
  if (services.length === 0) {
    return NextResponse.json({
      data: {
        note: "No probeable OData services — import the catalogue: Operations → Catalogue health → \"Import API reference + rebuild\" (or drop the api.sap.com export at sap-references/api-hub-catalog.json and run `pnpm sap:catalog:import` locally).",
        summary: null,
      },
    });
  }

  const contained = await call.contain();
  if (!contained.ok) return refuse(contained.refusal);
  // probeTenantCapabilities reports each service's outcome rather than
  // throwing; a throw here is a defect, recorded as a 502 and rethrown. The
  // row says the probe ran; the console circuit hears what each service was
  // answered, so a probe of a system that is down is not an "ok" (P0.14b review).
  const probed = await call.callSap(() => probeTenantCapabilities(product.envPrefix, tenant, services), {
    answered: (made) => ({ status: 200, rowCount: made.length, circuit: circuitOutcomeForProbes(made) }),
    failed: () => ({ status: 502, rowCount: null }),
  });
  if (!probed.ok) throw probed.error;
  const rows = probed.value;
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
