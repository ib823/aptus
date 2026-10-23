// @vitest-environment node
/**
 * The checker (P1.4, 3.6): every rule, in its order, and the AST it builds.
 *
 * This is acceptance criterion A1 at the unit level: `filter.X.eq` on a field
 * the policy does not let callers filter on is 400 POLICY_FIELD_NOT_GRANTED,
 * naming the field and what is allowed instead. And T7: a field can be
 * filtered or sorted on only if it can be read, and P1.5's `allowed` hook
 * narrows every rule at once.
 */

import { describe, expect, it } from "vitest";

import { basisOf, compiled, prepared, source } from "../../helpers/odata-query";

import { checkPolicyAvailable, checkQuery, CURSOR_UNUSABLE_MESSAGE, type CheckedQuery } from "@/lib/odata/check";
import { parseQueryParams, type ParsedQueryOk } from "@/lib/odata/params";
import { preparedFrom, type PreparedPolicy } from "@/lib/odata/policy";
import { compileQueryPolicy } from "@/lib/odata/policy-compiler";
import { QUERY_REFUSAL_STATUS, type QueryRefusal } from "@/lib/odata/rules";

const BASIS = basisOf(
  [
    { n: "Order", ml: 10 },
    { n: "Customer", ml: 10 },
    { n: "CompanyCode", ml: 4 },
    { n: "NetAmount", t: "D", p: 15, s: 2 },
    { n: "CreationDate", t: "DT", dateOnly: true },
    { n: "Status", ml: 1 },
    { n: "Flag", t: "B" },
    { n: "Uuid", t: "G" },
    { n: "Secret" },
  ],
  ["Order"],
);

const SOURCE = source({
  select: ["Order", "Customer", "CompanyCode", "NetAmount", "CreationDate", "Status", "Flag", "Uuid"],
  filter: [
    { field: "Customer", ops: ["eq", "in"] },
    { field: "CompanyCode", ops: ["eq"] },
    { field: "CreationDate", ops: ["gt", "ge", "lt", "le"] },
    { field: "Status", ops: ["eq", "in"] },
    { field: "Flag", ops: ["eq"] },
    { field: "Uuid", ops: ["eq", "in"] },
    { field: "Order", ops: ["eq", "in"] },
  ],
  sort: ["Order", "CreationDate", "Customer"],
  requireFilterOn: ["CompanyCode"],
});

const POLICY = prepared(BASIS, SOURCE);

function parsed(query: string | [string, string][]): ParsedQueryOk {
  const params = new URLSearchParams(query);
  const r = parseQueryParams(params, params.toString().length + 1);
  if (!r.surface || !r.ok) throw new Error(`parse refused: ${JSON.stringify(r)}`);
  return r;
}

function check(query: string | [string, string][], policy: PreparedPolicy = POLICY, allowed?: ReadonlySet<string>) {
  return checkQuery(parsed(query), policy, allowed === undefined ? {} : { allowed });
}

function refused(query: string | [string, string][], policy: PreparedPolicy = POLICY, allowed?: ReadonlySet<string>): QueryRefusal {
  const r = check(query, policy, allowed);
  if (r.ok) throw new Error(`not refused: ${JSON.stringify(r.ast)}`);
  return r;
}

function ok(query: string | [string, string][], policy: PreparedPolicy = POLICY, allowed?: ReadonlySet<string>): CheckedQuery {
  const r = check(query, policy, allowed);
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r)}`);
  return r;
}

const CC = "filter.CompanyCode.eq=1010";

describe("rule 1: a policy is available", () => {
  const c = compiled(BASIS, SOURCE);

  it("answers NO_POLICY, NO_CONTRACT, POLICY_UNREADABLE and POLICY_STALE as QUERY_NOT_AVAILABLE", () => {
    const cases: [unknown, { entitySet: string | null; sourcePresent?: boolean }, string][] = [
      [null, { entitySet: "Orders" }, "NO_POLICY"],
      [null, { entitySet: "Orders", sourcePresent: true }, "NO_CONTRACT"],
      [{ v: 1, junk: true }, { entitySet: "Orders" }, "POLICY_UNREADABLE"],
      [JSON.parse(JSON.stringify(c)), { entitySet: "OtherSet" }, "POLICY_STALE"],
    ];
    for (const [raw, ctx, rule] of cases) {
      const r = checkPolicyAvailable(raw, ctx);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.reason).toBe("QUERY_NOT_AVAILABLE");
      expect(r.detail.rule).toBe(rule);
      expect(QUERY_REFUSAL_STATUS[r.reason]).toBe(400);
    }
    expect(checkPolicyAvailable(JSON.parse(JSON.stringify(c)), { entitySet: "Orders" }).ok).toBe(true);
  });

  it("a stale compiled policy is POLICY_STALE", () => {
    const staleBasis = { ...BASIS, source: "SAMPLED" as const };
    const r = compileQueryPolicy(SOURCE, staleBasis, { mode: "verify", interface: { entitySet: "Orders", odataVersion: "V2" }, revision: 1, now: new Date() });
    if (!r.ok) throw new Error("verify refused");
    const a = checkPolicyAvailable(JSON.parse(JSON.stringify(r.compiled)), { entitySet: "Orders" });
    expect(!a.ok && a.detail.rule).toBe("POLICY_STALE");
  });
});

describe("rules 2 and 3: key lookup", () => {
  it("is POLICY_FIELD_NOT_GRANTED when the policy does not allow it", () => {
    const noKey = prepared(BASIS, { ...SOURCE, keyLookup: false });
    const r = refused("key.Order=1", noKey);
    expect(r.reason).toBe("POLICY_FIELD_NOT_GRANTED");
    expect(r.detail.rule).toBe("KEY_LOOKUP_NOT_ALLOWED");
  });

  it("must name every key part once and nothing else", () => {
    const composite = basisOf([{ n: "Order" }, { n: "Line", t: "I32" }, { n: "Text" }], ["Order", "Line"]);
    const p = prepared(composite);
    expect(refused("key.Order=1", p).detail).toMatchObject({ rule: "KEY_INCOMPLETE", parameter: "key.Line", allowed: ["Order", "Line"] });
    expect(refused("key.Order=1&key.Line=2&key.Text=x", p).detail).toMatchObject({ rule: "KEY_INCOMPLETE", parameter: "key.Text" });
    expect(refused("key.Order=1&key.Line=2&key.Text=x", p).reason).toBe("QUERY_INVALID");
    const ast = ok("key.Line=2&key.Order=1", p).ast;
    expect(ast.key).toEqual([
      { f: "Order", v: { t: "S", v: "1" } },
      { f: "Line", v: { t: "I32", v: "2" } },
    ]);
  });

  it("a pinned draft part sent by the caller counts as extra", () => {
    const draft = basisOf([{ n: "Travel" }, { n: "IsActiveEntity", t: "B" }], ["Travel", "IsActiveEntity"], { odata: "V4" });
    const p = prepared(draft);
    expect(refused("key.Travel=1&key.IsActiveEntity=false", p).detail).toMatchObject({ rule: "KEY_INCOMPLETE", parameter: "key.IsActiveEntity" });
    expect(ok("key.Travel=1", p).ast.key).toEqual([{ f: "Travel", v: { t: "S", v: "1" } }]);
  });

  it("a key value with a slash needs the key-as-filter fallback", () => {
    expect(ok("key.Order=A/1").ast.key).toEqual([{ f: "Order", v: { t: "S", v: "A/1" } }]);
    const noFallback = prepared(basisOf([{ n: "Order", filterable: false }], ["Order"]));
    expect(refused("key.Order=A/1", noFallback).detail).toMatchObject({ rule: "KEY_NOT_ADDRESSABLE", parameter: "key.Order" });
    expect(refused("key.Order=A\\1", noFallback).detail.rule).toBe("KEY_NOT_ADDRESSABLE");
    expect(ok("key.Order=A1", noFallback).ast.kind).toBe("KEY");
  });
});

describe("rules 4 to 6: fields and operators", () => {
  it("4: a selected field must be readable", () => {
    const r = refused(`${CC}&select=Order,Secret`);
    expect(r.reason).toBe("POLICY_FIELD_NOT_GRANTED");
    expect(r.detail).toEqual({ rule: "FIELD_NOT_SELECTABLE", parameter: "select", field: "Secret", allowed: POLICY.readable });
  });

  it("5 (A1): filtering on a readable field without operators is 400 POLICY_FIELD_NOT_GRANTED, with field and allowed", () => {
    const r = refused(`${CC}&filter.NetAmount.gt=1`);
    expect(r.reason).toBe("POLICY_FIELD_NOT_GRANTED");
    expect(QUERY_REFUSAL_STATUS[r.reason]).toBe(400);
    expect(r.detail).toEqual({
      rule: "FIELD_NOT_FILTERABLE",
      parameter: "filter.NetAmount.gt",
      field: "NetAmount",
      allowed: ["Order", "Customer", "CompanyCode", "CreationDate", "Status", "Flag", "Uuid"],
    });
    expect(r.message).toBe("filter.NetAmount: this interface does not allow filtering on NetAmount.");
  });

  it("5: a field the policy does not have at all, including __proto__", () => {
    expect(refused(`${CC}&filter.Secret.eq=1`).detail.field).toBe("Secret");
    expect(refused([["filter.CompanyCode.eq", "1"], ["filter.__proto__.eq", "1"]]).detail).toMatchObject({ rule: "FIELD_NOT_FILTERABLE", field: "__proto__" });
    expect(refused([["filter.CompanyCode.eq", "1"], ["filter.constructor.eq", "1"]]).detail.rule).toBe("FIELD_NOT_FILTERABLE");
  });

  it("6: an operator the field does not allow; a one-value in counts as eq", () => {
    expect(refused(`${CC}&filter.Status.gt=A`).detail).toEqual({ rule: "OPERATOR_NOT_ALLOWED", parameter: "filter.Status.gt", field: "Status", allowed: ["eq", "in"] });
    expect(refused("filter.CompanyCode.in=1010&filter.CompanyCode.in=1710").detail).toMatchObject({ rule: "OPERATOR_NOT_ALLOWED", parameter: "filter.CompanyCode.in" });
    expect(ok("filter.CompanyCode.in=1010").ast.filter).toEqual([{ f: "CompanyCode", op: "eq", v: { t: "S", v: "1010" } }]);
    expect(ok("filter.CompanyCode.in=1010&filter.CompanyCode.in=1010").ast.filter).toEqual([{ f: "CompanyCode", op: "eq", v: { t: "S", v: "1010" } }]);
  });

  it("the first failing rule answers", () => {
    // Rule 4 (select) before rule 5 (filter) before rule 8 (required filter).
    expect(refused("select=Secret&filter.NetAmount.gt=1").detail.rule).toBe("FIELD_NOT_SELECTABLE");
    expect(refused("filter.NetAmount.gt=1").detail.rule).toBe("FIELD_NOT_FILTERABLE");
    // Rule 5 for every field before rule 6 for any.
    expect(refused(`filter.Status.gt=A&filter.NetAmount.eq=1&${CC}`).detail.rule).toBe("FIELD_NOT_FILTERABLE");
  });
});

describe("rule 7: values", () => {
  it("parses each value for its field's type and facets, naming the parameter and never the value", () => {
    const r = refused(`${CC}&filter.CreationDate.ge=2026-02-30`);
    expect(r.reason).toBe("QUERY_INVALID");
    expect(r.detail).toEqual({ rule: "VALUE_INVALID", parameter: "filter.CreationDate.ge" });
    expect(r.message).toBe("filter.CreationDate.ge must be a date, YYYY-MM-DD.");
    const long = refused(`${CC}&filter.Customer.eq=12345678901`);
    expect(long.detail.rule).toBe("VALUE_TOO_LONG");
    expect(long.message).not.toContain("12345678901");
    expect(refused(`${CC}&filter.Flag.eq=yes`).detail.rule).toBe("VALUE_INVALID");
    expect(refused("key.Order=").detail).toMatchObject({ rule: "VALUE_INVALID", parameter: "key.Order" });
  });

  it("an empty string is a value for eq and in, not for a bound", () => {
    expect(ok(`${CC}&filter.Customer.eq=`).ast.filter).toContainEqual({ f: "Customer", op: "eq", v: { t: "S", v: "" } });
    const strings = basisOf([{ n: "Id" }, { n: "Name" }], ["Id"]);
    const p = prepared(strings, source({ filter: [{ field: "Name", ops: ["eq", "gt", "lt"] }] }));
    expect(refused("filter.Name.gt=", p).detail.rule).toBe("VALUE_INVALID");
  });
});

describe("rules 8 to 12", () => {
  it("8: a required filter must be constrained, with eq, in or both bounds", () => {
    const r = refused("filter.Customer.eq=1");
    expect(r.detail).toEqual({ rule: "FILTER_REQUIRED", field: "CompanyCode", allowed: ["CompanyCode"] });
    const ranged = prepared(BASIS, { ...SOURCE, requireFilterOn: ["CreationDate"] });
    expect(refused("filter.CreationDate.ge=2026-01-01", ranged).detail.rule).toBe("FILTER_REQUIRED");
    expect(ok("filter.CreationDate.ge=2026-01-01&filter.CreationDate.lt=2026-04-01", ranged).ast.filter).toHaveLength(1);
    const anyFilter = prepared(basisOf([{ n: "Id" }], ["Id"], { set: { requiresFilter: true } }), source({ filter: [{ field: "Id", ops: ["eq"] }] }));
    expect(refused("select=Id", anyFilter).detail.rule).toBe("FILTER_REQUIRED");
    expect(ok("filter.Id.eq=1", anyFilter).ast.filter).toHaveLength(1);
    // A key lookup is not a list: the required filter does not apply.
    expect(ok("key.Order=1").ast.kind).toBe("KEY");
  });

  it("9: orderby fields must be sortable", () => {
    expect(refused(`${CC}&orderby=-Status`).detail).toEqual({ rule: "FIELD_NOT_SORTABLE", parameter: "orderby", field: "Status", allowed: ["Order", "Customer", "CreationDate"] });
  });

  it("10: count needs the policy's count", () => {
    expect(refused(`${CC}&count=true`).detail.rule).toBe("COUNT_NOT_ALLOWED");
    expect(ok(`${CC}&count=false`).ast.count).toBe(false);
    expect(ok(`${CC}&count=true`, prepared(BASIS, { ...SOURCE, count: true })).ast.count).toBe(true);
  });

  it("11: pageSize above the maximum is refused, never clamped", () => {
    expect(refused(`${CC}&pageSize=501`).detail).toEqual({ rule: "PAGE_SIZE_NOT_ALLOWED", parameter: "pageSize" });
    expect(ok(`${CC}&pageSize=500`).ast.pageSize).toBe(500);
    expect(ok(CC).ast.pageSize).toBe(100);
  });

  it("12: a cursor needs a dataset that pages", () => {
    const single = prepared(basisOf([{ n: "Id" }], ["Id"], { set: { pageable: false } }));
    const r = refused("cursor=cec1.t1.x", single);
    expect(r.reason).toBe("QUERY_INVALID");
    expect(r.detail.rule).toBe("CURSOR_INVALID");
    expect(r.message).toBe(CURSOR_UNUSABLE_MESSAGE);
    expect(ok(`${CC}&cursor=cec1.t1.x`).ast.kind).toBe("LIST");
  });
});

describe("the AST and the projection", () => {
  it("is canonical whatever order the request came in", () => {
    const a = ok(
      `filter.Status.in=B&filter.Status.in=A&filter.Status.in=B&${CC}&filter.CreationDate.lt=2026-04-01&filter.CreationDate.ge=2026-01-01&select=Status,Order&orderby=-CreationDate,Order`,
    );
    const b = ok(`orderby=-CreationDate,Order&select=Order,Status&filter.CreationDate.ge=2026-01-01&filter.Status.in=A&filter.Status.in=B&filter.CreationDate.lt=2026-04-01&${CC}`);
    expect(a.ast).toEqual(b.ast);
    expect(a.ast).toEqual({
      v: 1,
      kind: "LIST",
      select: ["Order", "Status"],
      filter: [
        { f: "CompanyCode", op: "eq", v: { t: "S", v: "1010" } },
        {
          f: "CreationDate",
          op: "range",
          lo: { incl: true, v: { t: "DT", v: "2026-01-01T00:00:00" } },
          hi: { incl: false, v: { t: "DT", v: "2026-04-01T00:00:00" } },
        },
        { f: "Status", op: "in", vs: [{ t: "S", v: "A" }, { t: "S", v: "B" }] },
      ],
      orderby: [
        { f: "CreationDate", desc: true },
        { f: "Order", desc: false },
      ],
      key: null,
      count: false,
      pageSize: 100,
    });
    expect(a.project).toEqual(["Order", "Status"]);
  });

  it("collapses in values that are equal once canonical", () => {
    const r = ok(`${CC}&filter.Uuid.in=0050568D-393C-1EE8-AB8E-8E8E2B4C5B6A&filter.Uuid.in=0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a`);
    expect(r.ast.filter).toContainEqual({ f: "Uuid", op: "eq", v: { t: "G", v: "0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a" } });
  });

  it("with no select, projects every readable field in policy order", () => {
    expect(ok(CC).project).toEqual(POLICY.readable);
    expect(ok(CC).ast.select).toBeNull();
  });
});

describe("P1.5's allowed hook narrows every rule (T7)", () => {
  const scope = new Set(["Order", "CompanyCode", "CreationDate"]);

  it("read, filter, sort and key lookup all stay within readable ∩ allowed", () => {
    expect(refused(`${CC}&select=Customer`, POLICY, scope).detail).toMatchObject({ rule: "FIELD_NOT_SELECTABLE", allowed: ["Order", "CompanyCode", "CreationDate"] });
    expect(refused(`${CC}&filter.Customer.eq=1`, POLICY, scope).detail).toMatchObject({ rule: "FIELD_NOT_FILTERABLE", allowed: ["Order", "CompanyCode", "CreationDate"] });
    expect(refused(`${CC}&orderby=Customer`, POLICY, scope).detail).toMatchObject({ rule: "FIELD_NOT_SORTABLE", allowed: ["Order", "CreationDate"] });
    expect(ok(CC, POLICY, scope).project).toEqual(["Order", "CompanyCode", "CreationDate"]);
    expect(ok("key.Order=1", POLICY, scope).project).toEqual(["Order", "CompanyCode", "CreationDate"]);
    expect(refused("key.Order=1", POLICY, new Set(["CompanyCode"])).detail.rule).toBe("KEY_LOOKUP_NOT_ALLOWED");
    expect(refused("filter.Order.eq=1", POLICY, new Set(["Order"])).detail).toMatchObject({ rule: "FILTER_REQUIRED", field: "CompanyCode" });
  });
});

describe("refusals never carry a value", () => {
  it("for every rule exercised here", () => {
    const secret = "S3CR3T-VALUE";
    const probes = [
      `${CC}&filter.NetAmount.gt=${secret}`,
      `${CC}&filter.CreationDate.ge=${secret}`,
      `${CC}&filter.Status.gt=${secret}`,
      `filter.Customer.eq=${secret}`,
      `key.Order=${secret}&key.Extra=${secret}`,
    ];
    for (const q of probes) expect(JSON.stringify(refused(q))).not.toContain(secret);
  });

  it("caps allowed at 20 names", () => {
    const many = basisOf(Array.from({ length: 40 }, (_, i) => ({ n: `F${i}` })), ["F0"]);
    const p = preparedFrom(compiled(many, source({ filter: Array.from({ length: 30 }, (_, i) => ({ field: `F${i}`, ops: ["eq"] as const })) })));
    expect(refused("filter.F35.eq=1", p).detail.allowed).toHaveLength(20);
  });
});
