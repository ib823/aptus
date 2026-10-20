// @vitest-environment node
/**
 * Sign-up is limited per caller address at the edge (roadmap P0.13).
 *
 * POST /api/auth/signup used to share `auth:<ip>` at 30 a minute with every
 * other auth request. Each sign-up sends an email from this host's domain and,
 * with developer sign-up open, can lead to an organization, so it has its own
 * bucket: 10 an hour per address. The per-email bucket the edge cannot key is
 * the route's (tests/unit/api/auth-signup-developer.test.ts).
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimitModule from "@/lib/security/rate-limit";

const seen = vi.hoisted(() => [] as { key: string; limit: number; windowMs: number }[]);
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof RateLimitModule>();
  return {
    ...real,
    checkRateLimit: async (key: string, config: { limit: number; windowMs: number }) => {
      seen.push({ key, ...config });
      // The real in-memory window, so the eleventh call is genuinely refused.
      return real.checkRateLimit(key, config);
    },
  };
});

import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { middleware } from "@/middleware";

const post = (path: string, ip: string) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "x-real-ip": ip } });

describe("the sign-up bucket", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("is its own, per address, an hour wide", async () => {
    await middleware(post("/api/auth/signup", "10.9.0.1"));
    expect(seen).toEqual([{ key: "signup:10.9.0.1", ...RATE_LIMITS.signupPerIp }]);
    expect(RATE_LIMITS.signupPerIp).toEqual({ limit: 10, windowMs: 60 * 60 * 1000 });
  });

  it("refuses the eleventh sign-up from one address with 429, and not its neighbour", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await middleware(post("/api/auth/signup", "10.9.0.2"))).status);
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);

    expect((await middleware(post("/api/auth/signup", "10.9.0.3"))).status).not.toBe(429);
  });

  it("an ordinary sign-in stays in the shared auth bucket", async () => {
    await middleware(post("/api/auth/signin/email", "10.9.0.4"));
    expect(seen.map((s) => s.key)).toEqual(["auth:10.9.0.4"]);
  });
});
