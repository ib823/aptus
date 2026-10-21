// @vitest-environment node
/**
 * P1.10 against real PostgreSQL: both paths, every supported version, one
 * behaviour.
 *
 * `/api/northbound/*` and `/api/northbound/v1/*`, unpinned and pinned to each
 * supported `CoreEdge-Version`, driven through the real edge middleware and
 * the real routes (tests/helpers/northbound-world.ts). For each combination:
 *
 *   - P0.11 authentication: the key works; a wrong key is the same 401.
 *   - P0.1 grant binding: a grant bound to one interface does not reach the
 *     same service on another product.
 *   - discovery, schema, read and write answer as they did before versions,
 *     and the write's Idempotency-Key replays without calling SAP again.
 *   - every response states the version; every audited call's row names the
 *     path and version, under the correlation id the caller was given.
 *
 * Then what is shared across paths: one credential's route budget (P0.5) is
 * one budget, whichever path spends it; an unsupported version is refused
 * before anything (no audit row, no SAP call, no idempotency reservation);
 * and a key minted before P0.11 (plain `ce_`) keeps working on both paths
 * until it expires, and is refused after.
 *
 * SAP is the only stand-in (sapStub). Opt-in like the other integration
 * suites: skipped without TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomBytes, randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { NORTHBOUND_API_VERSIONS, supportedVersions } from "@/lib/northbound/version-policy";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  removeWorld,
  sapStub,
  seedApp,
  seedWorld,
  serveNorthbound,
  type Envelope,
  type NorthboundApp,
  type NorthboundWorld,
} from "../helpers/northbound-world";

const RUN = `p110-${randomUUID().slice(0, 8)}`;
const BASES = ["/api/northbound", "/api/northbound/v1"] as const;
const SUPPORTED = supportedVersions(new Date()).map((v) => v.version);
const DEFAULT = SUPPORTED[0]!;
/** Unpinned, then each supported version. */
const PINS: (string | null)[] = [null, ...SUPPORTED];
const MATRIX = BASES.flatMap((base) => PINS.map((pin) => [base, pin] as const));

const realFetch = globalThis.fetch;
const sap = sapStub(realFetch);
let world: NorthboundWorld;
let app: NorthboundApp;
let ipSeq = 0;

interface Sent {
  method?: string;
  token?: string;
  pin?: string | null;
  headers?: Record<string, string>;
  body?: unknown;
  ip?: string;
}

async function send(url: string, opts: Sent = {}) {
  const headers: Record<string, string> = {
    // One address per suite, so its edge buckets are its own.
    "x-real-ip": opts.ip ?? "203.0.113.110",
    accept: "application/json",
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    ...(opts.pin ? { "CoreEdge-Version": opts.pin } : {}),
    ...opts.headers,
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await serveNorthbound(
    new NextRequest(`http://localhost${url}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
    }),
  );
  const text = await res.text();
  return { res, status: res.status, json: (text ? JSON.parse(text) : null) as Envelope };
}

async function auditRow(correlationId: string) {
  return prisma.northboundAuditEvent.findFirst({
    where: { organizationId: world.organizationId, correlationId },
    select: { status: true, apiVersion: true, apiBasePath: true, clientTokenId: true, externalId: true, replayed: true },
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("northbound versioning against real PostgreSQL (P1.10)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    vi.stubGlobal("fetch", sap.fetch);
    world = await seedWorld(RUN);
    app = await seedApp(world, "Travel portal", { tokenPrefix: "ce_test_", expiresAt: new Date(Date.now() + 30 * 86_400_000) });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (world) await removeWorld(world);
  });

  it("serves every supported version that the registry lists, starting with 2026-10", () => {
    expect(SUPPORTED).toEqual(NORTHBOUND_API_VERSIONS.map((v) => v.version));
    expect(DEFAULT).toBe("2026-10");
  });

  describe.each(MATRIX)("on %s pinned to %s", (base, pin) => {
    const served = pin ?? DEFAULT;

    it("discovery: 200, the grant-bound interface callable and the other not, version and audit row stated", async () => {
      const { res, status, json } = await send(`${base}/interfaces`, { token: app.token, pin });
      expect(status).toBe(200);
      expect(res.headers.get("CoreEdge-Version")).toBe(served);
      const byId = new Map((json.data.interfaces as { id: string; callable: boolean }[]).map((i) => [i.id, i.callable]));
      expect(byId.get(app.readInterfaceId)).toBe(true);
      expect(byId.get(app.ungrantedInterfaceId)).toBe(false);
      const correlationId = res.headers.get("x-correlation-id")!;
      expect(await auditRow(correlationId)).toMatchObject({
        status: 200, apiVersion: served, apiBasePath: base, clientTokenId: app.clientId, externalId: "-discovery-",
      });
    });

    it("schema: 200, audited with the path and version", async () => {
      const { res, status, json } = await send(`${base}/interfaces/${app.readInterfaceId}/schema`, { token: app.token, pin });
      expect(status).toBe(200);
      expect(json.data).toMatchObject({ id: app.readInterfaceId, entitySet: "Travel", schemaCaptured: false });
      expect(res.headers.get("CoreEdge-Version")).toBe(served);
      expect(await auditRow(res.headers.get("x-correlation-id")!)).toMatchObject({ status: 200, apiVersion: served, apiBasePath: base });
    });

    it("read: SAP's rows without its envelope, the same contract as before versions", async () => {
      const before = sap.calls.reads;
      const { res, status, json } = await send(`${base}/interfaces/${app.readInterfaceId}/data?limit=5`, { token: app.token, pin });
      expect(status).toBe(200);
      expect(json.data).toMatchObject({
        count: 2,
        empty: false,
        records: [{ TravelID: "1", Description: "Lisbon kickoff" }, { TravelID: "2", Description: "Osaka review" }],
        interface: { id: app.readInterfaceId, version: 1 },
      });
      expect(json.data.records[0]).not.toHaveProperty("__metadata");
      expect(sap.calls.reads).toBe(before + 1);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("CoreEdge-Version")).toBe(served);
      const correlationId = res.headers.get("x-correlation-id")!;
      expect(await auditRow(correlationId)).toMatchObject({ status: 200, apiVersion: served, apiBasePath: base, clientTokenId: app.clientId });
    });

    it("write: 201 once, then the same key replays without reaching SAP", async () => {
      const key = `p110-${randomUUID()}`;
      const write = () =>
        send(`${base}/interfaces/${app.writeInterfaceId}/data/write`, {
          method: "POST",
          token: app.token,
          pin,
          headers: { "x-coreedge-write-key": app.writeKey, "idempotency-key": key },
          body: { record: { Description: `Trip via ${base} ${pin ?? "unpinned"}` } },
        });
      const before = sap.calls.creates;
      const first = await write();
      expect(first.status).toBe(201);
      expect(first.json.data).toMatchObject({ created: true, record: { Description: `Trip via ${base} ${pin ?? "unpinned"}` } });
      expect(first.json.data.location).toMatch(/^\/Travel\('\d+'\)$/);
      expect(first.res.headers.get("CoreEdge-Version")).toBe(served);
      const again = await write();
      expect(again.status).toBe(201);
      expect(again.res.headers.get("idempotency-replayed")).toBe("true");
      expect(again.res.headers.get("CoreEdge-Version")).toBe(served);
      expect(again.json).toEqual(first.json);
      expect(sap.calls.creates).toBe(before + 1);
      expect(await auditRow(first.res.headers.get("x-correlation-id")!)).toMatchObject({ status: 201, apiVersion: served, apiBasePath: base, replayed: false });
      expect(await auditRow(again.res.headers.get("x-correlation-id")!)).toMatchObject({ status: 201, apiVersion: served, apiBasePath: base, replayed: true });
    });

    it("grant binding: the same service on another product is refused 403, and audited", async () => {
      const { res, status, json } = await send(`${base}/interfaces/${app.ungrantedInterfaceId}/data`, { token: app.token, pin });
      expect(status).toBe(403);
      expect(json.error.code).toBe("FORBIDDEN");
      expect(res.headers.get("CoreEdge-Version")).toBe(served);
      expect(await auditRow(json.error.correlationId)).toMatchObject({ status: 403, apiVersion: served, apiBasePath: base });
    });

    it("authentication: a wrong key is the one 401, with the version stated", async () => {
      const { res, status, json } = await send(`${base}/interfaces/${app.readInterfaceId}/data`, {
        token: `ce_test_${randomBytes(32).toString("base64url")}`,
        pin,
        ip: `203.0.113.${120 + ipSeq++}`,
      });
      expect(status).toBe(401);
      expect(json.error).toMatchObject({ code: "UNAUTHENTICATED", message: "Missing or invalid client token." });
      expect(res.headers.get("x-correlation-id")).toBe(json.error.correlationId);
      expect(res.headers.get("CoreEdge-Version")).toBe(served);
    });
  });

  it.each(BASES)("an unknown version on %s is refused first: no audit row, no SAP call, no key reserved", async (base) => {
    const reads = sap.calls.reads;
    const creates = sap.calls.creates;
    const key = `p110-${randomUUID()}`;
    const attempts = [
      send(`${base}/interfaces`, { token: app.token, pin: "2025-01" }),
      send(`${base}/interfaces/${app.readInterfaceId}/schema`, { token: app.token, pin: "2025-01" }),
      send(`${base}/interfaces/${app.readInterfaceId}/data`, { token: app.token, pin: "2025-01" }),
      send(`${base}/interfaces/${app.writeInterfaceId}/data/write`, {
        method: "POST",
        token: app.token,
        pin: "2025-01",
        headers: { "x-coreedge-write-key": app.writeKey, "idempotency-key": key },
        body: { record: { Description: "never" } },
      }),
    ];
    for (const { res, status, json } of await Promise.all(attempts)) {
      expect(status).toBe(400);
      expect(json.error).toMatchObject({ code: "UNSUPPORTED_VERSION", requestedVersion: "2025-01", supportedVersions: SUPPORTED });
      expect(res.headers.get("CoreEdge-Version")).toBeNull();
      expect(await auditRow(json.error.correlationId)).toBeNull();
    }
    expect(sap.calls.reads).toBe(reads);
    expect(sap.calls.creates).toBe(creates);
    expect(await prisma.northboundIdempotencyKey.count({ where: { organizationId: world.organizationId, key } })).toBe(0);
  });

  it("one credential's route budget is one budget, whichever path spends it", async () => {
    const own = await seedApp(world, "Budget app", { tokenPrefix: "ce_test_", expiresAt: new Date(Date.now() + 86_400_000) });
    const limit = RATE_LIMITS.northbound.limit;
    for (let i = 0; i < limit; i++) {
      const { status } = await send(`${BASES[i % 2]}/interfaces`, { token: own.token, ip: "203.0.113.200" });
      expect(status).toBe(200);
    }
    for (const base of BASES) {
      const { res, status, json } = await send(`${base}/interfaces`, { token: own.token, ip: "203.0.113.200" });
      expect(status).toBe(429);
      expect(json.error.code).toBe("RATE_LIMITED");
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(res.headers.get("CoreEdge-Version")).toBe(DEFAULT);
      expect(await auditRow(json.error.correlationId)).toMatchObject({ status: 429, apiBasePath: base, clientTokenId: own.clientId });
    }
  });

  it("a key minted before P0.11 (plain ce_) works on both paths and every version until it expires", async () => {
    const legacy = await seedApp(world, "Legacy app", { tokenPrefix: "ce_", expiresAt: new Date(Date.now() + 86_400_000) });
    expect(legacy.token).toMatch(/^ce_(?!live_|test_)/);
    for (const [base, pin] of MATRIX) {
      const list = await send(`${base}/interfaces`, { token: legacy.token, pin, ip: "203.0.113.210" });
      expect(list.status).toBe(200);
      const read = await send(`${base}/interfaces/${legacy.readInterfaceId}/data?limit=1`, { token: legacy.token, pin, ip: "203.0.113.210" });
      expect(read.status).toBe(200);
      expect(read.json.data.count).toBe(1);
    }
    // Expired: the same key is now the one 401, on both paths.
    await prisma.solutionClient.update({
      where: { id: legacy.clientId, organizationId: world.organizationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    for (const base of BASES) {
      const { status, json } = await send(`${base}/interfaces/${legacy.readInterfaceId}/data`, { token: legacy.token, ip: "203.0.113.211" });
      expect(status).toBe(401);
      expect(json.error.code).toBe("UNAUTHENTICATED");
    }
  });
});
