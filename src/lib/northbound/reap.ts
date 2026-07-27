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
 * means the first run is boring and the backlog drains over a few nights.
 */

import { prisma } from "@/lib/db/prisma";

/** One night's work. Steady state is far below this; the cap protects run one. */
export const REAP_BATCH_LIMIT = 5_000;

export interface ReapResult {
  deleted: number;
  /** True when the cap was hit, so the caller can say the backlog is not clear. */
  moreRemaining: boolean;
}

/**
 * Delete expired keys, oldest first, up to the batch cap.
 *
 * Oldest-first is deliberate: it drains the backlog in the order it accumulated
 * rather than leaving an arbitrary residue that never quite clears.
 */
export async function reapExpiredIdempotencyKeys(
  now: Date = new Date(),
  limit: number = REAP_BATCH_LIMIT,
): Promise<ReapResult> {
  const doomed = await prisma.northboundIdempotencyKey.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });

  if (doomed.length === 0) return { deleted: 0, moreRemaining: false };

  const result = await prisma.northboundIdempotencyKey.deleteMany({
    where: { id: { in: doomed.map((d) => d.id) } },
  });

  return { deleted: result.count, moreRemaining: doomed.length === limit };
}
