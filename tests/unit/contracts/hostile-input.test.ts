// @vitest-environment node
/**
 * The compiler parses whatever a customer's SAP connection answers, so these
 * are the documents built to hurt the process that reads them (xml.ts).
 * Each must be refused with its own reason, quickly, without expanding,
 * fetching or recursing into anything.
 */

import { describe, expect, it } from "vitest";

import { compileContract } from "@/lib/contracts/compile";
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
