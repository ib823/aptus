// @vitest-environment node
/**
 * The compiler parses whatever a customer's SAP connection answers, so these
 * are the documents built to hurt the process that reads them (xml.ts).
 * Each must be refused with its own reason, quickly, without expanding,
 * fetching or recursing into anything.
 */

import { describe, expect, it } from "vitest";

import { contractDigest, MAX_CONTRACT_BYTES } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { buildContractSchemas, standaloneSchemas } from "@/lib/contracts/json-schema";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { DEFAULT_XML_LIMITS, parseXml } from "@/lib/contracts/xml";
import { buildTypeScriptClient } from "@/lib/studio/scaffold";

const EDMX_HEAD =
  '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
  '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">';
const EDMX_TAIL = "</Schema></edmx:DataServices></edmx:Edmx>";

function reason(input: string, limits = DEFAULT_XML_LIMITS): string {
  const r = compileContract(input, limits);
  return r.ok ? "OK" : r.reason;
}

describe("entity expansion and external entities", () => {
  it("refuses a billion-laughs document before an entity can be declared", () => {
    const lol =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">' +
      Array.from({ length: 9 }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i === 0 ? "" : i};`.repeat(10)}">`).join("") +
      `]>${EDMX_HEAD}<EntityType Name="T"><Property Name="P" Type="Edm.String" DefaultValue="&lol9;"/></EntityType>${EDMX_TAIL}`;
    const started = performance.now();
    expect(reason(lol)).toBe("DOCTYPE_REFUSED");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("refuses an external entity (XXE) for the same reason, and fetches nothing", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]>${EDMX_HEAD}<EntityType Name="&ext;"/>${EDMX_TAIL}`;
    expect(reason(xxe)).toBe("DOCTYPE_REFUSED");
  });

  it("does not expand an entity a document uses without declaring it", () => {
    expect(reason(`${EDMX_HEAD}<EntityType Name="&undeclared;"/>${EDMX_TAIL}`)).toBe("NOT_WELL_FORMED");
  });

  it("still reads the five predefined entities, which are not expansion", () => {
    const r = compileContract(
      `${EDMX_HEAD}<EntityType Name="T"><Key><PropertyRef Name="P"/></Key><Property Name="P" Type="Edm.String" Nullable="false" DefaultValue="a&amp;b&lt;c"/></EntityType>` +
        `<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>${EDMX_TAIL}`,
    );
    expect(r.ok && r.ir.entityTypes[0]?.properties[0]?.defaultValue).toBe("a&b<c");
  });
});

describe("size, depth and floods", () => {
  it("refuses a document over the byte bound before parsing it", () => {
    const limits = { ...DEFAULT_XML_LIMITS, maxBytes: 1024 };
    expect(reason(`${EDMX_HEAD}${" ".repeat(2048)}${EDMX_TAIL}`, limits)).toBe("TOO_LARGE");
    expect(reason(`{"$Version":"4.0","x":"${"y".repeat(2048)}"}`, limits)).toBe("TOO_LARGE");
  });

  it("the default bound is the verify's own 8 MB", () => {
    expect(DEFAULT_XML_LIMITS.maxBytes).toBe(8 * 1024 * 1024);
  });

  it("refuses nesting deeper than the bound", () => {
    const deep = `${"<a>".repeat(200)}${"</a>".repeat(200)}`;
    expect(reason(deep)).toBe("TOO_DEEP");
  });

  it("refuses an element flood", () => {
    const limits = { ...DEFAULT_XML_LIMITS, maxElements: 1000 };
    expect(reason(`<r>${"<e/>".repeat(5000)}</r>`, limits)).toBe("TOO_MANY_ELEMENTS");
  });

  it("refuses an attribute flood on one element", () => {
    const attrs = Array.from({ length: 500 }, (_, i) => `a${i}="1"`).join(" ");
    expect(reason(`<r ${attrs}/>`)).toBe("TOO_MANY_ATTRIBUTES");
  });

  it("keeps a bounded amount of text per element", () => {
    const limits = { ...DEFAULT_XML_LIMITS, maxTextPerElement: 16 };
    const r = parseXml(`<r>${"x".repeat(10_000)}</r>`, limits);
    expect(r.ok && r.root.text.length).toBe(16);
  });

  it("stays linear on the input that made the regex readers quadratic", () => {
    // `<EntitySet <EntitySet …` with no `>`: one pass, refused as malformed.
    const hostile = `${EDMX_HEAD}${"<EntitySet ".repeat(200_000)}${EDMX_TAIL}`;
    const started = performance.now();
    expect(reason(hostile)).toBe("NOT_WELL_FORMED");
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("survives JSON nested past any sane depth", () => {
    const deep = `{"$Version":"4.0","ns":${"[".repeat(100_000)}${"]".repeat(100_000)}}`;
    // Either the parser refuses it or the reader finds no schema in it; it never throws.
    expect(["NOT_WELL_FORMED", "INVALID_CSDL"]).toContain(reason(deep));
  });

  it("reads annotation values in CSDL JSON to a bounded depth", () => {
    let nested = '"leaf"';
    for (let i = 0; i < 5000; i++) nested = `{"a":${nested}}`;
    const doc = `{"$Version":"4.0","ns":{"T":{"$Kind":"EntityType","$Key":["P"],"P":{},"@Org.OData.Core.V1.Description":${nested}}}}`;
    expect(reason(doc)).toBe("OK");
  });
});

describe("documents that are not service descriptions", () => {
  it.each([
    ["empty", "   ", "EMPTY"],
    ["not XML", "<html><body>login</body", "NOT_WELL_FORMED"],
    ["an HTML login page", "<html><body>Sign in</body></html>", "NOT_EDMX"],
    ["an EDMX of an unknown version", '<edmx:Edmx Version="3.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"/>', "UNSUPPORTED_VERSION"],
    ["an EDMX without DataServices", '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"/>', "INVALID_CSDL"],
    ["an undeclared namespace prefix", '<edmx:Edmx Version="4.0"/>', "NOT_WELL_FORMED"],
    ["JSON that is not CSDL", '{"hello":"world"}', "NOT_EDMX"],
    ["CSDL JSON of an unsupported version", '{"$Version":"2.0"}', "UNSUPPORTED_VERSION"],
  ])("%s → %s", (_label, input, expected) => {
    expect(reason(input)).toBe(expected);
  });

  it("never echoes the document in its answer", () => {
    const secret = "TOP-SECRET-TENANT-VALUE";
    for (const input of [`<x>${secret}`, `{"${secret}":`, `<html>${secret}</html>`]) {
      const r = compileContract(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.detail).not.toContain(secret);
    }
  });
});

/*
 * Documents that pass every parser bound (bytes, depth, elements) and are
 * still built to stall the request that compiles them: the verify route
 * compiles and slices synchronously, and the kit renders on every download.
 * Each took ten to twenty seconds at these sizes — a fraction of the 8 MB
 * bound — when a lookup was a scan, and a few hundred milliseconds after. The
 * budget leaves room for a loaded CI machine and none for the quadratic one.
 */
describe("descriptions that make a lookup quadratic", () => {
  const BUDGET_MS = 5000;
  const timed = <T>(fn: () => T): { value: T; ms: number } => {
    const started = performance.now();
    const value = fn();
    return { value, ms: performance.now() - started };
  };

  it("many bound overloads of one name, each imported (CSDL XML)", () => {
    const n = 20_000;
    const doc =
      EDMX_HEAD +
      '<Function Name="f" IsBound="true"/>'.repeat(n) +
      '<EntityContainer Name="C">' +
      Array.from({ length: n }, (_, i) => `<FunctionImport Name="i${i}" Function="ns.f"/>`).join("") +
      "</EntityContainer>" +
      EDMX_TAIL;
    const { value, ms } = timed(() => compileContract(doc));
    expect(value.ok).toBe(true);
    // None is unbound, so no import names an operation.
    expect(value.ok && value.ir.operations.some((o) => o.name.startsWith("i"))).toBe(false);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("many bound overloads of one name, each imported (CSDL JSON)", () => {
    const n = 40_000;
    const container: Record<string, unknown> = { $Kind: "EntityContainer" };
    for (let i = 0; i < n; i++) container[`i${i}`] = { $Function: "ns.f" };
    const doc = JSON.stringify({
      $Version: "4.0",
      ns: { f: Array.from({ length: n }, () => ({ $Kind: "Function", $IsBound: true })), C: container },
    });
    const { value, ms } = timed(() => compileContract(doc));
    expect(value.ok).toBe(true);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  // Every import carries its operation's parameters, so P parameters imported
  // M times were P×M objects: 9,000,000 from 300 KB, and a heap exhausted on
  // the verify request from under 1 MB.
  const P = 3000;
  const M = 3000;

  it("one action with many parameters, imported many times, is refused (CSDL XML)", () => {
    const doc =
      EDMX_HEAD +
      `<Action Name="a">${Array.from({ length: P }, (_, i) => `<Parameter Name="p${i}" Type="Edm.String"/>`).join("")}</Action>` +
      `<EntityContainer Name="C">${Array.from({ length: M }, (_, i) => `<ActionImport Name="i${i}" Action="ns.a"/>`).join("")}</EntityContainer>` +
      EDMX_TAIL;
    expect(doc.length).toBeLessThan(DEFAULT_XML_LIMITS.maxBytes);
    const { value, ms } = timed(() => compileContract(doc));
    expect(value).toMatchObject({ ok: false, reason: "TOO_MANY_MEMBERS" });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("the same in CSDL JSON", () => {
    const container: Record<string, unknown> = { $Kind: "EntityContainer" };
    for (let i = 0; i < M; i++) container[`i${i}`] = { $Action: "ns.a" };
    const doc = JSON.stringify({
      $Version: "4.0",
      ns: {
        a: [{ $Kind: "Action", $Parameter: Array.from({ length: P }, (_, i) => ({ $Name: `p${i}` })) }],
        C: container,
      },
    });
    const { value, ms } = timed(() => compileContract(doc));
    expect(value).toMatchObject({ ok: false, reason: "TOO_MANY_MEMBERS" });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("an action imported a few times still carries its parameters in each import", () => {
    const doc =
      EDMX_HEAD +
      '<Action Name="a"><Parameter Name="x" Type="Edm.String"/><Parameter Name="y" Type="Edm.Int32"/></Action>' +
      '<EntityContainer Name="C"><ActionImport Name="one" Action="ns.a"/><ActionImport Name="two" Action="ns.a"/></EntityContainer>' +
      EDMX_TAIL;
    const r = compileContract(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.operations.map((o) => [o.name, o.parameters.map((p) => p.name)])).toEqual([
      ["one", ["x", "y"]],
      ["two", ["x", "y"]],
    ]);
  });

  it("many complex types over one large base type: the slice is refused, not multiplied", () => {
    // Each derived type folded its own copy of the base: N×B properties from
    // N+B declarations — 4,000,000 here, a 210 MB contract from 250 KB.
    const n = 2000;
    const doc =
      EDMX_HEAD +
      `<ComplexType Name="Base">${Array.from({ length: n }, (_, i) => `<Property Name="b${i}" Type="Edm.String"/>`).join("")}</ComplexType>` +
      Array.from({ length: n }, (_, i) => `<ComplexType Name="c${i}" BaseType="ns.Base"/>`).join("") +
      '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      Array.from({ length: n }, (_, i) => `<Property Name="p${i}" Type="ns.c${i}"/>`).join("") +
      '</EntityType><EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>' +
      EDMX_TAIL;
    const r = compileContract(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { value, ms } = timed(() => sliceForEntitySet(r.ir, "S"));
    expect(value).toMatchObject({ ok: false, reason: "TOO_LARGE" });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("an import still names the first unbound overload, after bound ones of the same name", () => {
    const doc =
      EDMX_HEAD +
      '<Function Name="f" IsBound="true"><Parameter Name="it" Type="ns.T"/><ReturnType Type="Edm.Int32"/></Function>' +
      '<Function Name="f"><Parameter Name="x" Type="Edm.String"/><ReturnType Type="Edm.String"/></Function>' +
      '<Function Name="f"><ReturnType Type="Edm.Boolean"/></Function>' +
      '<EntityType Name="T"><Key><PropertyRef Name="K"/></Key><Property Name="K" Type="Edm.String" Nullable="false"/></EntityType>' +
      '<EntityContainer Name="C"><FunctionImport Name="callF" Function="ns.f"/></EntityContainer>' +
      EDMX_TAIL;
    const r = compileContract(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const imported = r.ir.operations.find((o) => o.name === "callF");
    expect(imported).toMatchObject({ kind: "function", parameters: [{ name: "x" }], returnType: { type: "Edm.String" } });
  });

  it("a set-level restriction listing as many paths as the type has properties", () => {
    const n = 40_000;
    const doc =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">' +
      '<edmx:Reference Uri="x"><edmx:Include Namespace="Org.OData.Capabilities.V1" Alias="Capabilities"/></edmx:Reference>' +
      '<edmx:DataServices><Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
      '<EntityType Name="T"><Key><PropertyRef Name="p0"/></Key>' +
      Array.from({ length: n }, (_, i) => `<Property Name="p${i}" Type="Edm.String"/>`).join("") +
      '</EntityType><EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>' +
      '<Annotations Target="ns.C/S"><Annotation Term="Capabilities.FilterRestrictions"><Record>' +
      '<PropertyValue Property="NonFilterableProperties"><Collection>' +
      Array.from({ length: n }, (_, i) => `<PropertyPath>q${i}</PropertyPath>`).join("") +
      "<PropertyPath>p1</PropertyPath></Collection></PropertyValue></Record></Annotation></Annotations>" +
      EDMX_TAIL;
    const r = compileContract(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { value, ms } = timed(() => sliceForEntitySet(r.ir, "S"));
    expect(value.ok).toBe(true);
    // The one path that names a property is still folded in.
    expect(value.ok && value.contract.entityType.properties.find((p) => p.name === "p1")?.capabilities).toEqual({ filterable: false });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("one complex type per property, through the slice and the starter kit's client", () => {
    const n = 60_000;
    const doc =
      EDMX_HEAD +
      Array.from({ length: n }, (_, i) => `<ComplexType Name="c${i}"/>`).join("") +
      '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      Array.from({ length: n }, (_, i) => `<Property Name="p${i}" Type="ns.c${i}"/>`).join("") +
      '</EntityType><EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>' +
      EDMX_TAIL;
    const r = compileContract(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const slice = timed(() => sliceForEntitySet(r.ir, "S"));
    expect(slice.ms).toBeLessThan(BUDGET_MS);
    if (!slice.value.ok) throw new Error(slice.value.detail);
    expect(slice.value.contract.complexTypes).toHaveLength(n);
    const contract = slice.value.contract;
    const kit = timed(() =>
      buildTypeScriptClient({
        id: "if_1",
        name: "x",
        externalId: "custom:/sap/opu/odata4/sap/zx/srvd/sap/zx/0001",
        sapProduct: "s4hana",
        operation: "READ",
        entitySet: "S",
        version: 1,
        solutionName: "s",
        compiled: { semver: "1.0.0", snapshotId: "snap", contentHash: "0", compiledAt: "2026-10-20T00:00:00.000Z", contract },
      }),
    );
    expect(kit.value).toContain("p59999?: Record<string, unknown> | null;");
    expect(kit.ms).toBeLessThan(BUDGET_MS);
  });
});

/*
 * P1 wave A integration review: documents that pass every compiler bound and
 * still hurt what reads the compiled contract back.
 */
describe("compiled contracts that are expensive to read back", () => {
  const BUDGET_MS = 5000;
  const timed = <T>(fn: () => T): { value: T; ms: number } => {
    const started = performance.now();
    const value = fn();
    return { value, ms: performance.now() - started };
  };

  it("thousands of types sharing one Name get their component names in linear time", () => {
    // Each type probed one suffix per earlier namesake: 36 s of CPU at this
    // size, paid on every GET /schema, every OpenAPI build and every kit.
    const n = 30_000;
    const doc =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
      '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm"><EntityType Name="E"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      Array.from({ length: n }, (_, i) => `<Property Name="p${i}" Type="n${i}.T"/>`).join("") +
      '</EntityType><EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.E"/></EntityContainer></Schema>' +
      Array.from({ length: n }, (_, i) => `<Schema Namespace="n${i}" xmlns="http://docs.oasis-open.org/odata/ns/edm"><ComplexType Name="T"/></Schema>`).join("") +
      "</edmx:DataServices></edmx:Edmx>";
    const r = compileContract(doc);
    if (!r.ok) throw new Error(r.detail);
    const slice = sliceForEntitySet(r.ir, "S");
    if (!slice.ok) throw new Error(slice.detail);
    // Small enough to be stored, so this is what /schema would serve.
    expect(contractDigest(slice.contract).bytes).toBeLessThan(MAX_CONTRACT_BYTES);
    const built = timed(() => standaloneSchemas(slice.contract, "S"));
    expect(built.ms).toBeLessThan(BUDGET_MS);
    // Every type still has a name of its own, in the contract's order.
    const defs = Object.keys((built.value.record.$defs ?? {}) as Record<string, unknown>);
    expect(defs).toHaveLength(n);
    expect(defs.slice(0, 3)).toEqual(["S_T", "S_T2", "S_T3"]);
    expect(defs.at(-1)).toBe(`S_T${n}`);
  }, 60_000);

  it("a suffixed name never lands on a type that already has that name", () => {
    const doc =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
      '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm"><EntityType Name="E"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      '<Property Name="a" Type="a.T"/><Property Name="b" Type="ns.T2"/><Property Name="c" Type="c.T"/><Property Name="d" Type="d.T"/>' +
      '</EntityType><ComplexType Name="T2"/><EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.E"/></EntityContainer></Schema>' +
      ["a", "c", "d"].map((ns) => `<Schema Namespace="${ns}" xmlns="http://docs.oasis-open.org/odata/ns/edm"><ComplexType Name="T"/></Schema>`).join("") +
      "</edmx:DataServices></edmx:Edmx>";
    const r = compileContract(doc);
    if (!r.ok) throw new Error(r.detail);
    const slice = sliceForEntitySet(r.ir, "S");
    if (!slice.ok) throw new Error(slice.detail);
    const built = buildContractSchemas(slice.contract, { dialect: "2020-12", stem: "S", ref: (x) => x });
    const named = Object.entries(built.schemas)
      .filter(([name]) => name.startsWith("S_T"))
      .map(([name, s]) => `${String(s["x-odata-type"])}=${name}`)
      .sort();
    expect(named).toEqual(["a.T=S_T", "c.T=S_T3", "d.T=S_T4", "ns.T2=S_T2"]);
  });

  it("one long label on a base type folded into thousands of types is refused at the slice, never multiplied", () => {
    // Each folded copy shared the label string, so the slice was small in
    // memory and passed the member budget; its canonical JSON then wrote the
    // label 2,000 times (600 MB) before its size was checked, and threw.
    const n = 2000;
    const label = "L".repeat(300_000);
    const doc =
      '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData">' +
      '<edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="ns" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">' +
      `<ComplexType Name="B"><Property Name="b" Type="Edm.String" sap:label="${label}"/></ComplexType>` +
      Array.from({ length: n }, (_, i) => `<ComplexType Name="c${i}" BaseType="ns.B"/>`).join("") +
      '<EntityType Name="E"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      Array.from({ length: n }, (_, i) => `<Property Name="p${i}" Type="ns.c${i}"/>`).join("") +
      '</EntityType><EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="S" EntityType="ns.E"/></EntityContainer>' +
      "</Schema></edmx:DataServices></edmx:Edmx>";
    expect(doc.length).toBeLessThan(DEFAULT_XML_LIMITS.maxBytes);
    const r = compileContract(doc);
    if (!r.ok) throw new Error(r.detail);
    const slice = timed(() => sliceForEntitySet(r.ir, "S"));
    expect(slice.ms).toBeLessThan(BUDGET_MS);
    expect(slice.value).toMatchObject({ ok: false, reason: "TOO_LARGE" });
  }, 60_000);

  it("whatever the slice accepts has a canonical form in proportion to the description", () => {
    // Just under the old trigger: a few long labels folded a few times.
    const label = "L".repeat(50_000);
    const doc =
      EDMX_HEAD +
      `<ComplexType Name="B"><Property Name="b" Type="Edm.String"><Annotation Term="Org.OData.Core.V1.Description" String="${label}"/></Property></ComplexType>` +
      Array.from({ length: 5 }, (_, i) => `<ComplexType Name="c${i}" BaseType="ns.B"/>`).join("") +
      '<EntityType Name="E"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      Array.from({ length: 5 }, (_, i) => `<Property Name="p${i}" Type="ns.c${i}"/>`).join("") +
      '</EntityType><EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.E"/></EntityContainer>' +
      EDMX_TAIL;
    const r = compileContract(doc);
    if (!r.ok) throw new Error(r.detail);
    const slice = sliceForEntitySet(r.ir, "S");
    if (!slice.ok) throw new Error(slice.detail);
    expect(slice.contract.complexTypes).toHaveLength(5);
    let bytes = -1;
    expect(() => (bytes = contractDigest(slice.contract as InterfaceContract).bytes)).not.toThrow();
    expect(bytes).toBeLessThan(16 * doc.length);
  });
});

describe("CSDL JSON values that are not scalars", () => {
  it.each([
    ["an enum member's value", '{"$Version":"4.0","ns":{"En":{"$Kind":"EnumType","A":{"toString":1},"B":1}}}'],
    ["a property's $DefaultValue", '{"$Version":"4.0","ns":{"T":{"$Kind":"EntityType","$Key":["P"],"P":{"$DefaultValue":{"toString":1}}}}}'],
    [
      "a type definition's $DefaultValue",
      '{"$Version":"4.0","ns":{"D":{"$Kind":"TypeDefinition","$UnderlyingType":"Edm.String","$DefaultValue":{"toString":1}},"T":{"$Kind":"EntityType","$Key":["P"],"P":{"$Type":"ns.D"}}}}',
    ],
  ])("%s that cannot be made a string is left out; the compile never throws", (_what, doc) => {
    let r: ReturnType<typeof compileContract> | undefined;
    expect(() => (r = compileContract(doc))).not.toThrow();
    if (!r?.ok) throw new Error(r?.detail);
    for (const en of r.ir.enumTypes) expect(en.members).toEqual([{ name: "B", value: "1" }]);
    for (const t of r.ir.entityTypes) for (const p of t.properties) expect(p.defaultValue).toBeUndefined();
  });

  it("a scalar $DefaultValue and enum value are still read", () => {
    const r = compileContract(
      '{"$Version":"4.0","ns":{"En":{"$Kind":"EnumType","A":0,"B":"2"},"T":{"$Kind":"EntityType","$Key":["P"],"P":{"$DefaultValue":false},"Q":{"$Type":"Edm.Int32","$DefaultValue":7}}}}',
    );
    if (!r.ok) throw new Error(r.detail);
    expect(r.ir.enumTypes[0]!.members).toEqual([
      { name: "A", value: "0" },
      { name: "B", value: "2" },
    ]);
    expect(r.ir.entityTypes[0]!.properties.map((p) => p.defaultValue)).toEqual(["false", "7"]);
  });
});
