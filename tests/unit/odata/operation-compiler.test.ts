// @vitest-environment node
/**
 * The operation compiler (P1.4, 3.7): golden URLs per version, the URL as
 * fetch sends it, and the rules for what each option carries.
 *
 * Every golden below is the URL buildSapUrl writes AND its WHATWG
 * serialisation (`new URL(url).href`), which is what fetch sends and SAP
 * receives: a query's `'` becomes `%27`, a path's stays raw.
 */

import { describe, expect, it } from "vitest";

import { basisOf, prepared, source } from "../../helpers/odata-query";

import { checkQuery } from "@/lib/odata/check";
import { buildQueryUrl, compileQuery, SAP_URL_MAX_LENGTH, sentLine, type SapQuery } from "@/lib/odata/operation-compiler";
import { parseQueryParams } from "@/lib/odata/params";
import type { PreparedPolicy } from "@/lib/odata/policy";
import type { QueryBasisV1 } from "@/lib/odata/basis";

const TARGET = {
  baseUrl: "https://sap.example.invalid:44300",
  servicePath: "/sap/opu/odata/sap/API_SALES_ORDER_SRV",
  entitySet: "A_SalesOrder",
  client: "100",
};

function orders(odata: "V2" | "V4", extra: Partial<QueryBasisV1> = {}): QueryBasisV1 {
  return {
    ...basisOf(
      [
        { n: "SalesOrder", ml: 10 },
        { n: "SoldToParty", ml: 10 },
        { n: "CreationDate", t: odata === "V2" ? "DT" : "DA", ...(odata === "V2" ? { dateOnly: true as const } : {}) },
        { n: "OverallStatus", ml: 1 },
        { n: "CompanyCode", ml: 4 },
        { n: "Customer", ml: 10 },
        { n: "Internal" },
      ],
      ["SalesOrder"],
      { odata, entitySet: "A_SalesOrder" },
    ),
    ...extra,
  };
}

const ORDERS_SOURCE = source({
  select: ["SalesOrder", "SoldToParty", "CreationDate", "OverallStatus", "CompanyCode", "Customer"],
  filter: [
    { field: "CompanyCode", ops: ["eq"] },
    { field: "Customer", ops: ["eq", "in"] },
    { field: "OverallStatus", ops: ["eq", "in"] },
    { field: "CreationDate", ops: ["gt", "ge", "lt", "le"] },
    { field: "SalesOrder", ops: ["eq", "in"] },
  ],
  sort: ["CreationDate", "SalesOrder"],
  count: true,
});

function compile(query: string | [string, string][], policy: PreparedPolicy, position = { skip: 0, top: 201 as number | null, page0: true }): SapQuery {
  const params = new URLSearchParams(query);
  const parsed = parseQueryParams(params, params.toString().length + 1);
  if (!parsed.surface || !parsed.ok) throw new Error(`parse: ${JSON.stringify(parsed)}`);
  const checked = checkQuery(parsed, policy);
  if (!checked.ok) throw new Error(`check: ${JSON.stringify(checked)}`);
  return compileQuery(checked.ast, policy, position, checked.project);
}

function url(q: SapQuery, target = TARGET): { built: string; href: string } {
  const r = buildQueryUrl(q, target);
  if (!r.ok) throw new Error(`url refused: ${r.detail.rule}`);
  return { built: r.url, href: new URL(r.url).href };
}

const EXAMPLE =
  "filter.CompanyCode.eq=1010&filter.Customer.eq=17100001&filter.OverallStatus.in=A&filter.OverallStatus.in=B" +
  "&filter.CreationDate.ge=2026-01-01&filter.CreationDate.lt=2026-04-01&orderby=-CreationDate&pageSize=200&count=true";

describe("the worked example (3.7.8)", () => {
  it("V2, page 0", () => {
    const q = compile(EXAMPLE, prepared(orders("V2"), ORDERS_SOURCE));
    const { built, href } = url(q);
    const options =
      "?$select=SalesOrder,SoldToParty,CreationDate,OverallStatus,CompanyCode,Customer" +
      "&$filter=CompanyCode%20eq%20'1010'%20and%20CreationDate%20ge%20datetime'2026-01-01T00%3A00%3A00'" +
      "%20and%20CreationDate%20lt%20datetime'2026-04-01T00%3A00%3A00'%20and%20Customer%20eq%20'17100001'" +
      "%20and%20(OverallStatus%20eq%20'A'%20or%20OverallStatus%20eq%20'B')" +
      "&$orderby=CreationDate%20desc,SalesOrder%20asc&$top=201&$inlinecount=allpages&$format=json&sap-client=100";
    expect(built).toBe(`https://sap.example.invalid:44300/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder${options}`);
    expect(href).toBe(`https://sap.example.invalid:44300/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder${options.replaceAll("'", "%27")}`);
    expect(q.headers).toEqual({});
    expect(q.top).toBe(201);
  });

  it("V4, page 0: Edm.Date unquoted, $count, and OData-MaxVersion", () => {
    const q = compile(EXAMPLE, prepared(orders("V4"), ORDERS_SOURCE));
    const { built } = url(q);
    expect(built).toContain("CreationDate%20ge%202026-01-01%20and%20CreationDate%20lt%202026-04-01");
    expect(built).toContain("&$count=true&$format=json");
    expect(built).not.toContain("$inlinecount");
    expect(q.headers).toEqual({ "OData-MaxVersion": "4.0" });
  });
});

describe("LIST options", () => {
  const policy = prepared(orders("V2"), ORDERS_SOURCE);

  it("$top is what the page asks; $skip only above 0; count on page 0 only", () => {
    const later = compile("filter.CompanyCode.eq=1&count=true", policy, { skip: 200, top: 101, page0: false });
    expect(later.options.map(([n]) => n)).toEqual(["$select", "$filter", "$orderby", "$top", "$skip", "$format"]);
    expect(later.options.find(([n]) => n === "$skip")?.[1]).toBe("200");
    expect(later.options.find(([n]) => n === "$top")?.[1]).toBe("101");
    const first = compile("filter.CompanyCode.eq=1", policy, { skip: 0, top: 101, page0: true });
    expect(first.options.map(([n]) => n)).toEqual(["$select", "$filter", "$orderby", "$top", "$format"]);
  });

  it("the tie-break: every key part not already ordered, ascending", () => {
    expect(compile("filter.CompanyCode.eq=1", policy).options.find(([n]) => n === "$orderby")?.[1]).toBe("SalesOrder%20asc");
    expect(compile("filter.CompanyCode.eq=1&orderby=-SalesOrder", policy).options.find(([n]) => n === "$orderby")?.[1]).toBe("SalesOrder%20desc");
    const composite = prepared(
      basisOf([{ n: "Order" }, { n: "Line", t: "I32" }, { n: "Date", t: "DT" }], ["Order", "Line"]),
      source({ sort: ["Date", "Line", "Order"] }),
    );
    expect(compile("orderby=-Date,Line", composite).options.find(([n]) => n === "$orderby")?.[1]).toBe("Date%20desc,Line%20asc,Order%20asc");
  });

  it("a dataset that does not page: no tie-break, no $skip", () => {
    const single = prepared(orders("V2", { set: { pageable: false } }), ORDERS_SOURCE);
    const q = compile("filter.CompanyCode.eq=1&orderby=-CreationDate", single);
    expect(q.options.find(([n]) => n === "$orderby")?.[1]).toBe("CreationDate%20desc");
    expect(() => compileQuery({ v: 1, kind: "LIST", select: null, filter: [], orderby: [], key: null, count: false, pageSize: 10 }, single, { skip: 10, top: 11, page0: false })).toThrow();
    const unordered = compile("filter.CompanyCode.eq=1", single);
    expect(unordered.options.map(([n]) => n)).not.toContain("$orderby");
  });

  it("$top is left out when SAP does not support it", () => {
    const noTop = prepared(orders("V2", { set: { topSupported: false } }), { ...ORDERS_SOURCE, keyLookup: false });
    const q = compile("filter.CompanyCode.eq=1", noTop);
    expect(q.top).toBeNull();
    expect(q.options.map(([n]) => n)).not.toContain("$top");
  });

  it("the draft pin is added to every list filter", () => {
    const draft = prepared(
      basisOf([{ n: "TravelID" }, { n: "IsActiveEntity", t: "B" }, { n: "Agency" }], ["TravelID", "IsActiveEntity"], { odata: "V4", entitySet: "Travel" }),
      source({ filter: [{ field: "Agency", ops: ["eq"] }] }),
    );
    const q = compile("filter.Agency.eq=070001", draft);
    expect(q.options.find(([n]) => n === "$filter")?.[1]).toBe("Agency%20eq%20'070001'%20and%20IsActiveEntity%20eq%20true");
    expect(q.flags).toContain("PINNED_ACTIVE");
    expect(compile("pageSize=5", draft).options.find(([n]) => n === "$filter")?.[1]).toBe("IsActiveEntity%20eq%20true");
  });
});

describe("$select", () => {
  it("is the effective select plus the key parts, in policy order", () => {
    const q = compile("filter.CompanyCode.eq=1&select=Customer,CompanyCode", prepared(orders("V2"), ORDERS_SOURCE));
    expect(q.options.find(([n]) => n === "$select")?.[1]).toBe("SalesOrder,CompanyCode,Customer");
    expect(q.project).toEqual(["CompanyCode", "Customer"]);
    expect(q.selectSent).toEqual(["SalesOrder", "CompanyCode", "Customer"]);
  });

  it("is left out when it would name every column, or when SAP does not support it", () => {
    const all = prepared(orders("V2"), { ...ORDERS_SOURCE, select: "*" });
    expect(compile("filter.CompanyCode.eq=1", all).options.map(([n]) => n)).not.toContain("$select");
    expect(compile("filter.CompanyCode.eq=1", all).selectSent).toBeNull();
    expect(compile("filter.CompanyCode.eq=1&select=Customer", all).options.map(([n]) => n)).toContain("$select");
    const unsupported = prepared(orders("V2", { set: { selectSupported: false } }), ORDERS_SOURCE);
    expect(compile("filter.CompanyCode.eq=1&select=Customer", unsupported).options.map(([n]) => n)).not.toContain("$select");
  });
});

describe("key lookups", () => {
  it("single and composite, in parentheses, in key order", () => {
    const one = compile("key.SalesOrder=1000123", prepared(orders("V2"), ORDERS_SOURCE));
    expect(url(one).built).toBe("https://sap.example.invalid:44300/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('1000123')?$select=SalesOrder,SoldToParty,CreationDate,OverallStatus,CompanyCode,Customer&$format=json&sap-client=100");
    // The path keeps its quote on the wire.
    expect(url(one).href).toContain("/A_SalesOrder('1000123')?");
    expect(one.kind).toBe("KEY");
    expect(one.top).toBeNull();
    expect(one.options.map(([n]) => n)).toEqual(["$select", "$format"]);
    const composite = prepared(basisOf([{ n: "Order" }, { n: "Item", t: "I32" }], ["Order", "Item"]), source());
    expect(compile("key.Item=10&key.Order=1", composite).pathSuffix).toBe("(Order='1',Item=10)");
  });

  it("GUID and Int64 keys per version", () => {
    for (const [odata, guid, int64] of [
      ["V2", "(guid'0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a')", "(9223372036854775807L)"],
      ["V4", "(0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a)", "(9223372036854775807)"],
    ] as const) {
      const g = prepared(basisOf([{ n: "Uuid", t: "G" }], ["Uuid"], { odata }));
      expect(compile("key.Uuid=0050568D-393C-1EE8-AB8E-8E8E2B4C5B6A", g).pathSuffix).toBe(guid);
      const i = prepared(basisOf([{ n: "Ref", t: "I64" }], ["Ref"], { odata }));
      expect(compile("key.Ref=9223372036854775807", i).pathSuffix).toBe(int64);
    }
  });

  it("the V4 draft pin goes into the key predicate", () => {
    const draft = prepared(basisOf([{ n: "SalesOrder" }, { n: "IsActiveEntity", t: "B" }], ["SalesOrder", "IsActiveEntity"], { odata: "V4" }));
    expect(compile("key.SalesOrder=1000123", draft).pathSuffix).toBe("(SalesOrder='1000123',IsActiveEntity=true)");
  });

  it("a value with / or \\ is read through a filter, never put in the path", () => {
    const policy = prepared(orders("V2"), ORDERS_SOURCE);
    for (const value of ["A/1", "A\\1"]) {
      const q = compile([["key.SalesOrder", value]], policy);
      expect(q.kind).toBe("KEY_VIA_FILTER");
      expect(q.pathSuffix).toBe("");
      expect(q.top).toBe(2);
      expect(q.flags).toContain("KEY_VIA_FILTER");
      expect(q.options.map(([n]) => n)).toEqual(["$select", "$filter", "$top", "$format"]);
      const { href } = url(q);
      expect(new URL(href).pathname).toBe("/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder");
      expect(href).toContain(value === "A/1" ? "A%2F1" : "A%5C1");
    }
  });

  it("quotes and reserved characters stay inside the literal", () => {
    const q = compile([["key.SalesOrder", "O'N&=,()"]], prepared(orders("V2"), ORDERS_SOURCE));
    expect(q.pathSuffix).toBe("('O''N%26%3D%2C%28%29')");
  });
});

describe("the URL cap, measured as fetch sends it", () => {
  const policy = prepared(basisOf([{ n: "Id" }, { n: "Name" }, ...Array.from({ length: 40 }, (_, i) => ({ n: `Wide_Field_Name_${i}_${"x".repeat(60)}` }))], ["Id"]), source({ select: "*", filter: [{ field: "Name", ops: ["eq", "in"] }] }));

  it("drops $select first, flagged", () => {
    const names = policy.readable.slice(0, 40).join(",");
    const values = Array.from({ length: 30 }, (_, i) => ["filter.Name.in", `v${i}${"q".repeat(40)}`] as [string, string]);
    const q = compile([["select", names], ...values], policy);
    const r = buildQueryUrl(q, TARGET);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new URL(r.url).href.length).toBeLessThanOrEqual(SAP_URL_MAX_LENGTH);
    expect(r.query.flags).toContain("SELECT_DROPPED");
    expect(r.query.selectSent).toBeNull();
    expect(r.url).not.toContain("$select");
  });

  it("refuses SAP_URL_TOO_LONG when even that is over", () => {
    // Within every parse cap (1,920 code points of values, a 6.5 KB request),
    // but each quote is %27%27 on the wire to SAP.
    const values = Array.from({ length: 40 }, (_, i) => ["filter.Name.in", `${String(i).padStart(2, "0")}${"'".repeat(46)}`] as [string, string]);
    const r = buildQueryUrl(compile(values, policy), TARGET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail.rule).toBe("SAP_URL_TOO_LONG");
  });

  it("counts a query's quote as the %27 it is sent as", () => {
    // Each quote is '' in the built URL and %27%27 on the wire.
    const values = Array.from({ length: 21 }, (_, i) => ["filter.Name.in", `${i}${"'".repeat(40)}`] as [string, string]);
    const q = compile(values, policy);
    const built = buildQueryUrl({ ...q }, { ...TARGET, baseUrl: "https://h" });
    const raw = `https://h${TARGET.servicePath}/${TARGET.entitySet}?${q.options.map(([n, v]) => `${n}=${v}`).join("&")}&sap-client=100`;
    expect(raw.length).toBeLessThanOrEqual(SAP_URL_MAX_LENGTH);
    expect(new URL(raw).href.length).toBeGreaterThan(SAP_URL_MAX_LENGTH);
    expect(built.ok).toBe(false);
  });
});

describe("what the compiler will not do", () => {
  it("emits no name the policy did not vouch for", () => {
    const policy = prepared(orders("V2"), ORDERS_SOURCE);
    const forged = { v: 1, kind: "LIST", select: null, filter: [{ f: "x&$expand=y", op: "eq", v: { t: "S", v: "1" } }], orderby: [], key: null, count: false, pageSize: 10 } as const;
    expect(() => compileQuery(forged, policy, { skip: 0, top: 11, page0: true })).toThrow(/identifier/);
  });

  it("the sent line names the service path and never the host or client", () => {
    const q = compile(EXAMPLE, prepared(orders("V2"), ORDERS_SOURCE));
    const line = sentLine(q, TARGET);
    expect(line.startsWith("/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?$select=")).toBe(true);
    expect(line).not.toContain("example.invalid");
    expect(line).not.toContain("44300");
    expect(line).not.toContain("sap-client");
  });
});
