/**
 * GET /api/ops/connections-health — the SAP connection fleet.
 *
 * THE REAL STATUS VOCABULARY, which an earlier spec got wrong. `probeConnection`
 * returns exactly:
 *
 *   OK · UNAUTHORIZED · NOT_FOUND · TIMEOUT · ERROR · NO_PROBE_PATH
 *
 * plus a SEVENTH state that is not a return value at all: `lastValidationStatus`
 * null, meaning never tested. The schema names that state NEVER_TESTED in its own
 * documentation, so the label is kept — but it is the absence of a result, not a
 * member of the scale of observed outcomes, and it is counted separately.
 *
 * `NO_PROBE_PATH` counts as UNKNOWN, never as NEEDS ATTENTION. It means we have
 * no path to probe and refused to guess one — our ignorance, not the tenant's
 * fault. Nagging an operator about a gap on our side is how a health screen
 * teaches people to ignore it.
 *
 * A STALE TIMESTAMP BESIDE A FAILING STATUS IS CORRECT. `lastValidatedAt` moves
 * only on a real 200, so "TIMEOUT, last validated three weeks ago" is the truth
 * (it last worked three weeks ago; it is failing now), not an inconsistency to
 * be tidied away.
 *
 * SECRET-SAFE BY SELECTION: `secretsCiphertext`, `baseUrl` and `oauthTokenUrl`
 * are never selected. A console needs to know a connection is unhealthy, never
 * where it points or what opens it.
 */

import { prisma } from "@/lib/db/prisma";
import { opsWhere, requireOperations } from "@/lib/ops/guard";
import { CONNECTION_PROOF_TTL_MS, connectionHealthVerdict } from "@/lib/coreedge/freshness";
import { studioOk } from "@/lib/studio/api";
import { BROKER_UNREACHABLE, DEPLOYMENT_TENANT_SCOPE } from "@/lib/ops/deployment-tenant";
import { deploymentFallbackTenants } from "@/lib/studio/tenants";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  // Deactivated connections are excluded from the list AND counted, so the
  // exclusion is visible on the response rather than being a filter a reader has
  // to find in the source. Every other omission in this module is declared in a
  // provenance block; this one was not.
  const [rows, inactive] = await Promise.all([
    prisma.sapConnection.findMany({
      where: opsWhere(guard.actor, { isActive: true }),
      select: {
        id: true,
        organizationId: true,
        product: true,
        key: true,
        label: true,
        environment: true,
        writeEnabled: true,
        lastValidationStatus: true,
        lastValidatedAt: true,
        createdAt: true,
      },
      orderBy: [{ product: "asc" }, { createdAt: "asc" }],
    }),
    prisma.sapConnection.count({ where: opsWhere(guard.actor, { isActive: false }) }),
  ]);

  const byStatus: Record<string, number> = {};
  let healthy = 0;
  let needsAttention = 0;
  let unknown = 0;
  let stale = 0;
  let neverTested = 0;
  let bindingUnverified = 0;
  let prodConnections = 0;

  const now = new Date();
  for (const r of rows) {
    const status = r.lastValidationStatus;
    const label = status ?? "NEVER_TESTED";
    byStatus[label] = (byStatus[label] ?? 0) + 1;

    /*
     * HEALTH DECAYS (P0.2, A50). "OK" counted as healthy whatever its age, so a
     * connection whose probing stopped — or whose secret stopped opening, which
     * skipped the write — kept its last green forever. `connectionHealthVerdict`
     * is the one reading: an OK older than CONNECTION_PROOF_TTL_MS is `stale`,
     * and UNREADABLE (recorded by the sweep since P0.2) needs attention.
     */
    switch (connectionHealthVerdict(r, now)) {
      case "neverTested":
        neverTested++;
        break;
      case "healthy":
        healthy++;
        break;
      case "stale":
        stale++;
        break;
      case "needsAttention":
      case "unreadable":
        needsAttention++;
        break;
      case "unknown":
        unknown++; // NO_PROBE_PATH, or an unrecognised value: never assumed healthy
        break;
    }

    // The backlog, not a badge. A connection with no declared environment serves
    // reads flagged unverified and refuses writes outright; the count is work to
    // clear and is expected to trend to zero as environments are declared.
    if (r.environment === null || r.environment.trim().length === 0) bindingUnverified++;
    else if (r.environment.trim().toUpperCase() === "PROD") prodConnections++;
  }

  /**
   * WHAT REACHES SAP, AS TWO FACTS (P0.3, A59).
   *
   * Two mechanisms reach SAP, and they serve different callers. Stored
   * `SapConnection` rows are the ONLY way an app reaches SAP through the
   * broker: the data and write routes bind through the organization's own
   * connections and refuse with CONNECTION_NOT_CONFIGURED when there is none.
   * The deployment's `{PREFIX}_*` env tenants serve console and explorer reads
   * (Explore, preview, the operations screens) for every organization,
   * whatever connections it has (`resolveReadTenant`, deployment tenants
   * first).
   *
   * This said the broker "prefers the first and falls back to the second",
   * and listed the env tenant only when the organization had no rows. Both
   * halves were wrong: an organization with no connection was shown as served
   * by the shared tenant while every app call was refused, and one with a
   * connection was shown no env tenant while its users' console reads reached
   * it. See lib/ops/deployment-tenant.ts.
   */
  const tenants = deploymentFallbackTenants();
  const brokerReachable = rows.length > 0;

  return studioOk({
    scope: guard.actor.kind,
    counts: {
      total: rows.length,
      healthy,
      needsAttention,
      unknown,
      neverTested,
      // An OK older than CONNECTION_PROOF_TTL_MS (P0.2, A50): not counted healthy.
      stale,
      byStatus,
    },
    /** Apps can reach SAP through the broker only when this is true (an active connection exists). */
    brokerReachable,
    /**
     * The deployment's shared env tenants: console and explorer reads only,
     * for every organization, never the broker's (A59). Emphatically NOT
     * "this client's SAP" — which is why `source` is carried and why these
     * are listed apart from `connections` rather than merged in.
     */
    deploymentTenant: {
      configured: tenants.length > 0,
      servesBroker: false,
      tenants: tenants.map((t) => ({
        key: t.key,
        label: t.label,
        product: t.product,
        environment: t.environment,
        source: t.source,
      })),
    },
    provenance: {
      // Named because a deactivated connection still exists and can be
      // reactivated, so "we have 3 connections" and "3 are listed here" are
      // different claims.
      activeOnly: true,
      // How old an OK may be and still count as healthy (P0.2, A50).
      healthyWithinHours: CONNECTION_PROOF_TTL_MS / 3_600_000,
      excludedInactive: inactive,
      why: "A deactivated connection serves no traffic, so its probe status would be a stale claim about a system nothing is calling.",
      deploymentTenantScope: tenants.length > 0 ? DEPLOYMENT_TENANT_SCOPE : null,
      brokerReachability: brokerReachable ? null : BROKER_UNREACHABLE,
      noHealthForDeploymentTenant:
        tenants.length > 0
          ? "Probe health is recorded per stored connection. The deployment's tenant has no row, so there is no health record for it — that is an absence, not a failure, and not a pass."
          : null,
    },
    bindingBacklog: {
      // Presented as work with a route to remediation, not a status. A count
      // that sits constant is the signal that the permissive read rule has
      // quietly become permanent.
      undeclaredEnvironment: bindingUnverified,
      remediation: "Declare the environment on each connection in Studio.",
      consequence:
        "Reads through an undeclared connection are served but marked unverified; writes through one are refused outright.",
    },
    prodConnections,
    connections: rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      product: r.product,
      key: r.key,
      label: r.label,
      // Null renders no chip at all — never a guessed default. This is the one
      // control whose job is to stop an accidental write to production.
      environment: r.environment,
      writeEnabled: r.writeEnabled,
      status: r.lastValidationStatus ?? "NEVER_TESTED",
      /*
       * The row's reading, from the same `connectionHealthVerdict` as the
       * counts (P0.2, A50): the screen draws its chip from this, so an OK
       * older than the TTL is drawn stale rather than green, and a row always
       * sits in exactly one count tile.
       */
      verdict: connectionHealthVerdict(r, now),
      // Moves only on a real 200. A stale value beside a failing status is the
      // truth about when it last worked, not a bug.
      lastValidatedAt: r.lastValidatedAt ? r.lastValidatedAt.toISOString() : null,
      neverTested: r.lastValidationStatus === null,
    })),
  });
}
