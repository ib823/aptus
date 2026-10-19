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

/**
 * Roll up ONE day. Exposed for tests and for `rerollRetainedUsage`; the cron
 * drives it via the runner.
 *
 * ONLY FOR A DAY THE AUDIT FEED STILL HOLDS WHOLE. The day's rollup is made to
 * match the feed exactly, rows the feed no longer supports included, so on a
 * day retention has eaten into it would replace real usage with what is left.
 * Both callers keep to that: see `runCoreEdgeUsageRollup` and
 * `rerollRetainedUsage`.
 */
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
   *
   * AND A RE-ROLL CONVERGES. Upserts alone only ever add: an organization the
   * current rules no longer count — `-deployment-`, or one whose only traffic
   * that day was console reads and Test Console runs — kept the row an earlier
   * rollup wrote for it, and the Usage screen kept adding it into its totals.
   * The day's rows for every organization not recomputed are deleted in the
   * same transaction, so after a re-roll the day holds what the rules say and
   * nothing else, including when that is nothing at all.
   */
  const recomputed = [...orgs.keys()];
  const stale = prisma.coreEdgeUsageRollup.deleteMany({
    where: { day: start, organizationId: { notIn: recomputed } },
  });
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
  await prisma.$transaction([stale, ...upserts]);
  return upserts.length;
}

/**
 * Roll up every complete day that has audit rows and no rollup yet, newest
 * first, up to the backfill cap. Yesterday is always attempted (re-running
 * makes the day match the feed again), so a day whose late writes landed after
 * the first pass converges on the next run. No OLDER day is re-rolled: when the
 * counting rules change, `rerollRetainedUsage` is what brings those up to date.
 *
 * "Holds a rollup row" stands for "covered" only because `rollupDay` writes a
 * day as one transaction — a day is never left holding some organizations'
 * rows and not others.
 */
export async function runCoreEdgeUsageRollup(now: Date = new Date()): Promise<RollupRunResult> {
  // The rollup serves every tenant in one run — declared, per the guard.
  permitCrossTenantReads("coreedge-usage-rollup: nightly cross-tenant aggregation");

  const today = utcMidnight(now);

  /*
   * THE SENTINEL IS NEVER AN ORGANIZATION. `rollupDay` stopped writing
   * `-deployment-` rows, but a rollup from before that wrote one for any day a
   * global admin read the deployment tenant, and the Usage screen sums every row
   * it finds for up to 180 days — well past the audit feed's retention, so most
   * of those days can never be re-rolled. They are removed here, on every run:
   * a no-op once they are gone. Done before `done` is read, so a day whose only
   * row was the sentinel goes back through the backfill like any missing day.
   */
  await prisma.coreEdgeUsageRollup.deleteMany({ where: { organizationId: DEPLOYMENT_AUDIT_SCOPE } });

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

export interface RerollResult {
  /** Days re-rolled, newest first — every day the feed holds whole, through yesterday. */
  daysRerolled: number;
  rowsWritten: number;
  /** The oldest day re-rolled, or null when the feed holds no whole day. */
  from: string | null;
}

/**
 * Re-roll every day the audit feed still holds WHOLE, under the current rules.
 *
 * WHY THIS EXISTS. The runner rolls a day once and then treats it as covered,
 * re-running only yesterday. That is right while the rules stand still and
 * wrong the moment they change: every day rolled before the change keeps the
 * old answer. When `rollupDay` stopped counting dry runs, console reads and
 * discovery, the rows already written kept those figures — over-counts, the one
 * direction the header rules out — for as long as the Usage screen shows them.
 * The figures for a day can be recomputed for exactly as long as its audit rows
 * survive, so this recomputes all of those and leaves every other day alone.
 *
 * WHOLE, NOT MERELY PRESENT. Retention deletes by age, not by calendar day, so
 * the oldest audit row's own day has usually lost its earlier hours; re-rolling
 * it would replace a complete figure with a partial one, and drop outright any
 * organization whose calls that day were all in the part already deleted. That
 * day, and every day before it, keeps the rollup it has.
 *
 * WHOLE IS DECIDED AGAIN BEFORE EVERY DAY, not once before the loop. The
 * northbound-retention sweep moves its cutoff about a day forward each night,
 * into exactly the oldest whole day — the one this loop, newest first, reaches
 * last. Decided once, a sweep that ran while the loop did left that day's
 * figures to be recomputed from what survived it, and the convergence delete
 * then removed every organization whose calls that day were all before the
 * cutoff. Read again, the oldest row says where retention has got to now, and
 * the loop stops at the first day it has reached. That cannot close the moment
 * between the check and the day's own reads, so the script is not run while
 * the sweep is (03:45 UTC).
 *
 * IDEMPOTENT AND SAFE TO RE-RUN: each day is one transaction that makes the
 * day's rows match its audit rows, so a second run writes what the first did,
 * plus any audit rows that landed in between. Run by
 * `scripts/reroll-coreedge-usage.ts` once a change to the rules is deployed.
 */
export async function rerollRetainedUsage(now: Date = new Date()): Promise<RerollResult> {
  permitCrossTenantReads("coreedge-usage-reroll: re-rolling every retained day, every tenant");

  await prisma.coreEdgeUsageRollup.deleteMany({ where: { organizationId: DEPLOYMENT_AUDIT_SCOPE } });

  let daysRerolled = 0;
  let rowsWritten = 0;
  let from: string | null = null;
  let day = new Date(utcMidnight(now).getTime() - 24 * 60 * 60 * 1000);
  for (;;) {
    const firstWhole = await firstWholeRetainedDay();
    if (firstWhole === null || day.getTime() < firstWhole.getTime()) break;
    rowsWritten += await rollupDay(day);
    daysRerolled++;
    from = day.toISOString();
    day = new Date(day.getTime() - 24 * 60 * 60 * 1000);
  }
  return { daysRerolled, rowsWritten, from };
}

/** The first day the retained audit feed holds whole, or null when it holds no row. */
async function firstWholeRetainedDay(): Promise<Date | null> {
  const oldest = await prisma.northboundAuditEvent.findFirst({
    orderBy: { at: "asc" },
    select: { at: true },
  });
  if (!oldest) return null;
  // A row at exactly midnight starts a whole day; anything later may not.
  const oldestDay = utcMidnight(oldest.at);
  return oldest.at.getTime() === oldestDay.getTime() ? oldestDay : new Date(oldestDay.getTime() + 24 * 60 * 60 * 1000);
}
