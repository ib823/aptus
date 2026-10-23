// @vitest-environment node
/**
 * P0.14 acceptance: 5 failures open the breaker in both of two processes.
 *
 * TWO PROCESSES, SIMULATED. Each "process" is its own module graph — the
 * governed read route, the pipeline, containment.ts and circuit-breaker.ts
 * imported afresh after `vi.resetModules()` — so each has its own module
 * state, exactly as two serverless instances do. What they share is the
 * store: one MemoryCircuitStore standing in for Upstash, handed to both, the
 * way both instances would be handed the same Redis.
 *
 * And the contrast that proves the store is what does it: with a store each
 * (no Upstash, the fallback), three failures in one and two in the other open
 * neither.
 *
 * The Upstash adapter itself is checked against a fake Redis that runs the
 * compare-and-set script's semantics, and concurrent failures are shown not to
 * be lost to a race.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sap: vi.fn(), audits: [] as Record<string, unknown>[] }));

vi.mock("@/lib/northbound/auth", () => ({
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: async () => undefined,
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "client_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      environment: "DEV",
      sapClient: null,
      scope: { organizationId: "org_a" },
    },
  }),
}));
vi.mock("@/lib/northbound/auth-failures", () => ({ noteFailedCredential: async () => undefined }));
vi.mock("@/lib/northbound/audit", () => ({
  recordNorthboundCall: async (row: Record<string, unknown>) => {
    h.audits.push(row);
  },
}));
vi.mock("@/lib/security/rate-limit", () => ({
  RATE_LIMITS: { northbound: { limit: 60, windowMs: 60_000 } },
  checkRateLimit: async () => ({ allowed: true, remaining: 59, resetMs: 0 }),
}));
vi.mock("@/lib/northbound/access", () => ({
  resolveReadableInterface: async () => ({
    ok: true,
    iface: {
      id: "if_1",
      name: "Feed",
      externalId: "purchase-orders",
      sapProduct: "s4hana",
      entitySet: "A_PurchaseOrder",
      operation: "READ",
      mode: "READ",
      version: 1,
      draft: false,
      servicePath: null,
      odataVersion: null,
      serviceVerifiedAt: null,
      serviceVerifications: null,
    },
  }),
  resolveWritableInterface: async () => ({ ok: false, reason: "INTERFACE_NOT_FOUND", message: "No such interface." }),
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveSapConnectionForEnvironment: async () => ({
    ok: true,
    bindingUnverified: false,
    connection: {
      source: "db",
      id: "conn_1",
      organizationId: "org_a",
      product: "s4hana",
      key: "dev",
      label: "DEV",
      baseUrl: "https://my000001-api.s4hana.cloud.sap",
      authType: "basic",
      secrets: { username: "u", password: "p" },
      oauthTokenUrl: null,
      writeEnabled: false,
      apiPath: null,
      timeoutMs: null,
      environment: "DEV",
      client: null,
    },
  }),
}));
vi.mock("@/lib/northbound/read-definition", () => ({
  resolveReadDefinition: async () => ({
    ok: true,
    service: { key: "purchase-orders", path: "/sap/opu/odata/sap/X" },
    entitySet: "A_PurchaseOrder",
  }),
}));
vi.mock("@/lib/coreedge/journey", () => ({ noteFirstCall: async () => undefined }));

import {
  createCircuitBreaker,
  FAILURE_THRESHOLD,
  MemoryCircuitStore,
  upstashCircuitStore,
  type CircuitStore,
  type RedisLike,
} from "@/lib/northbound/circuit-breaker";

/** One "process": a fresh module graph, pointed at a store. */
async function processWith(store: CircuitStore) {
  vi.resetModules();
  const route = await import("@/app/api/northbound/interfaces/[id]/data/route");
  const containment = await import("@/lib/governed/containment");
  containment.__setGovernedCircuitStore(store);
  return {
    containment,
    read: async () => {
      const res = await route.GET(
        new NextRequest("http://localhost/api/northbound/interfaces/if_1/data", { headers: { authorization: "Bearer k" } }),
        { params: Promise.resolve({ id: "if_1" }) },
      );
      return { status: res.status, body: (await res.json()) as { error?: { code: string } } };
    },
  };
}

const failing = () => h.sap.mockImplementation(async () => new Response("down", { status: 503 }));
const healthy = () =>
  h.sap.mockImplementation(
    async () =>
      new Response(JSON.stringify({ d: { results: [{ a: 1 }] } }), { status: 200, headers: { "content-type": "application/json" } }),
  );

beforeEach(() => {
  h.audits = [];
  h.sap.mockReset();
  vi.stubGlobal("fetch", h.sap);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("five failures open the breaker in both of two processes", () => {
  it("opens for both when they share the store, whichever saw the failures", async () => {
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
    const shared = new MemoryCircuitStore({ shared: true });
    const a = await processWith(shared);
    const b = await processWith(shared);
    expect(a.containment).not.toBe(b.containment);

    failing();
    // Three failures seen by one process, two by the other: five in all.
    for (let i = 0; i < 3; i++) expect((await a.read()).status).toBe(502);
    for (let i = 0; i < 2; i++) expect((await b.read()).status).toBe(502);
    expect(h.sap).toHaveBeenCalledTimes(FAILURE_THRESHOLD);

    // Both now refuse before anything is sent to SAP.
    h.sap.mockClear();
    for (const p of [a, b]) {
      const refused = await p.read();
      expect(refused.status).toBe(503);
      expect(refused.body.error?.code).toBe("CIRCUIT_OPEN");
    }
    expect(h.sap).not.toHaveBeenCalled();
    // And the refusals are on the record, with the reason the incident rule leaves out.
    expect(h.audits.slice(-2).map((r) => [r.status, r.failureReason, r.connectionId])).toEqual([
      [503, "CIRCUIT_OPEN", "conn_1"],
      [503, "CIRCUIT_OPEN", "conn_1"],
    ]);
  });

  it("opens in neither when each holds only its own memory (no Upstash)", async () => {
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
    const a = await processWith(new MemoryCircuitStore());
    const b = await processWith(new MemoryCircuitStore());
    failing();
    for (let i = 0; i < 3; i++) await a.read();
    for (let i = 0; i < 2; i++) await b.read();
    h.sap.mockClear();
    healthy();
    expect((await a.read()).status).toBe(200);
    expect((await b.read()).status).toBe(200);
    expect(h.sap).toHaveBeenCalledTimes(2);
  });

  it("under the default (observe) records the same and refuses nothing", async () => {
    const shared = new MemoryCircuitStore({ shared: true });
    const a = await processWith(shared);
    const b = await processWith(shared);
    failing();
    for (let i = 0; i < 3; i++) await a.read();
    for (let i = 0; i < 2; i++) await b.read();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    healthy();
    // The circuit is open in the shared record...
    expect((await a.containment.governedCircuitBreaker().snapshot("connection:conn_1"))?.state).toBe("open");
    // ...and the calls go to SAP all the same, logged as ones it would have refused.
    expect((await a.read()).status).toBe(200);
    expect((await b.read()).status).toBe(200);
    expect(warn.mock.calls.some(([m]) => m === "[circuit] would refuse")).toBe(true);
    warn.mockRestore();
  });

  it("COREEDGE_CIRCUIT_BREAKER=off never touches the store", async () => {
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "off");
    const store: CircuitStore = {
      shared: true,
      read: vi.fn(async () => null),
      compareAndSet: vi.fn(async () => true),
    };
    const a = await processWith(store);
    failing();
    for (let i = 0; i < FAILURE_THRESHOLD + 2; i++) expect((await a.read()).status).toBe(502);
    expect(store.read).not.toHaveBeenCalled();
    expect(store.compareAndSet).not.toHaveBeenCalled();
  });

  it("a store that errors lets the call through", async () => {
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: CircuitStore = {
      shared: true,
      read: async () => {
        throw new Error("redis down");
      },
      compareAndSet: async () => {
        throw new Error("redis down");
      },
    };
    const a = await processWith(broken);
    healthy();
    expect((await a.read()).status).toBe(200);
    error.mockRestore();
  });
});

describe("the shared store keeps every failure", () => {
  it("loses none to concurrent writers", async () => {
    const shared = new MemoryCircuitStore({ shared: true });
    const one = createCircuitBreaker(shared);
    const two = createCircuitBreaker(shared);
    // All five at once, split between the two: each read-modify-write races
    // the others, and the compare-and-set makes the losers retry.
    await Promise.all([
      one.recordOutcome("k", "timeout", 1),
      two.recordOutcome("k", "timeout", 1),
      one.recordOutcome("k", "upstream-error", 1),
      two.recordOutcome("k", "timeout", 1),
      one.recordOutcome("k", "timeout", 1),
    ]);
    expect((await one.snapshot("k", 2))?.state).toBe("open");
    expect((await two.beforeCall("k", 2)).allowed).toBe(false);
  });

  it("takes exactly one half-open probe across both", async () => {
    const shared = new MemoryCircuitStore({ shared: true });
    const one = createCircuitBreaker(shared);
    const two = createCircuitBreaker(shared);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await one.recordOutcome("k", "timeout", 0);
    const after = 31_000;
    const [x, y] = await Promise.all([one.beforeCall("k", after), two.beforeCall("k", after)]);
    expect([x.allowed, y.allowed].filter(Boolean)).toHaveLength(1);
  });
});

describe("the Upstash adapter", () => {
  /** A Redis that runs GET and the compare-and-set script's semantics. */
  function fakeRedis(): RedisLike & { data: Map<string, string>; calls: unknown[][] } {
    const data = new Map<string, string>();
    const calls: unknown[][] = [];
    return {
      data,
      calls,
      async get(key) {
        return data.get(key) ?? null;
      },
      async eval(script, keys, args) {
        calls.push([keys, args]);
        expect(script).toContain("redis.call('GET', KEYS[1])");
        const [expected, next, ttl] = args as [string, string, string];
        expect(Number(ttl)).toBeGreaterThan(0);
        const current = data.get(keys[0]!) ?? null;
        if ((current === null && expected === "") || current === expected) {
          data.set(keys[0]!, next);
          return 1;
        }
        return 0;
      },
    };
  }

  it("shares one circuit across two breakers, under its own key prefix", async () => {
    const redis = fakeRedis();
    const one = createCircuitBreaker(upstashCircuitStore(redis));
    const two = createCircuitBreaker(upstashCircuitStore(redis));
    expect(one.shared).toBe(true);
    for (let i = 0; i < 3; i++) await one.recordOutcome("connection:c", "timeout", 0);
    for (let i = 0; i < 2; i++) await two.recordOutcome("connection:c", "timeout", 0);
    expect((await one.beforeCall("connection:c", 1)).allowed).toBe(false);
    expect((await two.beforeCall("connection:c", 1)).allowed).toBe(false);
    expect([...redis.data.keys()]).toEqual(["coreedge:circuit:connection:c"]);
  });

  it("writes nothing for a success on a circuit with no record", async () => {
    const redis = fakeRedis();
    const one = createCircuitBreaker(upstashCircuitStore(redis));
    await one.beforeCall("connection:c", 0);
    await one.recordOutcome("connection:c", "ok", 0);
    expect(redis.calls).toHaveLength(0);
  });

  /*
   * THE DEFAULT'S REAL COST. Once a circuit has a record (one failure ever),
   * a success that leaves it closed with no failures must not write: a write
   * per success is an extra Upstash command on every governed call, and each
   * write renews the record's 24-hour expiry, so on a busy connection it would
   * never expire. A refusal on a closed circuit changes nothing either.
   */
  it("writes nothing for an outcome that leaves a record closed and clean, so the record can expire", async () => {
    const redis = fakeRedis();
    const one = createCircuitBreaker(upstashCircuitStore(redis));
    await one.recordOutcome("connection:c", "timeout", 0); // write: one failure
    await one.recordOutcome("connection:c", "ok", 1); // write: back to zero
    expect(redis.calls).toHaveLength(2);
    for (let t = 2; t < 12; t++) {
      await one.beforeCall("connection:c", t);
      await one.recordOutcome("connection:c", "ok", t);
    }
    for (let t = 12; t < 15; t++) await one.recordOutcome("connection:c", "refused", t);
    expect(redis.calls).toHaveLength(2);
  });

  it("still writes a refusal that ends a half-open probe", async () => {
    const redis = fakeRedis();
    const one = createCircuitBreaker(upstashCircuitStore(redis));
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await one.recordOutcome("connection:c", "timeout", 0);
    expect((await one.beforeCall("connection:c", 31_000)).allowed).toBe(true); // the probe
    const before = redis.calls.length;
    await one.recordOutcome("connection:c", "refused", 31_001);
    expect(redis.calls.length).toBe(before + 1);
    // The probe's lease is released: the next call may probe at once.
    expect((await one.beforeCall("connection:c", 31_002)).allowed).toBe(true);
  });
});
