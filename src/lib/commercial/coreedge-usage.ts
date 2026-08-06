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
  const window = { at: { gte: start, lt: end } };

  const [calls, rows, writes, refusals, byInterface, byCredential] = await Promise.all([
    prisma.northboundAuditEvent.groupBy({ by: ["organizationId"], where: window, _count: { _all: true } }),
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId"],
      where: { ...window, operation: "READ", status: { lt: 400 } },
      _sum: { rowCount: true },
    }),
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId"],
      where: { ...window, operation: { not: "READ" }, status: { lt: 400 } },
      _count: { _all: true },
    }),
    // Refused before or at the gates: the caller's integration is failing,
    // which is a product signal (limit_hit-shaped), not billing volume.
    prisma.northboundAuditEvent.groupBy({
      by: ["organizationId"],
      where: { ...window, status: { in: [401, 403] } },
      _count: { _all: true },
    }),
    prisma.northboundAuditEvent.groupBy({ by: ["organizationId", "interfaceId"], where: window }),
    prisma.northboundAuditEvent.groupBy({ by: ["organizationId", "clientTokenId"], where: window }),
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

  let written = 0;
  for (const [organizationId, v] of orgs) {
    await prisma.coreEdgeUsageRollup.upsert({
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
    });
    written++;
  }
  return written;
}

/**
 * Roll up every complete day that has audit rows and no rollup yet, newest
 * first, up to the backfill cap. Yesterday is always attempted (re-running is
 * an idempotent upsert), so a day whose late writes landed after the first
 * pass converges on the next run.
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
