// @vitest-environment node
/**
 * The breaker's store is bounded (P0.14 review).
 *
 * The breaker protects SAP; it is not a gate on access, and a store that
 * cannot be asked must never hold a call. A store that THROWS was already let
 * through. A store that never answers was not: @upstash/redis sets no request
 * timeout, so an Upstash that accepts the connection and sends nothing back (a
 * regional brownout) left every governed call waiting on `redis.get` until the
 * platform killed the function, under the default `observe` mode too. The
 * rate limiter on the same store lets the request through after its own
 * timeout; the breaker now does the same, faster.
 */

import { createServer, type Server, type Socket } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { __setGovernedCircuitStore, governedCircuitBreaker } from "@/lib/governed/containment";
import {
  createCircuitBreaker,
  FAILURE_THRESHOLD,
  MemoryCircuitStore,
  STORE_DEADLINE_MS,
  type CircuitStore,
} from "@/lib/northbound/circuit-breaker";

const never = new Promise<never>(() => undefined);

const silentStore: CircuitStore = {
  shared: true,
  read: () => never,
  compareAndSet: () => never,
};

describe("a store that never answers", () => {
  it("lets the call through as degraded within the deadline, and says so once", async () => {
    const onStoreError = vi.fn();
    const breaker = createCircuitBreaker(silentStore, { onStoreError, deadlineMs: 50 });
    const startedAt = Date.now();
    await expect(breaker.beforeCall("k")).resolves.toMatchObject({ allowed: true, degraded: true });
    await expect(breaker.recordOutcome("k", "timeout")).resolves.toBeUndefined();
    await expect(breaker.snapshot("k")).resolves.toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(onStoreError).toHaveBeenCalledTimes(3);
    expect(String(onStoreError.mock.calls[0]![0])).toMatch(/did not answer within 50 ms/);
  });

  it("is bounded by default, briefly", () => {
    // Long enough for a read and a compare-and-set to Upstash in-region; short
    // enough that a hung store costs a call well under a second per step.
    expect(STORE_DEADLINE_MS).toBeGreaterThanOrEqual(100);
    expect(STORE_DEADLINE_MS).toBeLessThanOrEqual(500);
  });

  it("does not disturb a store that answers", async () => {
    const breaker = createCircuitBreaker(new MemoryCircuitStore(), { deadlineMs: 50 });
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await breaker.recordOutcome("k", "timeout");
    await expect(breaker.beforeCall("k")).resolves.toMatchObject({ allowed: false, state: "open", degraded: false });
  });
});

/*
 * The real client, against a server that accepts the connection and never
 * replies: what the governed breaker is built from when UPSTASH_REDIS_REST_URL
 * is set (containment.ts defaultStore).
 */
describe("the Upstash store, when Upstash accepts and never replies", () => {
  let server: Server;
  const sockets = new Set<Socket>();
  let url = "";
  let requests = 0;

  beforeAll(async () => {
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      // Read the request, answer nothing.
      socket.on("data", (chunk) => {
        if (chunk.toString("latin1").startsWith("POST ")) requests += 1;
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    url = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    __setGovernedCircuitStore(null);
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it(
    "answers beforeCall and recordOutcome promptly, letting the call through",
    async () => {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      __setGovernedCircuitStore(null);
      const breaker = governedCircuitBreaker();
      expect(breaker.shared).toBe(true);

      const startedAt = Date.now();
      await expect(breaker.beforeCall("connection:c1")).resolves.toMatchObject({ allowed: true, degraded: true });
      await breaker.recordOutcome("connection:c1", "ok");
      expect(Date.now() - startedAt).toBeLessThan(2 * STORE_DEADLINE_MS + 1_000);
      // Each request reached the server: this is the hung Upstash, not a refused connection.
      expect(requests).toBeGreaterThanOrEqual(2);
    },
    10_000,
  );
});
