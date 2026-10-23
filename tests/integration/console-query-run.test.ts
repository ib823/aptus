// @vitest-environment node
/**
 * The Test Console's query run (P1.4, 3.14): the query the deployed app
 * would send, run through the real console route, on PostgreSQL with the
 * tenant guard throwing.
 *
 * WHAT IS REAL: the route, the credential row, the grant gate with the
 * compiled policy, the binding, the checker, the compiler, the executor, the
 * page assembly and the dry-run audit row. WHAT IS STOOD IN: SAP, by the
 * independent OData evaluator on a canary host, and the session.
 *
 *   - a list query answers the first page, projected and filtered as asked,
 *     with no cursor issued, the query's own status and no `status` (so no
 *     capture is offered), and the line sent without the host;
 *   - a key lookup, and a key SAP does not have;
 *   - a refusal carries the same `error.query` the data route gives, and is
 *     audited once, dry-run;
 *   - a cursor, a page over the console's 50, and a string with no query
 *     parameter are refused;
 *   - the canary host appears nowhere in what the console is sent.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { POST as brokerRun } from "@/app/api/studio/test/broker-run/route";
import { prisma } from "@/lib/db/prisma";

import { source } from "../helpers/odata-query";
import { odataStub, type StubRow } from "../helpers/odata-sap-stub";
import {
  CANARY_ORIGIN,
  ENTITY_SET,
  enableQueries,
  hostIn,
  ORDER_LINE_TYPES,
  removeQueryWorld,
  seedQueryApp,
  seedQueryWorld,
  SERVICE_PATH,
  type QueryApp,
  type QueryWorld,
} from "../helpers/query-world";

const RUN = `p14c-${randomUUID().slice(0, 8)}`;

const ROWS: StubRow[] = Array.from({ length: 80 }, (_, i) => ({
  Order: `O${String(Math.floor(i / 2) + 1).padStart(4, "0")}`,
  Line: (i % 2) + 1,
  Customer: `C${(i % 3) + 1}`,
  CompanyCode: i % 2 === 0 ? "1010" : "2020",
  Status: "AB"[i % 2]!,
  NetAmount: (5 + i).toFixed(2),
  CreatedOn: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
  Note: `note ${i}`,
}));

const POLICY = source({
  filter: [
    { field: "Order", ops: ["eq", "in"] },
    { field: "Line", ops: ["eq"] },
    { field: "Customer", ops: ["eq", "in"] },
  ],
  sort: ["Order", "Line"],
  count: true,
});

const stub = odataStub({ odata: "V2", origin: CANARY_ORIGIN, servicePath: SERVICE_PATH.V2, entitySet: ENTITY_SET, keys: ["Order", "Line"], types: ORDER_LINE_TYPES, rows: () => ROWS });

let world: QueryWorld;
let app: QueryApp;

type RunAnswer = {
  data?: {
    outcome: "ran" | "refused";
    status?: string;
    queryStatus?: string;
    httpStatus?: number;
    records?: Record<string, unknown>[];
    count?: number;
    totalCount?: number | null;
    query?: { kind: string; sent: string; page: { index: number; nextCursor: string | null; complete: boolean } | null; rule: string | null };
    refusal?: { kind: string; message: string; query?: { rule: string; field?: string; parameter?: string } };
    correlationId?: string;
  };
  error?: { code: string; message: string };
};

async function run(query: string | undefined): Promise<{ status: number; text: string; body: RunAnswer }> {
  const res = await brokerRun(
    new NextRequest("http://localhost/api/studio/test/broker-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interfaceId: app.iface.V2, clientId: app.clientId, ...(query === undefined ? {} : { query }) }),
    }),
  );
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as RunAnswer };
}

async function auditOf(correlationId: string) {
  return prisma.northboundAuditEvent.findMany({ where: { organizationId: world.organizationId, correlationId } });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the Test Console's query run (P1.4)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return href.includes(SERVICE_PATH.V2) ? stub.fetch(input, init) : real(input, init);
    });
    world = await seedQueryWorld(RUN);
    app = await seedQueryApp(world, "Console");
    expect(await enableQueries(world, app.iface.V2, "V2", POLICY)).toBe("READY");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (world) await removeQueryWorld(world);
  });

  beforeEach(() => {
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
    session.user = { id: world.userId, email: "b@example.test", role: "consultant", organizationId: world.organizationId, authMethod: "session" };
  });

  it("runs the first page of a list query, as the app would get it, with no cursor and no capture offered", async () => {
    const r = await run("select=Order,Line,Customer&filter.Customer.eq=C2&orderby=-Order&count=true");
    expect(r.status).toBe(200);
    const data = r.body.data!;
    expect(data.outcome).toBe("ran");
    expect(data.queryStatus).toBe("OK");
    expect(data).not.toHaveProperty("status");
    const want = ROWS.filter((row) => row.Customer === "C2");
    // No pageSize: the policy's default page of 100, within the console's 50.
    expect(data.count).toBe(Math.min(50, want.length));
    expect(data.totalCount).toBe(want.length);
    for (const rec of data.records!) expect(Object.keys(rec).sort()).toEqual(["Customer", "Line", "Order"]);
    expect(data.query!.kind).toBe("LIST");
    expect(data.query!.sent.startsWith(`${SERVICE_PATH.V2}/${ENTITY_SET}?`)).toBe(true);
    expect(data.query!.sent).toContain("$filter=Customer%20eq%20'C2'");
    expect(data.query!.page).toMatchObject({ index: 0, nextCursor: null });
    // The canary host, in any form, is nowhere in the answer.
    expect(hostIn(r.text)).toEqual([]);

    const rows = await auditOf(data.correlationId!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dryRun: true, status: 200, queryKind: "LIST", pageIndex: 0, rowCount: data.count, queryRule: null });
    expect(rows[0]!.queryShape).toBe("L|s=Customer,Line,Order|f=Customer:eq:S|o=-Order|c=1|n=50");
  });

  it("looks a record up by key, and says when SAP has none", async () => {
    const found = await run("key.Order=O0003&key.Line=2");
    expect(found.body.data).toMatchObject({ outcome: "ran", queryStatus: "OK", httpStatus: 200, count: 1, query: { kind: "KEY", page: null } });
    expect(found.body.data!.query!.sent).toBe(`${SERVICE_PATH.V2}/${ENTITY_SET}(Order='O0003',Line=2)?$format=json`);
    const missing = await run("key.Order=O9999&key.Line=1");
    expect(missing.body.data).toMatchObject({ outcome: "ran", queryStatus: "NO_RECORD", httpStatus: 404, count: 0 });
  });

  it("refuses what the policy does not allow with the data route's error.query, audited once, dry-run", async () => {
    const r = await run("filter.NetAmount.gt=1");
    expect(r.body.data).toMatchObject({
      outcome: "refused",
      refusal: { kind: "POLICY_FIELD_NOT_GRANTED", query: { rule: "FIELD_NOT_FILTERABLE", field: "NetAmount", parameter: "filter.NetAmount.gt" } },
    });
    expect(r.body.data!.refusal!.message).toContain("the deployed application would receive");
    const rows = await prisma.northboundAuditEvent.findMany({
      where: { organizationId: world.organizationId, queryRule: "FIELD_NOT_FILTERABLE", dryRun: true },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ status: 400, failureReason: null });
  });

  it("refuses a cursor and a page larger than the console shows; a string with no query parameter is not a query run", async () => {
    const cursor = await run("pageSize=10&cursor=cec1.t0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(cursor.body.data).toMatchObject({ outcome: "refused", refusal: { kind: "QUERY_INVALID", query: { rule: "PARAMETER_CONFLICT", parameter: "cursor" } } });
    const big = await run("pageSize=51");
    expect(big.body.data).toMatchObject({ outcome: "refused", refusal: { kind: "QUERY_INVALID", query: { rule: "PAGE_SIZE_NOT_ALLOWED" } } });
    const none = await run("limit=5");
    expect(none.status).toBe(400);
    expect(none.body.error!.message).toContain("Leave it empty for a ?limit run");
  });

  it("refuses with the switch off, as the app would be refused", async () => {
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "off");
    const r = await run("select=Order");
    expect(r.body.data).toMatchObject({ outcome: "refused", refusal: { kind: "QUERY_NOT_AVAILABLE", query: { rule: "NOT_ENABLED" } } });
  });

  it("leaves the ?limit run as it was: a status, no queryStatus", async () => {
    const r = await run(undefined);
    expect(r.body.data).toMatchObject({ outcome: "ran", status: "OK" });
    expect(r.body.data).not.toHaveProperty("queryStatus");
  });
});
