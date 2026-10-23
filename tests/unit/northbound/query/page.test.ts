// @vitest-environment node
/**
 * One page of a query-surface read (P1.4, 3.9.5, 3.9.6 and 3.10).
 *
 * The algorithm: the look-ahead row, the row cap, a dataset that does not
 * page, a server-side page cap with a next link, SAP ignoring $top, SAP
 * ignoring $skip (502), adaptive $top. The byte cap at -1, 0 and +1 byte,
 * multibyte rows, one row too large, and the tail reserve with the longest
 * cursor and interface name. The legacy guard: the body byte-identical to
 * NextResponse.json, and 413 one byte past the cap.
 */

import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import type * as TokenRingModule from "@/lib/security/token-ring";

// The real derivation, counted: the overlap check derives its key once a page.
vi.mock("@/lib/security/token-ring", async (importOriginal) => {
  const real = await importOriginal<typeof TokenRingModule>();
  return { ...real, deriveTokenKey: vi.fn(real.deriveTokenKey) };
});

import { basisOf, prepared, source } from "../../../helpers/odata-query";

import type { QueryAstV1 } from "@/lib/odata/ast";
import type { PreparedPolicy } from "@/lib/odata/policy";
import type { AnswerRow } from "@/lib/odata/response";
import { openCursor, type CursorBinding, type OpenedCursor } from "@/lib/northbound/query/cursor";
import {
  assembleKey,
  assemblePage,
  buildPageBody,
  fitRows,
  LEGACY_RESPONSE_CAP,
  legacyBody,
  PAGE_TAIL_RESERVE,
  planPage,
  type PageContext,
  type PageResult,
} from "@/lib/northbound/query/page";
import { northboundOkJson } from "@/lib/northbound/respond";
import { deriveTokenKey, readTokenRing, TOKEN_PURPOSES } from "@/lib/security/token-ring";

const RING = readTokenRing({ COREEDGE_TOKEN_KEYS: `t1:${"11".repeat(32)}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1", NODE_ENV: "production" });
const BINDING: CursorBinding = { organizationId: "org_a", clientId: "cli_a", interfaceId: "if_a", apiVersion: "2026-10" };
const NOW = new Date("2026-10-27T10:00:00.000Z");
const IFACE = { id: "if_a", name: "Orders", version: 3 };
const CONNECTION = { id: "conn_1", revision: 4 };

const BASIS = basisOf([{ n: "Id" }, { n: "Name" }], ["Id"]);
const POLICY = prepared(BASIS, source({ page: { defaultSize: 10, maxSize: 50, rowCap: 25, byteCap: 4_000_000 } }));

const ast = (pageSize = 10, count = false): QueryAstV1 => ({ v: 1, kind: "LIST", select: null, filter: [], orderby: [], key: null, count, pageSize });

const rowsFrom = (from: number, n: number, width = 0): AnswerRow[] =>
  Array.from({ length: n }, (_, i) => {
    const id = String(from + i).padStart(5, "0");
    return { record: { Id: id, Name: `n${id}${"x".repeat(width)}` }, keyText: JSON.stringify([id]) };
  });

function ctx(over: Partial<PageContext> & Pick<PageContext, "answer">, policy: PreparedPolicy = POLICY, cursor: OpenedCursor | null = null, query = ast()): PageContext {
  return {
    policy,
    ast: query,
    plan: planPage(policy, query, cursor?.payload ?? null),
    cursor,
    binding: BINDING,
    ring: RING,
    now: NOW,
    interface: IFACE,
    connection: CONNECTION,
    authorisingGrantIds: ["grant_1"],
    ...over,
  };
}

function okPage(r: PageResult) {
  if (!r.ok) throw new Error(`refused: ${r.rule}`);
  return r;
}

function next(r: PageResult): OpenedCursor {
  const page = okPage(r);
  const c = openCursor(page.page.nextCursor, BINDING, NOW, RING);
  if (!c.ok) throw new Error("cursor did not open");
  return c;
}

describe("planning a page", () => {
  it("page 0 asks for the page plus one look-ahead row", () => {
    expect(planPage(POLICY, ast(10), null)).toEqual({ page0: true, pageIndex: 0, skip: 0, eff: 10, top: 10, ask: 11 });
  });

  it("the row cap shortens the last page of a chain", () => {
    const c = next(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false } })));
    const later = { ...c.payload, rs: 20, off: 20 };
    expect(planPage(POLICY, ast(10), later)).toMatchObject({ eff: 5, top: 5, ask: 6, skip: 20, pageIndex: 1 });
  });

  it("later pages adapt $top to the bytes per row so far", () => {
    const wide = prepared(BASIS, source({ page: { defaultSize: 50, maxSize: 50, rowCap: 1000, byteCap: 262_144 } }));
    const c = next(assemblePage(ctx({ answer: { rows: rowsFrom(0, 51), more: false, totalCount: null, projected: false } }, wide, null, ast(50))));
    const plan = planPage(wide, ast(50), { ...c.payload, rb: 20_000 });
    expect(plan.top).toBe(Math.floor((0.9 * (262_144 - PAGE_TAIL_RESERVE)) / 20_000));
    expect(plan.top).toBeLessThan(plan.eff);
  });

  it("sends no $top where SAP does not take one", () => {
    const noTop = prepared(basisOf([{ n: "Id" }], ["Id"], { set: { topSupported: false } }), source({ keyLookup: false }));
    expect(planPage(noTop, ast(10), null).ask).toBeNull();
  });
});

describe("the page algorithm", () => {
  it("the look-ahead row means a cursor, and the last page needs no empty page after it", () => {
    const first = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false } })));
    expect(first.served).toBe(10);
    expect(first.page).toMatchObject({ index: 0, size: 10, rowsServed: 10, complete: false, stopped: null });
    expect(first.page.nextCursor).toMatch(/^cec1\.t1\./);
    const c = next(first);
    expect(c.payload).toMatchObject({ pi: 1, off: 10, rs: 10, iv: 3, pr: POLICY.compiled.rev, cn: "conn_1", cr: 4, ch: first.chainId });
    const last = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(10, 10), more: false, totalCount: null, projected: false } }, POLICY, c)));
    expect(last.page).toMatchObject({ index: 1, rowsServed: 20, nextCursor: null, complete: true, stopped: null });
    expect(last.chainId).toBe(first.chainId);
  });

  it("a server page cap: fewer rows with a next link continues at offset + served", () => {
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 4), more: true, totalCount: null, projected: false } })));
    expect(r.page).toMatchObject({ rowsServed: 4, complete: false, stopped: null });
    expect(next(r).payload.off).toBe(4);
  });

  it("the row cap stops the chain with no cursor", () => {
    const c = next(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false } })));
    const c2 = next(assemblePage(ctx({ answer: { rows: rowsFrom(10, 11), more: false, totalCount: null, projected: false } }, POLICY, c)));
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(20, 6), more: false, totalCount: null, projected: false } }, POLICY, c2)));
    expect(r.page).toMatchObject({ rowsServed: 25, nextCursor: null, complete: false, stopped: "ROW_CAP" });
    expect(r.flags).toContain("ROW_CAP");
  });

  it("a dataset that does not page stops at one page", () => {
    const single = prepared(basisOf([{ n: "Id" }, { n: "Name" }], ["Id"], { set: { pageable: false } }), source({ page: { defaultSize: 10, maxSize: 50, rowCap: 50, byteCap: 4_000_000 } }));
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false } }, single)));
    expect(r.page).toMatchObject({ nextCursor: null, complete: false, stopped: "NOT_PAGEABLE" });
  });

  it("SAP ignoring $top: serve what fits of the first page, no cursor, say so", () => {
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 40), more: false, totalCount: null, projected: false } })));
    expect(r.served).toBe(10);
    expect(r.page).toMatchObject({ nextCursor: null, complete: false, stopped: "UPSTREAM_IGNORED_PAGING" });
    expect(r.flags).toContain("TOP_NOT_HONOURED");
  });

  it("SAP ignoring $skip: the last page's final row again is 502 UPSTREAM_IGNORED_PAGING", () => {
    const c = next(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false } })));
    const r = assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false } }, POLICY, c));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rule).toBe("UPSTREAM_IGNORED_PAGING");
      expect(r.flags).toContain("SKIP_NOT_HONOURED");
    }
  });

  /*
   * P-SKIP-IGNORED-ADAPTIVE. A page 0 that fills the byte cap gives page 1 a
   * smaller adaptive $top than page 0 served. A service that ignores $skip
   * answers from offset 0 again, and its window stops before page 0's last
   * row, so `lk` alone passed and page 1 served page 0's rows again with a
   * cursor. The chain's first row is in every such window.
   */
  it.each([
    [2380, "page 0 not cut, but over 90% of the byte cap"],
    [4000, "page 0 cut by bytes"],
  ])("SAP ignoring $skip after an adaptive $top (rows of %i bytes, %s) is 502 UPSTREAM_IGNORED_PAGING", (width) => {
    const tight = prepared(BASIS, source({ page: { defaultSize: 100, maxSize: 500, rowCap: 10_000, byteCap: 262_144 } }));
    const fromZero = (ask: number) => rowsFrom(0, ask, width);
    const plan0 = planPage(tight, ast(100), null);
    const first = okPage(assemblePage(ctx({ answer: { rows: fromZero(plan0.ask!), more: false, totalCount: null, projected: false } }, tight, null, ast(100))));
    const c = next(first);
    const plan1 = planPage(tight, ast(100), c.payload);
    expect(plan1.ask!).toBeLessThan(first.served);
    const r = assemblePage(ctx({ answer: { rows: fromZero(plan1.ask!), more: false, totalCount: null, projected: false } }, tight, c, ast(100)));
    expect(r).toMatchObject({ ok: false, rule: "UPSTREAM_IGNORED_PAGING" });
    expect(r.flags).toContain("SKIP_NOT_HONOURED");
    // A service that honours $skip is served.
    expect(assemblePage(ctx({ answer: { rows: rowsFrom(first.served, plan1.ask!, width), more: false, totalCount: null, projected: false } }, tight, c, ast(100))).ok).toBe(true);
  });

  it("the chain's first row keeps its own kid across a rotation, and is checked under it", () => {
    const k1 = `t1:${"11".repeat(32)}`;
    const k2 = `t2:${"22".repeat(32)}`;
    const before = readTokenRing({ COREEDGE_TOKEN_KEYS: `${k1},${k2}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1", NODE_ENV: "production" });
    const after = readTokenRing({ COREEDGE_TOKEN_KEYS: `${k1},${k2}`, COREEDGE_TOKEN_ACTIVE_KEY: "t2", NODE_ENV: "production" });
    const open = (r: PageResult, ring: typeof RING) => {
      const c = openCursor(okPage(r).page.nextCursor, BINDING, NOW, ring);
      if (!c.ok) throw new Error("cursor did not open");
      return c;
    };
    const c1 = open(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false }, ring: before })), before);
    expect(c1.payload.fk).toMatch(/^t1\./);
    // Page 1 after the rotation: sealed under t2, the first row still under t1.
    const c2 = open(assemblePage(ctx({ answer: { rows: rowsFrom(10, 11), more: false, totalCount: null, projected: false }, ring: after }, POLICY, c1)), after);
    expect(c2.kid).toBe("t2");
    expect(c2.payload.fk).toBe(c1.payload.fk);
    // Page 2 from offset 0 with a window short of page 1's last row: the first row gives it away.
    const r = assemblePage(ctx({ answer: { rows: rowsFrom(0, 5), more: false, totalCount: null, projected: false }, ring: after }, POLICY, c2));
    expect(r).toMatchObject({ ok: false, rule: "UPSTREAM_IGNORED_PAGING" });
  });

  it("the overlap check derives its key once, and reads only the rows that could be served", () => {
    const c = next(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false } })));
    const derive = vi.mocked(deriveTokenKey);
    derive.mockClear();
    // SAP honours $skip but ignores $top: 5,000 rows from offset 10.
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(10, 5000), more: false, totalCount: null, projected: false } }, POLICY, c)));
    expect(r.flags).toContain("TOP_NOT_HONOURED");
    expect(r.served).toBe(10);
    expect(derive.mock.calls.filter(([, , purpose]) => purpose === TOKEN_PURPOSES.cursorLastKey)).toHaveLength(1);
  });

  it("issues no cursor where none is wanted (the Test Console's single page)", () => {
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false }, issueCursor: false })));
    expect(r.page).toMatchObject({ nextCursor: null, complete: false, stopped: null, rowsServed: 10 });
  });

  it("refuses to start a chain no grant authorised", () => {
    expect(() => assemblePage(ctx({ answer: { rows: rowsFrom(0, 11), more: false, totalCount: null, projected: false }, authorisingGrantIds: [] }))).toThrow(/no authorising grant/);
  });

  it("an empty answer is a complete, empty page", () => {
    const r = okPage(assemblePage(ctx({ answer: { rows: [], more: false, totalCount: null, projected: false } })));
    expect(JSON.parse(r.body)).toEqual({
      data: {
        records: [],
        count: 0,
        interface: IFACE,
        empty: true,
        note: "No records. The service answered successfully and has nothing to return.",
        page: { index: 0, size: 10, rowsServed: 0, nextCursor: null, complete: true, stopped: null },
      },
    });
  });

  it("the body keeps the legacy envelope's keys first, then page and totalCount (page 0 with count only)", () => {
    const counted = prepared(BASIS, source({ count: true, page: { defaultSize: 10, maxSize: 50, rowCap: 25, byteCap: 4_000_000 } }));
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 2), more: false, totalCount: 1873, projected: true } }, counted, null, ast(10, true))));
    const body = JSON.parse(r.body) as { data: Record<string, unknown> };
    expect(Object.keys(body.data)).toEqual(["records", "count", "interface", "empty", "note", "page", "totalCount"]);
    expect(body.data.totalCount).toBe(1873);
    expect(r.flags).toContain("PROJECTED");
    expect(Object.keys(JSON.parse(okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 2), more: false, totalCount: null, projected: false } }))).body).data)).not.toContain("totalCount");
  });
});

describe("the byte cap", () => {
  const head = Buffer.byteLength('{"data":{"records":[');
  const rows = [{ A: "x" }, { A: "y" }, { A: "z" }];
  const each = Buffer.byteLength(JSON.stringify(rows[0]));
  const exactlyTwo = head + each + (each + 1) + PAGE_TAIL_RESERVE;

  it("at -1, 0 and +1 byte", () => {
    expect(fitRows(rows, exactlyTwo).parts).toHaveLength(2);
    expect(fitRows(rows, exactlyTwo - 1).parts).toHaveLength(1);
    expect(fitRows(rows, exactlyTwo + 1).parts).toHaveLength(2);
    expect(fitRows(rows, exactlyTwo + each + 1).parts).toHaveLength(3);
  });

  it("counts bytes, not characters", () => {
    const wide = [{ A: "é".repeat(10) }, { A: "é".repeat(10) }];
    const one = Buffer.byteLength(JSON.stringify(wide[0]));
    expect(one).toBe(JSON.stringify(wide[0]).length + 10);
    expect(fitRows(wide, head + one + one + 1 + PAGE_TAIL_RESERVE).parts).toHaveLength(2);
    expect(fitRows(wide, head + one + one + PAGE_TAIL_RESERVE).parts).toHaveLength(1);
  });

  it("a page cut by bytes resumes exactly where it stopped", () => {
    const small = prepared(BASIS, source({ page: { defaultSize: 50, maxSize: 50, rowCap: 1000, byteCap: 262_144 } }));
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 51, 10_000), more: false, totalCount: null, projected: false } }, small, null, ast(50))));
    expect(r.served).toBeLessThan(50);
    expect(r.bytes).toBeLessThanOrEqual(262_144);
    expect(r.flags).toContain("CUT_BY_BYTES");
    expect(next(r).payload.off).toBe(r.served);
  });

  it("one row too large for the page is ROW_TOO_LARGE", () => {
    const small = prepared(BASIS, source({ page: { defaultSize: 10, maxSize: 50, rowCap: 1000, byteCap: 262_144 } }));
    const r = assemblePage(ctx({ answer: { rows: rowsFrom(0, 3, 300_000), more: false, totalCount: null, projected: false } }, small));
    expect(r.ok === false && r.rule).toBe("ROW_TOO_LARGE");
  });

  it("the tail reserve holds the longest cursor and interface name, escaped", () => {
    const tail = {
      count: 1000,
      interface: { id: "c".repeat(30), name: "\u0001\"".repeat(100), version: Number.MAX_SAFE_INTEGER },
      empty: false,
      note: "x".repeat(200),
      page: { index: 9999, size: 1000, rowsServed: 100_000, nextCursor: `cec1.t999999.${"A".repeat(1011)}`, complete: false, stopped: "UPSTREAM_IGNORED_PAGING" },
      totalCount: Number.MAX_SAFE_INTEGER,
    };
    expect(Buffer.byteLength(JSON.stringify(tail))).toBeLessThan(PAGE_TAIL_RESERVE);
    const { parts } = fitRows([{ A: "y".repeat(4_000_000 - PAGE_TAIL_RESERVE - 40) }], 4_000_000);
    expect(parts).toHaveLength(1);
    const body = buildPageBody(parts, tail, 4_000_000);
    expect(body.bytes).toBeLessThanOrEqual(4_000_000);
    expect(JSON.parse(body.text).data.page.nextCursor).toHaveLength(1024);
  });

  it("every page body is at most the cap", () => {
    const r = okPage(assemblePage(ctx({ answer: { rows: rowsFrom(0, 11, 50), more: false, totalCount: null, projected: false } })));
    expect(r.bytes).toBe(Buffer.byteLength(r.body));
    expect(r.bytes).toBeLessThanOrEqual(4_000_000);
  });
});

describe("key lookups", () => {
  const key = (rows: AnswerRow[], kind: "KEY" | "KEY_VIA_FILTER" = "KEY") => assembleKey({ policy: POLICY, kind, answer: { rows, projected: false }, interface: IFACE });

  it("one record: records [r], count 1, no page", () => {
    const r = key(rowsFrom(0, 1));
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.parse(r.body)).toEqual({ data: { records: [{ Id: "00000", Name: "n00000" }], count: 1, interface: IFACE, empty: false, note: "1 record." } });
  });

  it("through the fallback: none is no record, two is SAP's key not being unique", () => {
    expect(key([], "KEY_VIA_FILTER")).toMatchObject({ ok: false, outcome: "NO_RECORD" });
    expect(key(rowsFrom(0, 2), "KEY_VIA_FILTER")).toMatchObject({ ok: false, outcome: "KEY_NOT_UNIQUE" });
    expect(key(rowsFrom(0, 1), "KEY_VIA_FILTER").flags).toContain("KEY_VIA_FILTER");
  });

  it("a record larger than the page limit", () => {
    const small = prepared(BASIS, source({ page: { defaultSize: 10, maxSize: 50, rowCap: 1000, byteCap: 262_144 } }));
    expect(assembleKey({ policy: small, kind: "KEY", answer: { rows: rowsFrom(0, 1, 300_000), projected: false }, interface: IFACE })).toMatchObject({ ok: false, outcome: "ROW_TOO_LARGE" });
  });
});

describe("the legacy guard", () => {
  it("is byte-identical to NextResponse.json, body and headers", async () => {
    const data = { records: [{ A: "é", B: null, C: [1, { D: " " }] }], count: 1, interface: IFACE, empty: false, note: "1 record." };
    const body = legacyBody(data);
    if (!body.ok) throw new Error("over the cap");
    const spliced = northboundOkJson(body.text, "corr-1");
    const original = NextResponse.json({ data }, { status: 200, headers: { "x-correlation-id": "corr-1", "cache-control": "no-store" } });
    expect(await spliced.text()).toBe(await original.text());
    expect(spliced.status).toBe(original.status);
    expect([...spliced.headers.entries()].sort()).toEqual([...original.headers.entries()].sort());
  });

  it("passes at the cap and refuses one byte past it", () => {
    const fixed = Buffer.byteLength(JSON.stringify({ data: { s: "" } }));
    const at = legacyBody({ s: "x".repeat(LEGACY_RESPONSE_CAP - fixed) });
    expect(at.ok && at.bytes).toBe(LEGACY_RESPONSE_CAP);
    const over = legacyBody({ s: "x".repeat(LEGACY_RESPONSE_CAP - fixed + 1) });
    expect(over).toEqual({ ok: false, bytes: LEGACY_RESPONSE_CAP + 1 });
  });
});
