/**
 * GET /api/sap/tdd/preview — a live row read of a connected SAP tenant.
 *
 * THREE GATES, NOT ONE (audit E15). This route opens a real connection to a
 * client's S/4HANA system and issues an OData request against it. It used to be
 * gated on a role and nothing else: no grant, no environment ceiling, and no
 * record that the read ever happened.
 *
 *   1. `refuseUnlessMayProbeTenant` — a Studio role, not merely a session.
 *   2. `decideConsoleRead` — Sandbox and Dev freely; TEST, PROD or an undeclared
 *      landscape only behind a live approved grant for that environment.
 *   3. `recordConsoleRead` — a NorthboundAuditEvent with `dryRun: true` and the
 *      actor, written whether the read succeeded, was refused, or failed.
 *
 * THE ENTITY SET IS NO LONGER THE CALLER'S TO CHOOSE on the governed path (audit
 * E16) — see the comment on `entity` below for the one case that remains and why.
 *
 * ON THE GOVERNED PIPELINE (P0.14). The two ceilings are the pipeline's
 * `authorise` step and its typed refusals (src/lib/governed/pipeline.ts), and
 * the read passes a `contain` step of its own: the console's circuit breaker
 * for this SAP system and this organization, which observes unless
 * COREEDGE_CIRCUIT_BREAKER=enforce. Not the broker's circuit: the builder
 * chooses this read's query, so it must not be able to refuse production
 * calls or another organization's previews (containment.ts
 * circuitKeyForConsoleRead), and SAP's 4xx answer to it is not counted as a
 * failure (pipeline.ts circuitOutcomeForConsoleRead).
 * The read itself still goes through the Workbench connector (`sapFetch`),
 * which P4.1 moves onto the pipeline's Transport.
 *
 * THE CONSOLE CALL (P0.14b). The gates above, the deployment tenant's host
 * check, the circuit and both audit rows are now one object,
 * `openConsoleCall` (src/lib/governed/console.ts), shared by every console
 * route; the read is made only inside its `callSap`, which audits it.
 */

import { NextResponse, type NextRequest } from "next/server";
import { consoleRefusalBody, consoleRefusalInit, openConsoleCall } from "@/lib/governed/console";
import type { Refusal } from "@/lib/governed/pipeline";
import { SapHttpError } from "@/lib/sap-public/upstream-failure";
import {
  getSapProduct,
  previewSapEntitySet,
} from "@/lib/sap-public/tdd-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import {
  readTenantRefusalResponse,
  resolveReadTenant,
  unknownTenantMessage,
} from "@/lib/sap-public/tenant-for-read";
import { getCurrentUser } from "@/lib/auth/session";
import { noteFirstCall } from "@/lib/coreedge/journey";
import { parseSapEnvironment } from "@/lib/sap-public/environment";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import { answeredReadAuditStatus, consoleReadFailure } from "@/lib/sap-public/console-read-failure";
import { failureReasonFromHttp } from "@/lib/northbound/failure-reason";
import { ERROR_CODES } from "@/types/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }

  // A preview is a LIVE READ of a customer tenant, not a catalogue lookup, so
  // the gate is a role and not merely a session. See refuseUnlessMayProbeTenant.
  const roleRefusal = await refuseUnlessMayProbeTenant({ appliesSandboxDeveloperCeiling: true });
  if (roleRefusal) return roleRefusal;

  const tenantKey = request.nextUrl.searchParams.get("tenant") ?? "";
  const viewer = await getCurrentUser();
  // `refuseUnlessMayProbeTenant` has already established a session, so a null
  // viewer here is unreachable; the check is kept because the audit row cannot
  // be written without an actor, and a read we cannot attribute must not run.
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
  const serviceKey = request.nextUrl.searchParams.get("service") ?? "";
  const service = await resolveHubService(product, serviceKey);
  /*
   * THE ENTITY SET, AND WHY IT IS STILL A PARAMETER HERE.
   *
   * On the GOVERNED path — the northbound data route — the caller no longer
   * chooses: `Interface.entitySet` is the only source (audit E16). This route is
   * not that path. It has no interface: it exists so a builder can look at a
   * service's entity sets and decide which one an interface should name, which
   * means the entity set is the question being asked, not an override of a
   * governed answer. Removing it would leave the discovery console unable to
   * discover anything.
   *
   * What has changed is everything around it: the set is validated against the
   * service's own metadata below rather than passed through, the landscape it can
   * be asked of is capped, and the read is recorded.
   */
  const entity = request.nextUrl.searchParams.get("entity") ?? "";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);

  if (!resolved || !tenant || !service || !entity) {
    // Three different mistakes, three different sentences. "A valid service
    // and entity are required" covered all of them and named none, so a
    // service absent from the catalogue was indistinguishable from a missing
    // entity parameter — and the caller had to guess which half to fix.
    const message = !tenant
      ? unknownTenantMessage(tenantKey)
      : !service
        ? serviceKey
          ? `Unknown service "${serviceKey}" for ${product.label}: it is not a curated service and is not in this product's catalogue.`
          : "A service is required (?service=)."
        : "An entity set is required (?entity=).";
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message } },
      { status: 400 },
    );
  }

  /*
   * THE GOVERNED CONSOLE CALL (P0.14b, governed/console.ts). The person the
   * role gate let through, as the "console" principal: the sandbox developer's
   * ceiling and the environment ceiling (authorise), the deployment tenant's
   * host against the allow-list (bind), the console's own circuit for this
   * system in this organization (contain), then the read itself (callSap).
   * Every refusal and the read are audited by the pipeline on both trails: the
   * organization's console row (filed under DEPLOYMENT_AUDIT_SCOPE for a
   * reader with no organization) and the platform-scope row.
   */
  const call = openConsoleCall({
    viewer,
    target: { kind: "odata", product, resolved },
    route: "/api/sap/tdd/preview",
    externalId: service.key,
    entitySet: entity,
    servicePath: service.path,
    request: { entity, limit },
  });
  const correlationId = call.correlationId;
  // A refusal of the governed pipeline, already audited: answered in this
  // route's envelope with the correlation id.
  const refuse = (r: Refusal) => NextResponse.json(consoleRefusalBody(r, correlationId), consoleRefusalInit(r));

  const authorised = await call.authorise();
  if (!authorised.ok) return refuse(authorised.refusal);
  const bound = await call.bind();
  if (!bound.ok) return refuse(bound.refusal);
  const contained = await call.contain();
  if (!contained.ok) return refuse(contained.refusal);

  const conn = call.connection;
  const read = await call.callSap(() => previewSapEntitySet(product.envPrefix, tenant, service, entity, limit), {
    // The status SAP actually gave (audit A26). A 403 for an entity set the
    // arrangement does not release is SAP answering correctly, and recording
    // it as 502 raised the tenant-errors incident against a healthy tenant.
    // Only its refusals, though: SAP's 429 recorded as 429 raised the
    // 'throttled' incident instead — see answeredReadAuditStatus.
    answered: (preview) => ({
      status: answeredReadAuditStatus(preview.ok, preview.status),
      rowCount: preview.rows.length,
      failureReason: failureReasonFromHttp(preview.status),
      sapStatus: preview.status,
    }),
    failed: (error) => {
      const failure = consoleReadFailure(error, "SAP preview request failed");
      return {
        status: failure.auditStatus,
        rowCount: null,
        failureReason: failure.failureReason,
        sapStatus: error instanceof SapHttpError ? error.status : null,
      };
    },
  });

  if (read.ok) {
    const preview = read.value;
    /*
     * A SANDBOX READ IS A FIRST CALL (P2.12): it is the first call a sandbox
     * developer can make at all, so time to first call ends here for them. A
     * console read of a real system is a person looking, not an app calling,
     * and is not a milestone.
     */
    const readEnvironment = conn ? conn.environment : parseSapEnvironment(tenant.environment);
    if (viewer.organizationId && readEnvironment === "SANDBOX") {
      await noteFirstCall({
        organizationId: viewer.organizationId,
        solutionId: null,
        environment: readEnvironment,
        channel: "console",
        status: answeredReadAuditStatus(preview.ok, preview.status),
        actorUserId: viewer.id,
      });
    }
    return NextResponse.json({ data: { ...preview, correlationId } });
  }
  // Do not reflect the raw connector error to the client — it can carry SAP
  // tenant labels, upstream HTTP status, and topology detail useful for recon.
  // Log server-side; return a generic message — or, for a refusal SAP gave
  // or a credential CoreEdge could not use, the fixed sentence that says
  // which (see consoleReadFailure).
  console.error("[sap/tdd/preview] request failed:", read.error);
  const failure = consoleReadFailure(read.error, "SAP preview request failed");
  return NextResponse.json(
    { error: { code: failure.code, message: failure.message, correlationId } },
    { status: failure.status },
  );
}
