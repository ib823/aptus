// @vitest-environment node
/**
 * The generated northbound OpenAPI describes what the edge and the broker
 * actually send (P1 wave A integration review).
 *
 * The document says it lists every header and error the broker sends. Every
 * answer below is served through the real middleware and routes
 * (tests/helpers/northbound-world.ts) and checked against the document the
 * per-solution OpenAPI route builds: the status must be documented for that
 * operation, and the body must validate against the documented schema. The
 * edge's per-address refusals are the case this exists for: GET /versions
 * needs no credential, a call with no Authorization header never reaches the
 * per-credential limiter, and with COREEDGE_MACHINE_RATE_LIMIT=ip (the P0.5
 * rollback) no call does — all three meet the per-address bucket, whose 429
 * once had no correlation id and a code the document did not list.
 *
 * Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomBytes, randomUUID } from "node:crypto";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
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

import { buildNorthboundOpenApi } from "@/lib/contracts/openapi";
import { prisma } from "@/lib/db/prisma";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  removeWorld,
  sapStub,
  seedApp,
  seedWorld,
  serveNorthbound,
  type NorthboundApp,
  type NorthboundWorld,
} from "../helpers/northbound-world";

const RUN = `oaconf-${randomUUID().slice(0, 8)}`;
const KEY = randomBytes(32).toString("hex");
const sap = sapStub(globalThis.fetch);
let world: NorthboundWorld;
let app: NorthboundApp;
type Obj = Record<string, unknown>;
let doc: Obj;
let ajv: Ajv2020;

async function send(url: string, opts: { token?: string; ip?: string; headers?: Record<string, string> } = {}) {
  const res = await serveNorthbound(
    new NextRequest(`http://localhost${url}`, {
      headers: {
        "x-real-ip": opts.ip ?? "203.0.113.150",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
    }),
  );
  const text = await res.text();
  return { res, status: res.status, json: (text ? JSON.parse(text) : null) as Obj };
}

/** Send until the edge refuses, at most one call past the per-address read budget. */
async function untilRefused(url: string, opts: Parameters<typeof send>[1] = {}) {
  let last: Awaited<ReturnType<typeof send>> | null = null;
  for (let i = 0; i < RATE_LIMITS.apiRead.limit + 1; i++) {
    last = await send(url, opts);
    if (last.status === 429) break;
  }
  return last!;
}

function deref(node: Obj): Obj {
  const ref = node.$ref as string | undefined;
  if (!ref) return node;
  let cur: unknown = doc;
  for (const p of ref.replace(/^#\//, "").split("/")) cur = (cur as Obj)[p];
  return cur as Obj;
}

/** Why an answer is not the documented one; empty when it is. */
function problems(path: string, status: number, body: unknown): string[] {
  const op = ((doc.paths as Obj)[path] as Obj | undefined)?.get as Obj | undefined;
  if (!op) return [`GET ${path} is not in the document`];
  const responses = op.responses as Obj;
  const entry = (responses[String(status)] ?? responses[`${String(status)[0]}XX`]) as Obj | undefined;
  if (!entry) return [`${status} is not documented for GET ${path}`];
  const response = deref(entry);
  const schema = ((response.content as Obj)["application/json"] as Obj).schema as Obj;
  const validate = ajv.getSchema(`doc#/components/schemas/${String(schema.$ref).split("/").pop()}`)!;
  if (validate(body)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);
}

/** The northbound envelope's headers, on an edge answer as on a route's. */
function expectNorthboundEnvelope(r: Awaited<ReturnType<typeof send>>) {
  const correlationId = (r.json.error as Obj).correlationId;
  expect(correlationId).toEqual(expect.any(String));
  expect(r.res.headers.get("x-correlation-id")).toBe(correlationId);
  expect(r.res.headers.get("cache-control")).toBe("no-store");
  expect(Number(r.res.headers.get("retry-after"))).toBeGreaterThan(0);
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the northbound OpenAPI describes every answer, the edge's included", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", KEY);
    vi.stubGlobal("fetch", sap.fetch);
    world = await seedWorld(RUN);
    app = await seedApp(world, "Conformance app", { tokenPrefix: "ce_test_", expiresAt: new Date(Date.now() + 30 * 86_400_000) });
    const ifaces = await prisma.interface.findMany({
      where: { organizationId: world.organizationId, solutionId: app.solutionId },
      select: { id: true, name: true, externalId: true, sapProduct: true, operation: true, mode: true, entitySet: true, version: true, status: true },
    });
    doc = buildNorthboundOpenApi({
      version: "3.1.0",
      baseUrl: "http://localhost/api/northbound",
      title: "conformance",
      description: "conformance",
      infoVersion: "1.0.0",
      interfaces: ifaces.map((i) => ({ ...i, contract: { source: "none" as const } })),
      discovery: true,
    });
    ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ ...doc, $id: "doc" });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (world) await removeWorld(world);
  });

  it("the broker's own answers conform: discovery, a read, a 401 and a 400 UNSUPPORTED_VERSION", async () => {
    const d = await send("/api/northbound/v1/interfaces", { token: app.token });
    expect(d.status).toBe(200);
    expect(problems("/interfaces", d.status, d.json)).toEqual([]);
    const r = await send(`/api/northbound/v1/interfaces/${app.readInterfaceId}/data`, { token: app.token });
    expect(r.status).toBe(200);
    expect(problems(`/interfaces/${app.readInterfaceId}/data`, r.status, r.json)).toEqual([]);
    const u = await send(`/api/northbound/interfaces/${app.readInterfaceId}/data`, {
      token: `ce_test_${randomBytes(32).toString("base64url")}`,
      ip: "203.0.113.151",
    });
    expect(u.status).toBe(401);
    expect(problems(`/interfaces/${app.readInterfaceId}/data`, u.status, u.json)).toEqual([]);
    const v = await send("/api/northbound/interfaces", { token: app.token, headers: { "CoreEdge-Version": "1999-01" } });
    expect(v.status).toBe(400);
    expect(problems("/interfaces", v.status, v.json)).toEqual([]);
  });

  it("GET /versions, which needs no credential: the edge's 429 is the documented one", async () => {
    const last = await untilRefused("/api/northbound/v1/versions", { ip: "203.0.113.160" });
    expect(last.status).toBe(429);
    expect(problems("/versions", last.status, last.json)).toEqual([]);
    expectNorthboundEnvelope(last);
    // The code a caller already branches on is kept.
    expect((last.json.error as Obj).code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("a read with no Authorization header: the edge's 429 is the documented one", async () => {
    const last = await untilRefused(`/api/northbound/interfaces/${app.readInterfaceId}/data`, { ip: "203.0.113.161" });
    expect(last.status).toBe(429);
    expect(problems(`/interfaces/${app.readInterfaceId}/data`, last.status, last.json)).toEqual([]);
    expectNorthboundEnvelope(last);
  });

  it("COREEDGE_MACHINE_RATE_LIMIT=ip (the P0.5 rollback): every credentialed 429 is the documented one", async () => {
    vi.stubEnv("COREEDGE_MACHINE_RATE_LIMIT", "ip");
    try {
      // Keys the route would refuse: the route's own per-credential limit
      // answers before the edge's for a good one, and that 429 is documented.
      let last: Awaited<ReturnType<typeof send>> | null = null;
      for (let i = 0; i < RATE_LIMITS.apiRead.limit + 1 && last?.status !== 429; i++) {
        last = await send("/api/northbound/v1/interfaces", { token: `ce_test_ipmode${i}`, ip: "203.0.113.162" });
      }
      if (!last) throw new Error("no answer");
      expect(last.status).toBe(429);
      expect(problems("/interfaces", last.status, last.json)).toEqual([]);
      expectNorthboundEnvelope(last);
    } finally {
      vi.unstubAllEnvs();
      vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", KEY);
    }
  });
});
