// @vitest-environment node
/**
 * The compiler parses whatever a customer's SAP connection answers, so these
 * are the documents built to hurt the process that reads them (xml.ts).
 * Each must be refused with its own reason, quickly, without expanding,
 * fetching or recursing into anything.
 */

import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { boundedContractDigest, contractDigest, jsonBytesAtLeast, MAX_CONTRACT_BYTES } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { MAX_IDENTIFIER_LENGTH, MAX_REFERENCE_LENGTH } from "@/lib/contracts/csdl-xml";
import {
  diffContracts,
  MAX_CHANGE_TEXT,
  MAX_STORED_CHANGES,
  MAX_STORED_DIFF_BYTES,
  storedDiff,
} from "@/lib/contracts/diff";
import { MAX_DOCUMENT_CONTRACT_BYTES } from "@/lib/contracts/doc-inputs";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { buildContractSchemas, standaloneSchemas } from "@/lib/contracts/json-schema";
import { MAX_TYPE_NAME_LENGTH, toTypeName } from "@/lib/contracts/names";
import { buildNorthboundOpenApi, documentJson, multiInterfaceInfoVersion, type OpenApiVersion } from "@/lib/contracts/openapi";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { DEFAULT_XML_LIMITS, parseXml } from "@/lib/contracts/xml";
import { buildScaffold, buildTypeScriptClient, safeName } from "@/lib/studio/scaffold";

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

  it("a set-level restriction listing more paths than the type has properties", () => {
    // As many properties as fit the contract's size bound, and more paths.
    const n = 40_000;
    const doc =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">' +
      '<edmx:Reference Uri="x"><edmx:Include Namespace="Org.OData.Capabilities.V1" Alias="Capabilities"/></edmx:Reference>' +
      '<edmx:DataServices><Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
      '<EntityType Name="T"><Key><PropertyRef Name="p0"/></Key>' +
      Array.from({ length: 30_000 }, (_, i) => `<Property Name="p${i}" Type="Edm.String"/>`).join("") +
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
    // As many as fit the contract's size bound (MAX_CONTRACT_BYTES).
    const n = 40_000;
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
    expect(kit.value).toContain(`p${n - 1}?: Record<string, unknown> | null;`);
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
    // Each type probed one suffix per earlier namesake: 36 s of CPU at twice
    // this size (a quarter of it here, still past the budget), paid on every
    // GET /schema, every OpenAPI build and every kit. As many as fit the
    // contract's size bound.
    const n = 15_000;
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

/*
 * Hostile-input review round 1. THE BOUNDS, for any description inside the
 * parser's (8 MB, 400,000 elements):
 *
 *   compile  refuses or succeeds in under BUDGET_MS, emitting at most
 *            maxElements members and capability paths (MemberBudget), no
 *            name over MAX_IDENTIFIER_LENGTH characters;
 *   diff     what a snapshot stores of it is under MAX_STORED_DIFF_BYTES;
 *   render   a document carries at most MAX_DOCUMENT_CONTRACT_BYTES of
 *            contract (refused before any IR is read past it, see
 *            routes.test.ts), and is linear in it: a kit response under 32
 *            bytes per contract byte, a solution document under 16, /schema's
 *            four schemas under 12 and its whole answer under 16, each in
 *            under BUDGET_MS; client.ts under 2. Round 2 asserts these at the
 *            worst shapes (below), not only at ordinary ones.
 */
describe("hostile-input review round 1", () => {
  const BUDGET_MS = 5000;
  const timed = <T>(fn: () => T): { value: T; ms: number } => {
    const started = performance.now();
    const value = fn();
    return { value, ms: performance.now() - started };
  };
  const CAPS_HEAD =
    '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">' +
    '<edmx:Reference Uri="x"><edmx:Include Namespace="Org.OData.Capabilities.V1" Alias="Capabilities"/></edmx:Reference>' +
    '<edmx:DataServices><Schema Namespace="n" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
    '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/></EntityType>';

  describe("one annotation target's paths are never copied onto many entity sets", () => {
    it("N same-named entity sets beside one target of P paths (CSDL XML, N = P = 20,000) are refused", () => {
      // Each set copied the target's P paths: N×P, and the heap was exhausted at this size (1.4 MB).
      const n = 20_000;
      const doc =
        CAPS_HEAD +
        `<EntityContainer Name="C">${'<EntitySet Name="S" EntityType="n.T"/>'.repeat(n)}</EntityContainer>` +
        '<Annotations Target="n.C/S"><Annotation Term="Capabilities.FilterRestrictions"><Record>' +
        '<PropertyValue Property="NonFilterableProperties"><Collection>' +
        Array.from({ length: n }, (_, i) => `<PropertyPath>q${i}</PropertyPath>`).join("") +
        "</Collection></PropertyValue></Record></Annotation></Annotations>" +
        EDMX_TAIL;
      const { value, ms } = timed(() => compileContract(doc));
      expect(value).toMatchObject({ ok: false, reason: "INVALID_CSDL" });
      expect(!value.ok && value.detail).toMatch(/entity set or singleton "S" more than once/);
      expect(ms).toBeLessThan(BUDGET_MS);
    });

    it("the same spread over N containers in CSDL JSON (N = 30,000, P = 100,000) is refused", () => {
      const ns: Record<string, unknown> = { T: { $Kind: "EntityType", $Key: ["k"], k: {} } };
      for (let i = 0; i < 30_000; i++) ns[`C${i}`] = { $Kind: "EntityContainer", S: { $Collection: true, $Type: "n.T" } };
      ns.$Annotations = {
        "n.C0/S": {
          "@Org.OData.Capabilities.V1.FilterRestrictions": { NonFilterableProperties: Array.from({ length: 100_000 }, (_, i) => `q${i}`) },
        },
      };
      const doc = JSON.stringify({ $Version: "4.0", $EntityContainer: "n.C0", n: ns });
      expect(doc.length).toBeLessThan(DEFAULT_XML_LIMITS.maxBytes);
      const { value, ms } = timed(() => compileContract(doc));
      expect(value).toMatchObject({ ok: false, reason: "INVALID_CSDL" });
      expect(ms).toBeLessThan(BUDGET_MS);
    });

    it("a singleton named like an entity set is the same ambiguity", () => {
      const doc =
        CAPS_HEAD +
        '<EntityContainer Name="C"><EntitySet Name="S" EntityType="n.T"/><Singleton Name="S" Type="n.T"/></EntityContainer>' +
        EDMX_TAIL;
      expect(reason(doc)).toBe("INVALID_CSDL");
    });

    it("capability paths spend the member budget, so what is emitted stays bounded by the element bound", () => {
      const doc = JSON.stringify({
        $Version: "4.0",
        n: {
          T: { $Kind: "EntityType", $Key: ["k"], k: {} },
          C: { $Kind: "EntityContainer", S: { $Collection: true, $Type: "n.T" } },
          $Annotations: {
            "n.C/S": {
              "@Org.OData.Capabilities.V1.FilterRestrictions": { NonFilterableProperties: Array.from({ length: 5000 }, (_, i) => `q${i}`) },
            },
          },
        },
      });
      expect(reason(doc, { ...DEFAULT_XML_LIMITS, maxElements: 1000 })).toBe("TOO_MANY_MEMBERS");
      const r = compileContract(doc);
      expect(r.ok && r.ir.entitySets[0]!.capabilities.nonFilterableProperties).toHaveLength(5000);
    });

    it("a CSDL JSON entity set's annotations are read from its own container's target", () => {
      const r = compileContract(
        JSON.stringify({
          $Version: "4.0",
          $EntityContainer: "n.C1",
          n: {
            T: { $Kind: "EntityType", $Key: ["k"], k: {} },
            C1: { $Kind: "EntityContainer", S1: { $Collection: true, $Type: "n.T" } },
            C2: { $Kind: "EntityContainer", S2: { $Collection: true, $Type: "n.T" } },
            $Annotations: { "n.C2/S2": { "@Org.OData.Capabilities.V1.InsertRestrictions": { Insertable: false } } },
          },
        }),
      );
      if (!r.ok) throw new Error(r.detail);
      expect(r.ir.entitySets.map((s) => [s.name, s.capabilities.creatable])).toEqual([
        ["S1", undefined],
        ["S2", false],
      ]);
    });
  });

  describe("names have a length", () => {
    const action = (name: string) =>
      `${EDMX_HEAD}<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/></EntityType>` +
      `<Action Name="${name}" IsBound="true"><Parameter Name="it" Type="ns.T"/></Action>` +
      `<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>${EDMX_TAIL}`;

    it("a name past MAX_IDENTIFIER_LENGTH is not a service description; one at it is", () => {
      expect(reason(action("A".repeat(65_000)))).toBe("INVALID_CSDL");
      expect(reason(action("A".repeat(MAX_IDENTIFIER_LENGTH + 1)))).toBe("INVALID_CSDL");
      expect(reason(action("A".repeat(MAX_IDENTIFIER_LENGTH)))).toBe("OK");
    });

    it("so is a type reference past MAX_REFERENCE_LENGTH, and the same in CSDL JSON", () => {
      const longType = `Collection(${"n".repeat(MAX_IDENTIFIER_LENGTH)}.${"T".repeat(MAX_IDENTIFIER_LENGTH + 1)})`;
      expect(reason(`${EDMX_HEAD}<ComplexType Name="X"><Property Name="p" Type="${longType}"/></ComplexType>${EDMX_TAIL}`)).toBe("INVALID_CSDL");
      expect(
        reason(`${EDMX_HEAD}<ComplexType Name="X"><Property Name="p" Type="Collection(ns.${"T".repeat(MAX_IDENTIFIER_LENGTH)})"/></ComplexType>${EDMX_TAIL}`),
      ).toBe("OK");
      const json = (member: Record<string, unknown>) =>
        JSON.stringify({ $Version: "4.0", ns: { T: { $Kind: "EntityType", $Key: ["k"], k: {}, ...member } } });
      expect(reason(json({ ["p".repeat(MAX_IDENTIFIER_LENGTH + 1)]: {} }))).toBe("INVALID_CSDL");
      expect(reason(json({ p: { $Type: `ns.${"T".repeat(MAX_REFERENCE_LENGTH)}` } }))).toBe("INVALID_CSDL");
      expect(
        reason(
          JSON.stringify({
            $Version: "4.0",
            ns: { [`a${"x".repeat(70_000)}`]: [{ $Kind: "Action", $IsBound: true, $Parameter: [{ $Name: "it", $Type: "ns.T" }] }] },
          }),
        ),
      ).toBe("INVALID_CSDL");
      expect(reason(json({ p: { $Type: "Edm.String" } }))).toBe("OK");
    });
  });

  describe("a stored diff is bounded whatever the contract", () => {
    function withAction(name: string, params: string[]): InterfaceContract {
      const r = compileContract(
        `${EDMX_HEAD}<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/></EntityType>` +
          `<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>${EDMX_TAIL}`,
      );
      if (!r.ok) throw new Error(r.detail);
      const s = sliceForEntitySet(r.ir, "S");
      if (!s.ok) throw new Error(s.detail);
      // Built in code, past the compiler's name bound: the diff's own bound must hold without it.
      s.contract.operations.push({
        name,
        kind: "action",
        bound: true,
        bindingType: "ns.T",
        parameters: [
          { name: "it", type: "ns.T", nullable: false },
          ...params.map((p) => ({ name: p, type: "Edm.String", nullable: false })),
        ],
      });
      return s.contract;
    }

    it("2,000 renamed parameters of an action named with 65,000 characters store under MAX_STORED_DIFF_BYTES", () => {
      // It stored 260 MB — past PostgreSQL's jsonb limit — from a 170 KB contract.
      const name = "A".repeat(65_000);
      const k = 2000;
      const before = withAction(name, Array.from({ length: k }, (_, i) => `a${i}`));
      const after = withAction(name, Array.from({ length: k }, (_, i) => `b${i}`));
      const { value: diff, ms } = timed(() => diffContracts(before, after));
      expect(diff.changes).toHaveLength(2 * k);
      const { value: stored, ms: storeMs } = timed(() => storedDiff(diff));
      expect(ms + storeMs).toBeLessThan(BUDGET_MS);
      expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThan(MAX_STORED_DIFF_BYTES);
      expect(stored).toMatchObject({ bump: "major", omitted: 2 * k - MAX_STORED_CHANGES });
      expect(stored.changes).toHaveLength(MAX_STORED_CHANGES);
      for (const c of stored.changes) {
        expect(c.at.length).toBeLessThanOrEqual(MAX_CHANGE_TEXT);
        expect(c.change.length).toBeLessThanOrEqual(MAX_CHANGE_TEXT);
      }
    });

    it("keeps the most severe changes when it must leave some out, and cuts no surrogate pair in half", () => {
      const changes = [
        ...Array.from({ length: MAX_STORED_CHANGES }, (_, i) => ({ bump: "patch" as const, at: `p${i}`, change: "label" })),
        { bump: "major" as const, at: `${"x".repeat(MAX_CHANGE_TEXT - 2)}😀😀`, change: "removed" },
      ];
      const stored = storedDiff({ bump: "major", changes });
      expect(stored.changes[0]).toMatchObject({ bump: "major", change: "removed" });
      expect(stored.omitted).toBe(1);
      expect(stored.changes[0]!.at.endsWith("…")).toBe(true);
      expect(stored.changes[0]!.at.length).toBeLessThanOrEqual(MAX_CHANGE_TEXT);
      expect(() => encodeURIComponent(stored.changes[0]!.at)).not.toThrow(); // no lone surrogate
      // Under the bound nothing is cut or left out.
      const small = { bump: "minor" as const, changes: [{ bump: "minor" as const, at: "property:X", change: "X was added." }] };
      expect(storedDiff(small)).toEqual(small);
    });
  });

  describe("rendered documents stay inside a stated bound", () => {
    const HEAD =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="n" xmlns="http://docs.oasis-open.org/odata/ns/edm">';
    const TAIL = '<EntityContainer Name="C"><EntitySet Name="S" EntityType="n.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
    const sliced = (doc: string) => {
      const r = compileContract(doc);
      if (!r.ok) throw new Error(r.detail);
      const s = sliceForEntitySet(r.ir, "S");
      if (!s.ok) throw new Error(s.detail);
      return s.contract;
    };
    const kitInterface = (contract: InterfaceContract) => ({
      id: "if_1",
      name: "x",
      externalId: "custom:/x",
      sapProduct: "s4hana",
      operation: "CREATE",
      mode: "WRITE",
      entitySet: "S",
      version: 1,
      solutionName: "s",
      compiled: { semver: "1.0.0", snapshotId: "snap", contentHash: "0", compiledAt: "2026-10-20T00:00:00.000Z", contract },
    });

    it("an enum of M members on P properties is declared once: client.ts is linear (M = P = 8,000)", () => {
      // The union was written out per property: M×P, a RangeError at this size after 10 s.
      const m = 8000;
      const contract = sliced(
        HEAD +
          `<EnumType Name="E">${Array.from({ length: m }, (_, i) => `<Member Name="m${i}"/>`).join("")}</EnumType>` +
          '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
          Array.from({ length: m }, (_, i) => `<Property Name="p${i}" Type="n.E"/>`).join("") +
          '<Property Name="all" Type="Collection(n.E)"/></EntityType>' +
          TAIL,
      );
      const { value: client, ms } = timed(() => buildTypeScriptClient(kitInterface(contract)));
      expect(ms).toBeLessThan(BUDGET_MS);
      expect(client.length).toBeLessThan(2 * contractDigest(contract).bytes);
      expect(client.split("export type EEnum = ").length).toBe(2);
      expect(client).toContain(`p${m - 1}?: EEnum | null;`);
      expect(client).toContain("all?: EEnum[];");
    });

    it("a kit, a solution document and /schema for a contract at the document budget", () => {
      const p = 30_000;
      const contract = sliced(
        HEAD +
          '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
          Array.from({ length: p }, (_, i) => `<Property Name="p${i}" Type="Edm.DateTimeOffset"/>`).join("") +
          "</EntityType>" +
          TAIL,
      );
      const bytes = contractDigest(contract).bytes;
      expect(bytes).toBeGreaterThan(MAX_DOCUMENT_CONTRACT_BYTES * 0.8);
      expect(bytes).toBeLessThanOrEqual(MAX_DOCUMENT_CONTRACT_BYTES);

      const kit = timed(() => JSON.stringify({ data: { files: buildScaffold(kitInterface(contract), "https://x") } }));
      expect(kit.ms).toBeLessThan(BUDGET_MS);
      expect(kit.value.length).toBeLessThan(32 * bytes);

      const solution = timed(() =>
        JSON.stringify(
          buildNorthboundOpenApi({
            version: "3.1.0",
            baseUrl: "https://x",
            title: "t",
            infoVersion: "1.0.0",
            description: "d",
            interfaces: [{ ...kitInterface(contract), contract: { source: "metadata", contract, semver: "1.0.0" } }],
            discovery: true,
            safe: safeName,
          }),
          null,
          2,
        ),
      );
      expect(solution.ms).toBeLessThan(BUDGET_MS);
      expect(solution.value.length).toBeLessThan(16 * bytes);

      const schema = timed(() => JSON.stringify(standaloneSchemas(contract, "S")));
      expect(schema.ms).toBeLessThan(BUDGET_MS);
      expect(schema.value.length).toBeLessThan(8 * bytes);
    }, 60_000);
  });
});

/*
 * Hostile-input review round 2. THE BOUNDS, at the worst shapes:
 *
 *   slice    an operation the slice keeps is charged its bytes like a folded
 *            property, so imports multiplying one action's parameters are
 *            refused (TOO_LARGE, reported NOT_COMPILED) in under 1 s;
 *   digest   a contract that cannot be under MAX_CONTRACT_BYTES is refused
 *            before it is serialised (boundedContractDigest), in under 1 s
 *            and with under 64 MB more heap, however much its parts share;
 *   names    a component name is never longer than MAX_TYPE_NAME_LENGTH
 *            plus a type's own, so a 511-character dataset name is not
 *            repeated in every $ref;
 *   render   the multipliers stated above hold for the shapes that render
 *            the most per contract byte: enum- and complex-typed nullable
 *            properties under a 511-character dataset name, one large
 *            complex type, collection navigations — at the budget.
 */
describe("hostile-input review round 2", () => {
  const BUDGET_MS = 5000;
  const timed = <T>(fn: () => T): { value: T; ms: number } => {
    const started = performance.now();
    const value = fn();
    return { value, ms: performance.now() - started };
  };
  const LONG = 511; // MAX_IDENTIFIER_LENGTH: a legal name

  describe("an action imported many times does not multiply its parameters' bytes", () => {
    // 1,000 parameters with long names and types, imported 399 times into the
    // dataset: 399 × 1,001 members is under the member bound, and the digest
    // then wrote 600 MB of canonical JSON — RangeError, or the heap exhausted.
    const P = 1000;
    const IMPORTS = 399;
    const name = (i: number) => `p${i}`.padEnd(LONG, "x");
    const type = `${"n".repeat(LONG)}.${"T".repeat(LONG)}`;
    const ENTITY = '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/></EntityType>';

    const refused = (doc: string) => {
      expect(doc.length).toBeLessThan(DEFAULT_XML_LIMITS.maxBytes);
      const r = compileContract(doc);
      if (!r.ok) throw new Error(r.detail);
      const heap = process.memoryUsage().heapUsed;
      const { value, ms } = timed(() => sliceForEntitySet(r.ir, "S"));
      expect(value).toMatchObject({ ok: false, reason: "TOO_LARGE" });
      expect(ms).toBeLessThan(1000);
      expect(process.memoryUsage().heapUsed - heap).toBeLessThan(64 * 1024 * 1024);
    };

    it("CSDL XML", () => {
      refused(
        EDMX_HEAD +
          ENTITY +
          `<Action Name="a">${Array.from({ length: P }, (_, i) => `<Parameter Name="${name(i)}" Type="${type}"/>`).join("")}</Action>` +
          `<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/>${Array.from({ length: IMPORTS }, (_, i) => `<ActionImport Name="i${i}" Action="ns.a" EntitySet="S"/>`).join("")}</EntityContainer>` +
          EDMX_TAIL,
      );
    }, 30_000);

    it("CSDL JSON", () => {
      const container: Record<string, unknown> = { $Kind: "EntityContainer", S: { $Collection: true, $Type: "ns.T" } };
      for (let i = 0; i < IMPORTS; i++) container[`i${i}`] = { $Action: "ns.a", $EntitySet: "S" };
      refused(
        JSON.stringify({
          $Version: "4.0",
          ns: {
            T: { $Kind: "EntityType", $Key: ["k"], k: {} },
            a: [{ $Kind: "Action", $Parameter: Array.from({ length: P }, (_, i) => ({ $Name: name(i), $Type: type })) }],
            C: container,
          },
        }),
      );
    }, 30_000);

    it("a few imports of a small action are still kept, each with its parameters", () => {
      const r = compileContract(
        EDMX_HEAD +
          ENTITY +
          '<Action Name="a"><Parameter Name="x" Type="Edm.String"/></Action>' +
          '<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/><ActionImport Name="one" Action="ns.a" EntitySet="S"/><ActionImport Name="two" Action="ns.a" EntitySet="S"/></EntityContainer>' +
          EDMX_TAIL,
      );
      if (!r.ok) throw new Error(r.detail);
      const s = sliceForEntitySet(r.ir, "S");
      expect(s.ok && s.contract.operations.map((o) => [o.name, o.parameters.length])).toEqual([
        ["one", 1],
        ["two", 1],
      ]);
    });

    it("whatever reaches the digest, one that cannot be stored is refused before it is serialised", () => {
      const r = compileContract(`${EDMX_HEAD}${ENTITY}<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>${EDMX_TAIL}`);
      if (!r.ok) throw new Error(r.detail);
      const s = sliceForEntitySet(r.ir, "S");
      if (!s.ok) throw new Error(s.detail);
      // Built in code, past the slice's charge: 399 operations sharing one list of parameters.
      const parameters = Array.from({ length: P }, (_, i) => ({ name: name(i), type, nullable: true }));
      for (let i = 0; i < IMPORTS; i++) s.contract.operations.push({ name: `i${i}`, kind: "action", entitySet: "S", parameters });
      const heap = process.memoryUsage().heapUsed;
      const { value, ms } = timed(() => boundedContractDigest(s.contract));
      expect(value.ok).toBe(false);
      expect(value.bytes).toBeGreaterThan(MAX_CONTRACT_BYTES);
      expect(ms).toBeLessThan(1000);
      expect(process.memoryUsage().heapUsed - heap).toBeLessThan(64 * 1024 * 1024);
    });

    it("the size it decides on is a lower bound of the canonical bytes, exact for plain ASCII", () => {
      const r = compileContract(readFileSync(path.resolve(__dirname, "../../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8"));
      if (!r.ok) throw new Error(r.detail);
      const s = sliceForEntitySet(r.ir, "SalesOrder");
      if (!s.ok) throw new Error(s.detail);
      const exact = contractDigest(s.contract);
      expect(jsonBytesAtLeast(s.contract, Number.MAX_SAFE_INTEGER)).toBe(exact.bytes);
      expect(boundedContractDigest(s.contract)).toEqual({ ok: true, ...exact });
      for (const v of [{ a: "é\n\"", b: [1, null, undefined, true], c: undefined }, [], {}, "x", 1.5e300, Number.NaN]) {
        expect(jsonBytesAtLeast(v, Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(Buffer.byteLength(JSON.stringify(v) ?? "", "utf8"));
      }
    });
  });

  describe("component names do not repeat a long dataset name", () => {
    it("toTypeName is at most MAX_TYPE_NAME_LENGTH, keeps short names as they were, and keeps long ones apart", () => {
      expect(toTypeName("A_BusinessPartner")).toBe("ABusinessPartner");
      const a = toTypeName(`${"S".repeat(LONG)}a`);
      const b = toTypeName(`${"S".repeat(LONG)}b`);
      expect(a.length).toBeLessThanOrEqual(MAX_TYPE_NAME_LENGTH);
      expect(b.length).toBeLessThanOrEqual(MAX_TYPE_NAME_LENGTH);
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      expect(toTypeName(`${"S".repeat(LONG)}a`)).toBe(a); // stable
    });
  });

  describe("rendered documents stay inside the stated bounds at the worst shapes", () => {
    const SET = "S".repeat(LONG);
    const HEAD =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="n" xmlns="http://docs.oasis-open.org/odata/ns/edm">';
    const TAIL = `<EntityContainer Name="C"><EntitySet Name="${SET}" EntityType="n.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
    const entity = (members: string) =>
      `<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>${members}</EntityType>`;
    const many = (n: number, member: (i: number) => string) => Array.from({ length: n }, (_, i) => member(i)).join("");

    const SHAPES: [string, string][] = [
      ["enum-typed nullable properties", '<EnumType Name="E"><Member Name="A"/></EnumType>' + entity(many(40_000, (i) => `<Property Name="p${i}" Type="n.E"/>`))],
      ["complex-typed nullable properties", '<ComplexType Name="E"><Property Name="a" Type="Edm.String"/></ComplexType>' + entity(many(40_000, (i) => `<Property Name="p${i}" Type="n.E"/>`))],
      ["one large complex type", `<ComplexType Name="E">${many(36_000, (i) => `<Property Name="p${i}" Type="Edm.TimeOfDay"/>`)}</ComplexType>` + entity('<Property Name="c" Type="n.E"/>')],
      ["collection navigations", entity(many(40_000, (i) => `<NavigationProperty Name="p${i}" Type="Collection(n.T)"/>`))],
    ];

    const kitInterface = (contract: InterfaceContract) => ({
      id: "if_1",
      name: "x",
      externalId: "custom:/x",
      sapProduct: "s4hana",
      operation: "CREATE",
      mode: "WRITE",
      entitySet: SET,
      version: 1,
      solutionName: "s",
      compiled: { semver: "1.0.0", snapshotId: "snap", contentHash: "0", compiledAt: "2026-10-20T00:00:00.000Z", contract },
    });

    it.each(SHAPES)("%s", (_label, body) => {
      const r = compileContract(HEAD + body + TAIL);
      if (!r.ok) throw new Error(r.detail);
      const s = sliceForEntitySet(r.ir, SET);
      if (!s.ok) throw new Error(s.detail);
      const contract = s.contract;
      const bytes = contractDigest(contract).bytes;
      // Near the budget, which is every read path's.
      expect(bytes).toBeGreaterThan(MAX_DOCUMENT_CONTRACT_BYTES * 0.7);
      expect(bytes).toBeLessThanOrEqual(MAX_DOCUMENT_CONTRACT_BYTES);
      expect(MAX_DOCUMENT_CONTRACT_BYTES).toBe(MAX_CONTRACT_BYTES);

      const kit = timed(() => JSON.stringify({ data: { files: buildScaffold(kitInterface(contract), "https://x") } }));
      expect(kit.ms).toBeLessThan(BUDGET_MS);
      expect(kit.value.length).toBeLessThan(32 * bytes);

      for (const version of ["3.1.0", "3.0.3"] as OpenApiVersion[]) {
        const solution = timed(() =>
          documentJson(
            buildNorthboundOpenApi({
              version,
              baseUrl: "https://x",
              title: "t",
              infoVersion: "1.0.0",
              description: "d",
              interfaces: [{ ...kitInterface(contract), contract: { source: "metadata", contract, semver: "1.0.0" } }],
              discovery: true,
              safe: safeName,
            }),
          ),
        );
        expect(solution.ms).toBeLessThan(BUDGET_MS);
        expect(solution.value.length).toBeLessThan(16 * bytes);
      }

      // GET /schema: its four schemas, and with the write body it serves beside them.
      const schema = timed(() => {
        const schemas = standaloneSchemas(contract, toTypeName(SET));
        return { schemas: JSON.stringify(schemas), all: JSON.stringify({ schemas, requestSchema: { ...schemas.create, "x-contract": {} } }) };
      });
      expect(schema.ms).toBeLessThan(BUDGET_MS);
      expect(schema.value.schemas.length).toBeLessThan(12 * bytes);
      expect(schema.value.all.length).toBeLessThan(16 * bytes);
    }, 120_000);

    it("a small document is still indented for the person who reads it", () => {
      expect(documentJson({ a: { b: 1 } })).toBe('{\n  "a": {\n    "b": 1\n  }\n}');
      const large = { a: "x".repeat(600 * 1024) };
      expect(documentJson(large)).toBe(JSON.stringify(large));
    });
  });

  describe("a document of several interfaces has a version that moves with their contracts", () => {
    const metadata = (semver: string, version = 1) => ({
      version,
      contract: { source: "metadata" as const, contract: {} as InterfaceContract, semver },
    });
    it("one compiled interface: its contract's version; a major anywhere raises the major", () => {
      expect(multiInterfaceInfoVersion([metadata("1.4.2")], "abc")).toBe("1.4.2+abc");
      const before = multiInterfaceInfoVersion([metadata("1.4.0"), metadata("3.1.0")], "a");
      const after = multiInterfaceInfoVersion([metadata("2.0.0"), metadata("3.1.0")], "b");
      expect(before).toBe("3.6.0+a");
      expect(after).toBe("4.2.0+b");
      // A minor bump raises the minor, a patch the patch; one without a compiled contract counts by its version.
      expect(multiInterfaceInfoVersion([metadata("1.5.0"), metadata("3.1.0")], "c")).toBe("3.7.0+c");
      expect(multiInterfaceInfoVersion([metadata("1.4.1"), metadata("3.1.0")], "d")).toBe("3.6.1+d");
      expect(multiInterfaceInfoVersion([{ version: 3, contract: { source: "none" } }], "e")).toBe("1.3.0+e");
    });
  });
});
