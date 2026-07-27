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
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

/** Observed probe outcomes. `null` is handled separately — it is not an outcome. */
const NEEDS_ATTENTION = new Set(["UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "ERROR"]);
const UNKNOWN = new Set(["NO_PROBE_PATH"]);

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
  let neverTested = 0;
  let bindingUnverified = 0;
  let prodConnections = 0;

  for (const r of rows) {
    const status = r.lastValidationStatus;
    const label = status ?? "NEVER_TESTED";
    byStatus[label] = (byStatus[label] ?? 0) + 1;

    if (status === null) neverTested++;
    else if (status === "OK") healthy++;
    else if (NEEDS_ATTENTION.has(status)) needsAttention++;
    else if (UNKNOWN.has(status)) unknown++;
    else unknown++; // an unrecognised value is unknown, never assumed healthy

    // The backlog, not a badge. A connection with no declared environment serves
    // reads flagged unverified and refuses writes outright; the count is work to
    // clear and is expected to trend to zero as environments are declared.
    if (r.environment === null || r.environment.trim().length === 0) bindingUnverified++;
    else if (r.environment.trim().toUpperCase() === "PROD") prodConnections++;
  }

  return studioOk({
    scope: guard.actor.kind,
    counts: {
      total: rows.length,
      healthy,
      needsAttention,
      unknown,
      neverTested,
      byStatus,
    },
    provenance: {
      // Named because a deactivated connection still exists and can be
      // reactivated, so "we have 3 connections" and "3 are listed here" are
      // different claims.
      activeOnly: true,
      excludedInactive: inactive,
      why: "A deactivated connection serves no traffic, so its probe status would be a stale claim about a system nothing is calling.",
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
      // Moves only on a real 200. A stale value beside a failing status is the
      // truth about when it last worked, not a bug.
      lastValidatedAt: r.lastValidatedAt ? r.lastValidatedAt.toISOString() : null,
      neverTested: r.lastValidationStatus === null,
    })),
  });
}
