/**
 * GET /api/ops/broker-traffic — what the northbound broker actually did.
 *
 * Reads `NorthboundAuditEvent`. Never writes: the trail is append-only, and this
 * module is a consumer of it. (Note the audit modules themselves are asserted to
 * export a writer and nothing else, so Ops read helpers live here rather than
 * being added there.)
 *
 * THE COUNTS ARE A FLOOR, NOT A CENSUS, and the response says so rather than
 * leaving a screen to imply otherwise. Three classes of call leave no row:
 *
 *   1. Throttled at the edge. /api/northbound/* also passes the generic IP-keyed
 *      middleware buckets, which fire BEFORE the per-token bucket and persist
 *      nothing.
 *   2. Platform timeouts. No northbound route sets maxDuration, so a tenant
 *      slower than the platform default yields a 504 before any audit write.
 *   3. Audit writes that failed. recordNorthboundCall swallows its own errors —
 *      correctly, since losing a caller's data to failed bookkeeping is worse —
 *      which means the feed thins exactly when the database is struggling.
 *
 * A dashboard that renders these numbers as complete would be most confidently
 * wrong at the moment things are going worst.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsLimit, opsOrgFilter, opsWindowHours, requireOperations } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

/** The honest-status buckets, in the vocabulary the console already uses. */
function classify(status: number, rowCount: number | null): string {
  if (status === 429) return "throttled";
  if (status >= 500) return "error";
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "needs_setup";
  if (status >= 400) return "refused";
  // 2xx with zero rows is a SUCCESSFUL read of an empty resource, and stays
  // distinct from every failure above. Collapsing it into one of them is the
  // exact dishonesty the status vocabulary exists to prevent.
  return rowCount === 0 ? "empty" : "ok";
}

export async function GET(request: NextRequest) {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const hours = opsWindowHours(params.get("hours"));
  const limit = opsLimit(params.get("limit"));
  const solutionId = params.get("solutionId");
  const environment = params.get("environment");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await prisma.northboundAuditEvent.findMany({
    where: {
      ...opsOrgFilter(guard.actor),
      at: { gte: since },
      ...(solutionId ? { solutionId } : {}),
      ...(environment ? { environment } : {}),
    },
    select: {
      id: true,
      solutionId: true,
      interfaceId: true,
      operation: true,
      externalId: true,
      environment: true,
      connectionId: true,
      connectionEnvironment: true,
      status: true,
      rowCount: true,
      durationMs: true,
      correlationId: true,
      clientTokenId: true,
      at: true,
    },
    orderBy: { at: "desc" },
    take: limit,
  });

  const byStatus: Record<string, number> = {};
  const bySolution: Record<string, number> = {};
  const byToken: Record<string, number> = {};
  const durations: number[] = [];
  let bindingUnverified = 0;
  let bindingMismatch = 0;

  for (const r of rows) {
    const bucket = classify(r.status, r.rowCount);
    byStatus[bucket] = (byStatus[bucket] ?? 0) + 1;
    bySolution[r.solutionId] = (bySolution[r.solutionId] ?? 0) + 1;
    byToken[r.clientTokenId] = (byToken[r.clientTokenId] ?? 0) + 1;
    if (typeof r.durationMs === "number") durations.push(r.durationMs);

    // The environment pair. `environment` is the CREDENTIAL's declared value;
    // `connectionEnvironment` is the CONNECTION's own. Only the pair can show
    // they agreed — before the binding fix the broker could serve a PROD
    // connection while the row sincerely said SANDBOX.
    if (r.connectionId !== null && r.connectionEnvironment === null) bindingUnverified++;
    else if (
      r.connectionEnvironment !== null &&
      r.connectionEnvironment.toUpperCase() !== r.environment.toUpperCase()
    ) {
      bindingMismatch++;
    }
  }

  durations.sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)]! : null;

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: guard.actor.kind,
    counts: { total: rows.length, byStatus, bySolution, byToken },
    latency: {
      // Null, never zero, when nothing in the window carried a duration. A zero
      // would read as "instantaneous" rather than "not measured".
      medianMs: median,
      measured: durations.length,
      // Stated so a screen cannot present a median over 3 rows as if it were
      // over 3,000 — and so pre-durationMs rows are visibly excluded.
      unmeasured: rows.length - durations.length,
    },
    environmentBinding: {
      agreed: rows.length - bindingUnverified - bindingMismatch,
      unverified: bindingUnverified,
      mismatch: bindingMismatch,
    },
    truncated: rows.length === limit,
    provenance: {
      floorNotCensus: true,
      missing: [
        "calls throttled by the edge IP bucket, which persists nothing",
        "calls that hit a platform timeout before any audit write",
        "calls whose audit write itself failed — the feed thins when the database struggles",
      ],
    },
    events: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      solutionId: r.solutionId,
      interfaceId: r.interfaceId,
      operation: r.operation,
      externalId: r.externalId,
      credentialEnvironment: r.environment,
      connectionEnvironment: r.connectionEnvironment,
      connectionId: r.connectionId,
      status: r.status,
      outcome: classify(r.status, r.rowCount),
      rowCount: r.rowCount,
      durationMs: r.durationMs,
      correlationId: r.correlationId,
      clientTokenId: r.clientTokenId,
    })),
  });
}
