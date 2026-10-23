// @vitest-environment node
/**
 * A3: paging 10,000 rows (P1.4a, roadmap acceptance; spec 3.21 item 8).
 *
 * "Paging 10,000 rows completes at the interface's page size without
 * exceeding the key's 60-a-minute limit, in under N minutes, and no response
 * body, header or cursor contains the SAP host." N is 5 minutes at page size
 * 100 against a service that takes 1.5 s a page (D1), on a virtual clock.
 *
 * WHAT IS REAL: the /data route, the pipeline, the credential lookup, the
 * access load with the compiled policy, the cursor, the token ring, the
 * audit insert, PostgreSQL, and the per-key limiter (in memory, 60 a minute,
 * read from Date.now()). WHAT IS STOOD IN: SAP, by an OData evaluator over
 * 10,000 deterministic order lines that imports nothing from src/
 * (tests/helpers/odata-sap-stub.ts), on a canary host it writes into every
 * envelope link and next link it can; and the clock: `Date` is faked, each
 * SAP call moves it on by 1.5 s, and the client starts each request at least
 * 1.05 virtual seconds after the last.
 *
 * THE MATRIX: V2 and V4 at page size 100 and 500; SAP's own page cap of
 * 1,000 rows with next links, at page size 1,000; and a policy byte cap of
 * 262,144 with wide rows, which cuts pages by bytes and then asks SAP for
 * about as many rows as fit (adaptive $top).
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const q = vi.hoisted(() => ({ on: false, log: [] as string[] }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
    log: [{ emit: "event", level: "query" }],
  });
  base.$on("query", (e) => {
    if (q.on) q.log.push(e.query.replace(/\s+/g, " ").slice(0, 120));
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { prisma } from "@/lib/db/prisma";
import { NORTHBOUND_QUERY_STATEMENTS } from "@/lib/governed/db-budget";
import { openCursor } from "@/lib/northbound/query/cursor";
import { defaultVersion } from "@/lib/northbound/version-policy";
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
  type QueryWorld,
} from "../helpers/query-world";

const RUN = `p14p-${randomUUID().slice(0, 8)}`;
const ROWS = 10_000;
const SAP_LATENCY_MS = 1500;
const CLIENT_GAP_MS = 1050;
const N_MS = 5 * 60_000;

/** 10,000 order lines, four to an order, in key order already. */
function orderLines(note: (i: number) => string): StubRow[] {
  return Array.from({ length: ROWS }, (_, i) => ({
    Order: `O${String(Math.floor(i / 4)).padStart(5, "0")}`,
    Line: (i % 4) + 1,
    Customer: `C${i % 7}`,
    CompanyCode: "1010",
    Status: "A",
    NetAmount: (i * 0.01).toFixed(2),
    CreatedOn: `2026-0${(i % 9) + 1}-1${i % 9}`,
    Note: note(i),
  }));
}
const NARROW = orderLines((i) => `n${i}`);
const WIDE = orderLines((i) => `${"W".repeat(1900)}${i}`);

let world: QueryWorld;
const logs: string[] = [];

interface Scenario {
  readonly name: string;
  readonly odata: "V2" | "V4";
  readonly pageSize: number;
  readonly rows: readonly StubRow[];
  readonly serverPageCap?: number;
  readonly byteCap?: number;
  /** The most virtual time the run may take. */
  readonly within: number;
  /** The exact number of calls, where the page size decides it. */
  readonly calls?: number;
}

interface Page {
  readonly status: number;
  readonly text: string;
  readonly headers: [string, string][];
  readonly statements: string[];
  readonly startedAt: number;
}

/** Page through the whole set as a deployed app would: the same parameters, plus each nextCursor, paced. */
async function pageAll(s: Scenario): Promise<{ pages: Page[]; elapsed: number; interfaceId: string; clientId: string }> {
  const app = await seedQueryApp(world, s.name);
  const interfaceId = app.iface[s.odata];
  const state = await enableQueries(
    world,
    interfaceId,
    s.odata,
    source({
      filter: [{ field: "CompanyCode", ops: ["eq"] }],
      sort: ["Order", "Line"],
      page: { defaultSize: 100, maxSize: 1000, rowCap: 10_000, byteCap: s.byteCap ?? 4_000_000 },
    }),
  );
  expect(state).toBe("READY");

  const stub = odataStub({
    odata: s.odata,
    origin: CANARY_ORIGIN,
    servicePath: SERVICE_PATH[s.odata],
    entitySet: ENTITY_SET,
    keys: ["Order", "Line"],
    types: ORDER_LINE_TYPES,
    rows: () => s.rows,
    latencyMs: SAP_LATENCY_MS,
    advance: (ms) => vi.setSystemTime(Date.now() + ms),
    ...(s.serverPageCap ? { serverPageCap: s.serverPageCap } : {}),
  });
  // What SAP answered, as it answered it: the no-host check must meet every link the spec names (3.21 item 8).
  const answered: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const res = await stub.fetch(input, init);
    answered.push(await res.clone().text());
    return res;
  });

  const qs = `filter.CompanyCode.eq=1010&pageSize=${s.pageSize}`;
  const pages: Page[] = [];
  const started = Date.now();
  let lastStart = -Infinity;
  let cursor: string | null = null;
  for (let i = 0; i < 1000; i++) {
    if (Date.now() - lastStart < CLIENT_GAP_MS) vi.setSystemTime(lastStart + CLIENT_GAP_MS);
    lastStart = Date.now();
    q.log = [];
    q.on = true;
    const res: Response = await readRoute(
      new NextRequest(`http://localhost/api/northbound/interfaces/${interfaceId}/data?${qs}${cursor ? `&cursor=${cursor}` : ""}`, {
        headers: { authorization: `Bearer ${app.token}` },
      }),
      { params: Promise.resolve({ id: interfaceId }) },
    );
    const text = await res.text();
    // Prisma emits a statement's query event after its promise settles: let the last one land.
    for (let t = 0; t < 3; t++) await new Promise((r) => setImmediate(r));
    q.on = false;
    pages.push({ status: res.status, text, headers: [...res.headers.entries()], statements: q.log, startedAt: lastStart });
    if (res.status !== 200) break;
    const page = (JSON.parse(text) as { data: { page: { nextCursor: string | null; complete: boolean } } }).data.page;
    if (page.complete || page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  return { pages, elapsed: Date.now() - started, interfaceId, clientId: app.clientId, answered };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("A3: 10,000 rows, paged under the key's 60 a minute, in under N, with no host anywhere", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "d".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
    for (const level of ["log", "info", "warn", "error"] as const) {
      const real = console[level].bind(console);
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
        real(...args);
      });
    }
    world = await seedQueryWorld(RUN);
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterAll(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (world) await removeQueryWorld(world);
  });

  const scenarios: Scenario[] = [
    { name: "V2 at 100", odata: "V2", pageSize: 100, rows: NARROW, within: N_MS, calls: 100 },
    { name: "V4 at 100", odata: "V4", pageSize: 100, rows: NARROW, within: N_MS, calls: 100 },
    { name: "V2 at 500", odata: "V2", pageSize: 500, rows: NARROW, within: 2 * 60_000, calls: 20 },
    { name: "V4 at 500", odata: "V4", pageSize: 500, rows: NARROW, within: 2 * 60_000, calls: 20 },
    { name: "V2 under SAP's 1,000-row page cap", odata: "V2", pageSize: 1000, rows: NARROW, serverPageCap: 1000, within: N_MS, calls: 10 },
    { name: "V4 under SAP's 1,000-row page cap", odata: "V4", pageSize: 1000, rows: NARROW, serverPageCap: 1000, within: N_MS, calls: 10 },
    { name: "V2 with wide rows under a 262,144-byte page cap", odata: "V2", pageSize: 500, rows: WIDE, byteCap: 262_144, within: N_MS },
    { name: "V4 with wide rows under a 262,144-byte page cap", odata: "V4", pageSize: 500, rows: WIDE, byteCap: 262_144, within: N_MS },
  ];

  it.each(scenarios)("$name", async (s) => {
    const { pages, elapsed, interfaceId, clientId, answered } = await pageAll(s);

    // 2 — zero 429s, and every page served.
    expect(pages.map((p) => p.status).filter((st) => st !== 200)).toEqual([]);

    // 1 — exactly 10,000 unique keys, in key order, no gap; page indexes and rows served consistent; the last page complete.
    const bodies = pages.map((p) => JSON.parse(p.text) as { data: { records: { Order: string; Line: number }[]; page: { index: number; rowsServed: number; complete: boolean; stopped: string | null } } });
    const keys = bodies.flatMap((b) => b.data.records.map((r) => `${r.Order}/${r.Line}`));
    expect(keys).toHaveLength(ROWS);
    expect(keys).toEqual(s.rows.map((r) => `${String(r.Order)}/${String(r.Line)}`));
    let served = 0;
    bodies.forEach((b, i) => {
      served += b.data.records.length;
      expect(b.data.page.index).toBe(i);
      expect(b.data.page.rowsServed).toBe(served);
      expect(b.data.page.stopped).toBeNull();
    });
    expect(bodies.at(-1)!.data.page.complete).toBe(true);

    // 3 — in virtual time under N (2 minutes at 500).
    expect(elapsed).toBeLessThan(s.within);
    // 4 — the look-ahead row: no empty last page.
    if (s.calls !== undefined) expect(pages).toHaveLength(s.calls);
    expect(bodies.every((b) => b.data.records.length > 0)).toBe(true);

    // 5 — every body within the cap.
    const cap = s.byteCap ?? 4_000_000;
    for (const p of pages) expect(Buffer.byteLength(p.text)).toBeLessThanOrEqual(cap);
    if (s.byteCap) {
      // Cut by bytes, then asked for about as many as fit.
      expect(pages.length).toBeGreaterThan(ROWS / s.pageSize);
    }

    // 6 — no host: bodies, headers, cursors as sent and as opened, audit rows, logs.
    const ring = readTokenRing();
    const binding = { organizationId: world.organizationId, clientId, interfaceId, apiVersion: defaultVersion(new Date())!.version };
    const text: string[] = [];
    for (const p of pages) {
      text.push(p.text, ...p.headers.map(([k, v]) => `${k}: ${v}`));
      const cursor = (JSON.parse(p.text) as { data: { page: { nextCursor: string | null } } }).data.page.nextCursor;
      if (cursor) {
        const opened = openCursor(cursor, binding, new Date(), ring);
        expect(opened.ok).toBe(true);
        if (opened.ok) text.push(JSON.stringify(opened.payload));
      }
    }
    const audits = await prisma.northboundAuditEvent.findMany({ where: { organizationId: world.organizationId, interfaceId }, orderBy: { at: "asc" } });
    text.push(JSON.stringify(audits), ...logs);
    expect(hostIn(text.join("\n"))).toEqual([]);
    // And it met every link SAP writes on the host: the check is not vacuous.
    const sap = answered.join("\n");
    const links = s.odata === "V2" ? ["__metadata", "__deferred", "__next"] : ["@odata.context", "@odata.id", "@id", "@navigationLink", "@odata.nextLink"];
    for (const link of links.filter((l) => (l === "__next" || l === "@odata.nextLink" ? s.serverPageCap !== undefined : true))) {
      expect(sap, link).toContain(link);
    }
    expect(hostIn(sap).length).toBeGreaterThan(0);

    // 7 — one chain in the audit trail: LIST then PAGE, pages 0..P-1, ending at 10,000 rows.
    const chain = audits.filter((a) => a.queryKind === "LIST" || a.queryKind === "PAGE");
    expect(chain).toHaveLength(pages.length);
    expect(new Set(chain.map((a) => a.cursorChainId)).size).toBe(1);
    expect(chain.map((a) => a.pageIndex)).toEqual(pages.map((_, i) => i));
    expect(chain.map((a) => a.queryKind)).toEqual(pages.map((_, i) => (i === 0 ? "LIST" : "PAGE")));
    expect(chain.at(-1)!.chainRows).toBe(ROWS);
    if (s.byteCap) expect(chain.some((a) => a.queryFlags?.includes("ADAPTIVE_TOP"))).toBe(true);

    // 8 — three statements a page; the key's stamp adds one, at most once a virtual minute.
    const stamped = pages.filter((p) => p.statements.some((x) => x.includes('"lastUsedAt"')));
    for (const p of pages) {
      expect(p.statements.length, p.statements.join("\n")).toBe(NORTHBOUND_QUERY_STATEMENTS.page + (stamped.includes(p) ? 1 : 0));
    }
    expect(stamped.length).toBeLessThanOrEqual(Math.ceil(elapsed / 60_000) + 1);
  });

  /*
   * CHARACTERISATION (accepted residual risk, spec 1.3): offset paging over
   * data that changes mid-chain. Recorded, so a change in either behaviour is
   * seen:
   *   - a row inserted ahead of the offset after the first page pushes the
   *     first page's last row into the second page, which the overlap check
   *     reads as SAP repeating it: the chain stops, 502 UPSTREAM_ERROR /
   *     UPSTREAM_IGNORED_PAGING, rather than serving a row twice;
   *   - a row deleted ahead of the offset is not seen: the second page starts
   *     one row later, and one row is skipped silently.
   */
  async function changingChain(name: string, change: (rows: StubRow[]) => StubRow[]) {
    const base = NARROW.slice(0, 300);
    const app = await seedQueryApp(world, name);
    await enableQueries(world, app.iface.V2, "V2", source({ filter: [{ field: "CompanyCode", ops: ["eq"] }], sort: ["Order", "Line"] }));
    let calls = 0;
    const stub = odataStub({
      odata: "V2",
      origin: CANARY_ORIGIN,
      servicePath: SERVICE_PATH.V2,
      entitySet: ENTITY_SET,
      keys: ["Order", "Line"],
      types: ORDER_LINE_TYPES,
      // From the second call on, the data has changed.
      rows: () => (++calls >= 2 ? change(base) : base),
    });
    vi.stubGlobal("fetch", stub.fetch);
    const keys: string[] = [];
    const statuses: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(Date.now() + CLIENT_GAP_MS);
      const res: Response = await readRoute(
        new NextRequest(`http://localhost/api/northbound/interfaces/${app.iface.V2}/data?filter.CompanyCode.eq=1010&pageSize=100${cursor ? `&cursor=${cursor}` : ""}`, {
          headers: { authorization: `Bearer ${app.token}` },
        }),
        { params: Promise.resolve({ id: app.iface.V2 }) },
      );
      statuses.push(res.status);
      const body = (await res.json()) as { data?: { records: { Order: string; Line: number }[]; page: { nextCursor: string | null } }; error?: { query?: { rule: string } } };
      if (!body.data) return { keys, statuses, rule: body.error?.query?.rule ?? null, base };
      keys.push(...body.data.records.map((r) => `${r.Order}/${r.Line}`));
      cursor = body.data.page.nextCursor;
      if (cursor === null) break;
    }
    return { keys, statuses, rule: null, base };
  }

  it("characterisation: a row inserted ahead of the offset stops the chain as SAP repeating a row (502)", async () => {
    const r = await changingChain("V2 with a row inserted mid-chain", (rows) => [{ ...rows[0]!, Order: "A0000" }, ...rows]);
    expect(r.statuses).toEqual([200, 502]);
    expect(r.rule).toBe("UPSTREAM_IGNORED_PAGING");
    expect(r.keys).toHaveLength(100);
  });

  it("characterisation: a row deleted ahead of the offset is skipped silently", async () => {
    const r = await changingChain("V2 with a row deleted mid-chain", (rows) => rows.slice(1));
    expect(r.statuses.every((st) => st === 200)).toBe(true);
    const all = r.base.map((x) => `${String(x.Order)}/${String(x.Line)}`);
    expect(all.filter((k) => !r.keys.includes(k))).toEqual([all[100]]);
    expect(r.keys).toHaveLength(all.length - 1);
  });
});
