/**
 * Retention for the northbound audit trail.
 *
 * WHAT THIS CHANGES ABOUT AN "APPEND-ONLY" TABLE, said plainly. `audit.ts`
 * guarantees that no code path EDITS a row: there is a write helper and nothing
 * else, and a test asserts no module anywhere issues an update or a delete
 * against it. That guarantee is about integrity — a recorded call cannot be
 * rewritten to say something else — and it is untouched here. Retention is a
 * different property: rows expire as a whole, by age, on a stated schedule, and
 * a row that is deleted leaves no altered version behind. Append-only and
 * bounded are compatible; append-only and unbounded is just a table nobody has
 * decided about.
 *
 * `reap.ts` declined to sweep this table and gave three conditions for doing it
 * later: "a stated period, a legal basis and a tested exception". All three are
 * met here, deliberately and in the open:
 *
 *   PERIOD — 30 days by default, `NORTHBOUND_AUDIT_RETENTION_DAYS` to change it.
 *     Thirty days is the window the operations console actually queries: the
 *     traffic board clamps to 30 days (`opsWindowHours` caps at 24 * 30), so a
 *     row older than that is invisible to every screen that reads this table.
 *     Keeping data no surface can show, on a table with no bound, is how a
 *     correlation lookup gets slower every night for no one's benefit.
 *
 *   LEGAL BASIS — these rows record that a named credential or a named person
 *     caused a read of a client's SAP system. That is personal data about the
 *     actor and commercially sensitive data about the client, held for security
 *     and operational necessity. Necessity ends when the last screen that can
 *     display it stops being able to. A deployment with a longer obligation
 *     raises the variable; one with a shorter one lowers it.
 *
 *   TESTED EXCEPTION — the floor. Retention cannot be configured below
 *     `MINIMUM_RETENTION_DAYS`, because a deployment that sets it to zero has
 *     not shortened its retention, it has switched off its audit trail, and that
 *     should be a decision someone makes in code review rather than in an
 *     environment variable. An out-of-range value is REFUSED, not clamped
 *     silently: see `resolveRetentionDays`.
 *
 * WHY BOUNDED BATCHES, same as the reaper: a table nobody has ever swept can
 * hold a very large first night, and an unbounded `deleteMany` would take a lock
 * long enough to matter to the write path that records live traffic into it.
 *
 * AND WHY THE BATCHES REPEAT. One batch per night made 5,000 rows a day the
 * sweep's whole capacity — while one integration polling every 15 seconds
 * writes 5,760, and the broker's own per-credential budget allows 86,400.
 * Above the cap the backlog grew without bound and the oldest row aged past the
 * stated period by about half a day a night, each run recorded as a success.
 * So a run repeats the batch until one comes back short, and stops early only
 * on a time budget under the route's `maxDuration` — the one case it reports
 * as `moreRemaining`.
 *
 * AND THE CONSOLE'S PLATFORM-SCOPE COPY (P0.14b). A Workbench console read
 * also leaves a PlatformConsoleRead row: the same record of the same read, on
 * the same legal basis, so it expires on the same period, in the same run
 * (`sweepConsoleReads`). So do the SAP_CONSOLE_READ rows a pre-release P0.14b
 * build wrote to PlatformAuditEvent; the write-back's rows on that table are
 * never swept.
 */

import { PLATFORM_CONSOLE_READ_ACTION } from "@/lib/audit/platform-audit";
import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";

/** The default, and the window every operations screen can actually query. */
export const DEFAULT_RETENTION_DAYS = 30;

/**
 * The floor. Below this a deployment is not shortening retention, it is
 * disabling the audit trail — which is a code-review decision, not a config one.
 */
export const MINIMUM_RETENTION_DAYS = 7;

/** A ceiling, so a typo cannot quietly mean "never delete anything". */
export const MAXIMUM_RETENTION_DAYS = 3_650;

/** One batch: the most rows one scan selects and one round of deletes removes. */
export const RETENTION_BATCH_LIMIT = 5_000;

/**
 * How long one run keeps taking batches — under the route's `maxDuration` of
 * 300 s, with room left to record the run. A run that stops on this has not
 * cleared the backlog, and says so.
 */
export const RETENTION_TIME_BUDGET_MS = 240_000;

export type RetentionConfig =
  | { ok: true; days: number; source: "default" | "environment" }
  | { ok: false; reason: string };

/**
 * Read the configured retention period.
 *
 * REFUSES rather than clamps. A deployment that set `0` meant something by it,
 * and silently treating that as 7 would leave an operator believing the trail is
 * off while it is on — or the reverse. The job surfaces the refusal and does
 * nothing, which is the safe direction: failing to delete is recoverable,
 * deleting on a misread setting is not.
 */
export function resolveRetentionDays(
  raw: string | undefined = process.env.NORTHBOUND_AUDIT_RETENTION_DAYS,
): RetentionConfig {
  if (raw === undefined || raw.trim() === "") {
    return { ok: true, days: DEFAULT_RETENTION_DAYS, source: "default" };
  }
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed)) {
    return {
      ok: false,
      reason: `NORTHBOUND_AUDIT_RETENTION_DAYS must be a whole number of days; got "${raw}".`,
    };
  }
  if (parsed < MINIMUM_RETENTION_DAYS || parsed > MAXIMUM_RETENTION_DAYS) {
    return {
      ok: false,
      reason:
        `NORTHBOUND_AUDIT_RETENTION_DAYS must be between ${MINIMUM_RETENTION_DAYS} and ` +
        `${MAXIMUM_RETENTION_DAYS} days; got ${parsed}. Below the floor is not a shorter ` +
        `retention, it is no audit trail — change it in code if that is genuinely intended.`,
    };
  }
  return { ok: true, days: parsed, source: "environment" };
}

export interface RetentionResult {
  deleted: number;
  /** The console's platform-scope read rows deleted on the same period (sweepConsoleReads, P0.14b). */
  consoleReadsDeleted: number;
  /**
   * True when the run stopped on its time budget with full batches still coming
   * back — the backlog is not clear and rows past the period remain.
   */
  moreRemaining: boolean;
  /** The period applied, echoed so a run is self-describing in CronRunLog. */
  retentionDays: number;
  /** Everything at or before this instant was eligible. */
  cutoff: string;
}

/**
 * Delete audit rows older than the retention period, oldest first, a batch at a
 * time, until a batch comes back short or the time budget is spent.
 *
 * Oldest-first drains the backlog in the order it accumulated rather than
 * leaving an arbitrary residue that never quite clears — the same reasoning as
 * the idempotency reaper, and the reason both are safe to run nightly forever.
 */
export async function enforceNorthboundAuditRetention(
  now: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  limit: number = RETENTION_BATCH_LIMIT,
  budgetMs: number = RETENTION_TIME_BUDGET_MS,
): Promise<RetentionResult> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  // Wall clock, not `now`: `now` fixes which rows are eligible, this measures
  // how long the run itself has been going.
  const startedAt = Date.now();

  // A platform maintenance sweep has no caller organization, so the scan below
  // crosses tenants by design. Declared so the attached tenant-scope guard
  // permits it; every DELETE still re-asserts the organization it touches.
  permitCrossTenantReads("northbound-retention: platform maintenance sweep");

  let deleted = 0;
  let moreRemaining = false;
  for (;;) {
    const doomed = await prisma.northboundAuditEvent.findMany({
      where: { at: { lt: cutoff } },
      select: { id: true, organizationId: true },
      orderBy: { at: "asc" },
      take: limit,
    });

    if (doomed.length === 0) break;

    /*
     * DELETED PER TENANT, for the same reason the reaper does it: the model is
     * tenant-anchored and the scope guard requires every mutation's `where` to
     * carry the organization rather than trusting the lookup above it. The same
     * rows die either way; each DELETE independently re-asserts whose they were.
     */
    const byOrg = new Map<string, string[]>();
    for (const d of doomed) {
      const ids = byOrg.get(d.organizationId) ?? [];
      ids.push(d.id);
      byOrg.set(d.organizationId, ids);
    }

    for (const [organizationId, ids] of byOrg) {
      const result = await prisma.northboundAuditEvent.deleteMany({
        // Re-check the age at deletion time. The scan and the delete are not in one
        // transaction, and a row is only ever eligible on its own age, so the
        // predicate is repeated rather than assumed.
        where: { organizationId, id: { in: ids }, at: { lt: cutoff } },
      });
      deleted += result.count;
    }

    // A short batch is the bottom of the backlog: nothing older is left.
    if (doomed.length < limit) break;
    if (Date.now() - startedAt >= budgetMs) {
      moreRemaining = true;
      break;
    }
  }

  // The console's platform-scope copy of the same reads, on the same period,
  // in what is left of the budget (see sweepConsoleReads).
  let consoleReadsDeleted = 0;
  if (!moreRemaining) {
    const swept = await sweepConsoleReads(cutoff, limit, startedAt, budgetMs);
    consoleReadsDeleted = swept.deleted;
    moreRemaining = swept.moreRemaining;
  }

  return {
    deleted,
    consoleReadsDeleted,
    moreRemaining,
    retentionDays,
    cutoff: cutoff.toISOString(),
  };
}

/**
 * THE CONSOLE'S PLATFORM-SCOPE READ ROWS (P0.14b review). Since the Workbench
 * console runs on the governed pipeline (lib/governed/console.ts), every
 * console read leaves, beside the organization's own row swept above, a
 * platform-scope copy in PlatformConsoleRead naming the reader, their email
 * and organization, and the client's tenant, service and entity set. It is
 * the same record of the same read: personal data about the actor and
 * commercially sensitive data about the client, held for the same necessity,
 * which ends on the same day. Kept forever, a person's console activity
 * outlived the organization's trail (and the organization), on a table that
 * grows by a row per console call.
 *
 * So it expires on the same period, the age re-asserted in the delete as the
 * sweep above re-asserts it.
 *
 * AND THE ROWS A PRE-RELEASE BUILD WROTE ELSEWHERE. Before integration review
 * round 4 a console read was a PlatformAuditEvent row (action
 * SAP_CONSOLE_READ) with its PlatformAuditOutcome; a database that build wrote
 * to keeps them, so they expire on the same period too. ONLY that action: the
 * write-back's rows on the same table (P0.7) record a change made to a
 * client's SAP system and are not swept at any age. Each outcome row is held
 * by a RESTRICT foreign key, so an event and its outcome are deleted together,
 * in one transaction, with the action and the age re-asserted in both deletes.
 */
async function sweepConsoleReads(
  cutoff: Date,
  limit: number,
  startedAt: number,
  budgetMs: number,
): Promise<{ deleted: number; moreRemaining: boolean }> {
  let deleted = 0;
  for (;;) {
    const doomed = await prisma.platformConsoleRead.findMany({
      where: { at: { lt: cutoff } },
      select: { id: true },
      orderBy: { at: "asc" },
      take: limit,
    });
    if (doomed.length === 0) break;
    const result = await prisma.platformConsoleRead.deleteMany({
      where: { id: { in: doomed.map((d) => d.id) }, at: { lt: cutoff } },
    });
    deleted += result.count;
    if (doomed.length < limit) break;
    if (Date.now() - startedAt >= budgetMs) return { deleted, moreRemaining: true };
  }

  const consoleRead = { action: PLATFORM_CONSOLE_READ_ACTION, at: { lt: cutoff } };
  for (;;) {
    const doomed = await prisma.platformAuditEvent.findMany({
      where: consoleRead,
      select: { id: true },
      orderBy: { at: "asc" },
      take: limit,
    });
    if (doomed.length === 0) break;
    const ids = doomed.map((d) => d.id);
    const [, events] = await prisma.$transaction([
      prisma.platformAuditOutcome.deleteMany({ where: { eventId: { in: ids }, event: { is: consoleRead } } }),
      prisma.platformAuditEvent.deleteMany({ where: { id: { in: ids }, ...consoleRead } }),
    ]);
    deleted += events.count;
    if (doomed.length < limit) break;
    if (Date.now() - startedAt >= budgetMs) return { deleted, moreRemaining: true };
  }
  return { deleted, moreRemaining: false };
}
