// @vitest-environment node
/**
 * The query basis and the policy compiler (P1.4, 3.5.3-3.5.6), against P1.3's
 * repository-written V2 and V4 descriptions and the customer-built Z* and
 * YY1_* ones (tests/fixtures/contracts/edmx), plus small inline documents for
 * what those do not carry: a draft-enabled entity and hostile names.
 *
 * Every compile rule; a Studio save refuses where a verify narrows; each
 * STALE reason; the draft pin; the 64 KiB bound; and `rev`, stable across a
 * no-op recompile and changed by an effective change.
 */

import { describe, expect, it } from "vitest";

import { basisFromEdmx, basisOf, compiled, source } from "../../helpers/odata-query";

import { queryBasisOf, parseQueryBasis, withSnapshot } from "@/lib/odata/basis";
import { compileQueryPolicy, policyChange, type CompileContext } from "@/lib/odata/policy-compiler";
import { parseCompiledPolicy, parseQueryPolicySource, type CompiledQueryPolicyV1, type QueryPolicySourceV1 } from "@/lib/odata/policy";
import type { QueryBasisV1 } from "@/lib/odata/basis";
import type { InterfaceContract } from "@/lib/contracts/ir";

const NOW = new Date("2026-10-27T10:00:00.000Z");

function ctx(basis: QueryBasisV1, mode: "save" | "verify", extra: Partial<CompileContext> = {}): CompileContext {
  return { mode, interface: { entitySet: basis.entitySet, odataVersion: basis.odata }, revision: 3, now: NOW, ...extra };
}

function verify(src: QueryPolicySourceV1, basis: QueryBasisV1, extra: Partial<CompileContext> = {}) {
  const r = compileQueryPolicy(src, basis, ctx(basis, "verify", extra));
  if (!r.ok) throw new Error("a verify never refuses");
  return r;
}

function save(src: QueryPolicySourceV1, basis: QueryBasisV1, extra: Partial<CompileContext> = {}) {
  return compileQueryPolicy(src, basis, ctx(basis, "save", extra));
}

const field = (c: CompiledQueryPolicyV1, n: string) => c.fields.find((f) => f.n === n);

const DRAFT_V4 = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="Z_DRAFT" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="TravelType">
        <Key><PropertyRef Name="TravelID"/><PropertyRef Name="IsActiveEntity"/></Key>
        <Property Name="TravelID" Type="Edm.String" Nullable="false" MaxLength="8"/>
        <Property Name="IsActiveEntity" Type="Edm.Boolean" Nullable="false"/>
        <Property Name="Description" Type="Edm.String" MaxLength="256"/>
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="Travel" EntityType="Z_DRAFT.TravelType"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

const HOSTILE_V2 = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <edmx:DataServices m:DataServiceVersion="2.0">
    <Schema Namespace="ZHOSTILE" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="Thing">
        <Key><PropertyRef Name="Id"/></Key>
        <Property Name="Id" Type="Edm.String" Nullable="false" MaxLength="10"/>
        <Property Name="a'b" Type="Edm.String"/>
        <Property Name="x&amp;$expand=y" Type="Edm.String"/>
        <Property Name="Straße" Type="Edm.String"/>
        <Property Name="__proto__" Type="Edm.String"/>
        <Property Name="${"L".repeat(200)}" Type="Edm.String"/>
        <Property Name="Plain" Type="Edm.String"/>
      </EntityType>
      <EntityContainer Name="C" m:IsDefaultEntityContainer="true">
        <EntitySet Name="Things" EntityType="ZHOSTILE.Thing"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

describe("the basis", () => {
  it("maps V2 types, facets and SAP's flags (business partner)", () => {
    const b = basisFromEdmx("business-partner.v2.xml", "A_Partner");
    const p = (n: string) => b.properties.find((x) => x.n === n)!;
    expect(b.odata).toBe("V2");
    expect(b.source).toBe("METADATA");
    expect(b.keys).toEqual(["Partner"]);
    expect(p("Partner")).toMatchObject({ t: "S", ml: 10, nullable: false });
    expect(p("BirthDate")).toMatchObject({ t: "DT", dateOnly: true });
    expect(p("PartnerUUID")).toMatchObject({ t: "G", filterable: false });
    expect(p("IsBlocked").t).toBe("B");
    expect(p("CreationTime").t).toBe("OTHER");
    expect(p("CreditLimit")).toMatchObject({ t: "D", p: 15, s: 2 });
    expect(p("ExternalRef")).toMatchObject({ t: "I64", filterable: false, sortable: false });
    expect(p("LastChangeDateTime").t).toBe("DTO");
    expect(p("EmployeeCount").t).toBe("I32");
    expect(b.properties.every((x) => x.bad === undefined)).toBe(true);
  });

  it("maps V4 types and folds the set's restrictions into properties (RAP sales order)", () => {
    const b = basisFromEdmx("sales-order-rap.v4.xml", "SalesOrder");
    const p = (n: string) => b.properties.find((x) => x.n === n)!;
    expect(b.odata).toBe("V4");
    expect(p("SalesOrder")).toMatchObject({ t: "S", ml: 10 });
    expect(p("RequestedDeliveryDate").t).toBe("DA");
    expect(p("ContactEmail").filterable).toBe(false);
    expect(p("Tags")).toMatchObject({ t: "OTHER", filterable: false, sortable: false });
    expect(p("NetValue").t).toBe("OTHER");
    expect(p("Status").t).toBe("OTHER");
    expect(p("DeliveryTime").t).toBe("OTHER");
    expect(p("ItemCount").t).toBe("I64");
    expect(p("CreatedAt").t).toBe("DTO");
  });

  it("carries the set's capabilities and SAP's required filters (YY1, z-travel)", () => {
    const yy1 = basisFromEdmx("yy1-sales-bonus.v2.xml", "YY1_SALESBONUS");
    expect(yy1.set.requiresFilter).toBe(true);
    expect(yy1.properties.find((x) => x.n === "FiscalYear")?.requiredInFilter).toBe(true);
    expect(yy1.properties.find((x) => x.n === "BonusRate")?.t).toBe("OTHER");
    const travel = basisFromEdmx("z-travel-booking.v2.xml", "BookingSet");
    expect(travel.set.pageable).toBe(false);
    expect(travel.keys).toEqual(["TravelId", "BookingId"]);
    expect(travel.properties.find((x) => x.n === "SeatCount")?.t).toBe("U8");
  });

  it("is the same from a Z* RAP service's CSDL XML and its CSDL JSON", () => {
    const xml = basisFromEdmx("z-bonus-plan-rap.v4.xml", "BonusPlan");
    const json = basisFromEdmx("z-bonus-plan-rap.v4.json", "BonusPlan");
    expect(json).toEqual(xml);
    expect(xml.keys).toEqual(["PlanUUID"]);
    expect(xml.properties.find((x) => x.n === "PlanUUID")?.t).toBe("G");
    const c = compiled(xml);
    expect(c.key).toEqual(["PlanUUID"]);
    expect(c.odata).toBe("V4");
  });

  it("marks a name CoreEdge cannot address as bad, and cuts it to 128 characters", () => {
    const b = basisFromEdmx(HOSTILE_V2, "Things");
    const bad = b.properties.filter((x) => x.bad === "NAME").map((x) => x.n);
    expect(bad).toEqual(["a'b", "x&$expand=y", "Straße", "__proto__", "L".repeat(128)]);
    expect(b.properties.find((x) => x.n === "Plain")?.bad).toBeUndefined();
  });

  it("drops labels first, then cuts and marks it too large", () => {
    const contract = (n: number, labelled: boolean): InterfaceContract => ({
      irVersion: 1,
      odataVersion: "V2",
      source: "METADATA",
      entitySet: { name: "Wide", entityType: "Z.Wide", capabilities: {} },
      entityType: {
        name: "Wide",
        qualifiedName: "Z.Wide",
        key: ["F0"],
        navigations: [],
        properties: Array.from({ length: n }, (_, i) => ({
          name: `F${i}_${"x".repeat(60)}`.slice(0, i === 0 ? 2 : 64),
          type: "Edm.String",
          nullable: true,
          ...(labelled ? { label: "y".repeat(200) } : {}),
        })),
      },
      complexTypes: [],
      enumTypes: [],
      operations: [],
    });
    const labelled = queryBasisOf(contract(900, true));
    expect(labelled.tooLarge).toBeUndefined();
    expect(labelled.properties.every((p) => p.label === undefined)).toBe(true);
    const small = queryBasisOf(contract(5, true));
    expect(small.properties[1]?.label).toHaveLength(80);
    const over = queryBasisOf(contract(1200, false));
    expect(over.tooLarge).toBe(true);
    expect(over.properties.length).toBeLessThanOrEqual(1000);
    expect(Buffer.byteLength(JSON.stringify(withSnapshot(over, { id: "s", semver: "1.0.0", contentHash: "f".repeat(64) })))).toBeLessThanOrEqual(128 * 1024);
  });

  it("reads back what it wrote, and nothing else", () => {
    const b = basisFromEdmx("sales-order-rap.v4.xml", "SalesOrder");
    expect(parseQueryBasis(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(parseQueryBasis({ ...b, v: 2 })).toBeNull();
    expect(parseQueryBasis({ ...b, properties: [{ ...b.properties[0], n: "a'b" }] })).toBeNull();
    expect(parseQueryBasis({ ...b, set: { addressable: true } })).toBeNull();
    expect(parseQueryBasis("nope")).toBeNull();
  });
});

describe("compiling: readable fields, filters and sorting", () => {
  const bp = () => basisFromEdmx("business-partner.v2.xml", "A_Partner");

  it("a '*' policy reads every addressable field, keys first-class", () => {
    const c = compiled(bp(), source({ filter: [{ field: "Partner", ops: ["eq", "in"] }], sort: ["Partner"] }));
    expect(c.state).toBe("READY");
    expect(c.allReadable).toBe(true);
    expect(c.key).toEqual(["Partner"]);
    expect(c.keyViaFilter).toBe(true);
    expect(c.paging).toBe("OFFSET");
    expect(c.tieBreak).toEqual(["Partner"]);
    expect(field(c, "Partner")).toEqual({ n: "Partner", t: "S", ml: 10, ops: ["eq", "in"], sort: true, key: true });
    expect(field(c, "CreationTime")).toEqual({ n: "CreationTime", t: "OTHER" });
    expect(c.rev).toMatch(/^qp1:[A-Za-z0-9_-]{22}$/);
  });

  it("a list of fields is kept in policy order and is not 'all readable'", () => {
    const c = compiled(bp(), source({ select: ["LastName", "Partner", "FirstName"] }));
    expect(c.fields.map((f) => f.n)).toEqual(["LastName", "Partner", "FirstName"]);
    expect(c.allReadable).toBe(false);
  });

  it("in implies eq; a Boolean offers eq only; ops come out in a fixed order", () => {
    const c = compiled(bp(), source({ filter: [{ field: "Partner", ops: ["in"] }, { field: "IsBlocked", ops: ["in", "gt"] }, { field: "CreditLimit", ops: ["le", "ge", "eq"] }] }));
    expect(field(c, "Partner")?.ops).toEqual(["eq", "in"]);
    expect(field(c, "IsBlocked")?.ops).toEqual(["eq"]);
    expect(field(c, "CreditLimit")?.ops).toEqual(["eq", "ge", "le"]);
  });

  it.each([
    ["a field the contract does not have", source({ select: ["Partner", "Nope"] }), "FIELD_MISSING", "Nope"],
    ["a filter on a field that is not readable", source({ select: ["Partner"], filter: [{ field: "LastName", ops: ["eq"] }] }), "NOT_READABLE", "LastName"],
    ["a filter on a type CoreEdge cannot write", source({ filter: [{ field: "CreationTime", ops: ["eq"] }] }), "TYPE_NOT_FILTERABLE", "CreationTime"],
    ["a filter SAP refuses", source({ filter: [{ field: "PartnerUUID", ops: ["eq"] }] }), "SAP_NOT_FILTERABLE", "PartnerUUID"],
    ["a sort SAP refuses", source({ sort: ["ExternalRef"] }), "SAP_NOT_SORTABLE", "ExternalRef"],
    ["a sort on a field that is not readable", source({ select: ["Partner"], sort: ["LastName"] }), "NOT_READABLE", "LastName"],
    ["a required filter that cannot be satisfied", source({ requireFilterOn: ["LastName"], filter: [{ field: "LastName", ops: ["gt"] }] }), "REQUIRED_NOT_FILTERABLE", "LastName"],
  ])("a save refuses %s, and a verify narrows it", (_label, src, rule, name) => {
    const refused = save(src, bp());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.errors.map((e) => e.rule)).toContain(rule);
    expect(refused.errors.find((e) => e.rule === rule)?.message).toContain(name);
    const narrowed = verify(src, bp());
    expect(narrowed.compiled.state).toBe("READY");
    expect(narrowed.narrowed.join(" ")).toContain(name);
  });

  it("a verify keeps what is still allowed when it narrows", () => {
    const r = verify(source({ filter: [{ field: "PartnerUUID", ops: ["eq"] }, { field: "Partner", ops: ["eq"] }] }), bp());
    expect(field(r.compiled, "PartnerUUID")?.ops).toBeUndefined();
    expect(field(r.compiled, "Partner")?.ops).toEqual(["eq"]);
    expect(r.compiled.warnings.length).toBeGreaterThan(0);
  });
});

describe("compiling: required filters, keys, paging, count", () => {
  it("SAP's required-in-filter must be satisfiable: a save refuses, a verify goes stale", () => {
    const yy1 = basisFromEdmx("yy1-sales-bonus.v2.xml", "YY1_SALESBONUS");
    const without = source({ filter: [{ field: "SalesEmployee", ops: ["eq"] }] });
    const refused = save(without, yy1);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors[0]?.message).toContain("SAP requires a filter on FiscalYear");
    const stale = verify(without, yy1);
    expect(stale.compiled.state).toBe("STALE");
    expect(stale.compiled.stale?.reason).toBe("KEY_CHANGED");
    expect(stale.warnings[0]).toContain("SAP now requires a filter on FiscalYear");
    const ok = compiled(yy1, source({ filter: [{ field: "FiscalYear", ops: ["eq"] }] }));
    expect(ok.requireFilterOn).toEqual(["FiscalYear"]);
    expect(ok.requiresAnyFilter).toBe(true);
    expect(field(ok, "BonusAmount")?.ops).toBeUndefined();
  });

  it("the builder's required filters are added to SAP's", () => {
    const yy1 = basisFromEdmx("yy1-sales-bonus.v2.xml", "YY1_SALESBONUS");
    const c = compiled(yy1, source({ filter: [{ field: "FiscalYear", ops: ["eq"] }, { field: "SalesEmployee", ops: ["ge", "lt"] }], requireFilterOn: ["SalesEmployee", "FiscalYear"] }));
    expect(c.requireFilterOn).toEqual(["FiscalYear", "SalesEmployee"]);
  });

  it("a set SAP does not page is SINGLE, its row cap the page maximum (z-travel)", () => {
    const c = compiled(basisFromEdmx("z-travel-booking.v2.xml", "BookingSet"));
    expect(c.paging).toBe("SINGLE");
    expect(c.tieBreak).toEqual([]);
    expect(c.page.rowCap).toBe(c.page.maxSize);
    expect(c.warnings).toContain("SAP does not support paging on this dataset.");
    expect(c.key).toEqual(["TravelId", "BookingId"]);
  });

  it("an effective-dated composite key (SuccessFactors style)", () => {
    const c = compiled(basisFromEdmx("successfactors-style.v2.xml", "cust_TravelRequest"));
    expect(c.key).toEqual(["externalCode", "effectiveStartDate"]);
    expect(field(c, "effectiveStartDate")).toMatchObject({ t: "DT", dateOnly: true, key: true });
    expect(c.tieBreak).toEqual(["externalCode", "effectiveStartDate"]);
  });

  it("key lookup: refused at save, turned off at verify, when SAP does not address the set", () => {
    const b = basisOf([{ n: "Id" }, { n: "Name" }], ["Id"], { set: { addressable: false } });
    expect(save(source(), b).ok).toBe(false);
    const r = verify(source(), b);
    expect(r.compiled.key).toBeNull();
    expect(r.narrowed.join(" ")).toContain("Key lookup turned off");
    expect(compiled(b, source({ keyLookup: false })).key).toBeNull();
  });

  it("key lookup needs every key part readable and of a type with a literal (not Boolean)", () => {
    expect(save(source({ select: ["Name"] }), basisOf([{ n: "Id" }, { n: "Name" }], ["Id"])).ok).toBe(false);
    expect(save(source(), basisOf([{ n: "Flag", t: "B" }, { n: "Name" }], ["Flag"])).ok).toBe(false);
    expect(save(source(), basisOf([{ n: "Blob", t: "OTHER" }], ["Blob"])).ok).toBe(false);
  });

  it("the key-as-filter fallback needs every key part SAP-filterable and $top", () => {
    expect(compiled(basisOf([{ n: "Id" }], ["Id"])).keyViaFilter).toBe(true);
    expect(compiled(basisOf([{ n: "Id", filterable: false }], ["Id"])).keyViaFilter).toBe(false);
    const noTop = compiled(basisOf([{ n: "Id" }], ["Id"], { set: { topSupported: false } }));
    expect(noTop.keyViaFilter).toBe(false);
    expect(noTop.topSupported).toBe(false);
    expect(noTop.paging).toBe("SINGLE");
  });

  it("paging needs the key readable and SAP-sortable", () => {
    expect(compiled(basisOf([{ n: "Id", sortable: false }, { n: "X" }], ["Id"]), source({ keyLookup: false })).paging).toBe("SINGLE");
    expect(compiled(basisOf([{ n: "X" }], []), source({ keyLookup: false })).paging).toBe("SINGLE");
  });

  it("count: refused at save, turned off at verify, when SAP does not count", () => {
    const b = basisOf([{ n: "Id" }], ["Id"], { set: { countable: false } });
    expect(save(source({ count: true }), b).ok).toBe(false);
    expect(verify(source({ count: true }), b).compiled.count).toBe(false);
    expect(compiled(basisOf([{ n: "Id" }], ["Id"]), source({ count: true })).count).toBe(true);
  });

  it("selectSupported follows SAP's flag", () => {
    expect(compiled(basisOf([{ n: "Id" }], ["Id"], { set: { selectSupported: false } })).selectSupported).toBe(false);
    expect(compiled(basisOf([{ n: "Id" }], ["Id"])).selectSupported).toBe(true);
  });
});

describe("the draft pin (D20)", () => {
  it("pins IsActiveEntity = true on V4 and leaves it out of the key and the tie-break", () => {
    const c = compiled(basisFromEdmx(DRAFT_V4, "Travel"), source({ filter: [{ field: "IsActiveEntity", ops: ["eq"] }, { field: "TravelID", ops: ["eq"] }] }));
    expect(c.pinned).toEqual([{ f: "IsActiveEntity", v: { t: "B", v: "true" } }]);
    expect(c.key).toEqual(["TravelID"]);
    expect(c.tieBreak).toEqual(["TravelID"]);
    expect(field(c, "IsActiveEntity")?.ops).toBeUndefined();
    expect(c.warnings.join(" ")).toContain("Drafts are never served");
  });

  it("is V4 only", () => {
    const v2 = basisOf([{ n: "Id" }, { n: "IsActiveEntity", t: "B" }], ["Id", "IsActiveEntity"], { odata: "V2" });
    const r = save(source(), v2);
    // On V2 a Boolean key part is not pinned, and so cannot be addressed by key.
    expect(r.ok).toBe(false);
    expect(compiled(v2, source({ keyLookup: false })).pinned).toEqual([]);
  });
});

describe("hostile names", () => {
  it("are never readable, filterable, sortable or emitted", () => {
    const b = basisFromEdmx(HOSTILE_V2, "Things");
    const c = compiled(b);
    expect(c.fields.map((f) => f.n)).toEqual(["Id", "Plain"]);
    expect(c.allReadable).toBe(true);
    const text = JSON.stringify(c);
    for (const bad of ["a'b", "expand", "Straße", "__proto__", "LLLL"]) expect(text).not.toContain(bad);
    const listed = save({ ...source(), select: ["Id", "a'b"] }, b);
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(JSON.stringify(listed.errors)).not.toContain("a'b is");
    expect(parseQueryPolicySource({ ...source(), select: ["Id", "a'b"] }).ok).toBe(false);
    expect(parseQueryPolicySource({ ...source(), select: ["__proto__"] }).ok).toBe(false);
  });
});

describe("STALE reasons", () => {
  const b = () => basisOf([{ n: "Id" }, { n: "Name" }], ["Id"]);

  it.each([
    ["NOT_METADATA", { ...b(), source: "SAMPLED" as const }, {}],
    ["SINGLETON", { ...b(), set: { singleton: true as const } }, {}],
    ["BASIS_TOO_LARGE", { ...b(), tooLarge: true as const }, {}],
    ["ENTITY_SET_CHANGED", b(), { interface: { entitySet: "Other", odataVersion: "V2" as const } }],
    ["VERSION_CHANGED", b(), { interface: { entitySet: "Orders", odataVersion: "V4" as const } }],
  ])("%s: a verify goes stale, a save refuses", (reason, basis, extra) => {
    const v = verify(source(), basis, extra);
    expect(v.compiled.state).toBe("STALE");
    expect(v.compiled.stale).toEqual({ reason, at: NOW.toISOString() });
    expect(v.compiled.fields).toEqual([]);
    const s = save(source(), basis, extra);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.errors[0]?.rule).toBe(reason);
  });

  it("KEY_CHANGED: a verify that finds another key, and it stays stale until a save", () => {
    const before = compiled(b());
    const rekeyed = basisOf([{ n: "Id" }, { n: "Name" }, { n: "Line" }], ["Id", "Line"]);
    const r = verify(source(), rekeyed, { previous: before });
    expect(r.compiled.state).toBe("STALE");
    expect(r.compiled.stale?.reason).toBe("KEY_CHANGED");
    const again = verify(source(), rekeyed, { previous: r.compiled, now: new Date("2026-10-28T00:00:00.000Z") });
    expect(again.compiled.stale).toEqual(r.compiled.stale);
    const saved = save(source(), rekeyed, { previous: r.compiled });
    expect(saved.ok && saved.compiled.state).toBe("READY");
    // The same key: no change.
    expect(verify(source(), b(), { previous: before }).compiled.state).toBe("READY");
  });

  it("a stale policy reads back, and a call sees it as STALE", () => {
    const v = verify(source(), { ...b(), source: "SAMPLED" });
    const p = parseCompiledPolicy(JSON.parse(JSON.stringify(v.compiled)));
    expect("unreadable" in p).toBe(false);
    if (!("unreadable" in p)) expect(p.compiled.state).toBe("STALE");
  });
});

describe("bounds and the revision", () => {
  it("the compiled JSON is at most 64 KiB: a save refuses, a verify goes stale", () => {
    const props = Array.from({ length: 600 }, (_, i) => ({ n: `Field_${String(i).padStart(3, "0")}_${"x".repeat(90)}` }));
    const wide = basisOf(props, [props[0]!.n]);
    expect(Buffer.byteLength(JSON.stringify(wide))).toBeLessThan(128 * 1024);
    const src = source({ filter: props.slice(0, 128).map((p) => ({ field: p.n, ops: ["eq", "in", "gt", "ge", "lt", "le"] as const })), sort: props.slice(0, 128).map((p) => p.n) });
    const s = save(src, wide);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.errors[0]?.message).toContain("make fewer fields readable");
    expect(verify(src, wide).compiled.stale?.reason).toBe("BASIS_TOO_LARGE");
  });

  it("rev is stable across a no-op recompile and changes with an effective change", () => {
    const b = basisFromEdmx("sales-order-rap.v4.xml", "SalesOrder");
    const src = source({ filter: [{ field: "SoldToParty", ops: ["eq", "in"] }], sort: ["SalesOrder"] });
    const first = compiled(b, src, 1);
    const later = verify(src, b, { revision: 7, now: new Date("2027-01-01T00:00:00.000Z"), previous: first }).compiled;
    expect(later.rev).toBe(first.rev);
    expect(later.revision).toBe(7);
    expect(compiled(b, { ...src, filter: [{ field: "SoldToParty", ops: ["eq"] }] }).rev).not.toBe(first.rev);
    expect(compiled(b, { ...src, page: { ...src.page, maxSize: 400 } }).rev).not.toBe(first.rev);
    expect(compiled(b, src).rev).toBe(first.rev);
  });

  it("reads back through parseCompiledPolicy, and a tampered copy never widens it", () => {
    const b = basisFromEdmx("business-partner.v2.xml", "A_Partner");
    const c = compiled(b, source({ filter: [{ field: "Partner", ops: ["eq"] }], page: { defaultSize: 7, maxSize: 77, rowCap: 777, byteCap: 300_000 } }));
    const widen = () => {
      const copy = JSON.parse(JSON.stringify(c)) as { fields: { n: string; ops?: string[] }[] };
      copy.fields.find((f) => f.n === "LastName")!.ops = ["eq"];
      return copy;
    };
    // Never seen before: its rev does not match its content, so it is not one the compiler wrote.
    expect(parseCompiledPolicy(widen())).toEqual({ unreadable: true });
    expect(parseCompiledPolicy({ ...JSON.parse(JSON.stringify(c)), rev: "qp1:AAAAAAAAAAAAAAAAAAAAAA" })).toEqual({ unreadable: true });
    const p = parseCompiledPolicy(JSON.parse(JSON.stringify(c)));
    expect("unreadable" in p).toBe(false);
    // Once the genuine policy is cached by its rev, a copy claiming that rev
    // is served the genuine content: equal revs are equal content.
    const again = parseCompiledPolicy(widen());
    expect("unreadable" in again ? null : again.fields.get("LastName")?.ops).toBeUndefined();
  });
});

describe("what a save changes (3.5.8)", () => {
  it("widening the bulk limits or turning count on is recorded; narrowing is listed", () => {
    const b = basisOf([{ n: "Id" }, { n: "Name" }], ["Id"]);
    const before = compiled(b, source({ filter: [{ field: "Name", ops: ["eq", "in"] }] }));
    const after = compiled(b, source({ count: true, page: { defaultSize: 100, maxSize: 600, rowCap: 20_000, byteCap: 4_000_000 } }));
    const change = policyChange(before, after);
    expect(change.widened).toEqual(["rowCap 20000", "maxSize 600", "count"]);
    expect(change.narrowed).toEqual(["Name eq", "Name in"]);
    expect(policyChange(null, compiled(b)).widened).toEqual([]);
  });

  /*
   * On a dataset that cannot be paged the compiled row cap is the page size,
   * so a save asking for 100,000 compiled to 500 and was an UPDATE; a later
   * verify that finds the dataset pageable compiles the 100,000, and no
   * PROMOTE row ever recorded it. The row cap asked for is what is compared.
   */
  it("a row cap asked for above 10,000 is a widening even while the dataset cannot page", () => {
    const bulk = source({ page: { defaultSize: 100, maxSize: 500, rowCap: 100_000, byteCap: 4_000_000 } });
    const single = basisOf([{ n: "Id" }, { n: "Name" }], ["Id"], { set: { pageable: false } });
    const r = save(bulk, single);
    if (!r.ok) throw new Error("refused");
    const saved = r.compiled;
    expect(saved).toMatchObject({ paging: "SINGLE", page: { rowCap: 500 } });
    expect(policyChange(null, saved).widened).toEqual([]);
    expect(policyChange(null, saved, { before: null, after: bulk }).widened).toEqual(["rowCap 100000"]);
    // Saving the same request again widens nothing; a verify cannot raise the cap past it.
    expect(policyChange(saved, saved, { before: bulk, after: bulk }).widened).toEqual([]);
    const pageable = verify(bulk, basisOf([{ n: "Id" }, { n: "Name" }], ["Id"]), { previous: saved }).compiled;
    expect(pageable).toMatchObject({ paging: "OFFSET", page: { rowCap: 100_000 } });
    expect(pageable.page.rowCap).toBeLessThanOrEqual(bulk.page.rowCap);
  });
});
