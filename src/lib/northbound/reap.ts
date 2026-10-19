/**
 * Reaping expired idempotency keys.
 *
 * WHY THIS TABLE AND NOT THE AUDIT TABLE. `NorthboundAuditEvent` is append-only
 * by explicit guarantee, and retention there needs a stated period, a legal
 * basis and a tested exception — none of which should be invented alongside a
 * feature. `NorthboundIdempotencyKey` has none of those properties: it is
 * outside the append-only guarantee, `expiresAt` is already indexed, the TTL is
 * 24 hours, and `reserveIdempotencyKey` ALREADY treats an expired row as
 * garbage — it resets one in place on collision rather than honouring it. So
 * deleting an expired row removes nothing anyone can still use.
 *
 * WHY NOW. The operations console introduces the first query against this
 * table. Deferring the reaper would make a query this front is adding get
 * monotonically slower for no reason anyone chose.
 *
 * WHY A BOUNDED BATCH. An unbounded `deleteMany` on a table nobody has ever
 * swept could, on its first run, take a lock long enough to matter to live write
 * traffic — which reserves keys in this same table before touching SAP. The cap
 * bounds each lock, and the run repeats batches rather than stopping at one:
 * a single 5,000-row batch per night was the reaper's whole daily capacity,
 * below what one credential's 60-a-minute write budget can reserve, so a busy
 * deployment's backlog would only ever have grown. It stops early only on a
 * time budget under the route's `maxDuration`, and reports that as
 * `moreRemaining`.
 */

import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";

/** One batch: the most keys one scan selects and one round of deletes removes. */
export const REAP_BATCH_LIMIT = 5_000;

/** How long one run keeps taking batches — under the route's 300 s `maxDuration`. */
export const REAP_TIME_BUDGET_MS = 240_000;

export interface ReapResult {
  deleted: number;
  /**
   * True when the run stopped on its time budget with full batches still coming
   * back, so the caller can say the backlog is not clear.
   */
  moreRemaining: boolean;
}

/**
 * Delete expired keys, oldest first, a batch at a time, until a batch comes back
 * short or the time budget is spent.
 *
 * Oldest-first is deliberate: it drains the backlog in the order it accumulated
 * rather than leaving an arbitrary residue that never quite clears.
 */
export async function reapExpiredIdempotencyKeys(
  now: Date = new Date(),
  limit: number = REAP_BATCH_LIMIT,
  budgetMs: number = REAP_TIME_BUDGET_MS,
): Promise<ReapResult> {
  // Wall clock, not `now`: `now` fixes which keys are expired, this measures
  // how long the run itself has been going.
  const startedAt = Date.now();

  // The lookup below scans every tenant's expired keys — the reaper is a
  // platform maintenance job with no caller organization. Declared so the
  // attached tenant-scope guard permits it; the deletes still carry each
  // row's own organizationId.
  permitCrossTenantReads("northbound-reap: platform maintenance sweep");

  let deleted = 0;
  let moreRemaining = false;
  for (;;) {
    const doomed = await prisma.northboundIdempotencyKey.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, organizationId: true },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });

    if (doomed.length === 0) break;

    /*
     * DELETED PER TENANT, DELIBERATELY. The reaper is the one legitimate
     * cross-tenant sweep (a platform maintenance job has no caller organization)
     * — but the model is tenant-anchored, and the scope scan requires every
     * mutation's where to carry the organization rather than trusting the lookup
     * above it. Grouping by the org each doomed row belongs to satisfies the
     * invariant without weakening the sweep: the same rows die, and each DELETE
     * independently re-asserts whose rows it touches.
     */
    const byOrg = new Map<string, string[]>();
    for (const d of doomed) {
      const ids = byOrg.get(d.organizationId) ?? [];
      ids.push(d.id);
      byOrg.set(d.organizationId, ids);
    }
    for (const [organizationId, ids] of byOrg) {
      const result = await prisma.northboundIdempotencyKey.deleteMany({
        // Recheck expiry at deletion time: a reservation may have been renewed
        // since the scan. A stale sweep must never remove a live write's key.
        where: { organizationId, id: { in: ids }, expiresAt: { lt: now } },
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

  return { deleted, moreRemaining };
}
