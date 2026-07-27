/**
 * The measurement plumbing the Operations Center reads.
 *
 * Three pieces, each of which would have been quietly wrong if built the obvious
 * way:
 *
 *   1. `peekRateLimit` must NOT spend the budget it reports. The obvious
 *      implementation — call checkRateLimit and render its `remaining` — is
 *      consuming, so a polling gauge would eat the per-credential northbound
 *      budget and could manufacture the very 429s it warns about.
 *   2. The reaper must be bounded, or its first run on a never-swept table takes
 *      a lock that matters to live write traffic reserving keys in the same
 *      table.
 *   3. `durationMs` must be null when no upstream call happened. A zero would
 *      claim "instant" where the truth is "never left".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundIdempotencyKey: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
  },
}));

import { reapExpiredIdempotencyKeys, REAP_BATCH_LIMIT } from "@/lib/northbound/reap";
import { checkRateLimit, peekRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.deleteMany.mockReset();
});

describe("peekRateLimit does not spend what it measures", () => {
  it("leaves the budget untouched across repeated peeks", async () => {
    const key = `peek-test-${Math.random().toString(36).slice(2)}`;
    const config = RATE_LIMITS.northbound;

    const first = await peekRateLimit(key, config);
    expect(first).not.toBeNull();
    expect(first!.remaining).toBe(config.limit);
    expect(first!.limit).toBe(config.limit);

    // A dashboard polls. If this consumed, `remaining` would walk down.
    for (let i = 0; i < 10; i++) await peekRateLimit(key, config);

    const after = await peekRateLimit(key, config);
    expect(after!.remaining).toBe(config.limit);
  });

  it("reflects consumption performed by the real check, without adding to it", async () => {
    const key = `peek-vs-check-${Math.random().toString(36).slice(2)}`;
    const config = RATE_LIMITS.northbound;

    await checkRateLimit(key, config);
    await checkRateLimit(key, config);

    const peeked = await peekRateLimit(key, config);
    // Two spent, and peeking three more times must not spend a third.
    expect(peeked!.remaining).toBe(config.limit - 2);
    await peekRateLimit(key, config);
    await peekRateLimit(key, config);
    expect((await peekRateLimit(key, config))!.remaining).toBe(config.limit - 2);
  });

  it("reports a full budget for a key nobody has touched", async () => {
    const fresh = await peekRateLimit(`untouched-${Date.now()}`, RATE_LIMITS.sapLive);
    expect(fresh).toEqual({ remaining: RATE_LIMITS.sapLive.limit, limit: RATE_LIMITS.sapLive.limit });
  });
});

describe("the idempotency reaper is bounded and honest about it", () => {
  it("deletes nothing, and says so, when there is nothing expired", async () => {
    mocks.findMany.mockResolvedValue([]);
    const result = await reapExpiredIdempotencyKeys();
    expect(result).toEqual({ deleted: 0, moreRemaining: false });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only rows past their expiry, oldest first", async () => {
    mocks.findMany.mockResolvedValue([{ id: "k1" }, { id: "k2" }]);
    mocks.deleteMany.mockResolvedValue({ count: 2 });

    const now = new Date("2026-07-27T00:00:00.000Z");
    const result = await reapExpiredIdempotencyKeys(now, 100);

    const where = mocks.findMany.mock.calls[0]![0];
    expect(where.where).toEqual({ expiresAt: { lt: now } });
    expect(where.orderBy).toEqual({ expiresAt: "asc" });
    expect(where.take).toBe(100);
    expect(result.deleted).toBe(2);
  });

  it("reports moreRemaining when it hits the cap, so a full run is not read as a clear backlog", async () => {
    // Reporting only "deleted: N" after a capped run reads as done. It is not.
    mocks.findMany.mockResolvedValue(Array.from({ length: 3 }, (_, i) => ({ id: `k${i}` })));
    mocks.deleteMany.mockResolvedValue({ count: 3 });

    const result = await reapExpiredIdempotencyKeys(new Date(), 3);
    expect(result).toEqual({ deleted: 3, moreRemaining: true });
  });

  it("does not report moreRemaining on a partial batch", async () => {
    mocks.findMany.mockResolvedValue([{ id: "k1" }]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const result = await reapExpiredIdempotencyKeys(new Date(), 10);
    expect(result.moreRemaining).toBe(false);
  });

  it("keeps a batch cap at all — an unbounded first sweep is the risk", () => {
    expect(REAP_BATCH_LIMIT).toBeGreaterThan(0);
    expect(Number.isFinite(REAP_BATCH_LIMIT)).toBe(true);
  });
});
