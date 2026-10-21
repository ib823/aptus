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

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";



const q = vi.hoisted(() => ({
  /** The application_name this test's monitored connections carry. */
  app: "p019-governed-budget",
  on: false,
  log: [] as string[],
  /** BEGINs without their COMMIT or ROLLBACK, as the query log shows them. */
  open: 0,
  deferred: [] as (() => unknown)[],
}));

function withAppName(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}application_name=${q.app}`;
}

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: withAppName(process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused"),
    log: [{ emit: "event", level: "query" }],
  });
  base.$on("query", (e) => {
    const text = e.query.trim();
    if (/^BEGIN\b/i.test(text)) q.open += 1;
    if (/^(COMMIT|ROLLBACK)\b/i.test(text)) q.open -= 1;
    if (q.on) q.log.push(text.replace(/\s+/g, " ").slice(0, 90));
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

// after(): collected, so the statements it runs are counted apart.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (fn: () => unknown) => {
    q.deferred.push(fn);
  },
}));

import { PrismaClient } from "@prisma/client";

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as writeRoute } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { forgetRecordedJourneyMilestones } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import { DB_BUDGET } from "@/lib/governed/db-budget";
import { hashClientToken } from "@/lib/northbound/auth";
import { generateClientToken } from "@/lib/northbound/issue";
import { setWriteCredential } from "@/lib/northbound/write-credential";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const RUN = `p019-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 86_400_000;
const ids = { solution: "", read: "", write: "", noGrant: "", user: `${RUN}-dev`, client: "" };
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
  if (method === "GET" && new Headers(init?.headers).get("x-csrf-token") === "Fetch") {
    return new Response("{}", { status: 200, headers: { "x-csrf-token": "c", "content-type": "application/json" } });
  }
  if (method === "POST") {
    return new Response(JSON.stringify({ d: { SupplierInvoice: "1" } }), { status: 201, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "1" }] } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

interface Counted {
  status: number;
  /** Statements sent before the response. */
  response: string[];
  /** Statements `after()` sent once it was. */
  after: string[];
  total: number;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 10));
}

async function count(call: () => Promise<Response>): Promise<Counted> {
  await settle();
  q.deferred = [];
  q.log = [];
  q.on = true;
  const res = await call();
  await settle();
  const response = q.log;
  q.log = [];
  for (const fn of q.deferred.splice(0)) await fn();
  await settle();
  const after = q.log;
  q.on = false;
  return { status: res.status, response, after, total: response.length + after.length };
}

const read = (token: string, id: string) =>
  readRoute(new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data`, { headers: { authorization: `Bearer ${token}` } }), {
    params: Promise.resolve({ id }),
  });

const write = (token: string, id: string, key: string) =>
  writeRoute(
    new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data/write`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-coreedge-write-key": writeKey,
        "idempotency-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ record: { SupplierInvoice: "1" } }),
    }),
    { params: Promise.resolve({ id }) },
  );

/** The key's stamp as it is after a call in the last minute. */
const stampNow = () => prisma.solutionClient.update({ where: { id: ids.client, organizationId: ORG }, data: { lastUsedAt: new Date() } });

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

    // A warm instance: one call made, its milestone recorded.
    forgetRecordedJourneyMilestones();
    await count(() => read(tokens.live, ids.read));
    await count(() => write(tokens.live, ids.write, `${RUN}-warm-up`));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.northboundIdempotencyKey.deleteMany({ where: { organizationId: ORG } });
    await prisma.developerJourneyEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
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

  it("holds no transaction open while SAP is called", () => {
    // Every served call above reached SAP; at each, nothing was open.
    expect(sapSaw.length).toBeGreaterThan(5);
    expect(sapSaw.filter((s) => s.openInLog !== 0 || s.idleInTransaction !== 0)).toEqual([]);
  });
});
