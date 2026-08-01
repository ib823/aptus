/**
 * GET /api/ops/incidents — what needs attention, and why it is rated that way.
 *
 * This route gathers signals and nothing else. Every severity decision lives in
 * `@/lib/ops/incidents` as a named constant with its threshold and reasoning
 * attached, so a reader can reproduce any badge on this screen from the source.
 * A severity computed inline here would be a judgement no one could check.
 *
 * AN EMPTY LIST IS NOT A CLAIM OF HEALTH, and the response says so. The broker
 * audit feed is a floor, not a census — calls throttled at the edge, calls that
 * timed out before an audit write, and calls whose audit write itself failed all
 * leave no row. So "no incidents" means "nothing crossed a threshold in what we
 * can see", which is a materially weaker statement than "everything is fine",
 * and the difference matters most during an outage, when the feed thins.
 */

import type { NextRequest } from "next/server";

import type { $Enums } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { opsWhere, opsWindowHours, requireOperations } from "@/lib/ops/guard";
import {
  COUNTED_BINDING_REFUSALS,
  deriveIncidents,
  INCIDENT_RULES,
  INCIDENT_THRESHOLDS,
} from "@/lib/ops/incidents";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

/** Probe outcomes that mean the connection is not working, per connections-health. */
const UNHEALTHY = ["UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "ERROR"];

/** How far ahead a credential expiry is close enough to act on. */
const EXPIRY_RUNWAY_DAYS = 14;

/**
 * Decisions that actually confer access. Mirrors GRANTING in lib/studio/grants
 * — a REJECTED grant with no expiry is not an exposure, it is a refusal.
 */
const GRANTING_DECISIONS: $Enums.GrantDecision[] = ["APPROVED", "SANDBOX_ONLY", "READ_ONLY"];

export async function GET(request: NextRequest) {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  const hours = opsWindowHours(request.nextUrl.searchParams.get("hours"));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const now = new Date();
  const runway = new Date(now.getTime() + EXPIRY_RUNWAY_DAYS * 24 * 60 * 60 * 1000);

  const [
    bindingRefusals,
    unhealthyConnections,
    upstreamErrors,
    throttled,
    expiringCredentials,
    undeclared,
    unboundedGrants,
    credentialsWithoutExpiry,
    unaccountableProdGrants,
  ] = await Promise.all([
      // Calls the broker REFUSED because it could not bind them to a connection
      // for their environment. This replaces a comparison of two columns that the
      // binding guarantee makes equal by construction — see INCIDENT_RULES.
      //
      // The reason list is DERIVED from BINDING_REFUSAL_COVERAGE, not written
      // here. It used to be an inline array, and it drifted: when the resolver
      // gained NO_MATCH_FOR_CLIENT, this filter kept its old two entries, so a
      // credential bound to an SAP client no connection carries failed every
      // call while this critical rule reported zero. The coverage map forces an
      // explicit counted/excluded decision per reason, and a test reconciles it
      // against the resolver's own union.
      prisma.northboundAuditEvent.count({
        where: opsWhere(guard.actor, {
          at: { gte: since },
          bindingRefusal: { in: COUNTED_BINDING_REFUSALS },
        }),
      }),
      prisma.sapConnection.count({
        where: opsWhere(guard.actor, { isActive: true, lastValidationStatus: { in: UNHEALTHY } }),
      }),
      prisma.northboundAuditEvent.count({
        where: opsWhere(guard.actor, { at: { gte: since }, status: { gte: 500 } }),
      }),
      prisma.northboundAuditEvent.count({
        where: opsWhere(guard.actor, { at: { gte: since }, status: 429 }),
      }),
      prisma.solutionClient.count({
        where: opsWhere(guard.actor, {
          isActive: true,
          revokedAt: null,
          expiresAt: { gt: now, lte: runway },
        }),
      }),
      prisma.sapConnection.count({
        where: opsWhere(guard.actor, { isActive: true, environment: null }),
      }),
      /*
       * STANDING ACCESS. These three are NOT windowed by `since`, unlike every
       * count above. A grant that never ends is not an event that happened in
       * the last 24 hours — it is a condition that is true right now, and
       * windowing it would hide it on every screen except the day it was
       * created.
       */
      prisma.apiAccessGrant.count({
        where: opsWhere(guard.actor, {
          decision: { in: GRANTING_DECISIONS },
          expiresAt: null,
        }),
      }),
      // The case `expiring-credential` cannot see: no expiry means never
      // inside any runway.
      prisma.solutionClient.count({
        where: opsWhere(guard.actor, {
          isActive: true,
          revokedAt: null,
          expiresAt: null,
        }),
      }),
      prisma.apiAccessGrant.count({
        where: opsWhere(guard.actor, {
          decision: { in: GRANTING_DECISIONS },
          environment: "PROD",
          OR: [
            { solution: { status: { not: "ACTIVE" as $Enums.SolutionStatus } } },
            { solution: { technicalOwnerId: null } },
            { solution: { businessOwnerId: null } },
            { solution: { supportOwnerId: null } },
          ],
        }),
      }),
    ]);

  const incidents = deriveIncidents({
    bindingRefusals,
    unhealthyConnections,
    upstreamErrors,
    throttled,
    expiringCredentials,
    undeclaredEnvironmentConnections: undeclared,
    unboundedGrants,
    credentialsWithoutExpiry,
    unaccountableProdGrants,
  });

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: guard.actor.kind,
    counts: {
      total: incidents.length,
      critical: incidents.filter((i) => i.severity === "critical").length,
      major: incidents.filter((i) => i.severity === "major").length,
      minor: incidents.filter((i) => i.severity === "minor").length,
    },
    incidents,
    /** Every rule, firing or not — so a screen can show what is being watched. */
    rules: Object.values(INCIDENT_RULES).map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      firesWhen: r.firesWhen,
    })),
    thresholds: INCIDENT_THRESHOLDS,
    provenance: {
      floorNotCensus: true,
      emptyIsNotHealthy:
        "An empty list means nothing crossed a threshold in what the audit feed recorded. Calls throttled at the edge, calls that timed out before an audit write, and calls whose audit write failed leave no row — and the feed thins exactly when the database is struggling.",
      severitiesAreReproducible:
        "Every severity comes from a named rule in lib/ops/incidents with its threshold and reasoning attached. Nothing on this response is scored at request time.",
      expiryRunwayDays: EXPIRY_RUNWAY_DAYS,
    },
  });
}
