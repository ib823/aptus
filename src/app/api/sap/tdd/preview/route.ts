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
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getSapProduct,
  previewSapEntitySet,
} from "@/lib/sap-public/tdd-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import {
  decideConsoleRead,
  DEPLOYMENT_AUDIT_SCOPE,
  newCorrelationId,
  recordConsoleRead,
} from "@/lib/sap-public/console-read-guard";
import { resolveReadTenant, unknownTenantMessage } from "@/lib/sap-public/tenant-for-read";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
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
  const refusal = await refuseUnlessMayProbeTenant();
  if (refusal) return refusal;

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
  const audit = (status: number, rowCount: number | null, extra: { durationMs?: number } = {}) =>
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
      await audit(403, null);
      return NextResponse.json(
        {
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: decision.message,
            correlationId,
          },
        },
        { status: 403 },
      );
    }
  }

  const startedAt = Date.now();
  try {
    const preview = await previewSapEntitySet(product.envPrefix, tenant, service, entity, limit);
    await audit(preview.ok ? 200 : 502, preview.rows.length, {
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ data: { ...preview, correlationId } });
  } catch (error) {
    // Do not reflect the raw connector error to the client — it can carry SAP
    // tenant labels, upstream HTTP status, and topology detail useful for recon.
    // Log server-side; return a generic message.
    console.error("[sap/tdd/preview] request failed:", error);
    await audit(502, null, { durationMs: Date.now() - startedAt });
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "SAP preview request failed",
          correlationId,
        },
      },
      { status: 502 },
    );
  }
}
