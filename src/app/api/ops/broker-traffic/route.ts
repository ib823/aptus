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
import { opsLimit, opsWhere, opsWindowHours, requireOperations } from "@/lib/ops/guard";
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

  // ONE `where`, used by the row page AND by every aggregate below.
  //
  // WHY THE AGGREGATES EXIST. Every count on this response used to be derived
  // from `rows` — the page, capped at `limit` (default 100). A window holding
  // 5,000 calls reported `total: 100`, and `byStatus`, `bySolution`, `byToken`
  // and the environment-binding triad were all counted over the newest hundred.
  // `opsLimit`'s own doc comment reads "silent truncation is never acceptable",
  // which made it a self-contradiction rather than an oversight.
  //
  // So the page is now only the event list. Counts come from the database over
  // the whole window.
  const where = opsWhere(guard.actor, {
    at: { gte: since },
    ...(solutionId ? { solutionId } : {}),
    ...(environment ? { environment } : {}),
  });

  const rows = await prisma.northboundAuditEvent.findMany({
    where,
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

  const [total, statusGroups, emptyReads, solutionGroups, tokenGroups, noConnection, bindingPairs] =
    await Promise.all([
      prisma.northboundAuditEvent.count({ where }),
      prisma.northboundAuditEvent.groupBy({ by: ["status"], where, _count: { _all: true } }),
      // `classify` calls a 2xx with zero rows "empty", which no status code can
      // express on its own. Counted separately so the ok/empty split stays exact.
      prisma.northboundAuditEvent.count({ where: { ...where, status: { lt: 400 }, rowCount: 0 } }),
      prisma.northboundAuditEvent.groupBy({ by: ["solutionId"], where, _count: { _all: true } }),
      prisma.northboundAuditEvent.groupBy({ by: ["clientTokenId"], where, _count: { _all: true } }),
      // Refused at auth, throttle or the grant gate: no connection was ever
      // reached, so there is no binding to have agreed or disagreed.
      prisma.northboundAuditEvent.count({ where: { ...where, connectionId: null } }),
      // The credential/connection environment pair, grouped so the comparison
      // happens over the whole window. Prisma cannot compare two columns in a
      // `where`, but it can hand back every distinct pair with its count.
      prisma.northboundAuditEvent.groupBy({
        by: ["environment", "connectionEnvironment"],
        where: { ...where, connectionId: { not: null } },
        _count: { _all: true },
      }),
    ]);

  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) {
    // rowCount deliberately null here: the ok/empty split is applied below.
    const bucket = classify(g.status, null);
    byStatus[bucket] = (byStatus[bucket] ?? 0) + g._count._all;
  }
  if (emptyReads > 0) {
    byStatus.ok = (byStatus.ok ?? 0) - emptyReads;
    byStatus.empty = (byStatus.empty ?? 0) + emptyReads;
    if (byStatus.ok === 0) delete byStatus.ok;
  }

  const bySolution: Record<string, number> = {};
  for (const g of solutionGroups) bySolution[g.solutionId] = g._count._all;

  const byToken: Record<string, number> = {};
  for (const g of tokenGroups) byToken[g.clientTokenId] = g._count._all;

  // The environment pair. `environment` is the CREDENTIAL's declared value;
  // `connectionEnvironment` is the CONNECTION's own. Only the pair can show they
  // agreed — before the binding fix the broker could serve a PROD connection
  // while the row sincerely said SANDBOX.
  let bindingUnverified = 0;
  let bindingMismatch = 0;
  let bindingAgreed = 0;
  for (const g of bindingPairs) {
    const n = g._count._all;
    if (g.connectionEnvironment === null) bindingUnverified += n;
    else if (g.connectionEnvironment.toUpperCase() !== g.environment.toUpperCase()) {
      bindingMismatch += n;
    } else bindingAgreed += n;
  }

  const durations = rows
    .map((r) => r.durationMs)
    .filter((d): d is number => typeof d === "number")
    .sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)]! : null;

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: guard.actor.kind,
    // Every count below is over the WINDOW, not over `events`. `events` is a
    // page; `total` is the real number of calls the window holds.
    counts: { total, byStatus, bySolution, byToken },
    latency: {
      // Null, never zero, when nothing carried a duration. A zero would read as
      // "instantaneous" rather than "not measured".
      medianMs: median,
      measured: durations.length,
      unmeasured: rows.length - durations.length,
      // THE ONE NUMBER ON THIS RESPONSE THAT IS NOT WINDOW-WIDE, said plainly.
      // A percentile needs either every duration in memory or raw SQL; this is
      // the median of the returned page. `sampleSize` against `counts.total`
      // tells a screen exactly how much of the window it represents, so a
      // median over 40 rows cannot be presented as one over 4,000.
      basis: "returnedPage",
      sampleSize: rows.length,
    },
    environmentBinding: {
      // Counted, not inferred. This was `total - unverified - mismatch`, so
      // every call refused before a connection was reached — every 401, 403 and
      // 429 — landed in `agreed`. A window of pure failure reported a wall of
      // agreed bindings, which is wrong in the operator's favour.
      agreed: bindingAgreed,
      unverified: bindingUnverified,
      mismatch: bindingMismatch,
      notApplicable: noConnection,
    },
    truncated: total > rows.length,
    provenance: {
      floorNotCensus: true,
      missing: [
        "calls throttled by the edge IP bucket, which persists nothing",
        "calls that hit a platform timeout before any audit write",
        "calls whose audit write itself failed — the feed thins when the database struggles",
      ],
      // Distinct from `missing` above: those are calls with no row at all.
      // This is about rows that exist and are not in `events`.
      eventsAreAPage: {
        returned: rows.length,
        limit,
        of: total,
      },
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
