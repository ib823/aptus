// @vitest-environment node
/**
 * The northbound routes answer a limiter outage as an outage (audit A44).
 *
 * Each route checks its credential's own bucket after authenticating. During
 * an Upstash outage that check refuses (the limiter fails closed in
 * production), and every route said 429 RATE_LIMITED "Too many requests for
 * this client credential", audited a 429 — "throttled" on the traffic screen,
 * counted by the throttled incident — and told a developer to slow down when
 * nothing about their traffic had changed.
 *
 * Now: 503 LIMITER_UNAVAILABLE with Retry-After, audited 503 with failureReason
 * LIMITER_UNAVAILABLE. A real limit hit is still 429 RATE_LIMITED.
 *
 * The second half is a source guard: every route that calls checkRateLimit
 * must tell an outage apart, so a route added later cannot quietly bring the
 * old answer back.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "@/lib/security/rate-limit";

const { audit, rate } = vi.hoisted(() => ({
  audit: vi.fn(),
  rate: { value: { allowed: true, remaining: 0, resetMs: 0 } as Record<string, unknown> },
}));

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "client_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      scope: { organizationId: "org_a" },
      environment: "SANDBOX",
      sapClient: null,
    },
  }),
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/write-credential", () => ({ verifyWriteCredential: async () => true }));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: audit }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimit>()),
  checkRateLimit: async () => rate.value,
}));

import { GET as discovery } from "@/app/api/northbound/interfaces/route";
import { GET as data } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as write } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { GET as schema } from "@/app/api/northbound/interfaces/[id]/schema/route";

const params = { params: Promise.resolve({ id: "if_1" }) };
const headers = { authorization: "Bearer ce_test", "x-coreedge-write-key": "cew_test" };
const ROUTES: Array<[string, () => Promise<Response>]> = [
  ["discovery", () => discovery(new NextRequest("http://localhost/api/northbound/interfaces", { headers }))],
  ["data", () => data(new NextRequest("http://localhost/api/northbound/interfaces/if_1/data", { headers }), params)],
  ["schema", () => schema(new NextRequest("http://localhost/api/northbound/interfaces/if_1/schema", { headers }), params)],
  [
    "write",
    () =>
      write(
        new NextRequest("http://localhost/api/northbound/interfaces/if_1/data/write", { method: "POST", headers }),
        params,
      ),
  ],
];

beforeEach(() => {
  audit.mockReset().mockResolvedValue(undefined);
});

describe("a limiter outage on the northbound routes", () => {
  it.each(ROUTES)("%s: 503 LIMITER_UNAVAILABLE, audited 503 with its reason — never 429", async (_name, call) => {
    rate.value = { allowed: false, remaining: 0, resetMs: 30_000, reason: "unavailable" };
    const res = await call();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; correlationId: string } };
    expect(body.error.code).toBe("LIMITER_UNAVAILABLE");
    expect(res.headers.get("retry-after")).toBe("30");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]![0]).toMatchObject({
      status: 503,
      failureReason: "LIMITER_UNAVAILABLE",
      correlationId: body.error.correlationId,
    });
  });

  it.each(ROUTES)("%s: a real limit hit is still 429 RATE_LIMITED", async (_name, call) => {
    rate.value = { allowed: false, remaining: 0, resetMs: 9_000, reason: "limited" };
    const res = await call();
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    expect(res.headers.get("retry-after")).toBe("9");
    expect(audit.mock.calls[0]![0]).toMatchObject({ status: 429, failureReason: null });
  });
});

describe("every caller of checkRateLimit tells an outage apart", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  const SRC = path.join(process.cwd(), "src");
  const callers = sources(SRC).filter((f) => {
    if (f.endsWith(path.join("lib", "security", "rate-limit.ts"))) return false;
    return /\bcheckRateLimit\s*\(/.test(readFileSync(f, "utf8"));
  });

  it("finds the callers (the guard is not vacuous)", () => {
    expect(callers.length).toBeGreaterThanOrEqual(10);
  });

  it.each(callers.map((f) => [path.relative(process.cwd(), f)]))("%s", (file) => {
    const text = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(
      /\bisLimiterOutage\b|\bnorthboundThrottleRefusal\b/.test(text),
      `${file} calls checkRateLimit but never asks isLimiterOutage — a limiter outage would be answered as throttling`,
    ).toBe(true);
  });
});
