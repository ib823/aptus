// @vitest-environment node
/**
 * The per-interface OpenAPI of the query surface (P1.4, 3.16).
 *
 *   - A read interface with a READY compiled policy lists every query
 *     parameter it serves by its literal name, typed by its field, with the
 *     page bounds; its 200 gains `page` and `totalCount`; its answers name
 *     the query surface's codes. Both documents validate against their
 *     specification.
 *   - A policy that is STALE, unreadable or about another dataset documents
 *     nothing more than no policy does.
 *   - A V4 draft's pinned key part is never a parameter.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compileContract } from "@/lib/contracts/compile";
import { buildNorthboundOpenApi, type InterfaceForDoc, type OpenApiVersion } from "@/lib/contracts/openapi";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import type { CompiledQueryPolicyV1 } from "@/lib/odata/policy";

import { basisFromEdmx, basisOf, compiled, source } from "../../helpers/odata-query";
import { validateOpenApi30, validateOpenApi31 } from "../../helpers/openapi-validate";

type Obj = Record<string, unknown>;

const XML = readFileSync(path.resolve(__dirname, "../../fixtures/odata/paging-orders.v2.xml"), "utf8");
const BASIS = basisFromEdmx(XML, "OrderLines");
const POLICY = compiled(
  BASIS,
  source({
    select: ["Order", "Line", "Customer", "NetAmount", "CreatedOn"],
    filter: [
      { field: "Order", ops: ["eq", "in"] },
      { field: "Line", ops: ["eq"] },
      { field: "NetAmount", ops: ["ge", "le"] },
      { field: "CreatedOn", ops: ["gt", "ge", "lt", "le"] },
    ],
    sort: ["Order", "Line", "CreatedOn"],
    count: true,
    page: { defaultSize: 50, maxSize: 200, rowCap: 2000, byteCap: 1_000_000 },
  }),
);

function contract() {
  const c = compileContract(XML);
  if (!c.ok) throw new Error(c.detail);
  const slice = sliceForEntitySet(c.ir, "OrderLines");
  if (!slice.ok) throw new Error(slice.detail);
  return { source: "metadata" as const, contract: slice.contract, semver: "1.0.0" };
}

function doc(queryPolicy: unknown, version: OpenApiVersion = "3.1.0", extra: Partial<InterfaceForDoc> = {}): Obj {
  return buildNorthboundOpenApi({
    version,
    baseUrl: "https://coreedge.example/api/northbound",
    title: "Query",
    description: "Query.",
    infoVersion: "1.0.0",
    interfaces: [
      {
        id: "if_q",
        name: "Order lines",
        externalId: "custom:/sap/opu/odata/sap/ZPAGING_ORDERS_SRV",
        sapProduct: "s4hana",
        operation: "READ",
        mode: "READ",
        entitySet: "OrderLines",
        version: 1,
        status: "ACTIVE",
        contract: contract(),
        queryPolicy,
        ...extra,
      },
    ],
  });
}

const getData = (d: Obj) => ((d.paths as Obj)["/interfaces/if_q/data"] as Obj).get as Obj;
const params = (d: Obj) => (getData(d).parameters as Obj[]).filter((p) => !("$ref" in p));
const named = (d: Obj, name: string) => params(d).find((p) => p.name === name);

describe("a READY policy's parameters, by their literal names", () => {
  it("lists exactly the parameters the policy serves", () => {
    expect(params(doc(POLICY)).map((p) => p.name)).toEqual([
      "select",
      "filter.Order.eq",
      "filter.Order.in",
      "filter.Line.eq",
      "filter.NetAmount.ge",
      "filter.NetAmount.le",
      "filter.CreatedOn.gt",
      "filter.CreatedOn.ge",
      "filter.CreatedOn.lt",
      "filter.CreatedOn.le",
      "orderby",
      "key.Order",
      "key.Line",
      "count",
      "pageSize",
      "cursor",
    ]);
  });

  it("types each by its field, and states the page bounds", () => {
    const d = doc(POLICY);
    expect(named(d, "select")).toMatchObject({ style: "form", explode: false, schema: { type: "array", items: { enum: ["Order", "Line", "Customer", "NetAmount", "CreatedOn"] } } });
    expect(named(d, "filter.Order.eq")!.schema).toMatchObject({ type: "string", maxLength: 10 });
    expect(named(d, "filter.Order.in")).toMatchObject({ style: "form", explode: true, schema: { type: "array", maxItems: 50, items: { type: "string", maxLength: 10 } } });
    expect(named(d, "filter.Line.eq")!.schema).toEqual({ type: "integer", minimum: -2147483648, maximum: 2147483647 });
    expect((named(d, "filter.NetAmount.ge")!.schema as Obj).pattern).toBe("^-?(0|[1-9][0-9]{0,33})(\\.[0-9]{1,34})?$");
    // A V2 Edm.DateTime shown as a date takes a date.
    expect(named(d, "filter.CreatedOn.gt")!.schema).toEqual({ type: "string", format: "date" });
    expect((named(d, "orderby")!.schema as Obj).items).toEqual({ type: "string", enum: ["Order", "Line", "CreatedOn", "-Order", "-Line", "-CreatedOn"] });
    expect(named(d, "pageSize")!.schema).toEqual({ type: "integer", minimum: 1, maximum: 200, default: 50 });
    expect((named(d, "cursor")!.schema as Obj).maxLength).toBe(1024);
  });

  it("documents page, totalCount, the query surface's codes and error.query", () => {
    const d = doc(POLICY);
    const responses = getData(d).responses as Record<string, Obj>;
    expect(responses["400"]!["x-coreedge-error-codes"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "POLICY_FIELD_NOT_GRANTED", status: 400 })]),
    );
    expect(responses["404"]!["x-coreedge-error-codes"]).toEqual(expect.arrayContaining([expect.objectContaining({ code: "RECORD_NOT_FOUND" })]));
    expect(responses["409"]!["x-coreedge-error-codes"]).toEqual([expect.objectContaining({ code: "CURSOR_STALE", status: 409 })]);
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(["413", "422"]));
    const schemas = (d.components as Obj).schemas as Record<string, Obj>;
    const data = ((schemas.OrderLines_ReadResult!.properties as Obj).data as Obj).properties as Obj;
    expect(data.page).toEqual({ $ref: "#/components/schemas/QueryPage" });
    expect(data.totalCount).toMatchObject({ type: ["integer", "null"] });
    expect(schemas.QueryPage).toBeDefined();
    const errorProps = (((schemas.Error!.properties as Obj).error as Obj).properties as Obj).query as Obj;
    expect(((errorProps.properties as Obj).rule as Obj).enum).toContain("FIELD_NOT_FILTERABLE");
    expect(schemas.Error!["x-coreedge-query-rules"]).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "SAP_REJECTED", status: 422 })]));
  });

  it("says key lookup is served through key.<Field>, and which query names the list takes", () => {
    const entry = (doc(POLICY)["x-coreedge-interfaces"] as Obj[])[0]!;
    const ops = entry.operations as Record<string, Obj>;
    expect(ops.getByKey).toEqual({ served: true, via: "key.<Field> on GET /interfaces/{id}/data", key: ["Order", "Line"] });
    expect(ops.list!.query).toEqual(expect.arrayContaining(["limit", "select", "filter.CreatedOn.le", "cursor"]));
    expect(ops.list!.queryPolicy).toEqual({ rev: POLICY.rev, revision: POLICY.revision, paging: "OFFSET" });
  });

  it.each(["3.1.0", "3.0.3"] as const)("validates against the %s specification", (version) => {
    const v = version === "3.1.0" ? validateOpenApi31(doc(POLICY, version)) : validateOpenApi30(doc(POLICY, version));
    expect(v.errors).toEqual([]);
  });
});

describe("what documents no query parameter", () => {
  const plain = doc(null);
  const onlyLimitAndVersion = (d: Obj) => (getData(d).parameters as Obj[]).every((p) => "$ref" in p);

  it("no policy: ?limit and the version header, no page, the 413 every read can meet", () => {
    expect(onlyLimitAndVersion(plain)).toBe(true);
    expect(((plain.components as Obj).schemas as Obj).QueryPage).toBeUndefined();
    expect(Object.keys(getData(plain).responses as Obj)).toContain("413");
    expect(((plain["x-coreedge-interfaces"] as Obj[])[0]!.operations as Obj).getByKey).toMatchObject({ served: false });
  });

  it("a STALE policy, an unreadable one, and one about another dataset document what no policy does", () => {
    const stale: CompiledQueryPolicyV1 = compiled(basisOf([{ n: "Order" }, { n: "Line", t: "I32" }], ["Order", "Line"], { entitySet: "OrderLines", source: "METADATA" }));
    const staleNow = { ...stale, state: "STALE" as const, stale: { reason: "KEY_CHANGED" as const, at: stale.compiledAt } };
    for (const policy of [{ ...staleNow, rev: "qp1:AAAAAAAAAAAAAAAAAAAAAA" }, { v: 1, nonsense: true }, compiled({ ...BASIS, entitySet: "Archive" })]) {
      expect(JSON.stringify(doc(policy))).toBe(JSON.stringify(plain));
    }
  });

  it("never offers a V4 draft's pinned key part as a parameter", () => {
    const draft = basisOf(
      [{ n: "SalesOrder" }, { n: "IsActiveEntity", t: "B", edm: "Edm.Boolean" }, { n: "Customer" }],
      ["SalesOrder", "IsActiveEntity"],
      { odata: "V4", entitySet: "OrderLines" },
    );
    const d = doc(compiled(draft, source({ filter: [{ field: "Customer", ops: ["eq"] }], sort: ["SalesOrder"] })));
    const names = params(d).map((p) => p.name as string);
    expect(names).toContain("key.SalesOrder");
    expect(names.some((n) => n.includes("IsActiveEntity"))).toBe(false);
  });
});
