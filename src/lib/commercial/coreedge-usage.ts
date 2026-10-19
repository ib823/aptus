/**
 * The nightly CoreEdge usage rollup — consumption per organization per day,
 * from the substrate that already exists (NorthboundAuditEvent).
 *
 * WHY A ROLLUP TABLE AND NOT LIVE AGGREGATION. The audit table grows without
 * bound; a Usage screen aggregating it live gets slower every week and puts an
 * unbounded scan behind an interactive request. The rollup is one bounded row
 * per organization-day, idempotent (upsert on the unique key), and the screen
 * reads ONLY rollups.
 *
 * A FLOOR, NOT A CENSUS — inherited from the feed it rolls up. Calls throttled
 * at the edge, calls that timed out before an audit write, and calls whose
 * audit write failed leave no row, so they are absent here too. Pricing built
 * on this data under-counts in the customer's favour, which is the only
 * acceptable direction to be wrong in.
 */

import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import { prisma } from "@/lib/db/prisma";
import { DEPLOYMENT_AUDIT_SCOPE } from "@/lib/sap-public/console-read-guard";

/** How many missing days one run may fill — the backfill is a loop, not a scan. */
export const ROLLUP_BACKFILL_LIMIT = 30;

export interface RollupRunResult {
  daysProcessed: number;
  rowsWritten: number;
  /** True when older unrolled days remain — the next nightly run continues. */
  moreRemaining: boolean;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Roll up ONE day. Exposed for tests; the cron drives it via the runner. */
export async function rollupDay(day: Date): Promise<number> {
  const start = utcMidnight(day);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  /*
   * BROKER TRAFFIC ONLY: `dryRun: false`. Two kinds of row carry dryRun — a Test
   * Console broker run (a builder rehearsing the pipeline from Studio) and a
   * console read (`recordConsoleRead`: a consultant on /api/sap/tdd/*, with no
   * solution and no credential). Both are real traffic on a real tenant and the
   * audit trail keeps them, but neither is a deployed application consuming the
   * broker, and the lane board already drops them as rehearsals. Counted here,
   * one press of Run and one `?probe=1` — whose rowCount is entity sets and
   * probes, not records — landed in Calls and Rows read on the record pricing is
   * chosen from: an over-count in the vendor's favour, the one direction the
   * header rules out. The deployment tenant's `-deployment-` sentinel is only
   * ever written on a console read, so it falls out with them; it is excluded
   * by name too, so it can never surface as an organization on the Usage screen.
   */
  const window = {
    at: { gte: start, lt: end },
    dryRun: false,
    organizationId: { not: DEPLOYMENT_AUDIT_SCOPE },
  };

  const [calls, rows, writes, refusals, byInterface, byCredential] = await Promise.all([
    prisma.northboundAuditEvent.groupBy({ by: ["organizationId"], where: window, _count: { _all: true } }),
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId"],
      // A served read OF AN INTERFACE. Discovery (`-discovery-`, no interface)
      // makes no SAP call; its rows written before it stopped recording the
      // interface count as rowCount are still inside retention, and this keeps
      // them from reading as SAP records.
      where: { ...window, operation: "READ", status: { lt: 400 }, interfaceId: { not: null } },
      _sum: { rowCount: true },
    }),
    // A REPLAY IS NOT A WRITE. A same-key retry re-serves the stored outcome
    // without calling SAP; counting its row billed one created record once per
    // retry — over-counting, the one direction this data must never be wrong in.
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId"],
      where: { ...window, operation: { not: "READ" }, status: { lt: 400 }, replayed: false },
      _count: { _all: true },
    }),
    // Refused before or at the gates: the caller's integration is failing,
    // which is a product signal (limit_hit-shaped), not billing volume.
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId"],
      where: { ...window, status: { in: [401, 403] } },
      _count: { _all: true },
    }),
    /*
     * DISTINCT COUNTS SKIP THE NULL GROUP, and an interface counts only where it
     * SERVED. SQL GROUP BY keeps NULL as a group of its own, so a discovery call
     * or a 429 (no interface) was one more Interface and a credential-less row
     * one more Credential — the group broker-traffic deliberately skips rather
     * than invent. And the data, schema and write routes record the raw path
     * parameter as interfaceId when they refuse it (404, 429), so every distinct
     * made-up id a key holder requested was one more Interface consumed. A
     * served call (< 400) can only name an interface that exists and is this
     * solution's; under-counting one that was only ever refused is the
     * acceptable direction.
     */
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId", "interfaceId"],
      where: { ...window, interfaceId: { not: null }, status: { lt: 400 } },
    }),
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId", "clientTokenId"],
      where: { ...window, clientTokenId: { not: null } },
    }),
  ]);

  const orgs = new Map<string, { calls: number; rowsRead: number; writes: number; refusals: number; interfaces: number; credentials: number }>();
  const entry = (org: string) => {
    const e = orgs.get(org) ?? { calls: 0, rowsRead: 0, writes: 0, refusals: 0, interfaces: 0, credentials: 0 };
    orgs.set(org, e);
    return e;
  };
  for (const g of calls) entry(g.organizationId).calls = g._count._all;
  for (const g of rows) entry(g.organizationId).rowsRead = g._sum.rowCount ?? 0;
  for (const g of writes) entry(g.organizationId).writes = g._count._all;
  for (const g of refusals) entry(g.organizationId).refusals = g._count._all;
  for (const g of byInterface) entry(g.organizationId).interfaces += 1;
  for (const g of byCredential) entry(g.organizationId).credentials += 1;

  /*
   * ONE TRANSACTION PER DAY. `runCoreEdgeUsageRollup` treats a day holding any
   * rollup row as covered, so a day must hold all of its organizations' rows or
   * none. Written one upsert at a time, a failure part-way through — a dropped
   * connection, the function's time limit — kept the organizations already
   * written, marked the day done for every other one, and no later run came
   * back for them: their usage for that day never appeared, and retention then
   * deleted the audit rows it could have been rebuilt from. As one batch a
   * failure rolls the whole day back, the day stays missing, and the next run
   * retries it.
   */
  const upserts = [...orgs].map(([organizationId, v]) =>
    prisma.coreEdgeUsageRollup.upsert({
      where: { organizationId_day: { organizationId, day: start } },
      create: {
        organizationId,
        day: start,
        calls: v.calls,
        rowsRead: v.rowsRead,
        writes: v.writes,
        refusals: v.refusals,
        distinctInterfaces: v.interfaces,
        distinctCredentials: v.credentials,
      },
      update: {
        calls: v.calls,
        rowsRead: v.rowsRead,
        writes: v.writes,
        refusals: v.refusals,
        distinctInterfaces: v.interfaces,
        distinctCredentials: v.credentials,
        computedAt: new Date(),
      },
    }),
  );
  if (upserts.length > 0) await prisma.$transaction(upserts);
  return upserts.length;
}

/**
 * Roll up every complete day that has audit rows and no rollup yet, newest
 * first, up to the backfill cap. Yesterday is always attempted (re-running is
 * an idempotent upsert), so a day whose late writes landed after the first
 * pass converges on the next run.
 *
 * "Holds a rollup row" stands for "covered" only because `rollupDay` writes a
 * day as one transaction — a day is never left holding some organizations'
 * rows and not others.
 */
export async function runCoreEdgeUsageRollup(now: Date = new Date()): Promise<RollupRunResult> {
  // The rollup serves every tenant in one run — declared, per the guard.
  permitCrossTenantReads("coreedge-usage-rollup: nightly cross-tenant aggregation");

  const today = utcMidnight(now);
  const oldest = await prisma.northboundAuditEvent.findFirst({
    orderBy: { at: "asc" },
    select: { at: true },
  });
  if (!oldest) return { daysProcessed: 0, rowsWritten: 0, moreRemaining: false };

  const floor = utcMidnight(oldest.at);
  const existing = await prisma.coreEdgeUsageRollup.findMany({
    select: { day: true },
    distinct: ["day"],
  });
  const done = new Set(existing.map((e) => e.day.getTime()));

  let daysProcessed = 0;
  let rowsWritten = 0;
  let moreRemaining = false;

  for (
    let day = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    day.getTime() >= floor.getTime();
    day = new Date(day.getTime() - 24 * 60 * 60 * 1000)
  ) {
    const isYesterday = daysProcessed === 0;
    if (!isYesterday && done.has(day.getTime())) continue;
    if (daysProcessed >= ROLLUP_BACKFILL_LIMIT) {
      moreRemaining = true;
      break;
    }
    rowsWritten += await rollupDay(day);
    daysProcessed++;
  }

  return { daysProcessed, rowsWritten, moreRemaining };
}
