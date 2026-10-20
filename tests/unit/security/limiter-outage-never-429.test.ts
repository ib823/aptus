// @vitest-environment node
/**
 * A rate-limiter outage is never reported as throttling (audit A44, roadmap
 * P0.5).
 *
 * In production the limiter fails CLOSED when Upstash cannot be reached — a
 * deliberate trade, kept: the per-instance fallback is no limit at all on
 * serverless, and the buckets guard sign-in brute force and load on customers'
 * SAP systems. The defect was the answer. The outage came back in the same
 * `{ allowed: false }` shape as a real limit hit, so every caller said 429
 * "Too many requests": the northbound routes told every credential it was
 * throttled, audited a 429 the traffic screen files under "throttled" and the
 * incident feed counts, and developers backed off or debugged their own call
 * rate during a broker-side failure.
 *
 * It is now 503 LIMITER_UNAVAILABLE with Retry-After, on every route class the
 * middleware limits. Upstash is mocked to throw; NODE_ENV is production so the
 * fail-closed branch is the one under test.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limit = vi.hoisted(() => vi.fn());

vi.mock("@upstash/redis/cloudflare", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    limit = limit;
    getRemaining = vi.fn();
  },
}));

beforeEach(() => {
  vi.resetModules();
  limit.mockReset().mockRejectedValue(new Error("Upstash: fetch failed (ECONNREFUSED)"));
  // Read at module load, so they are set before each dynamic import.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("checkRateLimit tells an outage from a limit", () => {
  it("still refuses during an outage, and says why", async () => {
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    const r = await checkRateLimit("k", RATE_LIMITS.northbound);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("unavailable");
    expect(r.resetMs).toBeGreaterThan(0);
  });

  it("a real limit hit is 'limited'", async () => {
    limit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 5_000 });
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    const r = await checkRateLimit("k", RATE_LIMITS.northbound);
    expect(r).toMatchObject({ allowed: false, reason: "limited" });
  });
});

describe("the middleware never answers 429 for an outage", () => {
  const cases: Array<[string, string, string, Record<string, string>]> = [
    ["a browser API read", "GET", "/api/studio/solutions", {}],
    ["a browser API mutation", "POST", "/api/studio/solutions", {}],
    ["a sign-in", "POST", "/api/auth/callback/email", {}],
    ["a passkey step-up", "POST", "/api/auth/webauthn/step-up/verify", {}],
    ["a live SAP route", "GET", "/api/sap/tdd/preview", {}],
    ["report generation", "POST", "/api/assessments/a1/report/pdf", {}],
    ["a machine read with a key", "GET", "/api/northbound/interfaces/if_1/data", { authorization: "Bearer ce_k" }],
    ["a machine write with a key", "POST", "/api/northbound/interfaces/if_1/data/write", { authorization: "Bearer ce_k" }],
    ["a machine call with no key", "GET", "/api/northbound/interfaces", {}],
  ];

  it.each(cases)("%s: 503 LIMITER_UNAVAILABLE with Retry-After", async (_label, method, path, headers) => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(
      new NextRequest(`http://localhost${path}`, { method, headers: { "x-real-ip": "203.0.113.9", ...headers } }),
    );
    expect(res.status).not.toBe(429);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("LIMITER_UNAVAILABLE");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
