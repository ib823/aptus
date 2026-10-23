/**
 * POST /api/sap/tdd/tenant-services — read the services a tenant's own SAP
 * Gateway catalogue lists, live, and store them for Discover (roadmap P1.2).
 *
 * A CONSOLE READ, ON THE GOVERNED PIPELINE (governed/console.ts), in the
 * order every console route runs its steps:
 *
 *   authenticate   refuseUnlessMayProbeTenant, then probe-all's rule: a
 *                  builder lists their own organisation's connection; only a
 *                  platform admin lists a deployment tenant, which every
 *                  organisation here shares
 *   rateLimit      the edge's sapLive bucket (isLiveSapTenantRoute), and one
 *                  listing per tenant every two minutes, below
 *   resolve        resolveReadTenant: the connection and its ceiling's grants
 *                  in one statement
 *   authorise      the environment ceiling: Sandbox and Dev freely; TEST, PROD
 *                  or undeclared only under a live grant (Q4: kept). A full
 *                  service inventory of a production system is reconnaissance,
 *                  so the conservative default stays, though no business data
 *                  is read
 *   bind, contain  the TWIN refusal, the deployment tenant's host check, the
 *                  console circuit
 *   callSap        listGatewayCatalogue (tdd-connector.ts): CoreEdge's own
 *                  paging, `redirect: "manual"`, every page bounded; no URL
 *                  the tenant lists is ever requested
 *   audit          the console row and the platform row, by callSap
 *
 * Then the listing is classified against SAP's own sources (two statements)
 * and stored for a connection tenant (one). A deployment tenant's listing is
 * answered and never stored.
 *
 * A CATALOGUE THE USER CANNOT READ is an answer, not an error: 200 with
 * `catalogueStatus` UNAUTHORIZED or NOT_FOUND, stored as such, and the screen
 * offers the upload. It does not name a communication scenario to activate:
 * SAP's 2608 table puts the catalogue service only in scenarios that also
 * open dozens of business APIs (the product owner's Q1).
 *
 * THE V4 CATALOGUE is tried only when the request opts in (`v4: true`), and
 * never on S/4HANA Cloud Public Edition (Q8).
 */

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/permissions";
import {
  circuitOutcomeForFanOut,
  circuitOutcomeForSapStatus,
  consoleRefusalBody,
  consoleRefusalInit,
  openConsoleCall,
} from "@/lib/governed/console";
import type { Refusal } from "@/lib/governed/pipeline";
import { failureReasonFromHttp } from "@/lib/northbound/failure-reason";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isLimiterOutage, limiterUnavailableResponse } from "@/lib/security/rate-limit-response";
import { consoleReadFailure } from "@/lib/sap-public/console-read-failure";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { getSapProduct, listGatewayCatalogue } from "@/lib/sap-public/tdd-connector";
import {
  catalogueStatusSentence,
  groupListing,
  V2_CATALOGUE_PATH,
  type CatalogueStatus,
  type GatewayCatalogueListing,
} from "@/lib/sap-public/tenant-discovery";
import { readTenantRefusalResponse, resolveReadTenant, unknownTenantMessage } from "@/lib/sap-public/tenant-for-read";
import {
  classifyListing,
  productHasGatewayCatalogue,
  storeListing,
  TENANT_SERVICES_LIMIT,
  v4CatalogueAllowed,
} from "@/lib/sap-public/tenant-listing";
import { isStudioBuilder } from "@/lib/studio/rbac";
import { ERROR_CODES } from "@/types/api";

export const dynamic = "force-dynamic";

const ROUTE = "/api/sap/tdd/tenant-services";

/** What the console row records for a listing: its catalogue's answer, as an HTTP status SAP would have given it. */
function auditStatusFor(status: CatalogueStatus, first: number | null): number {
  if (status === "OK" || status === "TRUNCATED") return 200;
  if (status === "UNAUTHORIZED") return first === 401 ? 401 : 403;
  if (status === "NOT_FOUND") return 404;
  if (status === "TIMEOUT") return 504;
  return 502;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const viewer = await getCurrentUser();
  const denied = await refuseUnlessMayProbeTenant({ viewer });
  if (denied) return denied;
  if (!viewer) return NextResponse.json({ error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } }, { status: 401 });

  let body: { product?: unknown; tenant?: unknown; v4?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } }, { status: 400 });
  }
  const product = getSapProduct(typeof body.product === "string" ? body.product : null);
  if (!product) {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } }, { status: 400 });
  }
  if (!productHasGatewayCatalogue(product.key)) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `${product.label} serves no SAP Gateway service catalogue, so there is no service list to read. Register a service by its path or from its description instead.`,
        },
      },
      { status: 400 },
    );
  }
  const tenantKey = typeof body.tenant === "string" ? body.tenant : "";
  const resolved = tenantKey ? await resolveReadTenant(product.envPrefix, product.key, viewer.organizationId ?? null, tenantKey) : null;
  if (resolved && "refused" in resolved) return readTenantRefusalResponse(resolved, tenantKey);
  if (!resolved) {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: unknownTenantMessage(tenantKey) } }, { status: 400 });
  }

  // Probe all's rule (probe-all/route.ts): a deployment tenant is shared by
  // every organisation here, so only a platform admin reads its inventory.
  const isAdmin = isAdminRole(viewer.role ?? "");
  if (resolved.source === "deployment" && !isAdmin) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: "This is a deployment-wide tenant, shared by every organization here: only a platform admin can list its services.",
        },
      },
      { status: 403 },
    );
  }
  if (!isAdmin && !isStudioBuilder(viewer.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Your role can view what was listed, but not read the tenant's service list." } },
      { status: 403 },
    );
  }

  const v4 = body.v4 === true && v4CatalogueAllowed(product.key);
  const call = openConsoleCall({
    viewer,
    target: { kind: "odata", product, resolved },
    route: ROUTE,
    // One row for the whole listing, its rowCount the services listed.
    externalId: "-tenant-catalogue-",
    servicePath: V2_CATALOGUE_PATH,
    request: { v4 },
  });
  const correlationId = call.correlationId;
  const refuse = (r: Refusal) => NextResponse.json(consoleRefusalBody(r, correlationId), consoleRefusalInit(r));
  const authorised = await call.authorise();
  if (!authorised.ok) return refuse(authorised.refusal);
  const bound = await call.bind();
  if (!bound.ok) return refuse(bound.refusal);
  const contained = await call.contain();
  if (!contained.ok) return refuse(contained.refusal);

  // After the ceilings and the circuit, so a refused listing spends nothing;
  // the circuit's permit is given back on every exit that does not reach SAP.
  const owner = resolved.source === "connection" ? (viewer.organizationId ?? "-") : "-deployment-";
  const gate = await checkRateLimit(`sap:tenant-services:${owner}:${resolved.connection?.id ?? tenantKey}`, TENANT_SERVICES_LIMIT);
  if (!gate.allowed) {
    await call.release();
    if (isLimiterOutage(gate)) return limiterUnavailableResponse(gate);
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: "This tenant's service list was read moments ago. Its stored list is shown; try again shortly.",
          correlationId,
        },
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.resetMs / 1000)) } },
    );
  }

  const run = await call.callSap(() => listGatewayCatalogue(product.envPrefix, resolved.tenant, { v4 }), {
    answered: (r: GatewayCatalogueListing) => {
      const first = r.answers[0] ?? null;
      const status = auditStatusFor(r.status, first);
      return {
        status,
        rowCount: r.entries.length,
        failureReason: status === 200 ? null : first === null ? r.status : failureReasonFromHttp(first),
        // What the requests said about the system, not the row's status: a
        // catalogue the user may not read is SAP answering, not SAP failing.
        circuit: circuitOutcomeForFanOut(r.answers.map(circuitOutcomeForSapStatus)),
      };
    },
    failed: (err) => {
      const f = consoleReadFailure(err, "The tenant's service list could not be read.");
      return { status: f.auditStatus, rowCount: null, failureReason: f.failureReason, circuit: "refused" };
    },
  });
  if (!run.ok) {
    const f = consoleReadFailure(run.error, "The tenant's service list could not be read.");
    return NextResponse.json({ error: { code: f.code, message: f.message, correlationId } }, { status: f.status });
  }

  const listing = run.value;
  const { entries, join } = await classifyListing(product, listing.entries);
  let stored = false;
  let storedCut = 0;
  let kept = entries;
  if (resolved.source === "connection" && resolved.connection && viewer.organizationId) {
    const saved = await storeListing({
      organizationId: viewer.organizationId,
      connectionId: resolved.connection.id,
      connectionRevision: resolved.connection.revision ?? 0,
      product: product.key,
      listedById: viewer.id,
      correlationId,
      catalogueStatus: listing.status,
      v4Status: listing.v4Status,
      truncated: listing.truncated,
      entries,
    });
    stored = true;
    storedCut = saved.storedCut;
    kept = saved.entries;
  }

  const scenarios = Object.fromEntries(
    [...join.byId.values()].flat().map((s) => [s.id, { name: s.name, interfaceCount: s.interfaceCount }]),
  );
  return NextResponse.json({
    data: {
      listedAt: new Date().toISOString(),
      tenant: resolved.tenant.label,
      source: resolved.source,
      stored,
      catalogueStatus: listing.status,
      v4Status: listing.v4Status,
      sentence: catalogueStatusSentence(listing.status),
      // The read stopped short; and, apart from it, what the store left out of what was read.
      truncated: listing.truncated,
      storedCut,
      dropped: listing.dropped,
      entryCount: entries.length,
      groups: groupListing(kept),
      scenarios,
      scenarioRelease: join.release,
      correlationId,
    },
  });
}
