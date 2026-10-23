// @vitest-environment node
/**
 * P0.19: the database budget per governed call, counted on PostgreSQL.
 *
 * WHAT IS COUNTED. Every SQL statement Prisma sends while a call runs —
 * its query events, BEGIN and COMMIT included — split into the statements
 * sent before the response and those `after()` runs once it is sent
 * (src/lib/governed/after-response.ts). Both count against the budget
 * (src/lib/governed/db-budget.ts): work after the response still holds a
 * pooled connection.
 *
 * THE PATHS: a served read, a read refused by its grant, reads refused by
 * the key's state (revoked, dropped by a rotation, expired, unknown), a
 * served write and a replayed write, each in the steady state (a warm
 * instance, a key stamped in the last minute); then the occasional work: the
 * minute's first call of a key, and an app's first call on a fresh instance.
 *
 * AND NO TRANSACTION IS OPEN WHILE SAP IS CALLED. When the fake SAP is asked,
 * the test checks PostgreSQL itself (pg_stat_activity, for this test's own
 * connections, named by application_name) for a session idle in a
 * transaction, and the query log for a BEGIN without its COMMIT.
 *
 * WHAT IS REAL: the routes, the pipeline, the credential lookup, the access
 * load, the binding, the idempotency store, the audit insert, the journey
 * milestone, the tenant guard in throw mode, and PostgreSQL. WHAT IS STOOD IN:
 * SAP (`fetch`), and `after()` (collected, then run, so the two halves can be
 * told apart). Skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as DynamicCatalog from "@/lib/sap-public/dynamic-catalog";



const q = vi.hoisted(() => ({
  /** The application_name this test's monitored connections carry. */
  app: "p019-governed-budget",
  on: false,
  log: [] as string[],
  /** BEGINs without their COMMIT or ROLLBACK, as the query log shows them. */
  open: 0,
  deferred: [] as (() => unknown)[],
  /** Errors Prisma logged (its `log: ['error']` output in production). */
  errors: [] as string[],
}));

function withAppName(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}application_name=${q.app}`;
}

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: withAppName(process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused"),
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
    ],
  });
  // What production's `log: ['error']` (src/lib/db/prisma.ts) would print.
  base.$on("error", (e) => {
    q.errors.push(e.message.replace(/\s+/g, " ").slice(0, 160));
  });
  base.$on("query", (e) => {
    const text = e.query.trim();
    if (/^BEGIN\b/i.test(text)) q.open += 1;
    if (/^(COMMIT|ROLLBACK)\b/i.test(text)) q.open -= 1;
    if (q.on) q.log.push(text.replace(/\s+/g, " ").slice(0, 90));
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

// The Workbench console's session: who previews. Only the COOKIE is stood in
// (P0.14b review round 4): the session is validated against PostgreSQL, so
// the console's `authenticate` step is counted, as the northbound read counts
// its key. Mocking getCurrentUser hid every statement validating it sent.
const session = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cookies: async () => ({ get: (name: string) => (name === "abeam-session" && session.token ? { name, value: session.token } : undefined) }),
}));

// after(): collected, so the statements it runs are counted apart.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (fn: () => unknown) => {
    q.deferred.push(fn);
  },
}));

// Probe all's candidates: only this run's catalogue rows (P0.14b review round
// 6), so its per-service count does not depend on what another test file has
// put in the shared catalogue table (the golden test's convention).
const hub = vi.hoisted(() => ({ tag: `P019HUB${Math.random().toString(36).slice(2, 10).toUpperCase()}` }));
vi.mock("@/lib/sap-public/dynamic-catalog", async (importOriginal) => {
  const real = await importOriginal<typeof DynamicCatalog>();
  return {
    ...real,
    probeAllCandidateWhere: (...args: Parameters<typeof real.probeAllCandidateWhere>) => ({
      AND: [real.probeAllCandidateWhere(...args), { externalId: { contains: hub.tag } }],
    }),
  };
});

import { PrismaClient } from "@prisma/client";

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { GET as consoleAribaRoute } from "@/app/api/sap/ariba/call/route";
import { GET as consoleCapabilitiesRoute } from "@/app/api/sap/tdd/capabilities/route";
import { GET as consoleEntitiesRoute } from "@/app/api/sap/tdd/entities/route";
import { GET as consoleHubItemRoute } from "@/app/api/sap/tdd/hub-content/[id]/route";
import { GET as consoleHubListRoute } from "@/app/api/sap/tdd/hub-content/route";
import { POST as consoleProbeAllRoute } from "@/app/api/sap/tdd/hub-content/probe-all/route";
import { POST as consoleTenantServicesRoute } from "@/app/api/sap/tdd/tenant-services/route";
import { GET as storedTenantServicesRoute } from "@/app/api/studio/tenant-services/route";
import { GET as consoleOperationsRoute } from "@/app/api/sap/tdd/operations/route";
import { GET as consolePreviewRoute } from "@/app/api/sap/tdd/preview/route";
import { POST as writeRoute } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { forgetRecordedJourneyMilestones } from "@/lib/coreedge/journey";
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  CONSOLE_ROUTE_STATEMENTS,
  DB_BUDGET,
  NORTHBOUND_DISCOVERY_STATEMENTS,
  NORTHBOUND_QUERY_STATEMENTS,
  NORTHBOUND_SCHEMA_STATEMENTS,
} from "@/lib/governed/db-budget";
import { GET as discoveryRoute } from "@/app/api/northbound/interfaces/route";
import { GET as discoveryRouteV1 } from "@/app/api/northbound/v1/interfaces/route";
import { GET as schemaRoute } from "@/app/api/northbound/interfaces/[id]/schema/route";
import { GET as schemaRouteV1 } from "@/app/api/northbound/v1/interfaces/[id]/schema/route";
import { recordJob } from "@/lib/contracts/jobs";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { loadRecordHeads } from "@/lib/contracts/snapshot";
import { hashClientToken } from "@/lib/northbound/auth";
import { generateClientToken } from "@/lib/northbound/issue";
import { sealCursor } from "@/lib/northbound/query/cursor";
import { defaultVersion } from "@/lib/northbound/version-policy";
import { setWriteCredential } from "@/lib/northbound/write-credential";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

import { basisOf, compiled as compiledPolicy, source as querySource } from "../helpers/odata-query";

const RUN = `p019-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 86_400_000;
const ids = {
  solution: "",
  read: "",
  write: "",
  noGrant: "",
  legacy: "",
  legacyGrant: "",
  user: `${RUN}-dev`,
  client: "",
  hubRows: [] as string[],
};
const tokens = { live: "", revoked: "", dropped: "", expired: "" };
let writeKey = "";

/** An unmonitored client: what PostgreSQL itself says about this test's sessions. */
const observer = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
const sapSaw: { openInLog: number; idleInTransaction: number }[] = [];

async function fakeSap(_input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const rows = await observer.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pg_stat_activity
    WHERE datname = current_database() AND application_name = ${q.app} AND state LIKE 'idle in transaction%'`;
  sapSaw.push({ openInLog: q.open, idleInTransaction: Number(rows[0]?.n ?? 0) });
  const method = (init?.method ?? "GET").toUpperCase();
  const url = String(_input instanceof Request ? _input.url : _input);
  if (url.includes("CATALOGSERVICE")) {
    // P1.2: a tenant's own Gateway catalogue, one short page: a customer-built
    // service and one this run's catalogue publishes.
    const results = [{ ID: "ZUI_BUDGET_O2_0001" }, { ID: `API_${hub.tag}_A_SRV_0001` }];
    return new Response(JSON.stringify({ d: { results } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("ariba.com")) {
    const body = url.includes("oauth/token") ? { access_token: "ariba-token" } : { content: [{ EventId: "Doc1" }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (method === "GET" && new Headers(init?.headers).get("x-csrf-token") === "Fetch") {
    return new Response("{}", { status: 200, headers: { "x-csrf-token": "c", "content-type": "application/json" } });
  }
  if (method === "POST") {
    return new Response(JSON.stringify({ d: { SupplierInvoice: "1" } }), { status: 201, headers: { "content-type": "application/json" } });
  }
  const query = queryAnswer(url);
  if (query) return query;
  return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "1" }] } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The query surface's reads (P1.4): a V2 service over five purchase orders
 * that honours $skip and $top, a key by path (404 for the key "404"), a key
 * read through $filter, SAP refusing a filter on the supplier REJECT, and an
 * answer past the 16 MiB bound for the supplier HUGE. Null for any other
 * request, which the default answer serves.
 */
function queryAnswer(url: string): Response | null {
  const u = new URL(url);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const key = /\/A_PurchaseOrder\('([^']*)'\)$/.exec(decodeURIComponent(u.pathname));
  if (key) return key[1] === "404" ? new Response("", { status: 404 }) : json({ d: { PurchaseOrder: key[1], Supplier: "S1" } });
  const filter = u.searchParams.get("$filter") ?? "";
  if (!u.searchParams.has("$orderby") && !filter) return null;
  if (filter.includes("'REJECT'")) return json({ error: { message: { value: "Invalid filter" } } }, 400);
  if (filter.includes("'HUGE'")) return new Response(`{"d":{"results":[{"Supplier":"${"x".repeat(17 * 1024 * 1024)}"}]}}`, { status: 200 });
  const byKey = /PurchaseOrder eq '([^']*)'/.exec(filter);
  if (byKey) return json({ d: { results: [{ PurchaseOrder: byKey[1], Supplier: "S1" }] } });
  const all = [1, 2, 3, 4, 5].map((n) => ({ __metadata: { uri: `${u.origin}/A_PurchaseOrder('${n}')` }, PurchaseOrder: String(n), Supplier: `S${n}` }));
  const skip = Number(u.searchParams.get("$skip") ?? 0);
  const top = Number(u.searchParams.get("$top") ?? all.length);
  return json({ d: { ...(u.searchParams.has("$inlinecount") ? { __count: "5" } : {}), results: all.slice(skip, skip + top) } });
}

interface Counted {
  status: number;
  /** Statements sent before the response. */
  response: string[];
  /** Statements `after()` sent once it was. */
  after: string[];
  total: number;
  /** Errors Prisma logged while the call ran, before or after the response. */
  errors: string[];
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 10));
}

async function count(call: () => Promise<Response>): Promise<Counted> {
  await settle();
  q.deferred = [];
  q.log = [];
  q.errors = [];
  q.on = true;
  const res = await call();
  await settle();
  const response = q.log;
  q.log = [];
  for (const fn of q.deferred.splice(0)) await fn();
  await settle();
  const after = q.log;
  q.on = false;
  return { status: res.status, response, after, total: response.length + after.length, errors: q.errors.splice(0) };
}

const read = (token: string, id: string) =>
  readRoute(new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data`, { headers: { authorization: `Bearer ${token}` } }), {
    params: Promise.resolve({ id }),
  });

const write = (token: string, id: string, key: string, record: Record<string, unknown> = { SupplierInvoice: "1" }) =>
  writeRoute(
    new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data/write`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-coreedge-write-key": writeKey,
        "idempotency-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ record }),
    }),
    { params: Promise.resolve({ id }) },
  );

/** The key's stamp as it is after a call in the last minute. */
const stampNow = () => prisma.solutionClient.update({ where: { id: ids.client, organizationId: ORG }, data: { lastUsedAt: new Date() } });

/** The key's stamp as it is when the key has not been used for two minutes. */
const stampStale = () =>
  prisma.solutionClient.update({ where: { id: ids.client, organizationId: ORG }, data: { lastUsedAt: new Date(Date.now() - 120_000) } });

const lastUsedAt = async () =>
  (await prisma.solutionClient.findFirst({ where: { id: ids.client, organizationId: ORG }, select: { lastUsedAt: true } }))?.lastUsedAt ?? null;

describe.skipIf(!process.env.TEST_DATABASE_URL)("the database budget per governed call (P0.19)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "on");
    vi.stubGlobal("fetch", vi.fn(fakeSap));

    await prisma.organization.create({ data: { id: ORG, name: "DB budget", type: "client" } });
    await prisma.user.create({ data: { id: ids.user, email: `${RUN}@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG } });
    ids.solution = (
      await prisma.solution.create({
        data: {
          organizationId: ORG,
          name: "Budget",
          slug: `${RUN}-budget`,
          classification: "CLIENT_APP",
          businessProblem: "The database budget per governed call.",
          dataClass: "INTERNAL",
          status: "ACTIVE",
        },
      })
    ).id;
    const iface = async (externalId: string, operation: string, mode: string, entitySet: string) =>
      (
        await prisma.interface.create({
          data: { organizationId: ORG, solutionId: ids.solution, name: externalId, sapProduct: "s4hana", externalId, operation, mode, entitySet, status: "ACTIVE" },
        })
      ).id;
    ids.read = await iface("purchase-orders", "READ", "READ", "A_PurchaseOrder");
    ids.write = await iface("supplier-invoices", "CREATE", "WRITE", "A_SupplierInvoice");
    ids.noGrant = await iface("purchase-contracts", "READ", "READ", "A_PurchaseContract");
    ids.legacy = await iface("commercial-projects", "READ", "READ", "A_CommercialProject");
    for (const [interfaceId, externalId, operation] of [
      [ids.read, "purchase-orders", "READ"],
      [ids.write, "supplier-invoices", "CREATE"],
    ] as const) {
      await prisma.apiAccessGrant.create({
        data: {
          organizationId: ORG,
          solutionId: ids.solution,
          interfaceId,
          sapProduct: "s4hana",
          externalId,
          operation,
          environment: "DEV",
          justification: "Budget.",
          decision: "APPROVED",
          decidedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY),
        },
      });
    }

    // An unbound legacy grant (P0.1) as the backfill and cut-off leave one
    // they could not bind, approved after its interface was created, so
    // COREEDGE_GRANT_BINDING=legacy (the default) honours it. Already marked,
    // so the backfill another test file runs over every organisation's
    // unmarked grants leaves this one alone.
    ids.legacyGrant = (
      await prisma.apiAccessGrant.create({
        data: {
          organizationId: ORG,
          solutionId: ids.solution,
          externalId: "commercial-projects",
          operation: "READ",
          environment: "DEV",
          justification: "Budget, legacy.",
          decision: "APPROVED",
          decidedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY),
          unboundReason: "AMBIGUOUS",
          unboundCutoffAt: new Date(),
        },
      })
    ).id;

    const client = async (environment: string, extra: Record<string, unknown> = {}) => {
      const raw = generateClientToken(environment);
      const row = await prisma.solutionClient.create({
        data: {
          organizationId: ORG,
          solutionId: ids.solution,
          label: `${environment} key`,
          createdById: ids.user,
          tokenHash: hashClientToken(raw),
          environment,
          isActive: true,
          expiresAt: new Date(Date.now() + DAY),
          ...extra,
        },
      });
      return { raw, id: row.id };
    };
    const live = await client("DEV");
    tokens.live = live.raw;
    ids.client = live.id;
    tokens.revoked = (await client("TEST", { revokedAt: new Date() })).raw;
    tokens.expired = (await client("SANDBOX", { expiresAt: new Date(Date.now() - DAY) })).raw;
    // A key the live row dropped at a rotation.
    tokens.dropped = generateClientToken("DEV");
    await prisma.retiredClientToken.create({ data: { tokenHash: hashClientToken(tokens.dropped), clientId: live.id, organizationId: ORG } });

    writeKey = `cew_${RUN}_write_key_0000000000000`;
    expect(await setWriteCredential(tenantScopeOf(ORG), live.id, writeKey)).toBe(true);
    await upsertSapConnection({
      organizationId: ORG,
      product: "s4hana",
      key: `${RUN}-dev`,
      label: "S/4HANA DEV",
      baseUrl: "https://my000001-api.s4hana.cloud.sap",
      authType: "basic",
      secrets: { username: "COMM_USER", password: "not-a-real-password" },
      environment: "DEV",
      writeEnabled: true,
    });
    // The console's PROD connection, read with no grant: refused by its ceiling.
    await upsertSapConnection({
      organizationId: ORG,
      product: "s4hana",
      key: `${RUN}-prod`,
      label: "S/4HANA PROD",
      baseUrl: "https://my000003-api.s4hana.cloud.sap",
      authType: "basic",
      secrets: { username: "COMM_USER", password: "not-a-real-password" },
      environment: "PROD",
    });
    // Two probeable catalogue rows for Probe all and the detail probe (P0.14b review round 6).
    for (const suffix of ["A", "B"]) {
      const row = await prisma.sapHubContent.create({
        data: {
          contentType: "API",
          externalId: `API_${hub.tag}_${suffix}_SRV`,
          title: `Budget ${suffix}`,
          description: "",
          status: "Released",
          hubUrl: "u",
          apiType: "ODATAV2",
          appliesToPublic: true,
        },
        select: { id: true },
      });
      ids.hubRows.push(row.id);
    }
    // A signed-in builder, active in the last five minutes (so no lastActiveAt stamp is due).
    expect(SESSION_COOKIE_NAME).toBe("abeam-session");
    session.token = generateSessionToken();
    await prisma.session.create({
      data: { userId: ids.user, tokenHash: hashSessionToken(session.token), expiresAt: new Date(Date.now() + DAY), mfaVerified: true, lastActiveAt: new Date() },
    });

    // A warm instance: one call made, its milestone recorded.
    forgetRecordedJourneyMilestones();
    await count(() => read(tokens.live, ids.read));
    await count(() => write(tokens.live, ids.write, `${RUN}-warm-up`));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    // The console's platform rows (append-only in the code; a test's own rows are removed here).
    await prisma.platformConsoleRead.deleteMany({ where: { actorUserId: ids.user } });
    await prisma.northboundIdempotencyKey.deleteMany({ where: { organizationId: ORG } });
    await prisma.developerJourneyEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.catalogueAddressVerification.deleteMany({ where: { organizationId: ORG } });
    await prisma.sapHubContent.deleteMany({ where: { id: { in: ids.hubRows } } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.session.deleteMany({ where: { userId: ids.user } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await observer.$disconnect();
  });

  const report = (label: string, c: Counted) =>
    `${label}: ${c.total} statements (${c.response.length} before the response, ${c.after.length} after)\n  ${[...c.response, ...c.after.map((s) => `[after] ${s}`)].join("\n  ")}`;

  it("a served read stays within the read budget", async () => {
    await stampNow();
    const c = await count(() => read(tokens.live, ids.read));
    expect(c.status).toBe(200);
    expect(c.total, report("served read", c)).toBeLessThanOrEqual(DB_BUDGET.read);
  });

  it("a read refused by its grant stays within the read budget", async () => {
    await stampNow();
    const c = await count(() => read(tokens.live, ids.noGrant));
    expect(c.status).toBe(403);
    expect(c.total, report("refused by grant", c)).toBeLessThanOrEqual(DB_BUDGET.read);
  });

  it.each([
    ["revoked", () => tokens.revoked],
    ["dropped at a rotation", () => tokens.dropped],
    ["expired", () => tokens.expired],
    ["unknown", () => generateClientToken("DEV")],
  ])("a read refused by its key's state (%s) stays within the read budget", async (_label, token) => {
    const c = await count(() => read(token(), ids.read));
    expect(c.status).toBe(401);
    expect(c.total, report(`refused key (${_label})`, c)).toBeLessThanOrEqual(DB_BUDGET.read);
  });

  it("a served write stays within the write budget", async () => {
    await stampNow();
    const c = await count(() => write(tokens.live, ids.write, `${RUN}-created`));
    expect(c.status).toBe(201);
    expect(c.total, report("served write", c)).toBeLessThanOrEqual(DB_BUDGET.write);
  });

  it("a replayed write stays within the write budget", async () => {
    await stampNow();
    await count(() => write(tokens.live, ids.write, `${RUN}-replayed`));
    const c = await count(() => write(tokens.live, ids.write, `${RUN}-replayed`));
    expect(c.status).toBe(201);
    expect(c.total, report("replayed write", c)).toBeLessThanOrEqual(DB_BUDGET.write);
  });

  it("the minute's first call of a key stamps it after the response, within budget", async () => {
    await prisma.solutionClient.update({ where: { id: ids.client, organizationId: ORG }, data: { lastUsedAt: new Date(Date.now() - 120_000) } });
    const c = await count(() => read(tokens.live, ids.read));
    expect(c.status).toBe(200);
    expect(c.after.filter((s) => s.includes('"lastUsedAt"')), report("stale stamp", c)).toHaveLength(1);
    expect(c.total, report("stale stamp", c)).toBeLessThanOrEqual(DB_BUDGET.read);
    // ...and the next call in the same minute writes nothing.
    const next = await count(() => read(tokens.live, ids.read));
    expect(next.after, report("stamped", next)).toEqual([]);
  });

  it("an app's first call on a fresh instance records its milestone after the response", async () => {
    await stampNow();
    forgetRecordedJourneyMilestones();
    const c = await count(() => read(tokens.live, ids.read));
    expect(c.status).toBe(200);
    // The response path keeps to the budget; the milestone is the documented
    // once-per-instance addition (db-budget.ts), and never on the response path.
    expect(c.response.length, report("first call on an instance", c)).toBeLessThanOrEqual(DB_BUDGET.read);
    expect(c.after.some((s) => s.includes("DeveloperJourneyEvent")), report("first call on an instance", c)).toBe(true);
    expect(c.after.length).toBeLessThanOrEqual(3);
  });

  /*
   * REVIEW ROUND 1. The stamp is due on every call of a key idle for a minute
   * — most writes of a low-volume app — so a write must carry it within the
   * write budget, not only a read (it rides in the Idempotency-Key claim).
   */
  it("the minute's first write of a key stamps it within the write budget", async () => {
    await stampStale();
    const before = (await lastUsedAt())!.getTime();
    const c = await count(() => write(tokens.live, ids.write, `${RUN}-stale-write`));
    expect(c.status).toBe(201);
    expect(c.total, report("stale stamp write", c)).toBeLessThanOrEqual(DB_BUDGET.write);
    expect((await lastUsedAt())!.getTime()).toBeGreaterThan(before + 60_000);
  });

  it("the minute's first replay of a key stamps it within the write budget", async () => {
    await stampNow();
    await count(() => write(tokens.live, ids.write, `${RUN}-stale-replay`));
    await stampStale();
    const before = (await lastUsedAt())!.getTime();
    const c = await count(() => write(tokens.live, ids.write, `${RUN}-stale-replay`));
    expect(c.status).toBe(201);
    expect(c.total, report("stale stamp replay", c)).toBeLessThanOrEqual(DB_BUDGET.write);
    expect((await lastUsedAt())!.getTime()).toBeGreaterThan(before + 60_000);
  });

  it("a write refused before its key is claimed is stamped after the response, within the write budget", async () => {
    await stampStale();
    const c = await count(() => write(tokens.live, ids.noGrant, `${RUN}-stale-refused`));
    expect(c.status).toBe(403);
    expect(c.after.filter((s) => s.includes('"lastUsedAt"')), report("stale stamp refused write", c)).toHaveLength(1);
    expect(c.total, report("stale stamp refused write", c)).toBeLessThanOrEqual(DB_BUDGET.write);
  });

  it("a write whose Idempotency-Key expired is renewed in the claim, within the write budget", async () => {
    await stampNow();
    const key = `${RUN}-expired`;
    expect((await count(() => write(tokens.live, ids.write, key, { SupplierInvoice: "old" }))).status).toBe(201);
    await prisma.northboundIdempotencyKey.updateMany({
      where: { organizationId: ORG, key },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const c = await count(() => write(tokens.live, ids.write, key, { SupplierInvoice: "new" }));
    expect(c.status).toBe(201);
    expect(c.total, report("expired key write", c)).toBeLessThanOrEqual(DB_BUDGET.write);
    expect(c.errors).toEqual([]);
    // Renewed for THIS request: a fresh lifetime and this call's own outcome.
    const row = await prisma.northboundIdempotencyKey.findFirst({ where: { organizationId: ORG, key } });
    expect(row?.status).toBe(201);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + DAY - 60_000);
  });

  it("a read authorised by an unbound legacy grant stamps the grant after the response, in one statement", async () => {
    await stampNow();
    await prisma.apiAccessGrant.update({ where: { id: ids.legacyGrant, organizationId: ORG }, data: { unboundLastUsedAt: null } });
    const c = await count(() => read(tokens.live, ids.legacy));
    expect(c.status).toBe(200);
    expect(c.response.filter((s) => s.includes("ApiAccessGrant") && s.startsWith("UPDATE")), report("legacy grant read", c)).toEqual([]);
    expect(c.after, report("legacy grant read", c)).toHaveLength(1);
    expect(c.after[0]).toContain('"unboundLastUsedAt"');
    expect(c.total, report("legacy grant read", c)).toBeLessThanOrEqual(DB_BUDGET.read);
    const stamped = await prisma.apiAccessGrant.findFirst({ where: { id: ids.legacyGrant, organizationId: ORG }, select: { unboundLastUsedAt: true } });
    expect(stamped?.unboundLastUsedAt?.getTime()).toBeGreaterThan(Date.now() - 60_000);
    // ...and within the hour nothing more is written.
    const next = await count(() => read(tokens.live, ids.legacy));
    expect(next.after, report("legacy grant read, stamped", next)).toEqual([]);
  });

  it("a replayed or conflicting write logs no database error", async () => {
    await stampNow();
    const key = `${RUN}-quiet`;
    expect((await count(() => write(tokens.live, ids.write, key))).errors).toEqual([]);
    const replay = await count(() => write(tokens.live, ids.write, key));
    expect(replay.status).toBe(201);
    expect(replay.errors).toEqual([]);
    const conflict = await count(() => write(tokens.live, ids.write, key, { SupplierInvoice: "other" }));
    expect(conflict.status).toBe(409);
    expect(conflict.errors).toEqual([]);
  });

  /*
   * P0.14b REVIEW ROUND 3. A Workbench console read is a read through the
   * pipeline too, and P0.14b added its platform-scope row: written as a nested
   * create, it was BEGIN, two INSERTs, a SELECT and COMMIT, so a warm preview
   * of a DEV connection sent 7 statements where it had sent 2. The row is one
   * statement now; the console's budget is stated in db-budget.ts.
   *
   * REVIEW ROUND 4. The console's `authenticate` step is the person's session,
   * and it was mocked here, so it was never counted: validating it was three
   * statements (Prisma's nested select), sent twice (the probe guard and the
   * route each validated it), six before the call's own. Only the cookie is
   * stood in now. The session is one statement and validated once.
   *
   * REVIEW ROUND 5. A TEST, PROD or undeclared connection sent its
   * environment ceiling's grant lookup apart from the connection: 5, and the
   * console budget had been raised to 5 to fit it. The grants are read in the
   * connection's own statement now: 4, the read's budget.
   */
  describe("the Workbench console (P0.14b)", () => {
    const S4 = "product=s4hana";
    const PO = "service=purchase-orders&entity=A_PurchaseOrder";
    const consoleGet = (route: (r: NextRequest) => Promise<Response>, url: string) => () => route(new NextRequest(`http://localhost${url}`));
    /** The session is validated once, in one statement. */
    const sessionLookups = (c: Counted) => c.response.filter((s) => s.includes("auth:session-lookup") || s.includes('"Session"'));
    /** A grant lookup sent on its own: the ceiling's grants ride in the connection's statement. */
    const ceilingLookups = (c: Counted) =>
      c.response.filter((s) => s.includes('"ApiAccessGrant"') && !s.includes("governed:console-connection"));

    it("a served preview stays within the console budget, its platform row in one statement", async () => {
      const c = await count(consoleGet(consolePreviewRoute, `/api/sap/tdd/preview?${S4}&tenant=${RUN}-dev&${PO}&limit=2`));
      expect(c.status, report("console preview", c)).toBe(200);
      expect(c.total, report("console preview", c)).toBeLessThanOrEqual(DB_BUDGET.consoleRead);
      // A DEV connection needs no grant lookup: the session, the connection, two rows.
      expect(c.total, report("console preview", c)).toBe(4);
      expect(sessionLookups(c), report("console preview", c)).toHaveLength(1);
      expect(c.response.filter((s) => /^(BEGIN|COMMIT)\b/i.test(s)), report("console preview", c)).toEqual([]);
      expect(c.response.filter((s) => s.includes("PlatformConsoleRead")), report("console preview", c)).toHaveLength(1);
      // Never on the Workbench write tables (integration review round 4).
      expect(c.response.filter((s) => s.includes("PlatformAuditEvent")), report("console preview", c)).toEqual([]);
      // ...and the row is whole: the event with its outcome.
      const row = await prisma.platformConsoleRead.findFirst({
        where: { actorUserId: ids.user, serviceKey: "purchase-orders" },
        orderBy: { at: "desc" },
      });
      expect(row?.outcome).toBe("SUCCEEDED");
    });

    it("a preview refused by the environment ceiling stays within the console budget", async () => {
      const c = await count(consoleGet(consolePreviewRoute, `/api/sap/tdd/preview?${S4}&tenant=${RUN}-prod&${PO}`));
      expect(c.status, report("console preview refused", c)).toBe(403);
      expect(c.total, report("console preview refused", c)).toBeLessThanOrEqual(DB_BUDGET.consoleRead);
      expect(sessionLookups(c), report("console preview refused", c)).toHaveLength(1);
      // The session, the connection WITH the ceiling's grants (review round
      // 5: one statement, governed:console-connection), two rows.
      expect(c.total, report("console preview refused", c)).toBe(4);
      expect(ceilingLookups(c), report("console preview refused", c)).toEqual([]);
    });

    it("a preview of a PROD connection its grant opens stays within the console budget", async () => {
      const grant = await prisma.apiAccessGrant.create({
        data: {
          organizationId: ORG,
          solutionId: ids.solution,
          interfaceId: ids.read,
          sapProduct: "s4hana",
          externalId: "purchase-orders",
          operation: "READ",
          environment: "PROD",
          justification: "Budget, PROD console read.",
          decision: "APPROVED",
          decidedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY),
        },
      });
      try {
        const c = await count(consoleGet(consolePreviewRoute, `/api/sap/tdd/preview?${S4}&tenant=${RUN}-prod&${PO}&limit=2`));
        expect(c.status, report("console preview PROD", c)).toBe(200);
        expect(c.total, report("console preview PROD", c)).toBeLessThanOrEqual(DB_BUDGET.consoleRead);
        expect(sessionLookups(c), report("console preview PROD", c)).toHaveLength(1);
        expect(c.total, report("console preview PROD", c)).toBe(4);
        expect(ceilingLookups(c), report("console preview PROD", c)).toEqual([]);
        // The grants are read with every call, never cached: revoked, the next preview is refused.
        await prisma.apiAccessGrant.update({ where: { id: grant.id, organizationId: ORG }, data: { revokedAt: new Date() } });
        const after = await count(consoleGet(consolePreviewRoute, `/api/sap/tdd/preview?${S4}&tenant=${RUN}-prod&${PO}&limit=2`));
        expect(after.status, report("console preview PROD, revoked", after)).toBe(403);
        expect(after.total, report("console preview PROD, revoked", after)).toBeLessThanOrEqual(DB_BUDGET.consoleRead);
      } finally {
        await prisma.apiAccessGrant.delete({ where: { id: grant.id, organizationId: ORG } });
      }
    });

    it("a fan-out (the operations dashboard) stays within the console budget", async () => {
      const c = await count(consoleGet(consoleOperationsRoute, `/api/sap/tdd/operations?${S4}&tenant=${RUN}-dev&refresh=1`));
      expect(c.status, report("console operations", c)).toBe(200);
      expect(c.total, report("console operations", c)).toBeLessThanOrEqual(DB_BUDGET.consoleRead);
      expect(sessionLookups(c), report("console operations", c)).toHaveLength(1);
      expect(c.total, report("console operations", c)).toBe(4);
    });

    /*
     * REVIEW ROUND 6. The figures above were claimed for every console route
     * (a capability or catalogue probe, Probe all's run) while CI measured
     * only the preview, operations and the Ariba call: the capability probe
     * sends 6, Probe all 6 plus one per service. Each console route is
     * measured here; the console read's 4 (`DB_BUDGET.consoleRead`) is held
     * by the routes that do nothing but the read, and the work the others add
     * to it is stated in `CONSOLE_ROUTE_STATEMENTS` with its reason.
     */
    /** The console call's own statements: the session, the connection, the two rows. */
    const consoleOwn = (c: Counted) =>
      c.response.filter(
        (s) =>
          s.includes("auth:session-lookup") ||
          s.includes("governed:console-connection") ||
          s.includes('"NorthboundAuditEvent"') ||
          s.includes("governed:console-read-audit"),
      );
    const routeOwn = (c: Counted) => {
      const own = new Set(consoleOwn(c));
      return c.response.filter((s) => !own.has(s));
    };

    it("the entity list stays within the console budget; its probe fan-out is two calls, each with its two rows", async () => {
      const c = await count(consoleGet(consoleEntitiesRoute, `/api/sap/tdd/entities?${S4}&tenant=${RUN}-dev&service=purchase-orders&refresh=1`));
      expect(c.status, report("console entities", c)).toBe(200);
      expect(c.total, report("console entities", c)).toBeLessThanOrEqual(DB_BUDGET.consoleRead);
      expect(c.total, report("console entities", c)).toBe(4);
      const fan = await count(
        consoleGet(consoleEntitiesRoute, `/api/sap/tdd/entities?${S4}&tenant=${RUN}-dev&service=purchase-orders&probe=1&refresh=1`),
      );
      expect(fan.status, report("console entities probe", fan)).toBe(200);
      expect(fan.total, report("console entities probe", fan)).toBe(CONSOLE_ROUTE_STATEMENTS.entityListWithProbe);
      expect(fan.response.filter((s) => s.includes("governed:console-read-audit")), report("console entities probe", fan)).toHaveLength(2);
      expect(routeOwn(fan), report("console entities probe", fan)).toEqual([]);
    });

    it("a capability probe sends the console read's 4, its catalogue read and its decision-log entry", async () => {
      const c = await count(consoleGet(consoleCapabilitiesRoute, `/api/sap/tdd/capabilities?${S4}&tenant=${RUN}-dev&refresh=1`));
      expect(c.status, report("console capabilities", c)).toBe(200);
      expect(c.total, report("console capabilities", c)).toBe(CONSOLE_ROUTE_STATEMENTS.capabilityProbe);
      expect(consoleOwn(c), report("console capabilities", c)).toHaveLength(DB_BUDGET.consoleRead);
      const own = routeOwn(c);
      expect(own, report("console capabilities", c)).toHaveLength(2);
      expect(own.filter((s) => s.includes('"SapApiReference"')), report("console capabilities", c)).toHaveLength(1);
      expect(own.filter((s) => s.includes('"DecisionLogEntry"')), report("console capabilities", c)).toHaveLength(1);
    });

    it("a catalogue detail probe sends the console read's 4 and the catalogue row it shows", async () => {
      const id = ids.hubRows[0]!;
      const c = await count(() =>
        consoleHubItemRoute(new NextRequest(`http://localhost/api/sap/tdd/hub-content/${id}?${S4}&tenant=${RUN}-dev`), {
          params: Promise.resolve({ id }),
        }),
      );
      expect(c.status, report("console catalogue detail", c)).toBe(200);
      expect(c.total, report("console catalogue detail", c)).toBe(CONSOLE_ROUTE_STATEMENTS.catalogueDetailProbe);
      expect(consoleOwn(c), report("console catalogue detail", c)).toHaveLength(DB_BUDGET.consoleRead);
      // The catalogue row, and (P1.2) the scenarios SAP's table lists the service under.
      expect(routeOwn(c).filter((s) => s.includes("sap:comm-scenarios")), report("console catalogue detail", c)).toHaveLength(1);
      expect(
        routeOwn(c).every((s) => s.includes('"SapHubContent"') || s.includes("sap:comm-scenarios")),
        report("console catalogue detail", c),
      ).toBe(true);
    });

    it("the catalogue list's live overlay adds one console read to the page's own catalogue statements", async () => {
      const c = await count(consoleGet(consoleHubListRoute, `/api/sap/tdd/hub-content?${S4}&tenant=${RUN}-dev&dataProbe=1&q=${hub.tag}`));
      expect(c.status, report("console catalogue overlay", c)).toBe(200);
      expect(consoleOwn(c), report("console catalogue overlay", c)).toHaveLength(DB_BUDGET.consoleRead);
      // Everything else is the catalogue page: its rows, counts, the V4 addresses the overlay verified,
      // and (P1.2) one statement for the scenarios SAP's table lists the page's services under.
      expect(
        routeOwn(c).every(
          (s) => s.includes('"SapHubContent"') || s.includes('"CatalogueAddressVerification"') || s.includes("sap:comm-scenarios"),
        ),
        report("console catalogue overlay", c),
      ).toBe(true);
      expect(routeOwn(c).filter((s) => s.includes("sap:comm-scenarios")), report("console catalogue overlay", c)).toHaveLength(1);
    });

    it("Probe all sends a fixed number of statements plus one per service it probed", async () => {
      const c = await count(() =>
        consoleProbeAllRoute(
          new NextRequest("http://localhost/api/sap/tdd/hub-content/probe-all", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirmation: "PROBE ALL SAP SERVICES", product: "s4hana", tenant: `${RUN}-dev` }),
          }),
        ),
      );
      expect(c.status, report("console probe all", c)).toBe(200);
      const services = ids.hubRows.length;
      expect(c.response.filter((s) => s.startsWith('UPDATE "SapHubContent"')), report("console probe all", c)).toHaveLength(services);
      expect(c.total, report("console probe all", c)).toBe(
        CONSOLE_ROUTE_STATEMENTS.probeAllFixed + CONSOLE_ROUTE_STATEMENTS.probeAllPerService * services,
      );
      expect(consoleOwn(c), report("console probe all", c)).toHaveLength(DB_BUDGET.consoleRead);
    });

    it("the live tenant service listing sends the console read's 4, its two classification reads and its upsert (P1.2)", async () => {
      const c = await count(() =>
        consoleTenantServicesRoute(
          new NextRequest("http://localhost/api/sap/tdd/tenant-services", {
            method: "POST",
            body: JSON.stringify({ product: "s4hana", tenant: `${RUN}-dev` }),
          }),
        ),
      );
      expect(c.status, report("console tenant services", c)).toBe(200);
      expect(c.total, report("console tenant services", c)).toBe(CONSOLE_ROUTE_STATEMENTS.tenantServiceList);
      expect(consoleOwn(c), report("console tenant services", c)).toHaveLength(DB_BUDGET.consoleRead);
      const own = routeOwn(c);
      expect(own.filter((s) => s.includes('"SapHubContent"')), report("console tenant services", c)).toHaveLength(1);
      expect(own.filter((s) => s.includes("sap:comm-scenarios")), report("console tenant services", c)).toHaveLength(1);
      expect(own.filter((s) => s.includes('"TenantServiceListing"')), report("console tenant services", c)).toHaveLength(1);
    });

    it("the stored tenant service listing reads the database only: no SAP request, no audit row (P1.2)", async () => {
      const c = await count(consoleGet(storedTenantServicesRoute, `/api/studio/tenant-services?${S4}&tenant=${RUN}-dev`));
      expect(c.status, report("stored tenant services", c)).toBe(200);
      expect(c.total, report("stored tenant services", c)).toBe(CONSOLE_ROUTE_STATEMENTS.tenantServiceListStored);
      expect(c.response.some((s) => s.includes('"NorthboundAuditEvent"') || s.includes("governed:console-read-audit"))).toBe(false);
    });

    it("an Ariba call reads no connection and writes no organization row", async () => {
      vi.stubEnv("ARIBA_BASE_URL", "https://openapi.ariba.com");
      vi.stubEnv("ARIBA_API_KEY", "ariba-key");
      vi.stubEnv("ARIBA_OAUTH_TOKEN_URL", "https://api.ariba.com/v2/oauth/token");
      vi.stubEnv("ARIBA_CLIENT_ID", "ariba-client");
      vi.stubEnv("ARIBA_CLIENT_SECRET", "ariba-secret");
      vi.stubEnv("ARIBA_REALM", "myrealm-T");
      vi.stubEnv("ARIBA_REALMS_JSON", "");
      const c = await count(consoleGet(consoleAribaRoute, "/api/sap/ariba/call?endpoint=sourcing-events&realm=myrealm-T&limit=2"));
      expect(c.status, report("console ariba", c)).toBe(200);
      // The session, the platform row, and the decision-log entry the route has always written beside it.
      expect(c.total, report("console ariba", c)).toBe(3);
      expect(sessionLookups(c), report("console ariba", c)).toHaveLength(1);
      expect(c.response.filter((s) => s.includes("PlatformConsoleRead")), report("console ariba", c)).toHaveLength(1);
    });
  });

  /*
   * GET /schema AND ITS /v1 ALIAS (P1.3 on P0.19). Not a governed read: it
   * reaches no SAP system, so it is not on the pipeline and is not held to
   * DB_BUDGET.read. It serves the texts a verify stored (P1.3), and what it
   * sends is stated in NORTHBOUND_SCHEMA_STATEMENTS and asserted exactly
   * here, so a change is seen. The two paths are one handler.
   */
  describe("GET /schema", () => {
    const schemaIds = { compiled: "", bare: "" };
    const schema = (path: "/api/northbound" | "/api/northbound/v1", token: string, id: string) =>
      (path === "/api/northbound" ? schemaRoute : schemaRouteV1)(
        new NextRequest(`http://localhost${path}/interfaces/${id}/schema`, { headers: { authorization: `Bearer ${token}` } }),
        { params: Promise.resolve({ id }) },
      );

    beforeAll(async () => {
      const make = async (externalId: string) =>
        prisma.interface.create({
          data: { organizationId: ORG, solutionId: ids.solution, name: externalId, sapProduct: "s4hana", externalId, operation: "READ", mode: "READ", entitySet: "A_Customer", status: "ACTIVE" },
          select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true },
        });
      const compiled = await make(`${RUN}-schema-compiled`);
      schemaIds.compiled = compiled.id;
      schemaIds.bare = (await make(`${RUN}-schema-bare`)).id;
      // The contract a verify records: the record job in process (jobs.ts is pure), then the record.
      const scope = tenantScopeOf(ORG);
      const iface = { ...compiled, entitySet: "A_Customer" };
      const heads = await loadRecordHeads(scope, iface, "DEV");
      const description = readFileSync(join(process.cwd(), "tests/fixtures/contracts/edmx/business-partner.v2.xml"), "utf8");
      const outcome = await recordVerifiedContract({
        scope,
        iface,
        compiled: recordJob({ description, entitySet: "A_Customer", ...heads }),
        heads,
        environment: "DEV",
        connectionId: "conn_budget",
        actorId: ids.user,
      });
      expect(outcome).toMatchObject({ status: "RECORDED" });
    });

    afterAll(async () => {
      await prisma.contractSnapshot.deleteMany({ where: { organizationId: ORG } });
    });

    it.each(["/api/northbound", "/api/northbound/v1"] as const)("%s: a compiled contract's stored texts, in the stated statements", async (path) => {
      await stampNow();
      const c = await count(() => schema(path, tokens.live, schemaIds.compiled));
      expect(c.status).toBe(200);
      expect(c.total, report(`schema ${path}`, c)).toBe(NORTHBOUND_SCHEMA_STATEMENTS.compiled);
    });

    it.each(["/api/northbound", "/api/northbound/v1"] as const)("%s: an interface with no contract yet, in the stated statements", async (path) => {
      await stampNow();
      const c = await count(() => schema(path, tokens.live, schemaIds.bare));
      expect(c.status).toBe(200);
      expect(c.total, report(`schema bare ${path}`, c)).toBe(NORTHBOUND_SCHEMA_STATEMENTS.none);
    });
  });

  /*
   * DISCOVERY AND ITS /v1 ALIAS. Not a governed read: it lists the solution's
   * interfaces and reaches no SAP system. It stamped the key's lastUsedAt on
   * every call; it now follows the governed calls' once-a-minute rule, so a
   * warm call sends no UPDATE and a stale key sends exactly one.
   */
  describe("GET /interfaces (discovery)", () => {
    const discover = (path: "/api/northbound" | "/api/northbound/v1", token: string) =>
      (path === "/api/northbound" ? discoveryRoute : discoveryRouteV1)(
        new NextRequest(`http://localhost${path}/interfaces`, { headers: { authorization: `Bearer ${token}` } }),
      );
    const stampUpdates = (c: Counted) => [...c.response, ...c.after].filter((s) => /UPDATE\s+"public"\."SolutionClient"/i.test(s) && s.includes("lastUsedAt"));
    const connectionsRead = (s: string) => /^SELECT\s+"public"\."SapConnection"\./.test(s);

    it.each(["/api/northbound", "/api/northbound/v1"] as const)("%s: warm, in the stated statements, with no key stamp", async (path) => {
      await stampNow();
      const c = await count(() => discover(path, tokens.live));
      expect(c.status).toBe(200);
      expect(c.total, report(`discovery ${path}`, c)).toBe(NORTHBOUND_DISCOVERY_STATEMENTS.warm);
      expect(stampUpdates(c), report(`discovery ${path}`, c)).toHaveLength(0);
      // One product among the granted interfaces: its connections, read once.
      expect(c.response.filter(connectionsRead), report(`discovery ${path}`, c)).toHaveLength(1);
    });

    it.each(["/api/northbound", "/api/northbound/v1"] as const)("%s: a key last stamped over a minute ago is stamped once", async (path) => {
      await prisma.solutionClient.update({ where: { id: ids.client, organizationId: ORG }, data: { lastUsedAt: new Date(Date.now() - 5 * 60_000) } });
      const c = await count(() => discover(path, tokens.live));
      expect(c.status).toBe(200);
      expect(c.total, report(`discovery stale ${path}`, c)).toBe(NORTHBOUND_DISCOVERY_STATEMENTS.stamped);
      expect(stampUpdates(c), report(`discovery stale ${path}`, c)).toHaveLength(1);
    });

    // The verdicts read connections only for interfaces that pass the grant
    // gate: a solution with nothing granted in the key's environment reads
    // none. Its own solution, so no other test's grants reach it.
    let ungrantedKey = "";
    beforeAll(async () => {
      const solutionId = (
        await prisma.solution.create({
          data: {
            organizationId: ORG,
            name: "Budget, nothing granted",
            slug: `${RUN}-nothing-granted`,
            classification: "CLIENT_APP",
            businessProblem: "Discovery with nothing granted.",
            dataClass: "INTERNAL",
            status: "ACTIVE",
          },
        })
      ).id;
      await prisma.interface.create({
        data: { organizationId: ORG, solutionId, name: "purchase-orders", sapProduct: "s4hana", externalId: "purchase-orders", operation: "READ", mode: "READ", entitySet: "A_PurchaseOrder", status: "ACTIVE" },
      });
      ungrantedKey = generateClientToken("DEV");
      await prisma.solutionClient.create({
        data: {
          organizationId: ORG,
          solutionId,
          label: "DEV key, nothing granted",
          createdById: ids.user,
          tokenHash: hashClientToken(ungrantedKey),
          environment: "DEV",
          isActive: true,
          expiresAt: new Date(Date.now() + DAY),
          lastUsedAt: new Date(),
        },
      });
    });

    it.each(["/api/northbound", "/api/northbound/v1"] as const)("%s: nothing granted in the key's environment reads no connections", async (path) => {
      const c = await count(() => discover(path, ungrantedKey));
      expect(c.status).toBe(200);
      expect(c.total, report(`discovery nothing granted ${path}`, c)).toBe(NORTHBOUND_DISCOVERY_STATEMENTS.nothingGranted);
      expect(c.response.filter(connectionsRead), report(`discovery nothing granted ${path}`, c)).toHaveLength(0);
    });
  });

  /*
   * THE QUERY SURFACE (P1.4). A query page is a read, held to the read's 4:
   * the compiled policy rides in the access load's own statement, the cursor
   * opens and is sealed in memory, and the query's audit columns are written
   * in the row's one insert. So every page — the first, with or without its
   * count, a cursor page, a key lookup by path or through the filter — and
   * every outcome SAP's answer decides, or refusal after authorisation, is
   * the legacy read's 3; a refusal before authorisation is 2, the interface
   * never read; and the key's minute stamp adds 1 at most.
   */
  describe("the query surface (P1.4)", () => {
    let noPolicy = "";
    const query = (qs: string, id = ids.read) =>
      readRoute(new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data?${qs}`, { headers: { authorization: `Bearer ${tokens.live}` } }), {
        params: Promise.resolve({ id }),
      });
    const POLICY = compiledPolicy(
      basisOf([{ n: "PurchaseOrder" }, { n: "Supplier" }, { n: "NetAmount", t: "D", edm: "Edm.Decimal" }], ["PurchaseOrder"], { entitySet: "A_PurchaseOrder" }),
      querySource({
        filter: [
          { field: "PurchaseOrder", ops: ["eq", "in"] },
          { field: "Supplier", ops: ["eq", "in"] },
        ],
        sort: ["PurchaseOrder"],
        count: true,
      }),
    );
    /** A cursor sealed for this key and interface, as the route would seal it, with what a test changes. */
    const cursorFor = (over: Record<string, unknown>) => {
      const now = Math.floor(Date.now() / 1000);
      return sealCursor(
        {
          v: 1,
          ch: "A".repeat(16),
          pi: 1,
          off: 2,
          rs: 2,
          iv: 1,
          pr: POLICY.rev,
          qb: "A".repeat(22),
          g: ["A".repeat(12)],
          cn: "x",
          cr: 0,
          lk: "A".repeat(11),
          fk: `t1.${"A".repeat(11)}`,
          rb: 50,
          iat: now,
          exp: now + 600,
          cx: now + 3600,
          ...over,
        } as never,
        { organizationId: ORG, clientId: ids.client, interfaceId: ids.read, apiVersion: defaultVersion(new Date())!.version },
      );
    };

    beforeAll(async () => {
      vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
      await prisma.interface.update({
        where: { id: ids.read, organizationId: ORG },
        data: { queryPolicy: querySource() as never, queryPolicyCompiled: POLICY as never, queryPolicyRevision: 1 },
      });
      noPolicy = (
        await prisma.interface.create({
          data: { organizationId: ORG, solutionId: ids.solution, name: "pr", sapProduct: "s4hana", externalId: "purchase-requisitions", operation: "READ", mode: "READ", entitySet: "A_PurchaseRequisition", status: "ACTIVE" },
        })
      ).id;
      await prisma.apiAccessGrant.create({
        data: {
          organizationId: ORG,
          solutionId: ids.solution,
          interfaceId: noPolicy,
          sapProduct: "s4hana",
          externalId: "purchase-requisitions",
          operation: "READ",
          environment: "DEV",
          justification: "Budget, no policy.",
          decision: "APPROVED",
          decidedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY),
        },
      });
      // Warm: the first query of the run.
      await count(() => query("pageSize=2"));
    });

    afterAll(() => {
      vi.stubEnv("COREEDGE_QUERY_SURFACE", "");
    });

    it.each([
      ["a first page", "pageSize=2", 200],
      ["a first page with its count", "pageSize=2&count=true", 200],
      ["a filtered, selected first page", "select=Supplier&filter.Supplier.in=S1&filter.Supplier.in=S2&orderby=-PurchaseOrder", 200],
      ["a key lookup by path", "key.PurchaseOrder=1", 200],
      ["a key read through the filter", "key.PurchaseOrder=A%2FB", 200],
      ["SAP refusing the query", "filter.Supplier.eq=REJECT", 422],
      ["SAP's page past the bound", "filter.Supplier.eq=HUGE", 422],
      ["a key SAP does not have", "key.PurchaseOrder=404", 404],
      ["a field the policy does not allow", "filter.NetAmount.gt=1", 400],
      ["a query SAP cannot take in one URL", Array.from({ length: 50 }, (_, i) => `filter.Supplier.in=${encodeURIComponent("é".repeat(19) + String(i).padStart(2, "0"))}`).join("&"), 400],
      ["a cursor whose policy changed", () => `pageSize=2&cursor=${cursorFor({ pr: "qp1:" + "B".repeat(22) })}`, 409],
    ] as const)("%s: the key, the access load with the policy, the audit row", async (label, qs, status) => {
      await stampNow();
      const c = await count(() => query(typeof qs === "function" ? qs() : qs));
      expect(c.status, report(label, c)).toBe(status);
      expect(c.total, report(label, c)).toBe(NORTHBOUND_QUERY_STATEMENTS.page);
    });

    it("an interface with no policy: refused after the access load, in the same 3", async () => {
      await stampNow();
      const c = await count(() => query("pageSize=2", noPolicy));
      expect(c.status).toBe(400);
      expect(c.total, report("no policy", c)).toBe(NORTHBOUND_QUERY_STATEMENTS.page);
    });

    it("a cursor page is the same 3: the cursor opens and is sealed in memory", async () => {
      await stampNow();
      const first = await query("pageSize=2");
      const { data } = (await first.json()) as { data: { page: { nextCursor: string | null } } };
      expect(data.page.nextCursor).not.toBeNull();
      const c = await count(() => query(`pageSize=2&cursor=${data.page.nextCursor}`));
      expect(c.status, report("cursor page", c)).toBe(200);
      expect(c.total, report("cursor page", c)).toBe(NORTHBOUND_QUERY_STATEMENTS.page);
    });

    it.each([
      // Raw OData beside a reserved name: on the surface, so refused (alone it is a legacy read, which ignores it, D16).
      ["raw OData", "select=PurchaseOrder&$filter=PurchaseOrder%20eq%20'1'"],
      ["a cursor that does not open", "pageSize=2&cursor=cec1.t0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
      ["an expired cursor", () => `pageSize=2&cursor=${cursorFor({ iat: 1, exp: 2 })}`],
    ] as const)("refused before authorisation (%s): the key and the audit row", async (label, qs) => {
      await stampNow();
      const c = await count(() => query(typeof qs === "function" ? qs() : qs));
      expect([400, 409]).toContain(c.status);
      expect(c.total, report(label, c)).toBe(NORTHBOUND_QUERY_STATEMENTS.refusedBeforeAccess);
      expect(c.response.some((sql) => sql.includes("governed:access-load")), report(label, c)).toBe(false);
    });

    it("the switch off refuses before authorisation too", async () => {
      vi.stubEnv("COREEDGE_QUERY_SURFACE", "off");
      try {
        await stampNow();
        const c = await count(() => query("pageSize=2"));
        expect(c.status).toBe(400);
        expect(c.total, report("switch off", c)).toBe(NORTHBOUND_QUERY_STATEMENTS.refusedBeforeAccess);
      } finally {
        vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
      }
    });

    it("the minute's first call of a key adds its stamp, after the response, within budget", async () => {
      await stampStale();
      const c = await count(() => query("pageSize=2&count=true"));
      expect(c.status).toBe(200);
      expect(c.after.filter((sql) => sql.includes('"lastUsedAt"')), report("stamped query", c)).toHaveLength(1);
      expect(c.total, report("stamped query", c)).toBe(NORTHBOUND_QUERY_STATEMENTS.page + 1);
      expect(c.total).toBeLessThanOrEqual(DB_BUDGET.read);
    });

    it("a legacy read of the same interface carries no policy in its statement", async () => {
      await stampNow();
      const c = await count(() => read(tokens.live, ids.read));
      expect(c.status).toBe(200);
      expect(c.total, report("legacy read beside a policy", c)).toBe(3);
    });
  });

  it("holds no transaction open while SAP is called", () => {
    // Every served call above reached SAP; at each, nothing was open.
    expect(sapSaw.length).toBeGreaterThan(5);
    expect(sapSaw.filter((s) => s.openInLog !== 0 || s.idleInTransaction !== 0)).toEqual([]);
  });
});
