/**
 * `peekRateLimit` must not spend the budget it reports — on the SHARED backend too.
 *
 * WHY THIS FILE EXISTS SEPARATELY. The existing peek tests
 * (`tests/unit/northbound/ops-plumbing.test.ts`) run with no `UPSTASH_*` env
 * vars, so `getLimiter` returns null and every one of them exercises only the
 * in-memory branch. They prove nothing about production, where a shared Redis
 * backend is mandatory — and production is the only place where a polling
 * dashboard could actually spend a customer's per-credential budget.
 *
 * The distinction that matters: `limit()` CONSUMES a token, `getRemaining()`
 * does not. A gauge built on the former eats the budget it displays and, on the
 * tight northbound bucket, can manufacture the 429s it exists to warn about.
 * So this asserts the API choice directly: peek calls `getRemaining` and never
 * `limit`, while `checkRateLimit` does the opposite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  limit: vi.fn(),
  getRemaining: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {}
  },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    limit = spies.limit;
    getRemaining = spies.getRemaining;
  },
}));

beforeEach(() => {
  vi.resetModules();
  spies.limit.mockReset().mockResolvedValue({ success: true, remaining: 41, reset: Date.now() + 1000 });
  spies.getRemaining.mockReset().mockResolvedValue(41);
  // Read at module load, so they must be set before the dynamic import below.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("on the shared backend", () => {
  it("peeks with getRemaining and never calls limit", async () => {
    const { peekRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");

    const result = await peekRateLimit("northbound:client_1", RATE_LIMITS.northbound);

    expect(spies.getRemaining).toHaveBeenCalledWith("northbound:client_1");
    // The whole point. `limit()` would spend a token from the caller's budget.
    expect(spies.limit).not.toHaveBeenCalled();
    expect(result).toEqual({ remaining: 41, limit: RATE_LIMITS.northbound.limit });
  });

  it("stays non-consuming across repeated polls", async () => {
    const { peekRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    for (let i = 0; i < 5; i++) await peekRateLimit("k", RATE_LIMITS.northbound);
    expect(spies.getRemaining).toHaveBeenCalledTimes(5);
    expect(spies.limit).not.toHaveBeenCalled();
  });

  it("checkRateLimit still CONSUMES — the contrast the split exists for", async () => {
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    await checkRateLimit("k", RATE_LIMITS.northbound);
    expect(spies.limit).toHaveBeenCalledTimes(1);
    expect(spies.getRemaining).not.toHaveBeenCalled();
  });

  it("accepts the object form of getRemaining as well as the number form", async () => {
    // Upstash has returned both shapes across versions; the reader handles each
    // rather than trusting one and producing NaN on the other.
    spies.getRemaining.mockResolvedValue({ remaining: 7, reset: Date.now() });
    const { peekRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    expect((await peekRateLimit("k", RATE_LIMITS.northbound))?.remaining).toBe(7);
  });

  it("reports UNKNOWN, not zero, when the backend errors", async () => {
    // Zero would render as "this credential is throttled" — a fabricated claim
    // about a customer's traffic. Null lets the screen say "unknown", and
    // nothing is gated on the answer, so failing open here is correct.
    spies.getRemaining.mockRejectedValue(new Error("redis down"));
    const { peekRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    expect(await peekRateLimit("k", RATE_LIMITS.northbound)).toBeNull();
  });
});
