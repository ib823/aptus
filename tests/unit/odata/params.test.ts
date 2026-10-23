// @vitest-environment node
/**
 * The query surface's request grammar (P1.4, 3.2).
 *
 * Every rule, in its order: what puts a request on the surface (and what
 * leaves it a legacy read, untouched); every name matching exactly one row;
 * repetition; combinations; values (control characters, U+FFFD, lone
 * surrogates, %XX text); and the caps at their boundaries.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_FILTER_FIELDS,
  MAX_IN_VALUES,
  MAX_IN_VALUES_PER_FIELD,
  MAX_LITERAL_TEXT,
  MAX_PARAMETERS,
  MAX_QUERY_STRING_LENGTH,
  parseQueryParams,
  type ParsedQuery,
  type ParsedQueryOk,
} from "@/lib/odata/params";

function parse(query: string | URLSearchParams): ParsedQuery {
  const params = typeof query === "string" ? new URLSearchParams(query) : query;
  const raw = typeof query === "string" ? query : params.toString();
  return parseQueryParams(params, raw.length === 0 ? 0 : raw.length + 1);
}

function ok(query: string | URLSearchParams): ParsedQueryOk {
  const r = parse(query);
  if (!r.surface || !r.ok) throw new Error(`refused: ${JSON.stringify(r)}`);
  return r;
}

function refused(query: string | URLSearchParams) {
  const r = parse(query);
  if (!r.surface || r.ok) throw new Error(`not refused: ${JSON.stringify(r, (_k, v: unknown) => (v instanceof Map ? [...v] : v))}`);
  return r;
}

describe("which requests are on the query surface", () => {
  it.each(["", "limit=50", "limit=50&entity=A_Other", "$filter=Customer eq '1'", "_=1", "Filter.X.eq=1", "selector=1"])(
    "%j is a legacy read, untouched",
    (q) => {
      expect(parse(q)).toEqual({ surface: false });
    },
  );

  it.each(["select=A", "expand=x", "filter=x", "orderby=A", "count=true", "pageSize=10", "cursor=x", "key=x", "filter.A.eq=1", "key.A=1", "filter.", "key."])(
    "%j is on the surface",
    (q) => {
      expect(parse(q).surface).toBe(true);
    },
  );
});

describe("names", () => {
  it.each([
    ["limit=10&select=A", "UNKNOWN_PARAMETER", "pageSize"],
    ["$filter=x&select=A", "ODATA_SYNTAX_REFUSED", "CoreEdge builds the OData query itself"],
    ["$top=1&select=A", "ODATA_SYNTAX_REFUSED", "$top"],
    ["entity=A_Other&select=A", "UNKNOWN_PARAMETER", "entity"],
    ["_=123&select=A", "UNKNOWN_PARAMETER", "_ is not"],
    ["expand=to_Item", "UNKNOWN_PARAMETER", "$expand is not served"],
    ["filter=A", "MALFORMED", "filter.<Field>.<op>"],
    ["key=A", "MALFORMED", "key.<Field>"],
    ["filter.A=1", "MALFORMED", "filter.A:"],
    ["filter.A.ne=1", "MALFORMED", "filter.A.ne"],
    ["filter.A.eq.x=1", "MALFORMED", ""],
    ["filter.1A.eq=1", "MALFORMED", ""],
    ["key.A.B=1", "MALFORMED", ""],
    ["key.=1", "MALFORMED", ""],
  ])("%j is refused %s", (q, rule, inMessage) => {
    const r = refused(q);
    expect(r.rule).toBe(rule);
    expect(r.message).toContain(inMessage);
  });

  it("echoes an unknown name only when it is safe to", () => {
    const safe = refused("select=A&weird.name-1=1");
    expect(safe.parameter).toBe("weird.name-1");
    expect(safe.message).toContain("weird.name-1");
    const hostile = refused(new URLSearchParams([["select", "A"], ["x'&<script>", "1"]]));
    expect(hostile.parameter).toBeUndefined();
    expect(hostile.message).not.toContain("script");
    const long = refused(new URLSearchParams([["select", "A"], ["a".repeat(65), "1"]]));
    expect(long.parameter).toBeUndefined();
  });

  it("treats __proto__ and constructor as ordinary names", () => {
    const r = ok(new URLSearchParams([["filter.__proto__.eq", "1"], ["filter.constructor.eq", "2"]]));
    expect([...r.filter.keys()].sort()).toEqual(["__proto__", "constructor"]);
    expect(r.filter.get("__proto__")).toEqual({ eq: "1" });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(refused(new URLSearchParams([["select", "A"], ["__proto__", "1"]])).rule).toBe("UNKNOWN_PARAMETER");
  });
});

describe("repetition and combinations", () => {
  it("refuses a repeated parameter, but for filter.<F>.in", () => {
    expect(refused("select=A&select=B").rule).toBe("DUPLICATE_PARAMETER");
    expect(refused("filter.A.eq=1&filter.A.eq=2").rule).toBe("DUPLICATE_PARAMETER");
    expect(refused("key.A=1&key.A=2").rule).toBe("DUPLICATE_PARAMETER");
    expect(ok("filter.A.in=1&filter.A.in=2&filter.A.in=1").filter.get("A")).toEqual({ in: ["1", "2", "1"] });
  });

  it("a key lookup allows only select beside its key parts", () => {
    const r = ok("key.SalesOrder=1000123&select=SalesOrder,SoldToParty");
    expect(r.kind).toBe("KEY");
    expect([...(r.key ?? new Map())]).toEqual([["SalesOrder", "1000123"]]);
    for (const extra of ["filter.A.eq=1", "orderby=A", "count=true", "pageSize=10", "cursor=cec1.t1.x"]) {
      const c = refused(`key.SalesOrder=1&${extra}`);
      expect(c.rule).toBe("PARAMETER_CONFLICT");
    }
  });

  it("one predicate per field: eq, in, or an interval", () => {
    expect(ok("filter.A.ge=1&filter.A.lt=5").filter.get("A")).toEqual({ ge: "1", lt: "5" });
    expect(ok("filter.A.gt=1").filter.get("A")).toEqual({ gt: "1" });
    for (const q of ["filter.A.eq=1&filter.A.in=2", "filter.A.eq=1&filter.A.ge=0", "filter.A.in=1&filter.A.le=2", "filter.A.gt=1&filter.A.ge=1", "filter.A.lt=1&filter.A.le=1"]) {
      expect(refused(q).rule).toBe("PARAMETER_CONFLICT");
    }
  });
});

describe("values", () => {
  it.each([
    ["U+FFFD", "a�b", "VALUE_INVALID"],
    ["a lone surrogate (through the console's JSON)", "a\uD800", "VALUE_INVALID"],
    ["NUL", "a\u0000", "VALUE_INVALID"],
    ["a C0 control", "a\u001Fb", "VALUE_INVALID"],
    ["DEL", "a\u007F", "VALUE_INVALID"],
    ["a C1 control", "a\u0085", "VALUE_INVALID"],
    ["%27 text", "O%27Neil", "VALUE_INVALID"],
    ["%2F text", "a%2Fb", "VALUE_INVALID"],
    ["%2f text, lower case", "a%2fb", "VALUE_INVALID"],
    ["257 characters", "x".repeat(257), "VALUE_TOO_LONG"],
  ])("refuses %s in a filter value, never echoing it", (_label, value, rule) => {
    const r = refused(new URLSearchParams([["filter.A.eq", value]]));
    expect(r.rule).toBe(rule);
    expect(r.parameter).toBe("filter.A.eq");
    expect(r.message).not.toContain(value);
  });

  it("the same checks apply to key values", () => {
    expect(refused(new URLSearchParams([["key.A", "a%27"]])).rule).toBe("VALUE_INVALID");
  });

  it("accepts what is only unusual: quotes, reserved characters, a lone %, unicode, 256 characters", () => {
    for (const v of ["O'Neil & Co", "a=b;c,d(e)/f\\g?h#i+j", "100%", "%2", "%zz", "\u{1F600}", "é", " ", " ", "x".repeat(256), "\u{1F600}".repeat(256)]) {
      expect(ok(new URLSearchParams([["filter.A.eq", v]])).filter.get("A")).toEqual({ eq: v });
    }
  });

  it("a + arrives as a space: the form decoding is URLSearchParams'", () => {
    expect(ok("filter.A.eq=a+b").filter.get("A")).toEqual({ eq: "a b" });
    expect(ok("filter.A.eq=a%2Bb").filter.get("A")).toEqual({ eq: "a+b" });
  });

  it("select, orderby, count and pageSize follow their grammars", () => {
    expect(ok("select=B,A").select).toEqual(["B", "A"]);
    expect(ok("orderby=-CreationDate,SalesOrder").orderby).toEqual([
      { f: "CreationDate", desc: true },
      { f: "SalesOrder", desc: false },
    ]);
    expect(ok("count=true").count).toBe(true);
    expect(ok("count=false").count).toBe(false);
    expect(ok("pageSize=9999").pageSize).toBe(9999);
    expect(ok("pageSize=1").pageSize).toBe(1);
    for (const q of ["select=", "select=A,,B", "select=A,A", "select=a'b", "orderby=", "orderby=A,-A", "orderby=+A", "orderby=A desc", "count=1", "count=TRUE", "pageSize=0", "pageSize=01", "pageSize=10000", "pageSize=-1", "pageSize=1.5"]) {
      expect(refused(q).rule, q).toBe("MALFORMED");
    }
  });

  it("passes the cursor through for cursor.ts to judge", () => {
    expect(ok("cursor=anything at all").cursor).toBe("anything at all");
  });
});

describe("caps at the boundary", () => {
  it("the raw query string: 8,192 characters", () => {
    const params = new URLSearchParams("select=A");
    expect(parseQueryParams(params, MAX_QUERY_STRING_LENGTH).surface).toBe(true);
    expect((parseQueryParams(params, MAX_QUERY_STRING_LENGTH) as ParsedQueryOk).ok).toBe(true);
    const over = parseQueryParams(params, MAX_QUERY_STRING_LENGTH + 1);
    expect(over).toMatchObject({ surface: true, ok: false, rule: "TOO_COMPLEX" });
  });

  it("128 parameters, counted before any name or value is looked at", () => {
    const junk = (n: number) => Array.from({ length: n }, (_, i) => [`x${i}`, "1"] as [string, string]);
    // At the cap, the count passes and the first unknown name is what is refused.
    expect(refused(new URLSearchParams([["select", "A"], ...junk(MAX_PARAMETERS - 1)])).rule).toBe("UNKNOWN_PARAMETER");
    const over = refused(new URLSearchParams([["select", "A"], ...junk(MAX_PARAMETERS)]));
    expect(over.rule).toBe("TOO_COMPLEX");
    expect(over.message).toContain(`${MAX_PARAMETERS} parameters`);
  });

  it("16 filtered fields", () => {
    const at = Array.from({ length: MAX_FILTER_FIELDS }, (_, i) => `filter.F${i}.eq=1`).join("&");
    expect(ok(at).filter.size).toBe(MAX_FILTER_FIELDS);
    expect(refused(`${at}&filter.Fx.eq=1`).rule).toBe("TOO_COMPLEX");
  });

  it("50 in values per field and 100 in all", () => {
    const values = (f: string, n: number) => Array.from({ length: n }, (_, i) => `filter.${f}.in=${i}`).join("&");
    expect(ok(values("A", MAX_IN_VALUES_PER_FIELD)).filter.get("A")?.in).toHaveLength(MAX_IN_VALUES_PER_FIELD);
    expect(refused(values("A", MAX_IN_VALUES_PER_FIELD + 1)).rule).toBe("TOO_COMPLEX");
    expect(ok(`${values("A", 50)}&${values("B", 50)}`).filter.size).toBe(2);
    expect(MAX_IN_VALUES).toBe(100);
    // 101 values over three fields: past the total, within each field's own cap.
    expect(refused(`${values("A", 50)}&${values("B", 50)}&${values("C", 1)}`).rule).toBe("TOO_COMPLEX");
  });

  it("2,048 code points of literal values in all", () => {
    const at = Array.from({ length: 8 }, (_, i) => [`filter.F${i}.eq`, "x".repeat(256)] as [string, string]);
    expect(ok(new URLSearchParams(at)).filter.size).toBe(8);
    expect(MAX_LITERAL_TEXT).toBe(2048);
    const over = new URLSearchParams([...at, ["key.K", "y"]]);
    // A key with filters is a conflict first; the literal cap is a LIST matter here.
    expect(refused(over).rule).toBe("PARAMETER_CONFLICT");
    const overList = new URLSearchParams([...at, ["filter.G.eq", "y"]]);
    expect(refused(overList).rule).toBe("TOO_COMPLEX");
  });

  it("select names at most 256 fields; orderby at most 4", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `F${i}`).join(",");
    expect(ok(`select=${names(256)}`).select).toHaveLength(256);
    expect(refused(`select=${names(257)}`).rule).toBe("TOO_COMPLEX");
    expect(ok("orderby=A,B,C,D").orderby).toHaveLength(4);
    expect(refused("orderby=A,B,C,D,E").rule).toBe("TOO_COMPLEX");
  });
});

describe("the parsed request", () => {
  it("a LIST carries every part, raw", () => {
    const r = ok(
      "filter.CompanyCode.eq=1010&filter.Customer.eq=17100001&filter.OverallStatus.in=A&filter.OverallStatus.in=B" +
        "&filter.CreationDate.ge=2026-01-01&filter.CreationDate.lt=2026-04-01&orderby=-CreationDate&pageSize=200&count=true",
    );
    expect(r.kind).toBe("LIST");
    expect(r.select).toBeNull();
    expect(r.key).toBeNull();
    expect(r.cursor).toBeNull();
    expect(r.count).toBe(true);
    expect(r.pageSize).toBe(200);
    expect(r.filter.get("CreationDate")).toEqual({ ge: "2026-01-01", lt: "2026-04-01" });
    expect(r.filter.get("OverallStatus")).toEqual({ in: ["A", "B"] });
  });
});
