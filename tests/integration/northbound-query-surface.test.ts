// @vitest-environment node
/**
 * The governed query surface end to end (P1.4a), through the real /data
 * route and its /v1 alias, on PostgreSQL with the tenant guard throwing.
 *
 * WHAT IS REAL: the route, the pipeline, the credential lookup, the access
 * load with the compiled policy, the grant gate, the binding and the sealed
 * connection, the checker, the compiler, buildSapUrl, the executor, the
 * cursor and the token ring (the development ring, t0), the audit insert,
 * and the policy itself, compiled by a verify of the repository-written
 * paging-orders service. WHAT IS STOOD IN: SAP, by an independent OData
 * evaluator (tests/helpers/odata-sap-stub.ts) on a canary host, and the
 * limiter's answer, so the x-ratelimit headers can be read exactly.
 *
 *   - A1: a filter on a field the policy does not let a caller filter is
 *     400 POLICY_FIELD_NOT_GRANTED, with error.query, one audit row whose
 *     queryRule is FIELD_NOT_FILTERABLE, and nothing sent to SAP.
 *   - Each mode on V2 and V4: a list page with select, filters, orderby and
 *     count; the next page by its cursor; a key lookup by path and through
 *     the filter; a key SAP does not have; SAP refusing a query.
 *   - The eleven audit columns, and a host that appears nowhere.
 *   - The switch off refuses (NOT_ENABLED); a legacy read is unchanged with
 *     it on, and refused 413 in CoreEdge's envelope past the legacy cap.
 *   - Cursors: another key of the same app, another organisation, other
 *     parameters, and both base paths.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Page from "@/lib/northbound/query/page";
import type * as RateLimit from "@/lib/security/rate-limit";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimit>()),
  checkRateLimit: async () => ({ allowed: true, remaining: 42, resetMs: 30_000 }),
}));
// The real page assembly, wrapped so one case can break an invariant in it.
vi.mock("@/lib/northbound/query/page", async (importOriginal) => {
  const real = await importOriginal<typeof Page>();
  return { ...real, assemblePage: vi.fn(real.assemblePage) };
});

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { GET as readRouteV1 } from "@/app/api/northbound/v1/interfaces/[id]/data/route";
import { prisma } from "@/lib/db/prisma";
import { openCursor } from "@/lib/northbound/query/cursor";
import { assemblePage } from "@/lib/northbound/query/page";
import { defaultVersion } from "@/lib/northbound/version-policy";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import { readTokenRing } from "@/lib/security/token-ring";

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

const RUN = `p14q-${randomUUID().slice(0, 8)}`;
const RUN_B = `p14qb-${randomUUID().slice(0, 8)}`;

/** Thirty order lines (ten orders of three), one whose order has a slash, one with a quote. */
const ROWS: StubRow[] = [
  ...Array.from({ length: 30 }, (_, i) => ({
    Order: `O${String(Math.floor(i / 3) + 1).padStart(4, "0")}`,
    Line: (i % 3) + 1,
    Customer: `C${(i % 4) + 1}`,
    CompanyCode: i % 2 === 0 ? "1010" : "2020",
    Status: "ABC"[i % 3]!,
    NetAmount: (10 + i * 1.25).toFixed(2),
    CreatedOn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    Note: `note ${i}`,
  })),
  { Order: "A/B", Line: 1, Customer: "C9", CompanyCode: "1010", Status: "A", NetAmount: "1.00", CreatedOn: "2026-02-01", Note: "slash" },
  { Order: "O'Neil", Line: 1, Customer: "C9", CompanyCode: "1010", Status: "A", NetAmount: "2.00", CreatedOn: "2026-02-02", Note: "quote" },
];

const POLICY = source({
  select: "*",
  filter: [
    { field: "Order", ops: ["eq", "in"] },
    { field: "Line", ops: ["eq"] },
    { field: "Customer", ops: ["eq", "in"] },
    { field: "CompanyCode", ops: ["eq", "in"] },
    { field: "Status", ops: ["eq", "in"] },
    { field: "CreatedOn", ops: ["gt", "ge", "lt", "le"] },
  ],
  sort: ["Order", "Line", "CreatedOn", "Customer"],
  keyLookup: true,
  count: true,
});

const stubs = {
  V2: odataStub({ odata: "V2", origin: CANARY_ORIGIN, servicePath: SERVICE_PATH.V2, entitySet: ENTITY_SET, keys: ["Order", "Line"], types: ORDER_LINE_TYPES, rows: () => ROWS, failWhen: (u) => (u.searchParams.get("$filter")?.includes("'REJECT'") ? 400 : null) }),
  V4: odataStub({ odata: "V4", origin: CANARY_ORIGIN, servicePath: SERVICE_PATH.V4, entitySet: ENTITY_SET, keys: ["Order", "Line"], types: ORDER_LINE_TYPES, rows: () => ROWS, failWhen: (u) => (u.searchParams.get("$filter")?.includes("'REJECT'") ? 400 : null) }),
};
const sapCalls = () => stubs.V2.calls.length + stubs.V4.calls.length;

let world: QueryWorld;
let app: QueryApp;
let worldB: QueryWorld;
let appB: QueryApp;

type Body = {
  data?: {
    records: Record<string, unknown>[];
    count: number;
    interface: { id: string; name: string; version: number };
    empty: boolean;
    note: string;
    page?: { index: number; size: number; rowsServed: number; nextCursor: string | null; complete: boolean; stopped: string | null };
    totalCount?: number | null;
  };
  error?: { code: string; message: string; correlationId: string; query?: { rule: string; parameter?: string; field?: string; allowed?: string[] } };
};

async function get(id: string, qs: string, opts: { token?: string; base?: "/api/northbound" | "/api/northbound/v1"; headers?: Record<string, string> } = {}) {
  const base = opts.base ?? "/api/northbound";
  const handler = base === "/api/northbound" ? readRoute : readRouteV1;
  const res = await handler(
    new NextRequest(`http://localhost${base}/interfaces/${id}/data${qs ? `?${qs}` : ""}`, { headers: { authorization: `Bearer ${opts.token ?? app.token}`, ...opts.headers } }),
    { params: Promise.resolve({ id }) },
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, body: JSON.parse(text) as Body };
}

async function lastAudit(): Promise<Record<string, unknown>> {
  const row = await prisma.northboundAuditEvent.findFirst({ where: { organizationId: world.organizationId }, orderBy: { at: "desc" } });
  return row as unknown as Record<string, unknown>;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the governed query surface (P1.4a)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (href.includes(SERVICE_PATH.V4)) return stubs.V4.fetch(input, init);
      if (href.includes(SERVICE_PATH.V2)) return stubs.V2.fetch(input, init);
      return real(input, init);
    });
    world = await seedQueryWorld(RUN);
    app = await seedQueryApp(world, "Portal");
    for (const v of ["V2", "V4"] as const) expect(await enableQueries(world, app.iface[v], v, POLICY)).toBe("READY");
    worldB = await seedQueryWorld(RUN_B);
    appB = await seedQueryApp(worldB, "Other");
    for (const v of ["V2", "V4"] as const) expect(await enableQueries(worldB, appB.iface[v], v, POLICY)).toBe("READY");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (world) await removeQueryWorld(world);
    if (worldB) await removeQueryWorld(worldB);
  });

  beforeEach(() => {
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
  });

  /* ── A1 ─────────────────────────────────────────────────────────────── */

  it.each(["V2", "V4"] as const)("A1 (%s): filtering on a field the policy does not allow is 400 POLICY_FIELD_NOT_GRANTED, audited, and nothing reaches SAP", async (v) => {
    const before = sapCalls();
    const r = await get(app.iface[v], "filter.NetAmount.gt=1");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({
      code: "POLICY_FIELD_NOT_GRANTED",
      query: { rule: "FIELD_NOT_FILTERABLE", parameter: "filter.NetAmount.gt", field: "NetAmount", allowed: ["Order", "Line", "Customer", "CompanyCode", "Status", "CreatedOn"] },
    });
    expect(r.body.error!.message).toContain("NetAmount");
    expect(sapCalls()).toBe(before);
    const rows = await prisma.northboundAuditEvent.findMany({ where: { organizationId: world.organizationId, correlationId: r.body.error!.correlationId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 400, queryRule: "FIELD_NOT_FILTERABLE", failureReason: null, durationMs: null, interfaceId: app.iface[v] });
  });

  /* ── each mode ──────────────────────────────────────────────────────── */

  it.each(["V2", "V4"] as const)("%s: a list page is filtered, selected, ordered and counted as asked, and the next page follows its cursor", async (v) => {
    const qs = "select=Order,Line,NetAmount&filter.CompanyCode.eq=1010&filter.Status.in=A&filter.Status.in=B&orderby=-Order&pageSize=4&count=true";
    const first = await get(app.iface[v], qs);
    expect(first.status).toBe(200);
    const want = ROWS.filter((r) => r.CompanyCode === "1010" && (r.Status === "A" || r.Status === "B")).sort((a, b) =>
      a.Order === b.Order ? Number(a.Line) - Number(b.Line) : String(a.Order) < String(b.Order) ? 1 : -1,
    );
    const keys = (b: Body) => b.data!.records.map((r) => `${String(r.Order)}/${String(r.Line)}`);
    expect(keys(first.body)).toEqual(want.slice(0, 4).map((r) => `${r.Order}/${r.Line}`));
    // Projected to the select, nothing else.
    for (const r of first.body.data!.records) expect(Object.keys(r).sort()).toEqual(["Line", "NetAmount", "Order"]);
    expect(first.body.data).toMatchObject({ count: 4, empty: false, totalCount: want.length, page: { index: 0, size: 4, rowsServed: 4, complete: false, stopped: null } });
    // The legacy envelope's keys first, in their order, then page and totalCount.
    expect(Object.keys(first.body.data!)).toEqual(["records", "count", "interface", "empty", "note", "page", "totalCount"]);
    expect(first.headers.get("x-ratelimit-limit")).toBe("60");
    expect(first.headers.get("x-ratelimit-remaining")).toBe("42");
    expect(first.headers.get("x-ratelimit-reset")).toBe("30");
    expect(first.headers.get("cache-control")).toBe("no-store");

    const second = await get(app.iface[v], `${qs}&cursor=${first.body.data!.page!.nextCursor}`);
    expect(second.status).toBe(200);
    expect(keys(second.body)).toEqual(want.slice(4, 8).map((r) => `${r.Order}/${r.Line}`));
    expect(second.body.data!.page).toMatchObject({ index: 1, rowsServed: 8 });
    expect(second.body.data).not.toHaveProperty("totalCount");

    // The audit rows of the chain.
    const rows = await prisma.northboundAuditEvent.findMany({
      where: { organizationId: world.organizationId, correlationId: { in: [first.headers.get("x-correlation-id")!, second.headers.get("x-correlation-id")!] } },
      orderBy: { at: "asc" },
    });
    expect(rows.map((r) => [r.queryKind, r.pageIndex, r.chainRows, r.rowCount])).toEqual([
      ["LIST", 0, 4, 4],
      ["PAGE", 1, 8, 4],
    ]);
    expect(rows[0]!.cursorChainId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(rows[1]!.cursorChainId).toBe(rows[0]!.cursorChainId);
    for (const row of rows) {
      expect(row.queryShape).toBe("L|s=Line,NetAmount,Order|f=CompanyCode:eq:S,Status:in2:S|o=-Order|c=1|n=4");
      expect(row.queryHash).toMatch(/^qh1\.t0\.[A-Za-z0-9_-]{22}$/);
      expect(row.requestedFields).toEqual(["Order", "Line", "NetAmount"]);
      expect(row.queryPolicyRev).toMatch(/^qp1:/);
      expect(row.responseBytes).toBe(Buffer.byteLength(row === rows[0] ? first.text : second.text));
      expect(row.queryRule).toBeNull();
      expect(row.failureReason).toBeNull();
    }
    // The same query restarted hashes the same; the literal is in no column.
    expect(rows[1]!.queryHash).toBe(rows[0]!.queryHash);
    expect(JSON.stringify(rows)).not.toContain("1010");
  });

  it("x-ratelimit-remaining is the smaller of the key's calls left and the edge's, which middleware hands over", async () => {
    const fewer = await get(app.iface.V2, "filter.Customer.eq=C1&pageSize=2", { headers: { "x-coreedge-edge-ratelimit-remaining": "7" } });
    expect(fewer.status).toBe(200);
    expect(fewer.headers.get("x-ratelimit-limit")).toBe("60");
    expect(fewer.headers.get("x-ratelimit-remaining")).toBe("7");
    const more = await get(app.iface.V2, "filter.Customer.eq=C1&pageSize=2", { headers: { "x-coreedge-edge-ratelimit-remaining": "590" } });
    expect(more.headers.get("x-ratelimit-remaining")).toBe("42");
  });

  it.each(["V2", "V4"] as const)("%s: a key lookup by path answers one record and no page", async (v) => {
    const r = await get(app.iface[v], "key.Order=O0002&key.Line=3&select=Customer");
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ records: [{ Customer: "C2" }], count: 1, empty: false });
    expect(r.body.data).not.toHaveProperty("page");
    const sent = (v === "V2" ? stubs.V2 : stubs.V4).calls.at(-1)!.href;
    expect(sent).toContain(`/${ENTITY_SET}(Order='O0002',Line=3)`);
    expect(await lastAudit()).toMatchObject({ queryKind: "KEY", queryShape: "K|s=Customer|k=Order:S,Line:I32", requestedFields: ["Customer"], queryFlags: null });
  });

  it.each(["V2", "V4"] as const)("%s: a key with a slash is read through the filter, never put in the path", async (v) => {
    const r = await get(app.iface[v], "key.Order=A%2FB&key.Line=1");
    expect(r.status).toBe(200);
    expect(r.body.data!.records).toEqual([expect.objectContaining({ Order: "A/B", Line: 1 })]);
    const sent = new URL((v === "V2" ? stubs.V2 : stubs.V4).calls.at(-1)!.href);
    expect(sent.pathname.endsWith(`/${ENTITY_SET}`)).toBe(true);
    expect(sent.searchParams.get("$top")).toBe("2");
    expect(await lastAudit()).toMatchObject({ queryKind: "KEY", queryFlags: "KEY_VIA_FILTER" });
  });

  it.each(["V2", "V4"] as const)("%s: a quote in a value is doubled and arrives intact", async (v) => {
    const r = await get(app.iface[v], "filter.Order.eq=O%27Neil");
    expect(r.status).toBe(200);
    expect(r.body.data!.records).toEqual([expect.objectContaining({ Order: "O'Neil" })]);
  });

  it.each(["V2", "V4"] as const)("%s: a key SAP does not have is 404 RECORD_NOT_FOUND", async (v) => {
    const r = await get(app.iface[v], "key.Order=O9999&key.Line=1");
    expect(r.status).toBe(404);
    expect(r.body.error).toMatchObject({ code: "RECORD_NOT_FOUND" });
    expect(await lastAudit()).toMatchObject({ status: 404, queryKind: "KEY", failureReason: "HTTP_404" });
  });

  it.each(["V2", "V4"] as const)("%s: SAP refusing a query is 422 VALIDATION_ERROR SAP_REJECTED, and SAP's text is not forwarded", async (v) => {
    const r = await get(app.iface[v], "filter.Customer.eq=REJECT");
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: "VALIDATION_ERROR", query: { rule: "SAP_REJECTED" } });
    expect(r.body.error!.message).not.toContain("Failure at");
    expect(hostIn(r.text)).toEqual([]);
    expect(await lastAudit()).toMatchObject({ status: 422, queryRule: "SAP_REJECTED", failureReason: "HTTP_400" });
  });

  it("an invariant broken while assembling SAP's rows is 500 INTERNAL, audited with what was sent, and none of SAP's rows is served", async () => {
    vi.mocked(assemblePage).mockImplementationOnce(() => {
      throw new QueryCompilerInvariantError("A page body is larger than its cap.");
    });
    const before = sapCalls();
    const r = await get(app.iface.V2, "filter.Customer.eq=C1&pageSize=2");
    expect(r.status).toBe(500);
    expect(r.body.error).toMatchObject({ code: "INTERNAL" });
    expect(r.body.error).not.toHaveProperty("query");
    expect(r.body).not.toHaveProperty("data");
    expect(r.text).not.toContain("O0001");
    expect(hostIn(r.text)).toEqual([]);
    expect(r.headers.get("x-ratelimit-remaining")).toBe("42");
    // SAP was asked once; the row says so, with nothing served.
    expect(sapCalls()).toBe(before + 1);
    expect(await lastAudit()).toMatchObject({
      status: 500,
      correlationId: r.body.error!.correlationId,
      rowCount: 0,
      queryKind: "LIST",
      queryRule: null,
      failureReason: null,
      cursorChainId: null,
      responseBytes: null,
    });
  });

  /* ── the switch, and the legacy read ─────────────────────────────────── */

  it("a refusal after the checker (no connection to bind) is audited with the checked query's kind, shape, fields and policy rev", async () => {
    await prisma.sapConnection.updateMany({ where: { organizationId: world.organizationId }, data: { isActive: false } });
    try {
      const before = sapCalls();
      const r = await get(app.iface.V2, "filter.Customer.eq=C1&pageSize=2");
      expect(r.status).toBe(403);
      expect(r.body.error).toMatchObject({ code: "CONNECTION_NOT_CONFIGURED" });
      expect(sapCalls()).toBe(before);
      const row = await lastAudit();
      expect(row).toMatchObject({ status: 403, bindingRefusal: "NO_CONNECTION", queryKind: "LIST", requestedFields: expect.any(Array) });
      expect(row.queryShape).toMatch(/^L\|/);
      expect(row.queryPolicyRev).toMatch(/^qp1:/);
    } finally {
      await prisma.sapConnection.updateMany({ where: { organizationId: world.organizationId }, data: { isActive: true } });
    }
  });

  it("with the switch off, a reserved name is refused NOT_ENABLED, never ignored", async () => {
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "off");
    const before = sapCalls();
    const r = await get(app.iface.V2, "filter.Customer.eq=C1");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: "VALIDATION_ERROR", query: { rule: "NOT_ENABLED" } });
    expect(sapCalls()).toBe(before);
    expect(await lastAudit()).toMatchObject({ status: 400, queryRule: "NOT_ENABLED", queryKind: null });
  });

  it("a legacy read is what it always was, with the switch on, and leaves the query columns null", async () => {
    const r = await get(app.iface.V2, "limit=2");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data!)).toEqual(["records", "count", "interface", "empty", "note"]);
    expect(r.body.data!.count).toBe(2);
    expect(r.headers.get("x-ratelimit-limit")).toBeNull();
    expect(r.headers.get("content-type")).toBe("application/json");
    const sent = new URL(stubs.V2.calls.at(-1)!.href);
    expect([...sent.searchParams.keys()]).toEqual(["$top", "$format"]);
    const row = await lastAudit();
    for (const c of ["queryKind", "queryShape", "queryHash", "requestedFields", "queryPolicyRev", "cursorChainId", "pageIndex", "chainRows", "responseBytes", "queryRule", "queryFlags"]) {
      expect(row[c], c).toBeNull();
    }
    // The records left without SAP's envelope, as before.
    expect(hostIn(r.text)).toEqual([]);
  });

  /* ── cursors ────────────────────────────────────────────────────────── */

  it("a cursor opens only for the client, organisation, interface and parameters it was issued to", async () => {
    const qs = "pageSize=2";
    const first = await get(app.iface.V2, qs);
    const cursor = first.body.data!.page!.nextCursor!;
    expect(cursor).toMatch(/^cec1\.t0\./);
    // Another app's key in the same organisation (one key per app and environment).
    const other = await seedQueryApp(world, "Second");
    const byOther = await get(app.iface.V2, `${qs}&cursor=${cursor}`, { token: other.token });
    expect(byOther.status).toBe(400);
    expect(byOther.body.error).toMatchObject({ code: "VALIDATION_ERROR", query: { rule: "CURSOR_INVALID" } });
    // Another organisation's credential, on this interface's id: the same refusal, before its 404.
    const byB = await get(app.iface.V2, `${qs}&cursor=${cursor}`, { token: appB.token });
    expect(byB.status).toBe(400);
    expect(byB.body.error!.query!.rule).toBe("CURSOR_INVALID");
    // Another interface.
    const elsewhere = await get(app.iface.V4, `${qs}&cursor=${cursor}`);
    expect(elsewhere.body.error!.query!.rule).toBe("CURSOR_INVALID");
    // Other parameters.
    const changed = await get(app.iface.V2, `pageSize=3&cursor=${cursor}`);
    expect(changed.status).toBe(400);
    expect(changed.body.error!.query!.rule).toBe("CURSOR_PARAMS_MISMATCH");
    // And the policy column never crossed organisations: B's interface serves B's chain.
    const b = await get(appB.iface.V2, qs, { token: appB.token });
    expect(b.status).toBe(200);
  });

  it("both base paths answer alike, and a cursor from one continues on the other (one API version)", async () => {
    const qs = "filter.Customer.eq=C1&pageSize=3";
    const base = await get(app.iface.V4, qs);
    const v1 = await get(app.iface.V4, qs, { base: "/api/northbound/v1" });
    expect(v1.status).toBe(base.status);
    expect(v1.body.data!.records).toEqual(base.body.data!.records);
    const next = await get(app.iface.V4, `${qs}&cursor=${base.body.data!.page!.nextCursor}`, { base: "/api/northbound/v1" });
    expect(next.status).toBe(200);
    expect(next.body.data!.page!.index).toBe(1);
    // The cursor is bound to the API version it was issued under.
    const ring = readTokenRing();
    const binding = { organizationId: world.organizationId, clientId: app.clientId, interfaceId: app.iface.V4, apiVersion: defaultVersion(new Date())!.version };
    expect(openCursor(base.body.data!.page!.nextCursor, binding, new Date(), ring).ok).toBe(true);
    expect(openCursor(base.body.data!.page!.nextCursor, { ...binding, apiVersion: "2099-01" }, new Date(), ring).ok).toBe(false);
  });

  /* ── no host anywhere ───────────────────────────────────────────────── */

  it("the SAP host appears in no body, header, cursor, cursor plaintext or audit column", async () => {
    const ring = readTokenRing();
    const seen: string[] = [];
    for (const v of ["V2", "V4"] as const) {
      const binding = { organizationId: world.organizationId, clientId: app.clientId, interfaceId: app.iface[v], apiVersion: defaultVersion(new Date())!.version };
      for (const qs of ["pageSize=5&count=true", "key.Order=O0001&key.Line=1", "key.Order=A%2FB&key.Line=1", "filter.Customer.eq=REJECT", "key.Order=O9999&key.Line=1"]) {
        const r = await get(app.iface[v], qs);
        seen.push(r.text);
        r.headers.forEach((value, name) => seen.push(`${name}: ${value}`));
        const cursor = r.body.data?.page?.nextCursor;
        if (cursor) {
          const opened = openCursor(cursor, binding, new Date(), ring);
          expect(opened.ok).toBe(true);
          if (opened.ok) seen.push(JSON.stringify(opened.payload));
        }
      }
    }
    const audits = await prisma.northboundAuditEvent.findMany({ where: { organizationId: world.organizationId } });
    seen.push(JSON.stringify(audits));
    // SAP answered with its host in every envelope it could: the stub is not vacuous.
    expect(stubs.V2.calls.length + stubs.V4.calls.length).toBeGreaterThan(10);
    expect(hostIn(seen.join("\n"))).toEqual([]);
  });

  /* ── the legacy byte guard ──────────────────────────────────────────── */

  it("a legacy read past 4.5 MiB is refused 413 in CoreEdge's envelope, and audited 413 with its size", async () => {
    const wide = ROWS.map((r) => ({ ...r, Note: "N".repeat(400_000) }));
    const stub = odataStub({ odata: "V2", origin: CANARY_ORIGIN, servicePath: SERVICE_PATH.V2, entitySet: ENTITY_SET, keys: ["Order", "Line"], types: ORDER_LINE_TYPES, rows: () => wide });
    vi.stubGlobal("fetch", stub.fetch);
    try {
      const r = await get(app.iface.V2, "limit=20");
      expect(r.status).toBe(413);
      expect(r.body.error).toMatchObject({ code: "VALIDATION_ERROR", query: { rule: "RESPONSE_TOO_LARGE" } });
      const row = await lastAudit();
      expect(row).toMatchObject({ status: 413, queryRule: "RESPONSE_TOO_LARGE", rowCount: 0, queryKind: null });
      expect(row.responseBytes as number).toBeGreaterThan(4_718_592);
    } finally {
      vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) =>
        (String(input instanceof Request ? input.url : input).includes(SERVICE_PATH.V4) ? stubs.V4 : stubs.V2).fetch(input, init),
      );
    }
  });

  it("every query CoreEdge sent asked for redirects refused, and V4 for OData-MaxVersion 4.0; a legacy read neither", () => {
    const isQuery = (href: string) => {
      const u = new URL(href);
      return u.searchParams.has("$orderby") || u.searchParams.has("$filter") || u.pathname.endsWith(")");
    };
    const all = [...stubs.V2.calls, ...stubs.V4.calls];
    const queries = all.filter((c) => isQuery(c.href));
    expect(queries.length).toBeGreaterThan(10);
    for (const c of queries) expect(c.redirect, c.href).toBe("manual");
    for (const c of all.filter((q) => !isQuery(q.href))) expect(c.redirect, c.href).toBeUndefined();
    for (const c of stubs.V4.calls.filter((q) => isQuery(q.href))) expect(c.headers["odata-maxversion"]).toBe("4.0");
    for (const c of stubs.V2.calls) expect(c.headers["odata-maxversion"]).toBeUndefined();
  });
});
