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
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  circuitKeyForConnection,
  circuitKeyForConsoleRead,
  circuitKeyForDeploymentTenant,
} from "@/lib/governed/containment";
import { circuitOutcomeForConsoleRead, containKey, refusal, type Refusal } from "@/lib/governed/pipeline";
import { SapHttpError } from "@/lib/sap-public/upstream-failure";
import {
  getSapProduct,
  previewSapEntitySet,
} from "@/lib/sap-public/tdd-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import {
  decideConsoleRead,
  decideSandboxDeveloperRead,
  DEPLOYMENT_AUDIT_SCOPE,
  newCorrelationId,
  recordConsoleRead,
} from "@/lib/sap-public/console-read-guard";
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

  if (!tenant || !service || !entity) {
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

  const correlationId = newCorrelationId();
  const conn = resolved?.connection ?? null;
  // A deployment tenant is the deployment's own demo system and belongs to no
  // organization. Its rows carry the tenant key as their environment rather than
  // a landscape: there is none to name, and inventing one would be the guess this
  // whole change exists to stop. See DEPLOYMENT_AUDIT_SCOPE for the organization.
  const auditEnvironment = conn?.environment ?? `deployment:${tenant.key}`;
  const audit = (
    status: number,
    rowCount: number | null,
    extra: { durationMs?: number; failureReason?: string | null } = {},
  ) =>
    recordConsoleRead({
      organizationId: viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE,
      actorUserId: viewer.id,
      externalId: service.key,
      environment: auditEnvironment,
      status,
      rowCount,
      correlationId,
      connectionId: conn?.id ?? null,
      connectionEnvironment: conn?.environment ?? null,
      ...extra,
    });
  // A refusal of the governed pipeline (pipeline.ts): audited as a console
  // read, answered in this route's envelope with the correlation id.
  const refuse = async (r: Refusal) => {
    await audit(r.status, null, r.audit.failureReason === undefined ? {} : { failureReason: r.audit.failureReason });
    return NextResponse.json(
      { error: { code: r.code, message: r.message, correlationId } },
      { status: r.status, ...(Object.keys(r.headers).length ? { headers: { ...r.headers } } : {}) },
    );
  };

  // A sandbox developer's ceiling is SANDBOX, the deployment tenant included
  // (P0.13). Every other role passes straight through it.
  const sandboxOnly = decideSandboxDeveloperRead(viewer.role, { tenant, connection: conn });
  if (!sandboxOnly.allowed) {
    return refuse(refusal("authorise", "SANDBOX_ONLY", sandboxOnly.message ?? ""));
  }

  /*
   * THE ENVIRONMENT CEILING. Only a stored connection has a landscape to cap —
   * a deployment tenant has no organization and therefore no grant that could
   * ever be written for it, so requiring one would close the catalogue to
   * everybody while protecting a system no customer owns.
   */
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
      return refuse(refusal("authorise", decision.refusal ?? "NO_APPROVED_GRANT", decision.message ?? ""));
    }
  }

  // The console's circuit for this SAP system (pipeline.ts contain): the
  // connection's or the deployment tenant's, inside this organization's own
  // console scope — never the circuit the northbound routes use, and never
  // another organization's (containment.ts circuitKeyForConsoleRead).
  // Observes only unless COREEDGE_CIRCUIT_BREAKER=enforce.
  const circuit = await containKey(
    circuitKeyForConsoleRead(
      viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE,
      conn ? circuitKeyForConnection(conn.id) : circuitKeyForDeploymentTenant(product.envPrefix, tenant.key),
    ),
    correlationId,
  );
  if (!circuit.ok) return refuse(circuit.refusal);

  const startedAt = Date.now();
  try {
    const preview = await previewSapEntitySet(product.envPrefix, tenant, service, entity, limit);
    // Timed before the breaker hears of it: its store is not SAP.
    const durationMs = Date.now() - startedAt;
    // The status SAP actually gave (audit A26). A 403 for an entity set the
    // arrangement does not release is SAP answering correctly, and recording
    // it as 502 raised the tenant-errors incident against a healthy tenant.
    // Only its refusals, though: SAP's 429 recorded as 429 raised the
    // 'throttled' incident instead — see answeredReadAuditStatus.
    const auditStatus = answeredReadAuditStatus(preview.ok, preview.status);
    await circuit.value.record(circuitOutcomeForConsoleRead(auditStatus, preview.status));
    await audit(auditStatus, preview.rows.length, {
      durationMs,
      failureReason: failureReasonFromHttp(preview.status),
    });
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
        status: auditStatus,
        actorUserId: viewer.id,
      });
    }
    return NextResponse.json({ data: { ...preview, correlationId } });
  } catch (error) {
    // Do not reflect the raw connector error to the client — it can carry SAP
    // tenant labels, upstream HTTP status, and topology detail useful for recon.
    // Log server-side; return a generic message — or, for a refusal SAP gave
    // or a credential CoreEdge could not use, the fixed sentence that says
    // which (see consoleReadFailure).
    const durationMs = Date.now() - startedAt;
    console.error("[sap/tdd/preview] request failed:", error);
    const failure = consoleReadFailure(error, "SAP preview request failed");
    await circuit.value.record(
      circuitOutcomeForConsoleRead(failure.auditStatus, error instanceof SapHttpError ? error.status : null),
    );
    await audit(failure.auditStatus, null, {
      durationMs,
      failureReason: failure.failureReason,
    });
    return NextResponse.json(
      {
        error: {
          code: failure.code,
          message: failure.message,
          correlationId,
        },
      },
      { status: failure.status },
    );
  }
}
