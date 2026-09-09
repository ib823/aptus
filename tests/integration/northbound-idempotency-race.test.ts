// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as NorthboundWrite from "@/lib/northbound/write";

const routeMocks = vi.hoisted(() => ({
  auth: vi.fn(), binding: vi.fn(), access: vi.fn(), write: vi.fn(), credential: vi.fn(),
}));
vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: routeMocks.auth, extractBearer: (s: string) => s,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/access", () => ({ resolveWritableInterface: routeMocks.access }));
vi.mock("@/lib/northbound/write-credential", () => ({ verifyWriteCredential: routeMocks.credential }));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { northbound: {} },
}));
vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnectionForEnvironment: routeMocks.binding, connectionRefusalMessage: () => "Not configured",
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: async () => ({ path: "/test" }),
}));
vi.mock("@/lib/northbound/write", async (importOriginal) => ({
  ...await importOriginal<typeof NorthboundWrite>(),
  writeEntitySet: routeMocks.write,
}));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
import { prisma } from "@/lib/db/prisma";
import {
  reserveIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey, IDEMPOTENCY_TTL_MS,
} from "@/lib/northbound/idempotency";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";
import { POST } from "@/app/api/northbound/interfaces/[id]/data/write/route";

// Opt in explicitly; never fall back to an application's DATABASE_URL.
// CI provisions this database, and all writes/cleanup use this run's namespace.
describe.skipIf(!process.env.TEST_DATABASE_URL)("idempotency with real PostgreSQL contention", () => {
  const scope = tenantScopeOf("idempotency-test-" + randomUUID());
  const now = new Date();
  const input = {
    scope, solutionId: "test-solution", interfaceId: "test-interface", key: "test-order-key",
    payload: { record: { Name: "Test" } },
    destination: {
      environment: "SANDBOX", sapClient: "100", connectionId: "test-connection",
      baseUrl: "https://sap.example", servicePath: "/test", entitySet: "Things", interfaceVersion: 1,
    },
  };
  const client = {
    clientId: "stable-client-row", organizationId: scope.organizationId,
    solutionId: input.solutionId, scope, environment: "SANDBOX", sapClient: "100",
  };
  const connection = {
    id: "test-connection", client: "100", baseUrl: "https://sap.example",
    environment: "SANDBOX", writeEnabled: true,
  };
  const request = (key = input.key) => POST(new NextRequest("http://localhost/api/northbound/interfaces/test-interface/data/write", {
    method: "POST",
    headers: { authorization: "Bearer ce_test", "x-coreedge-write-key": "cew_test", "idempotency-key": key },
    body: JSON.stringify(input.payload),
  }), { params: Promise.resolve({ id: input.interfaceId }) });
  beforeEach(async () => {
    await prisma.northboundIdempotencyKey.deleteMany({ where: { organizationId: scope.organizationId } });
    vi.clearAllMocks();
    routeMocks.auth.mockResolvedValue({ ok: true, client });
    routeMocks.credential.mockResolvedValue(true);
    routeMocks.access.mockResolvedValue({ ok: true, iface: {
      id: input.interfaceId, name: "Create thing", version: 1, entitySet: "Things",
      sapProduct: "s4hana", externalId: "API_TEST",
    } });
    routeMocks.binding.mockResolvedValue({ ok: true, connection });
    routeMocks.write.mockResolvedValue({ status: "CREATED", record: { ID: "one" }, location: "/Things('one')", detail: "Created" });
  });
  afterAll(async () => {
    await prisma.northboundIdempotencyKey.deleteMany({ where: { organizationId: scope.organizationId } });
    await prisma.$disconnect();
  });

  it.each(["new", "expired"] as const)("admits exactly one of 24 simultaneous attempts for a %s key", async (state) => {
    if (state === "expired") {
      await reserveIdempotencyKey(input, new Date(now.getTime() - IDEMPOTENCY_TTL_MS - 1000));
    }
    const results = await Promise.all(Array.from({ length: 24 }, () => reserveIdempotencyKey(input, now)));
    expect(results.filter((r) => r.outcome === "proceed")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "conflict")).toHaveLength(23);
    const winner = results.find((r) => r.outcome === "proceed")!;
    if (winner.outcome !== "proceed") throw new Error("No winner");
    await completeIdempotencyKey(scope, winner.recordId, 201, { data: { id: "created-once" } });
    expect(await reserveIdempotencyKey(input, now)).toEqual({
      outcome: "replay", status: 201, body: { data: { id: "created-once" } },
    });
  });

  it("fences late completion and release from an expired owner", async () => {
    const old = await reserveIdempotencyKey(input, new Date(now.getTime() - IDEMPOTENCY_TTL_MS));
    const fresh = await reserveIdempotencyKey(input, now);
    if (old.outcome !== "proceed" || fresh.outcome !== "proceed") throw new Error("Reservations failed");
    expect(fresh.recordId).not.toBe(old.recordId);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await completeIdempotencyKey(scope, old.recordId, 201, { stale: true });
      await releaseIdempotencyKey(scope, old.recordId);
      expect(await reserveIdempotencyKey(input, now)).toEqual({ outcome: "conflict", reason: "IN_FLIGHT" });
      await completeIdempotencyKey(scope, fresh.recordId, 201, { fresh: true });
      expect(await reserveIdempotencyKey(input, now)).toEqual({ outcome: "replay", status: 201, body: { fresh: true } });
    } finally {
      errorLog.mockRestore();
      warningLog.mockRestore();
    }
  });

  it.each(["environment", "sapClient", "connection"] as const)("a credential rebound to another %s cannot replay an old write", async (changed) => {
    expect((await request()).status).toBe(201);
    routeMocks.auth.mockResolvedValue({ ok: true, client: {
      ...client, environment: changed === "environment" ? "PROD" : "SANDBOX",
      sapClient: changed === "sapClient" ? "080" : "100",
    } });
    routeMocks.binding.mockResolvedValue({ ok: true, connection: {
      ...connection, environment: changed === "environment" ? "PROD" : "SANDBOX",
      client: changed === "sapClient" ? "080" : "100",
      id: changed === "connection" ? "different-connection" : connection.id,
    } });
    const retry = await request();
    expect(retry.status).toBe(409);
    expect((await retry.json()).error.code).toBe("CONFLICT");
    expect(routeMocks.write).toHaveBeenCalledTimes(1);
    expect((await request("distinct-write-intent")).status).toBe(201);
    expect(routeMocks.write).toHaveBeenCalledTimes(2);
  });

  it.each(["CREATED", "REJECTED", "TIMEOUT"] as const)("retries preserve the %s status and complete response body", async (status) => {
    routeMocks.write.mockResolvedValue({ status, record: null, location: null, detail: "Test outcome" });
    const first = await request();
    expect(first.status).toBe({ CREATED: 201, REJECTED: 422, TIMEOUT: 504 }[status]);
    const body = await first.json();
    const retry = await request();
    expect(retry.status).toBe(first.status);
    expect(await retry.json()).toEqual(body);
    expect(retry.headers.get("idempotency-replayed")).toBe("true");
    expect(routeMocks.write).toHaveBeenCalledTimes(1);
    if (status === "CREATED") expect(body.data.interface.id).toBe(input.interfaceId);
  });

  it("a revoked write credential cannot replay even a previously completed write", async () => {
    expect((await request()).status).toBe(201);
    routeMocks.credential.mockResolvedValue(false);
    expect((await request()).status).toBe(403);
    expect(routeMocks.write).toHaveBeenCalledTimes(1);
  });
});
