// @vitest-environment node
/**
 * The checked query's canonical text and its three derivations (P1.4, 3.4):
 * the cursor binding, the literal-free audit shape and the keyed audit hash.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalAst, queryBind, queryHash, queryShape, type QueryAstV1 } from "@/lib/odata/ast";
import { readTokenRing } from "@/lib/security/token-ring";

const LIST: QueryAstV1 = {
  v: 1,
  kind: "LIST",
  select: null,
  filter: [
    { f: "CompanyCode", op: "eq", v: { t: "S", v: "1010" } },
    { f: "CreationDate", op: "range", lo: { incl: true, v: { t: "DT", v: "2026-01-01T00:00:00" } }, hi: { incl: false, v: { t: "DT", v: "2026-04-01T00:00:00" } } },
    { f: "OverallStatus", op: "in", vs: [{ t: "S", v: "A" }, { t: "S", v: "B" }] },
  ],
  orderby: [{ f: "CreationDate", desc: true }],
  key: null,
  count: true,
  pageSize: 200,
};

const KEY: QueryAstV1 = {
  v: 1,
  kind: "KEY",
  select: ["SalesOrder", "SoldToParty"],
  filter: [],
  orderby: [],
  key: [{ f: "SalesOrder", v: { t: "S", v: "1000123" } }],
  count: false,
  pageSize: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canonicalAst", () => {
  it("is fixed-order JSON with no whitespace", () => {
    const text = canonicalAst(LIST);
    expect(text).toBe(
      '{"v":1,"kind":"LIST","select":null,"filter":[{"f":"CompanyCode","op":"eq","v":{"t":"S","v":"1010"}},' +
        '{"f":"CreationDate","op":"range","lo":{"incl":true,"v":{"t":"DT","v":"2026-01-01T00:00:00"}},"hi":{"incl":false,"v":{"t":"DT","v":"2026-04-01T00:00:00"}}},' +
        '{"f":"OverallStatus","op":"in","vs":[{"t":"S","v":"A"},{"t":"S","v":"B"}]}],' +
        '"orderby":[{"f":"CreationDate","desc":true}],"key":null,"count":true,"pageSize":200}',
    );
    expect(JSON.parse(text)).toEqual(LIST);
  });

  it("does not depend on how the object was built", () => {
    const shuffled = { pageSize: 200, count: true, key: null, orderby: LIST.orderby, filter: LIST.filter, select: null, kind: "LIST", v: 1 } as const;
    expect(canonicalAst(shuffled)).toBe(canonicalAst(LIST));
  });

  it("escapes values as JSON strings", () => {
    const tricky: QueryAstV1 = { ...KEY, key: [{ f: "SalesOrder", v: { t: "S", v: '"},{"f":"x' } }] };
    expect(JSON.parse(canonicalAst(tricky))).toEqual(tricky);
  });
});

describe("queryBind", () => {
  it("is 16 bytes, equal for equal queries and different for different ones", () => {
    expect(queryBind(LIST)).toHaveLength(16);
    expect(queryBind({ ...LIST })).toEqual(queryBind(LIST));
    expect(queryBind({ ...LIST, pageSize: 100 })).not.toEqual(queryBind(LIST));
    expect(queryBind({ ...LIST, orderby: [{ f: "CreationDate", desc: false }] })).not.toEqual(queryBind(LIST));
  });
});

describe("queryShape", () => {
  it("describes the query without its literals", () => {
    expect(queryShape(LIST)).toBe("L|s=*|f=CompanyCode:eq:S,CreationDate:range[ge,lt]:DT,OverallStatus:in2:S|o=-CreationDate|c=1|n=200");
    expect(queryShape(KEY)).toBe("K|s=SalesOrder,SoldToParty|k=SalesOrder:S");
    for (const literal of ["1010", "2026", "1000123"]) {
      expect(queryShape(LIST)).not.toContain(literal);
      expect(queryShape(KEY)).not.toContain(literal);
    }
  });

  it("is cut at 1,024 characters", () => {
    const wide: QueryAstV1 = { ...LIST, select: Array.from({ length: 256 }, (_, i) => `Field_${String(i).padStart(3, "0")}_${"x".repeat(40)}`) };
    const shape = queryShape(wide);
    expect(shape.length).toBeLessThanOrEqual(1024);
    expect(shape.endsWith("|+cut")).toBe(true);
    expect(shape).toHaveLength(1005);
  });
});

describe("queryHash", () => {
  const ring = () => {
    vi.stubEnv("COREEDGE_TOKEN_KEYS", `t1:${"11".repeat(32)},t2:${"22".repeat(32)}`);
    vi.stubEnv("COREEDGE_TOKEN_ACTIVE_KEY", "t2");
    return readTokenRing();
  };

  it("is keyed by the active ring key and the organisation, and names its kid", () => {
    const r = ring();
    const a = queryHash(LIST, { organizationId: "org_a", interfaceId: "if_1" }, r);
    expect(a).toMatch(/^qh1\.t2\.[A-Za-z0-9_-]{22}$/);
    expect(queryHash(LIST, { organizationId: "org_b", interfaceId: "if_1" }, r)).not.toBe(a);
    expect(queryHash(LIST, { organizationId: "org_a", interfaceId: "if_2" }, r)).not.toBe(a);
    expect(queryHash(LIST, { organizationId: "org_a", interfaceId: "if_1" }, { ...r, active: "t1" })).not.toBe(a);
  });

  it("leaves out page size and count, so a restarted chain of the same query hashes the same", () => {
    const r = ring();
    const ctx = { organizationId: "org_a", interfaceId: "if_1" };
    expect(queryHash({ ...LIST, pageSize: 50, count: false }, ctx, r)).toBe(queryHash(LIST, ctx, r));
    expect(queryHash({ ...LIST, filter: LIST.filter.slice(1) }, ctx, r)).not.toBe(queryHash(LIST, ctx, r));
  });

  it("covers literals: the same shape with another value hashes differently", () => {
    const r = ring();
    const ctx = { organizationId: "org_a", interfaceId: "if_1" };
    const other: QueryAstV1 = { ...LIST, filter: [{ f: "CompanyCode", op: "eq", v: { t: "S", v: "1710" } }, ...LIST.filter.slice(1)] };
    expect(queryShape(other)).toBe(queryShape(LIST));
    expect(queryHash(other, ctx, r)).not.toBe(queryHash(LIST, ctx, r));
  });
});
