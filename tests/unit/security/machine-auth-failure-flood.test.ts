// @vitest-environment node
/**
 * A flood of made-up keys from one address cannot buy more credential lookups
 * than the old per-IP edge bucket allowed (P0.5 review).
 *
 * Keying machine routes by the presented credential (A43) gave every new
 * bearer value a fresh edge bucket of its own, so an unauthenticated client
 * that sent `Authorization: Bearer junk_<i>` with a new value each time met
 * only the per-address backstop (6,000 a minute) — where the per-IP bucket had
 * stopped it at 120 writes or 300 reads. Every admitted call reached the route
 * and cost a Postgres lookup of the token hash: about 50 times as many
 * unauthenticated lookups per address as before.
 *
 * Failed lookups from one address now spend `machine-authfail:<ip>`, which the
 * edge reads before it spends anything else. Once it is empty, calls from that
 * address are refused at the edge — said as the ADDRESS's limit, never as a
 * credential's — and nothing reaches the database.
 *
 * Driven through the real middleware, the real discovery route and the real
 * in-memory limiter; only Prisma and the audit writer are stubbed. Each test
 * uses its own address and its own valid key, so the shared limiter Map cannot
 * leak between them.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookups, valid, dead } = vi.hoisted(() => ({
  lookups: { count: 0 },
  /** tokenHash → client id, for the keys that are live credentials. */
  valid: new Map<string, string>(),
  /** tokenHash → the row fields that make a REAL credential refuse (expired, revoked, …). */
  dead: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solutionClient: {
      // Authentication looks a token up by `tokenHash` and, only on a miss,
      // by `previousTokenHash` (the rotation overlap, P0.11). Every call is a
      // database query, so every call is counted.
      findUnique: async ({ where }: { where: { tokenHash?: string; previousTokenHash?: string } }) => {
        lookups.count++;
        // No key in this file was ever rotated, so a previous-key lookup misses.
        const hash = where.tokenHash;
        const id =
          hash === undefined ? undefined : (valid.get(hash) ?? (dead.has(hash) ? `dead_${hash}` : undefined));
        return id
          ? {
              id,
              organizationId: "org_a",
              solutionId: "sol_1",
              environment: "SANDBOX",
              sapClient: null,
              isActive: true,
              revokedAt: null,
              expiresAt: null,
              ...(hash === undefined ? {} : dead.get(hash)),
            }
          : null;
      },
      update: async () => ({}),
    },
    // The third lookup, only when both above miss: the keys a row has dropped
    // (RetiredClientToken, wave 1a final review). None in this file.
    retiredClientToken: {
      findUnique: async () => {
        lookups.count++;
        return null;
      },
    },
    solution: { findFirst: async () => ({ status: "ACTIVE" }) },
    interface: { findMany: async () => [] },
    apiAccessGrant: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: async () => undefined }));

import { GET as discovery } from "@/app/api/northbound/interfaces/route";
import { hashClientToken } from "@/lib/northbound/auth";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { middleware } from "@/middleware";

const PATH = "/api/northbound/interfaces";

/**
 * The queries one unknown key costs: the lookup by current key, then the one by
 * the key a rotation replaced, then the one by the keys a row has dropped
 * (auth.ts, P0.11). A key that authenticates costs one, because the others run
 * only on a miss.
 */
const QUERIES_PER_UNKNOWN_KEY = 3;

/** A live credential of its own, so this test's route budget starts full. */
function validKey(name: string): string {
  const key = `ce_valid_${name}`;
  valid.set(hashClientToken(key), `client_${name}`);
  return key;
}

/** A real credential that no longer authenticates: its row is found, and refuses. */
function deadKey(name: string, row: Record<string, unknown>): string {
  const key = `ce_dead_${name}`;
  dead.set(hashClientToken(key), row);
  return key;
}

/** One call as the platform runs it: the edge first, then the route if the edge let it through. */
async function call(ip: string, bearer?: string): Promise<Response> {
  const make = () =>
    new NextRequest(`http://localhost${PATH}`, {
      headers: { "x-real-ip": ip, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    });
  const edge = await middleware(make());
  if (edge.headers.get("x-middleware-next") !== "1") return edge;
  return discovery(make());
}

beforeEach(() => {
  lookups.count = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("random-key floods are capped per address", () => {
  it("a thousand made-up keys from one address cost at most the failure ceiling in lookups", async () => {
    const ip = "198.51.100.40";
    const statuses = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const res = await call(ip, `junk_${i}`);
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    }
    // Before: 2000 queries (every key was its own fresh edge bucket).
    const ceiling = RATE_LIMITS.machineAuthFailure.limit * QUERIES_PER_UNKNOWN_KEY;
    expect(lookups.count).toBeLessThanOrEqual(ceiling);
    // Under what the old per-IP read bucket let through (rate-limit.ts).
    expect(ceiling).toBeLessThanOrEqual(RATE_LIMITS.apiRead.limit);
    expect(statuses.get(401)).toBe(RATE_LIMITS.machineAuthFailure.limit);
    expect(statuses.get(429)).toBe(1000 - RATE_LIMITS.machineAuthFailure.limit);
  });

  it("the refusal is the address's, in the broker's envelope, with Retry-After", async () => {
    const ip = "198.51.100.41";
    for (let i = 0; i < RATE_LIMITS.machineAuthFailure.limit; i++) await call(ip, `junk_${i}`);
    const res = await call(ip, "junk_next");
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string; correlationId: string } };
    expect(body.error.code).toBe("RATE_LIMITED_ADDRESS");
    expect(body.error.message).toMatch(/this address/);
    expect(res.headers.get("x-correlation-id")).toBe(body.error.correlationId);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("a valid key on another address is untouched by the flood", async () => {
    const key = validKey("other_address");
    for (let i = 0; i < RATE_LIMITS.machineAuthFailure.limit + 20; i++) await call("198.51.100.42", `junk_${i}`);
    expect((await call("198.51.100.43", key)).status).toBe(200);
  });

  it("a valid key's own traffic never spends the failure budget", async () => {
    const ip = "198.51.100.44";
    const key = validKey("busy");
    // Its whole route budget, every call served, none of them a failure.
    for (let i = 0; i < RATE_LIMITS.northbound.limit; i++) {
      expect((await call(ip, key)).status).toBe(200);
    }
    // So an unknown key from the same address is still looked up and told 401.
    const before = lookups.count;
    expect((await call(ip, "junk_after_valid")).status).toBe(401);
    expect(lookups.count).toBe(before + QUERIES_PER_UNKNOWN_KEY);
  });

  it("a call with no key is not counted as a failed credential", async () => {
    const ip = "198.51.100.45";
    const key = validKey("after_keyless");
    for (let i = 0; i < RATE_LIMITS.machineAuthFailure.limit + 5; i++) {
      expect((await call(ip)).status).toBe(401);
    }
    expect((await call(ip, key)).status).toBe(200);
  });
});

/*
 * Wave 1a integration review. A key whose row is FOUND — expired at its P0.11
 * deadline, its rotation overlap closed, revoked, deactivated — is not a
 * made-up key: its lookup succeeded, and its own credential bucket already
 * bounds what it costs. Counting it against the ADDRESS let one tenant's dead
 * key, still retrying behind a shared egress, lock every other tenant's valid
 * key out at the edge (the P0.5 criterion "a flooding key cannot throttle
 * another key").
 */
describe("a real key that no longer authenticates is bounded by itself, not by its address", () => {
  it.each([
    ["expired", "198.51.100.46", { expiresAt: new Date(Date.now() - 60_000) }],
    ["revoked", "198.51.100.47", { revokedAt: new Date(Date.now() - 60_000) }],
    ["deactivated", "198.51.100.48", { isActive: false }],
  ])("a %s key retrying from a shared address does not lock out another tenant's valid key", async (name, ip, row) => {
    const stale = deadKey(name, row);
    const key = validKey(`shared_egress_${name}`);
    for (let i = 0; i < RATE_LIMITS.machineAuthFailure.limit + 10; i++) {
      expect((await call(ip, stale)).status).toBe(401);
    }
    expect((await call(ip, key)).status).toBe(200);
  });

  it("a dead key retrying is still refused at its own credential ceiling, before any lookup", async () => {
    const ip = "198.51.100.49";
    const stale = deadKey("bounded", { expiresAt: new Date(Date.now() - 60_000) });
    for (let i = 0; i < RATE_LIMITS.machineCredential.limit; i++) await call(ip, stale);
    const before = lookups.count;
    const res = await call(ip, stale);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    expect(lookups.count).toBe(before);
    // And the address stays open to every other key.
    expect((await call(ip, validKey("after_bounded"))).status).toBe(200);
  });
});
