// @vitest-environment node
/**
 * One runaway key must not throttle every other key behind the same address
 * (audit A43, roadmap P0.5).
 *
 * The edge middleware limited every /api/* call by client IP before the route
 * ran: 300 GETs a minute in `api:GET:<ip>`. A deployed application, an event
 * sender or a shared CI runner calls from a handful of server addresses, so
 * one credential looping at 400 a minute spent the whole address's allowance,
 * and a second customer's credential on the same egress was answered 429 by
 * the middleware — a different envelope, no correlation id, no audit row —
 * though its own budget was untouched. The route's per-credential bucket
 * (`northbound:<clientId>`) was supposed to be the isolation; the edge bucket
 * in front of it undid it.
 *
 * Authenticated machine routes are now limited at the edge per PRESENTED
 * credential (a hash of the bearer, never the bearer), with a high per-IP
 * ceiling behind it as the backstop against a flood of random keys. Browser
 * and console routes keep their per-IP buckets exactly as they were.
 *
 * Driven through the real middleware and the real in-memory limiter: no
 * Upstash variables are set in tests, so the limiter is the per-process Map.
 * Each test uses its own address, so the shared Map cannot leak between them.
 */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { middleware } from "@/middleware";

const DATA = "/api/northbound/interfaces/if_1/data";

function call(path: string, ip: string, opts: { bearer?: string; method?: string } = {}) {
  const headers: Record<string, string> = { "x-real-ip": ip };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return middleware(new NextRequest(`http://localhost${path}`, { method: opts.method ?? "GET", headers }));
}

async function flood(n: number, path: string, ip: string, bearer?: (i: number) => string, method = "GET") {
  let refused = 0;
  for (let i = 0; i < n; i++) {
    const res = await call(path, ip, bearer ? { bearer: bearer(i), method } : { method });
    if (res.status === 429) refused++;
  }
  return refused;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a flooding key cannot throttle another key behind the same IP", () => {
  it("credential B still gets through after credential A spent far more than the old per-IP allowance", async () => {
    const ip = "198.51.100.10";
    // Well past both the old shared GET bucket (300) and A's own edge ceiling.
    const refusedA = await flood(RATE_LIMITS.apiRead.limit * 3, DATA, ip, () => "ce_runaway_key_A");
    expect(refusedA).toBeGreaterThan(0); // A is throttled — by its own bucket.

    const b = await call(DATA, ip, { bearer: "ce_quiet_key_B" });
    expect(b.status).not.toBe(429);
  });

  it("holds for writes too: a write flood from A leaves B's reads and writes alone", async () => {
    const ip = "198.51.100.11";
    await flood(RATE_LIMITS.apiMutation.limit * 3, `${DATA}/write`, ip, () => "ce_runaway_writer", "POST");
    expect((await call(`${DATA}/write`, ip, { bearer: "ce_other_writer", method: "POST" })).status).not.toBe(429);
    expect((await call(DATA, ip, { bearer: "ce_other_writer" })).status).not.toBe(429);
  });

  it("the runaway key is told it is throttled, in the broker's own envelope", async () => {
    const ip = "198.51.100.12";
    let last: Response | null = null;
    for (let i = 0; i < RATE_LIMITS.machineCredential.limit + 1; i++) {
      last = await call(DATA, ip, { bearer: "ce_runaway_key_C" });
    }
    expect(last!.status).toBe(429);
    const body = (await last!.json()) as { error: { code: string; correlationId: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(last!.headers.get("x-correlation-id")).toBe(body.error.correlationId);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("random keys from one address still meet the per-IP backstop", async () => {
    const ip = "198.51.100.13";
    const refused = await flood(RATE_LIMITS.machineIpBackstop.limit + 5, DATA, ip, (i) => `ce_random_${i}`);
    expect(refused).toBeGreaterThan(0);
    // Said as the address's limit, not as any one credential's: its own code,
    // so a client does not back off a key that never used its budget.
    const res = await call(DATA, ip, { bearer: "ce_random_next" });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error).toMatchObject({ code: "RATE_LIMITED_ADDRESS", message: "Too many requests from this address." });
  });

  it("one key's flood spends at most its own ceiling of the address's backstop", () => {
    // The arithmetic the isolation rests on: a key is refused at its own
    // ceiling before it can reach the address's, with room for many keys.
    expect(RATE_LIMITS.machineIpBackstop.limit).toBeGreaterThanOrEqual(RATE_LIMITS.machineCredential.limit * 10);
    // And the edge never refuses a credential the route would still serve.
    expect(RATE_LIMITS.machineCredential.limit).toBeGreaterThan(RATE_LIMITS.northbound.limit * 2);
  });
});

describe("what stays as it was", () => {
  it("a machine call with no bearer stays in the per-IP API bucket", async () => {
    const ip = "198.51.100.20";
    const refused = await flood(RATE_LIMITS.apiRead.limit + 1, DATA, ip);
    expect(refused).toBe(1);
  });

  it("browser routes keep their per-IP buckets, bearer or not", async () => {
    const ip = "198.51.100.21";
    const refused = await flood(RATE_LIMITS.apiRead.limit + 1, "/api/studio/solutions", ip, (i) => `ignored_${i}`);
    expect(refused).toBe(1);
  });

  it("COREEDGE_MACHINE_RATE_LIMIT=ip puts machine routes back in the shared per-IP bucket", async () => {
    vi.stubEnv("COREEDGE_MACHINE_RATE_LIMIT", "ip");
    const ip = "198.51.100.22";
    await flood(RATE_LIMITS.apiRead.limit, DATA, ip, () => "ce_runaway_key_D");
    expect((await call(DATA, ip, { bearer: "ce_quiet_key_E" })).status).toBe(429);
  });
});
