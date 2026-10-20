/**
 * A working northbound integration, seeded in real PostgreSQL, for the suites
 * that drive the routes end to end (P1.10): an organization with a DEV SAP
 * connection, and apps — each a solution with a READ interface, a CREATE
 * interface, approved grants BOUND to each (P0.1), a runtime key and a write
 * key — plus an interface the grants must NOT reach.
 *
 * Every row is made the way the product's own paths store it (the connection
 * through upsertSapConnection, the write key through setWriteCredential), so
 * what the routes read back is what production would. SAP itself is the
 * stand-in: `sapStub` answers the OData calls the broker makes.
 *
 * The importing suite mocks `@/lib/db/prisma` with a real client carrying the
 * tenant guard, and sets SAP_CONNECTION_ENCRYPTION_KEY before seeding.
 */

import { randomBytes, randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { GET as schemaBase } from "@/app/api/northbound/interfaces/[id]/schema/route";
import { GET as readBase } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as writeBase } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { GET as listBase } from "@/app/api/northbound/interfaces/route";
import { GET as schemaV1 } from "@/app/api/northbound/v1/interfaces/[id]/schema/route";
import { GET as readV1 } from "@/app/api/northbound/v1/interfaces/[id]/data/route";
import { POST as writeV1 } from "@/app/api/northbound/v1/interfaces/[id]/data/write/route";
import { GET as listV1 } from "@/app/api/northbound/v1/interfaces/route";
import { GET as versionsV1 } from "@/app/api/northbound/v1/versions/route";
import { GET as versionsBase } from "@/app/api/northbound/versions/route";
import { prisma } from "@/lib/db/prisma";
import { hashClientToken } from "@/lib/northbound/auth";
import { setWriteCredential } from "@/lib/northbound/write-credential";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { customExternalId, validateServicePath } from "@/lib/sap-public/service-path";
import { verificationKey } from "@/lib/sap-public/service-verifications";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";
import { middleware } from "@/middleware";

export const SAP_BASE_URL = "https://my300100-api.s4hana.cloud.sap";
export const SERVICE_PATH = "/sap/opu/odata/sap/ZUI_TRAVEL_O2";
export const ENTITY_SET = "Travel";
const DAY = 24 * 60 * 60 * 1000;

export interface NorthboundWorld {
  organizationId: string;
  userIds: string[];
  connectionId: string;
}

export interface NorthboundApp {
  solutionId: string;
  clientId: string;
  /** The runtime key, raw: what a deployed application holds. */
  token: string;
  writeKey: string;
  readInterfaceId: string;
  writeInterfaceId: string;
  /** Same service on another SAP product: no grant is bound to it. */
  ungrantedInterfaceId: string;
}

/** The organization, two people and the DEV connection every app reads through. */
export async function seedWorld(run: string): Promise<NorthboundWorld> {
  const organizationId = `${run}-org`;
  await prisma.organization.create({ data: { id: organizationId, name: `Northbound ${run}`, type: "client" } });
  const userIds = [`${run}-builder`, `${run}-approver`];
  for (const id of userIds) {
    await prisma.user.create({ data: { id, email: `${id}@example.test`, name: id, role: "consultant", organizationId } });
  }
  await upsertSapConnection({
    organizationId,
    product: "s4hana",
    key: "dev",
    label: "S/4HANA Cloud DEV",
    baseUrl: SAP_BASE_URL,
    authType: "basic",
    secrets: { username: "COMM_USER", password: `pw-${run}` },
    writeEnabled: true,
    environment: "DEV",
  });
  const connection = await prisma.sapConnection.findFirstOrThrow({
    where: { organizationId, product: "s4hana", key: "dev" },
    select: { id: true },
  });
  return { organizationId, userIds, connectionId: connection.id };
}

/**
 * One app with a working DEV credential.
 *
 * `tokenPrefix` is the key's generation: `ce_test_` as minted since P0.11,
 * or `ce_` for a key minted before it, which must keep working until it
 * expires.
 */
export async function seedApp(
  world: NorthboundWorld,
  name: string,
  opts: { tokenPrefix: "ce_" | "ce_test_"; expiresAt: Date | null },
): Promise<NorthboundApp> {
  const { organizationId } = world;
  const [builder, approver] = world.userIds as [string, string];
  const solution = await prisma.solution.create({
    data: {
      organizationId,
      name,
      slug: `${organizationId}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Books travel for the client's portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      technicalOwnerId: builder,
    },
    select: { id: true },
  });
  const solutionId = solution.id;
  const path = validateServicePath(SERVICE_PATH);
  if (!path.ok) throw new Error("the fixture service path is not valid");
  const service = {
    servicePath: path.path,
    odataVersion: "V2",
    externalId: customExternalId(path.path),
    entitySet: ENTITY_SET,
  };
  const read = await prisma.interface.create({
    data: { organizationId, solutionId, name: `${name} read`, sapProduct: "s4hana", operation: "READ", mode: "READ", status: "ACTIVE", ...service },
    select: { id: true, externalId: true },
  });
  const write = await prisma.interface.create({
    data: {
      organizationId,
      solutionId,
      name: `${name} create`,
      sapProduct: "s4hana",
      operation: "CREATE",
      mode: "WRITE",
      status: "ACTIVE",
      ...service,
      // A custom service writes only once verified, through this connection.
      serviceVerifications: {
        [verificationKey("DEV", null)]: {
          environment: "DEV",
          at: new Date().toISOString(),
          connectionId: world.connectionId,
          sapClient: null,
          baseUrl: SAP_BASE_URL,
        },
      },
    },
    select: { id: true },
  });
  // The same service on another product: a grant bound to `read` must not reach it.
  const ungranted = await prisma.interface.create({
    data: { organizationId, solutionId, name: `${name} on-premise`, sapProduct: "s4hana-onprem", operation: "READ", mode: "READ", status: "ACTIVE", ...service },
    select: { id: true },
  });
  for (const [iface, operation] of [[read.id, "READ"], [write.id, "CREATE"]] as const) {
    await prisma.apiAccessGrant.create({
      data: {
        organizationId,
        solutionId,
        externalId: read.externalId,
        operation,
        environment: "DEV",
        justification: "Integration fixture.",
        requestedById: builder,
        decision: "APPROVED",
        decidedById: approver,
        decidedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * DAY),
        interfaceId: iface,
        sapProduct: "s4hana",
      },
    });
  }
  const token = `${opts.tokenPrefix}${randomBytes(32).toString("base64url")}`;
  const client = await prisma.solutionClient.create({
    data: {
      organizationId,
      solutionId,
      label: `${name} DEV`,
      tokenHash: hashClientToken(token),
      tokenPrefix: opts.tokenPrefix,
      environment: "DEV",
      createdById: approver,
      expiresAt: opts.expiresAt,
    },
    select: { id: true },
  });
  const writeKey = `cew_${randomBytes(24).toString("base64url")}`;
  if (!(await setWriteCredential(tenantScopeOf(organizationId), client.id, writeKey))) {
    throw new Error("the fixture write key was not stored");
  }
  return {
    solutionId,
    clientId: client.id,
    token,
    writeKey,
    readInterfaceId: read.id,
    writeInterfaceId: write.id,
    ungrantedInterfaceId: ungranted.id,
  };
}

export async function removeWorld(world: NorthboundWorld): Promise<void> {
  const where = { organizationId: world.organizationId };
  await prisma.northboundAuditEvent.deleteMany({ where });
  await prisma.northboundIdempotencyKey.deleteMany({ where });
  await prisma.organization.delete({ where: { id: world.organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: world.userIds } } });
}

/**
 * A northbound response body, typed loosely: `data` on success, `error` on a
 * refusal. Each suite asserts the fields it reads.
 */
export interface Envelope {
  data: {
    interfaces: { id: string; callable: boolean }[];
    records: Record<string, unknown>[];
    count: number;
    location: string;
    [field: string]: unknown;
  };
  error: { code: string; message: string; correlationId: string; [field: string]: unknown };
}

/* ── serving a request as the deployment would ───────────────────────── */

type Handler = (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

/**
 * The route table Next builds from src/app/api/northbound, for both base
 * paths. The v1 entries are the v1 MODULES, so a broken alias file breaks
 * the suites that serve through here.
 */
const ROUTES: { pattern: RegExp; method: string; handler: Handler }[] = [
  { pattern: /^\/api\/northbound\/interfaces$/, method: "GET", handler: listBase as Handler },
  { pattern: /^\/api\/northbound\/v1\/interfaces$/, method: "GET", handler: listV1 as Handler },
  { pattern: /^\/api\/northbound\/interfaces\/([^/]+)\/schema$/, method: "GET", handler: schemaBase as Handler },
  { pattern: /^\/api\/northbound\/v1\/interfaces\/([^/]+)\/schema$/, method: "GET", handler: schemaV1 as Handler },
  { pattern: /^\/api\/northbound\/interfaces\/([^/]+)\/data$/, method: "GET", handler: readBase as Handler },
  { pattern: /^\/api\/northbound\/v1\/interfaces\/([^/]+)\/data$/, method: "GET", handler: readV1 as Handler },
  { pattern: /^\/api\/northbound\/interfaces\/([^/]+)\/data\/write$/, method: "POST", handler: writeBase as Handler },
  { pattern: /^\/api\/northbound\/v1\/interfaces\/([^/]+)\/data\/write$/, method: "POST", handler: writeV1 as Handler },
  { pattern: /^\/api\/northbound\/versions$/, method: "GET", handler: versionsBase as Handler },
  { pattern: /^\/api\/northbound\/v1\/versions$/, method: "GET", handler: versionsV1 as Handler },
];

/**
 * One request through the edge middleware and then the route, as Next runs
 * them: the middleware's own answer when it refuses, otherwise the route's,
 * with the headers the middleware adds to a passed-through response.
 */
export async function serveNorthbound(request: NextRequest): Promise<Response> {
  const edge = await middleware(request);
  if (edge.headers.get("x-middleware-next") !== "1") return edge;
  const { pathname } = request.nextUrl;
  const route = ROUTES.find((r) => r.pattern.test(pathname));
  if (!route) return new Response(null, { status: 404 });
  if (route.method !== request.method) return new Response(null, { status: 405 });
  const id = decodeURIComponent(route.pattern.exec(pathname)?.[1] ?? "");
  const response = await route.handler(request, { params: Promise.resolve({ id }) });
  edge.headers.forEach((value, name) => {
    if (!name.startsWith("x-middleware-") && !response.headers.has(name)) response.headers.set(name, value);
  });
  return response;
}

/** What the stand-in SAP saw. */
export interface SapCalls {
  reads: number;
  csrf: number;
  creates: number;
}

/**
 * SAP, as far as the broker can tell: an OData V2 service with one Travel
 * row, a CSRF handshake, and a create that answers 201. Anything not
 * addressed to the fixture host goes to the real network function.
 */
export function sapStub(realFetch: typeof fetch): { fetch: typeof fetch; calls: SapCalls } {
  const calls: SapCalls = { reads: 0, csrf: 0, creates: 0 };
  const root = `${SAP_BASE_URL}${SERVICE_PATH}`;
  const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(SAP_BASE_URL)) return realFetch(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    const u = new URL(url);
    if (method === "GET" && u.pathname === `${SERVICE_PATH}/`) {
      calls.csrf++;
      return json({ d: { EntitySets: [ENTITY_SET] } }, 200, { "x-csrf-token": "csrf-fixture", "set-cookie": "SAP_SESSIONID=fixture; path=/" });
    }
    if (method === "GET" && u.pathname === `${SERVICE_PATH}/${ENTITY_SET}`) {
      calls.reads++;
      const top = Number(u.searchParams.get("$top") ?? "10");
      const rows = [
        { __metadata: { uri: `${root}/Travel('1')` }, TravelID: "1", Description: "Lisbon kickoff" },
        { __metadata: { uri: `${root}/Travel('2')` }, TravelID: "2", Description: "Osaka review" },
      ].slice(0, top);
      return json({ d: { results: rows } }, 200);
    }
    if (method === "POST" && u.pathname === `${SERVICE_PATH}/${ENTITY_SET}`) {
      calls.creates++;
      const sent = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const id = String(100 + calls.creates);
      return json({ d: { __metadata: { uri: `${root}/Travel('${id}')` }, TravelID: id, ...sent } }, 201, {
        location: `${root}/Travel('${id}')`,
      });
    }
    return json({ error: { message: { value: `fixture SAP has no ${method} ${u.pathname}` } } }, 404);
  }) as typeof fetch;
  return { fetch: stub, calls };
}
