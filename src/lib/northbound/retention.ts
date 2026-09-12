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
 */

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

/** One night's work. Steady state is far below this; the cap protects run one. */
export const RETENTION_BATCH_LIMIT = 5_000;

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
  /** True when the cap was hit, so the caller can say the backlog is not clear. */
  moreRemaining: boolean;
  /** The period applied, echoed so a run is self-describing in CronRunLog. */
  retentionDays: number;
  /** Everything at or before this instant was eligible. */
  cutoff: string;
}

/**
 * Delete audit rows older than the retention period, oldest first, up to the cap.
 *
 * Oldest-first drains the backlog in the order it accumulated rather than
 * leaving an arbitrary residue that never quite clears — the same reasoning as
 * the idempotency reaper, and the reason both are safe to run nightly forever.
 */
export async function enforceNorthboundAuditRetention(
  now: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  limit: number = RETENTION_BATCH_LIMIT,
): Promise<RetentionResult> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  // A platform maintenance sweep has no caller organization, so the scan below
  // crosses tenants by design. Declared so the attached tenant-scope guard
  // permits it; every DELETE still re-asserts the organization it touches.
  permitCrossTenantReads("northbound-retention: platform maintenance sweep");

  const doomed = await prisma.northboundAuditEvent.findMany({
    where: { at: { lt: cutoff } },
    select: { id: true, organizationId: true },
    orderBy: { at: "asc" },
    take: limit,
  });

  if (doomed.length === 0) {
    return { deleted: 0, moreRemaining: false, retentionDays, cutoff: cutoff.toISOString() };
  }

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

  let deleted = 0;
  for (const [organizationId, ids] of byOrg) {
    const result = await prisma.northboundAuditEvent.deleteMany({
      // Re-check the age at deletion time. The scan and the delete are not in one
      // transaction, and a row is only ever eligible on its own age, so the
      // predicate is repeated rather than assumed.
      where: { organizationId, id: { in: ids }, at: { lt: cutoff } },
    });
    deleted += result.count;
  }

  return {
    deleted,
    moreRemaining: doomed.length === limit,
    retentionDays,
    cutoff: cutoff.toISOString(),
  };
}
