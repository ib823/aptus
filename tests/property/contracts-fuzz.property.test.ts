// @vitest-environment node
/**
 * THE CONTRACT COMPILER AGAINST GENERATED DESCRIPTIONS (P1.3, structural
 * containment).
 *
 * Three hostile-input reviews each found a shape nobody had written a test
 * for. This test writes shapes nobody chose: a grammar of service
 * descriptions — CSDL XML (OData V2 and V4) and CSDL JSON (V4) — with every
 * construct the compiler reads (entity, complex and enum types; inheritance
 * chains, cycles included; navigations, associations, referential
 * constraints, containment; entity sets, singletons, bindings; function and
 * action imports, bound overloads, an action imported many times; V2 sap:
 * attributes and V4 annotations, capability restrictions and labels), drawn
 * at random from a fixed seed, with adversarial weights: names at and past
 * the identifier limit, duplicates, unicode edge cases (astral characters,
 * NUL and lone surrogates where JSON can spell them), markup in labels,
 * long labels on base types folded into many derived ones, enums used by
 * every property, and documents up to the 8 MB input cap. Some cases are
 * then corrupted (cut short, spliced).
 *
 * FOR EVERY CASE:
 *   - the compile never throws: it compiles, or refuses with a typed reason;
 *   - it is within the envelope's own bounds: a sample of cases is compiled
 *     in the real envelope (envelope.ts) and gives the same answer —
 *     compiled or refused alike, field by field (expectSameAnswer) — never
 *     RESOURCE_LIMIT or INTERNAL; every case compiles in time linear in its
 *     length;
 *   - every dataset's contract is prepared (sliced, digested, rendered and
 *     measured) without throwing, inside the contract budget, in proportion
 *     to the description (budget.ts);
 *   - every read path — /schema, the starter kit, the solution document —
 *     renders a prepared contract under its stated budget, in time linear in
 *     what it writes, and so does the diff against the previous case's.
 *
 * CI runs CONTRACTS_FUZZ_ITERATIONS (default 120) cases from
 * CONTRACTS_FUZZ_SEED (default 13). A long local run:
 *   CONTRACTS_FUZZ_ITERATIONS=5000 pnpm vitest run tests/property/contracts-fuzz.property.test.ts
 */

import { describe, expect, it } from "vitest";

import { contractLimit, documentLimit, kitLimit, measureJson, OutputBudget, schemaLimit, LIMITS } from "@/lib/contracts/budget";
import { compileContract, type CompileResult } from "@/lib/contracts/compile";
import { MAX_STORED_DIFF_BYTES } from "@/lib/contracts/diff";
import { runInEnvelope } from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { standaloneSchemas } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { buildNorthboundOpenApi, documentJson } from "@/lib/contracts/openapi";
import { compiledServiceOf, diffJob, prepareContract, type CompiledService, type PreparedContract } from "@/lib/contracts/pipeline";
import { buildScaffold, safeName } from "@/lib/studio/scaffold";

const ITERATIONS = Number(process.env.CONTRACTS_FUZZ_ITERATIONS ?? 120);
const SEED = Number(process.env.CONTRACTS_FUZZ_SEED ?? 13);
/** Every Nth case also runs in the real envelope (a worker each, so not every case). */
const ENVELOPE_EVERY = Number(process.env.CONTRACTS_FUZZ_ENVELOPE_EVERY ?? 15);
const MAX_INPUT = LIMITS.sourceBytes;

const REFUSALS = new Set([
  "EMPTY",
  "TOO_LARGE",
  "DOCTYPE_REFUSED",
  "TOO_DEEP",
  "TOO_MANY_ELEMENTS",
  "TOO_MANY_ATTRIBUTES",
  "NOT_WELL_FORMED",
  "NOT_EDMX",
  "UNSUPPORTED_VERSION",
  "INVALID_CSDL",
  "TOO_MANY_MEMBERS",
]);
const DATASET_REFUSALS = new Set(["NO_SUCH_ENTITY_SET", "NO_SUCH_ENTITY_TYPE", "TOO_LARGE", "OUTPUT_TOO_LARGE"]);

/** Time a description of `chars` characters may take to compile: linear, generous for a loaded CI runner. */
const compileBudgetMs = (chars: number) => 3000 + chars / 250;
/** Time a read path may take to write `bytes`: linear in what it writes. */
const renderBudgetMs = (bytes: number) => 3000 + bytes / 2000;

// ---------------------------------------------------------------- randomness

class Rand {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  /** Mostly small, sometimes large: a count with a long tail. */
  count(typical: number, max: number): number {
    if (this.chance(0.04)) return this.int(typical, max);
    return this.int(0, typical);
  }
}

// ---------------------------------------------------------------- the model

type Version = "V2" | "V4";
const PRIMITIVES_V2 = ["Edm.String", "Edm.Int32", "Edm.Int64", "Edm.Decimal", "Edm.Boolean", "Edm.DateTime", "Edm.DateTimeOffset", "Edm.Time", "Edm.Guid", "Edm.Binary", "Edm.Double", "Edm.Byte"];
const PRIMITIVES_V4 = ["Edm.String", "Edm.Int32", "Edm.Int64", "Edm.Decimal", "Edm.Boolean", "Edm.Date", "Edm.DateTimeOffset", "Edm.TimeOfDay", "Edm.Duration", "Edm.Guid", "Edm.Binary", "Edm.Double", "Edm.Untyped", "Edm.GeographyPoint", "Edm.SByte"];

interface GProp {
  name: string;
  type: string;
  collection: boolean;
  nullable: boolean | null;
  maxLength?: string;
  precision?: string;
  scale?: string;
  label?: string;
  quickInfo?: string;
  flags: Record<string, string>;
  computed?: boolean;
  mandatory?: boolean;
  personal?: boolean;
}
interface GNav {
  name: string;
  target: string;
  collection: boolean;
  partner?: string;
  contains?: boolean;
  constraint?: [string, string];
}
interface GType {
  kind: "EntityType" | "ComplexType";
  name: string;
  base?: string;
  open?: boolean;
  abstract?: boolean;
  key: string[];
  props: GProp[];
  navs: GNav[];
  label?: string;
}
interface GEnum {
  name: string;
  flags: boolean;
  members: { name: string; value?: string }[];
}
interface GSet {
  name: string;
  type: string;
  singleton: boolean;
  label?: string;
  flags: Record<string, string>;
  nonFilterable: string[];
  requiredFilter: string[];
  nonSortable: string[];
  bindings: [string, string][];
}
interface GOp {
  name: string;
  kind: "Action" | "Function";
  bound: boolean;
  bindingType?: string;
  bindingCollection?: boolean;
  params: { name: string; type: string; collection: boolean; nullable: boolean }[];
  returnType?: { type: string; collection: boolean };
  /** V4: how many imports of this operation the container declares. */
  imports: number;
  entitySet?: string;
  actionFor?: string;
  httpMethod?: string;
}
interface Model {
  version: Version;
  ns: string;
  alias?: string;
  container: string;
  enums: GEnum[];
  types: GType[];
  sets: GSet[];
  ops: GOp[];
  /** Same-named containers in further schemas (V4 JSON): one target, many sets. */
  extraContainers: number;
}

const NAME_POOL = ["Id", "Name", "Status", "Amount", "to_Item", "Description", "Created", "Partner", "Value", "Key", "Type", "Error", "Create", "Record"];

/**
 * How a case names things. Most cases name ordinarily; some put names AT the
 * identifier limit (valid, and repeated in every reference), some reuse names
 * (duplicates, most of which a description may not have), and a few put one
 * name PAST the limit (a typed refusal). Per case, not per name: per name, a
 * case of thousands of names would almost always hold one of each.
 */
interface Naming {
  atLimit: number;
  duplicates: number;
  pastLimitOnce: boolean;
}

let naming: Naming = { atLimit: 0, duplicates: 0, pastLimitOnce: false };

function chooseNaming(r: Rand): Naming {
  return {
    atLimit: r.chance(0.1) ? r.pick([0.01, 0.2, 1]) : 0,
    duplicates: r.chance(0.1) ? r.pick([0.001, 0.05]) : 0,
    pastLimitOnce: r.chance(0.03),
  };
}

function identifier(r: Rand, used: Set<string>, prefix: string): string {
  let name: string;
  if (naming.pastLimitOnce) {
    naming.pastLimitOnce = false;
    name = prefix + "N".repeat(520); // past the limit: refused, typed
  } else if (r.chance(naming.atLimit)) {
    // A member's name exactly at the limit; a type's at half, so a qualified reference stays inside its own.
    name = `${prefix}${r.int(0, 99_999)}`.padEnd(["p", "in", "M"].includes(prefix) ? 511 : 250, "N");
  }
  else if (r.chance(naming.duplicates) && used.size > 0) name = r.pick([...used]);
  else if (r.chance(0.03)) name = r.pick(["Ünïcødé", "名前", "имя", "Ωmega", "nameͅ", "x_ä_ö"]) + r.int(0, 99_999);
  else if (r.chance(0.1)) name = r.pick(NAME_POOL) + r.int(0, 99_999);
  else name = `${prefix}${r.int(0, 999_999)}`;
  used.add(name);
  return name;
}

function text(r: Rand): string {
  const roll = r.next();
  if (roll < 0.05) return "<img src=x onerror=alert(1)> & co";
  if (roll < 0.08) return "l".repeat(r.int(1000, 65_000));
  if (roll < 0.12) return "Label 😀 with astral and 中文 and ‮ RTL";
  if (roll < 0.14) return "line\nbreak\ttab";
  return `Label ${r.int(0, 9999)}`;
}

function generate(r: Rand): Model {
  const version: Version = r.chance(0.5) ? "V2" : "V4";
  const prims = version === "V2" ? PRIMITIVES_V2 : PRIMITIVES_V4;
  const ns = r.chance(0.9) ? "ZNS" : identifier(r, new Set(), "Ns");
  const m: Model = { version, ns, container: "Container", enums: [], types: [], sets: [], ops: [], extraContainers: 0 };
  if (version === "V4" && r.chance(0.3)) m.alias = "SAP";
  const qn = (n: string) => `${r.chance(0.1) && m.alias ? m.alias : ns}.${n}`;

  // Adversarial multipliers, sometimes.
  const amp = {
    foldBase: r.chance(0.08), // many derived complex types over one long-labelled base
    importMany: r.chance(0.08), // one action with many parameters imported many times
    enumEverywhere: r.chance(0.08), // one large enum used by every property
    deepChain: r.chance(0.08), // a long (possibly cyclic) entity inheritance chain
    sameNamedSets: version === "V4" && r.chance(0.05),
    big: r.chance(0.03), // a document near the input cap
  };
  const scale = amp.big ? 40 : 1;

  const typeNames = new Set<string>();
  const enumCount = amp.enumEverywhere ? 1 : r.count(2, 6);
  for (let i = 0; i < enumCount; i++) {
    const memberCount = amp.enumEverywhere ? r.int(500, 4000) : r.count(5, 200);
    const members = new Set<string>();
    m.enums.push({
      name: identifier(r, typeNames, "E"),
      flags: r.chance(0.2),
      members: Array.from({ length: memberCount }, (_, j) => ({ name: identifier(r, members, "M"), ...(r.chance(0.5) ? { value: String(r.chance(0.05) ? -j : j) } : {}) })),
    });
  }

  const complexCount = amp.foldBase ? r.int(50, 400) : r.count(3, 40);
  const entityCount = Math.max(1, r.count(4, 60) * scale);
  const propCount = () => (amp.enumEverywhere ? r.int(200, 2000) : r.count(12, 400) * (amp.big ? 4 : 1));

  const makeProp = (used: Set<string>, allowStructured: boolean): GProp => {
    const structured = allowStructured && r.chance(0.25) && (m.enums.length > 0 || m.types.some((t) => t.kind === "ComplexType"));
    let type = r.pick(prims);
    if (structured) {
      const complexes = m.types.filter((t) => t.kind === "ComplexType");
      type = complexes.length > 0 && r.chance(0.5) ? qn(r.pick(complexes).name) : m.enums.length > 0 ? qn(r.pick(m.enums).name) : type;
    }
    if (amp.enumEverywhere && m.enums.length > 0) type = qn(m.enums[0]!.name);
    if (r.chance(0.02)) type = `${ns}.DoesNotExist`;
    const p: GProp = {
      name: identifier(r, used, "p"),
      type,
      collection: version === "V4" && r.chance(0.08),
      nullable: r.chance(0.3) ? null : r.chance(0.5),
      flags: {},
    };
    if (type === "Edm.String" && r.chance(0.6)) p.maxLength = r.chance(0.1) ? "max" : String(r.int(1, 1333));
    if (type === "Edm.Decimal") {
      p.precision = String(r.int(1, 38));
      p.scale = r.chance(0.1) ? "variable" : String(r.int(0, 10));
    }
    if (r.chance(0.5)) p.label = text(r);
    if (r.chance(0.1)) p.quickInfo = text(r);
    if (version === "V2") {
      for (const f of ["creatable", "updatable", "filterable", "sortable", "required-in-filter", "required"]) if (r.chance(0.1)) p.flags[`sap:${f}`] = String(r.chance(0.5));
      if (r.chance(0.1)) p.flags["sap:display-format"] = r.pick(["Date", "UpperCase", "NonNegative"]);
      if (r.chance(0.05)) p.flags["sap:semantics"] = r.pick(["email", "tel", "currency-code"]);
    } else {
      if (r.chance(0.1)) p.computed = r.chance(0.8);
      if (r.chance(0.1)) p.mandatory = true;
      if (r.chance(0.05)) p.personal = true;
    }
    return p;
  };

  // Complex types first, so properties can use them; their bases among themselves.
  let foldBase: string | undefined;
  for (let i = 0; i < complexCount; i++) {
    const used = new Set<string>();
    const t: GType = { kind: "ComplexType", name: identifier(r, typeNames, "C"), key: [], props: [], navs: [] };
    const n = amp.foldBase && i === 0 ? r.int(50, 400) : r.count(6, 60);
    for (let j = 0; j < n; j++) t.props.push(makeProp(used, i > 0));
    if (amp.foldBase && i === 0) {
      for (const p of t.props) p.label = "f".repeat(r.int(100, 2000));
      foldBase = t.name;
    } else if (amp.foldBase && foldBase) t.base = qn(foldBase);
    else if (i > 0 && r.chance(0.15)) t.base = qn(r.pick(m.types.filter((x) => x.kind === "ComplexType")).name);
    if (r.chance(0.1)) t.open = true;
    m.types.push(t);
  }

  const entities: GType[] = [];
  for (let i = 0; i < entityCount; i++) {
    const used = new Set<string>();
    const t: GType = { kind: "EntityType", name: identifier(r, typeNames, "T"), key: [], props: [], navs: [] };
    const n = propCount();
    for (let j = 0; j < n; j++) t.props.push(makeProp(used, true));
    if (amp.foldBase && foldBase) {
      // One property per derived complex type: the fold multiplies the base's labels.
      for (const c of m.types.filter((x) => x.kind === "ComplexType" && x.base)) t.props.push({ name: identifier(r, used, "f"), type: qn(c.name), collection: false, nullable: true, flags: {} });
    }
    if (t.props.length > 0 && r.chance(0.9)) t.key = [t.props[0]!.name, ...(r.chance(0.1) && t.props[1] ? [t.props[1].name] : [])];
    if (r.chance(0.05)) t.key = ["NotAProperty"];
    if (r.chance(0.3)) t.label = text(r);
    if (r.chance(0.05)) t.open = true;
    if (amp.deepChain ? i > 0 : r.chance(0.1) && entities.length > 0) t.base = qn((amp.deepChain ? entities[i - 1]! : r.pick(entities)).name);
    entities.push(t);
    m.types.push(t);
  }
  if (amp.deepChain && entities.length > 1 && r.chance(0.5)) entities[0]!.base = qn(entities[entities.length - 1]!.name); // a cycle
  for (const t of entities) {
    const used = new Set(t.props.map((p) => p.name));
    const navs = r.count(3, 40);
    for (let j = 0; j < navs; j++) {
      const target = r.pick(entities);
      t.navs.push({
        name: identifier(r, used, "to_"),
        target: qn(target.name),
        collection: r.chance(0.5),
        ...(r.chance(0.2) ? { partner: identifier(r, new Set(), "to_") } : {}),
        ...(version === "V4" && r.chance(0.1) ? { contains: true } : {}),
        ...(r.chance(0.2) && t.props[0] && target.props[0] ? { constraint: [t.props[0].name, target.props[0].name] as [string, string] } : {}),
      });
    }
  }

  const setNames = new Set<string>();
  const sets = Math.max(1, r.count(4, 60) * scale);
  for (let i = 0; i < sets; i++) {
    const t = r.pick(entities);
    const props = t.props.map((p) => p.name);
    const paths = (n: number) => Array.from({ length: Math.min(props.length, n) }, () => (r.chance(0.9) ? r.pick(props) : "Nope"));
    const s: GSet = {
      name: identifier(r, setNames, "S"),
      type: r.chance(0.02) ? `${ns}.Missing` : qn(t.name),
      singleton: version === "V4" && r.chance(0.08),
      flags: {},
      nonFilterable: r.chance(0.2) ? paths(r.count(5, 2000)) : [],
      requiredFilter: r.chance(0.1) ? paths(r.count(3, 50)) : [],
      nonSortable: r.chance(0.1) ? paths(r.count(5, 200)) : [],
      bindings: t.navs.filter(() => r.chance(0.5)).map((n) => [n.name, r.pick([...setNames])] as [string, string]),
    };
    if (r.chance(0.3)) s.label = text(r);
    if (version === "V2") for (const f of ["creatable", "updatable", "deletable", "pageable", "addressable", "searchable", "requires-filter"]) if (r.chance(0.15)) s.flags[`sap:${f}`] = String(r.chance(0.5));
    m.sets.push(s);
  }
  if (amp.sameNamedSets) m.extraContainers = r.int(10, 400);

  const opNames = new Set<string>();
  const ops = amp.importMany ? 1 : r.count(4, 80);
  for (let i = 0; i < ops; i++) {
    const t = r.pick(entities);
    const bound = version === "V4" && r.chance(0.5);
    const paramCount = amp.importMany ? r.int(100, 2000) : r.count(4, 60);
    const pnames = new Set<string>();
    const op: GOp = {
      name: r.chance(0.3) && opNames.size > 0 ? r.pick([...opNames]) : identifier(r, opNames, "op"), // overloads share names
      kind: r.chance(0.5) ? "Action" : "Function",
      bound,
      ...(bound ? { bindingType: qn(t.name), bindingCollection: r.chance(0.3) } : {}),
      params: Array.from({ length: paramCount }, () => ({ name: identifier(r, pnames, "in"), type: r.pick(prims), collection: version === "V4" && r.chance(0.05), nullable: r.chance(0.5) })),
      ...(r.chance(0.6) ? { returnType: { type: r.chance(0.5) ? qn(t.name) : r.pick(prims), collection: r.chance(0.4) } } : {}),
      imports: bound ? 0 : amp.importMany ? r.int(50, 2000) : r.int(0, 2),
      ...(r.chance(0.4) ? { entitySet: r.pick(m.sets).name } : {}),
      ...(version === "V2" && r.chance(0.3) ? { actionFor: qn(t.name) } : {}),
      ...(version === "V2" ? { httpMethod: r.pick(["GET", "POST", "PUT", "MERGE", "DELETE"]) } : {}),
    };
    m.ops.push(op);
  }
  return m;
}

// ---------------------------------------------------------------- serialisers

const xa = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const attrs = (o: Record<string, string | undefined>) =>
  Object.entries(o)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => ` ${k}="${xa(v)}"`)
    .join("");

function toXml(m: Model): string {
  const out: string[] = [];
  const v4 = m.version === "V4";
  const typeRef = (t: string, collection: boolean) => (collection ? `Collection(${t})` : t);
  if (v4) {
    out.push('<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">');
    for (const [ns, alias] of [
      ["com.sap.vocabularies.Common.v1", "Common"],
      ["Org.OData.Core.V1", "Core"],
      ["Org.OData.Capabilities.V1", "Capabilities"],
      ["com.sap.vocabularies.PersonalData.v1", "PersonalData"],
    ]) out.push(`<edmx:Reference Uri="https://example.invalid/${alias}.xml"><edmx:Include${attrs({ Namespace: ns, Alias: alias })}/></edmx:Reference>`);
    out.push(`<edmx:DataServices><Schema${attrs({ Namespace: m.ns, Alias: m.alias })} xmlns="http://docs.oasis-open.org/odata/ns/edm">`);
  } else {
    out.push(
      '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData">',
      `<edmx:DataServices m:DataServiceVersion="2.0"><Schema${attrs({ Namespace: m.ns })} xmlns="http://schemas.microsoft.com/ado/2008/09/edm">`,
    );
  }
  const label = (l: string | undefined) => (v4 && l !== undefined ? `<Annotation Term="Common.Label"${attrs({ String: l })}/>` : "");
  if (v4) {
    for (const e of m.enums) {
      out.push(`<EnumType${attrs({ Name: e.name, IsFlags: e.flags ? "true" : undefined })}>`);
      for (const mem of e.members) out.push(`<Member${attrs({ Name: mem.name, Value: mem.value })}/>`);
      out.push("</EnumType>");
    }
  }
  for (const t of m.types) {
    out.push(`<${t.kind}${attrs({ Name: t.name, BaseType: t.base, OpenType: t.open ? "true" : undefined, Abstract: t.abstract ? "true" : undefined, ...(v4 ? {} : { "sap:label": t.label }) })}>`);
    if (t.key.length > 0) out.push(`<Key>${t.key.map((k) => `<PropertyRef${attrs({ Name: k })}/>`).join("")}</Key>`);
    for (const p of t.props) {
      const a: Record<string, string | undefined> = {
        Name: p.name,
        Type: typeRef(p.type, p.collection),
        Nullable: p.nullable === null ? undefined : String(p.nullable),
        MaxLength: p.maxLength,
        Precision: p.precision,
        Scale: p.scale,
        ...(v4 ? {} : { "sap:label": p.label, "sap:quickinfo": p.quickInfo, ...p.flags }),
      };
      const inner = v4
        ? label(p.label) +
          (p.quickInfo !== undefined ? `<Annotation Term="Common.QuickInfo"${attrs({ String: p.quickInfo })}/>` : "") +
          (p.computed !== undefined ? `<Annotation Term="Core.Computed" Bool="${p.computed}"/>` : "") +
          (p.mandatory ? '<Annotation Term="Common.FieldControl" EnumMember="Common.FieldControlType/Mandatory"/>' : "") +
          (p.personal ? '<Annotation Term="PersonalData.IsPotentiallyPersonal" Bool="true"/>' : "")
        : "";
      out.push(inner ? `<Property${attrs(a)}>${inner}</Property>` : `<Property${attrs(a)}/>`);
    }
    for (const n of t.navs) {
      if (v4) {
        const rc = n.constraint ? `<ReferentialConstraint${attrs({ Property: n.constraint[0], ReferencedProperty: n.constraint[1] })}/>` : "";
        out.push(`<NavigationProperty${attrs({ Name: n.name, Type: typeRef(n.target, n.collection), Partner: n.partner, ContainsTarget: n.contains ? "true" : undefined })}>${rc}</NavigationProperty>`);
      } else {
        out.push(`<NavigationProperty${attrs({ Name: n.name, Relationship: `${m.ns}.A_${t.name}_${n.name}`, FromRole: "From", ToRole: "To" })}/>`);
      }
    }
    out.push(label(t.label), `</${t.kind}>`);
  }
  if (!v4) {
    for (const t of m.types)
      for (const n of t.navs)
        out.push(
          `<Association${attrs({ Name: `A_${t.name}_${n.name}` })}><End${attrs({ Type: `${m.ns}.${t.name}`, Multiplicity: "1", Role: "From" })}/><End${attrs({ Type: n.target, Multiplicity: n.collection ? "*" : "0..1", Role: "To" })}/></Association>`,
        );
  }
  if (v4) {
    for (const op of m.ops) {
      out.push(`<${op.kind}${attrs({ Name: op.name, IsBound: op.bound ? "true" : undefined })}>`);
      if (op.bound) out.push(`<Parameter${attrs({ Name: "_it", Type: typeRef(op.bindingType!, op.bindingCollection === true) })}/>`);
      for (const p of op.params) out.push(`<Parameter${attrs({ Name: p.name, Type: typeRef(p.type, p.collection), Nullable: String(p.nullable) })}/>`);
      if (op.returnType) out.push(`<ReturnType${attrs({ Type: typeRef(op.returnType.type, op.returnType.collection) })}/>`);
      out.push(`</${op.kind}>`);
    }
  }
  out.push(`<EntityContainer${attrs({ Name: m.container, ...(v4 ? {} : { "m:IsDefaultEntityContainer": "true" }) })}>`);
  for (const s of m.sets) {
    const tag = s.singleton ? "Singleton" : "EntitySet";
    const a = { Name: s.name, [s.singleton ? "Type" : "EntityType"]: s.type, ...(v4 ? {} : { "sap:label": s.label, ...s.flags }) };
    if (!v4) {
      out.push(`<${tag}${attrs(a)}/>`);
      continue;
    }
    const caps: string[] = [];
    const paths = (ps: string[]) => `<Collection>${ps.map((p) => `<PropertyPath>${xa(p)}</PropertyPath>`).join("")}</Collection>`;
    if (s.nonFilterable.length > 0 || s.requiredFilter.length > 0)
      caps.push(
        `<Annotation Term="Capabilities.FilterRestrictions"><Record>${s.nonFilterable.length > 0 ? `<PropertyValue Property="NonFilterableProperties">${paths(s.nonFilterable)}</PropertyValue>` : ""}${s.requiredFilter.length > 0 ? `<PropertyValue Property="RequiredProperties">${paths(s.requiredFilter)}</PropertyValue><PropertyValue Property="RequiresFilter" Bool="true"/>` : ""}</Record></Annotation>`,
      );
    if (s.nonSortable.length > 0) caps.push(`<Annotation Term="Capabilities.SortRestrictions"><Record><PropertyValue Property="NonSortableProperties">${paths(s.nonSortable)}</PropertyValue></Record></Annotation>`);
    const bindings = s.bindings.map(([p, t]) => `<NavigationPropertyBinding${attrs({ Path: p, Target: t })}/>`).join("");
    out.push(`<${tag}${attrs(a)}>${bindings}${label(s.label)}${caps.join("")}</${tag}>`);
  }
  for (const op of m.ops) {
    if (v4) {
      for (let i = 0; i < op.imports; i++)
        out.push(`<${op.kind}Import${attrs({ Name: op.imports > 1 ? `${op.name}_${i}` : op.name, [op.kind]: `${m.ns}.${op.name}`, EntitySet: op.entitySet })}/>`);
    } else {
      out.push(`<FunctionImport${attrs({ Name: op.name, ReturnType: op.returnType ? typeRef(op.returnType.type, op.returnType.collection) : undefined, EntitySet: op.entitySet, "m:HttpMethod": op.httpMethod, "sap:action-for": op.actionFor })}>`);
      for (const p of op.params) out.push(`<Parameter${attrs({ Name: p.name, Type: p.type, Mode: "In", Nullable: String(p.nullable) })}/>`);
      out.push("</FunctionImport>");
    }
  }
  out.push("</EntityContainer>");
  if (v4 && m.sets.length > 0 && m.types.length > 0) {
    // Annotations blocks too, targeting a type's property and a set.
    const t = m.types[0]!;
    if (t.props[0]) out.push(`<Annotations${attrs({ Target: `${m.ns}.${t.name}/${t.props[0].name}` })}><Annotation Term="Common.Label" String="from an Annotations block"/></Annotations>`);
    out.push(`<Annotations${attrs({ Target: `${m.ns}.${m.container}/${m.sets[0]!.name}` })}><Annotation Term="Capabilities.InsertRestrictions"><Record><PropertyValue Property="Insertable" Bool="false"/></Record></Annotation></Annotations>`);
  }
  out.push("</Schema></edmx:DataServices></edmx:Edmx>");
  return out.join("");
}

/** CSDL JSON (V4). `unicode` sometimes spells what XML cannot: NUL and lone surrogates. */
function toJson(m: Model, r: Rand): string {
  const schema: Record<string, unknown> = {};
  if (m.alias) schema.$Alias = m.alias;
  const typeRef = (t: string) => t;
  for (const e of m.enums) {
    const o: Record<string, unknown> = { $Kind: "EnumType", ...(e.flags ? { $IsFlags: true } : {}) };
    e.members.forEach((mem, i) => (o[mem.name] = mem.value !== undefined ? Number(mem.value) : i));
    schema[e.name] = o;
  }
  for (const t of m.types) {
    const o: Record<string, unknown> = { $Kind: t.kind, ...(t.base ? { $BaseType: t.base } : {}), ...(t.open ? { $OpenType: true } : {}) };
    if (t.key.length > 0) o.$Key = t.key;
    if (t.label !== undefined) o["@Common.Label"] = t.label;
    for (const p of t.props) {
      const po: Record<string, unknown> = {};
      if (p.type !== "Edm.String") po.$Type = typeRef(p.type);
      if (p.collection) po.$Collection = true;
      if (p.nullable !== null) po.$Nullable = p.nullable;
      if (p.maxLength !== undefined) po.$MaxLength = p.maxLength === "max" ? "max" : Number(p.maxLength);
      if (p.precision !== undefined) po.$Precision = Number(p.precision);
      if (p.scale !== undefined) po.$Scale = p.scale === "variable" ? "variable" : Number(p.scale);
      if (p.label !== undefined) po["@Common.Label"] = p.label;
      if (p.computed !== undefined) po["@Core.Computed"] = p.computed;
      if (p.mandatory) po["@Common.FieldControl"] = { $EnumMember: "com.sap.vocabularies.Common.v1.FieldControlType/Mandatory" };
      o[p.name] = po;
    }
    for (const n of t.navs) {
      o[n.name] = {
        $Kind: "NavigationProperty",
        $Type: n.target,
        ...(n.collection ? { $Collection: true } : {}),
        ...(n.partner ? { $Partner: n.partner } : {}),
        ...(n.contains ? { $ContainsTarget: true } : {}),
        ...(n.constraint ? { $ReferentialConstraint: { [n.constraint[0]]: n.constraint[1] } } : {}),
      };
    }
    schema[t.name] = o;
  }
  const opsByName = new Map<string, unknown[]>();
  for (const op of m.ops) {
    const list = opsByName.get(op.name) ?? [];
    list.push({
      $Kind: op.kind,
      ...(op.bound ? { $IsBound: true } : {}),
      $Parameter: [
        ...(op.bound ? [{ $Name: "_it", $Type: op.bindingType, ...(op.bindingCollection ? { $Collection: true } : {}) }] : []),
        ...op.params.map((p) => ({ $Name: p.name, $Type: p.type, ...(p.collection ? { $Collection: true } : {}), ...(p.nullable ? {} : { $Nullable: false }) })),
      ],
      ...(op.returnType ? { $ReturnType: { $Type: op.returnType.type, ...(op.returnType.collection ? { $Collection: true } : {}) } } : {}),
    });
    opsByName.set(op.name, list);
  }
  for (const [name, list] of opsByName) schema[name] = list;
  const container: Record<string, unknown> = { $Kind: "EntityContainer" };
  const annotations: Record<string, unknown> = {};
  for (const s of m.sets) {
    container[s.name] = {
      ...(s.singleton ? { $Type: s.type } : { $Collection: true, $Type: s.type }),
      ...(s.bindings.length > 0 ? { $NavigationPropertyBinding: Object.fromEntries(s.bindings) } : {}),
    };
    const a: Record<string, unknown> = {};
    if (s.label !== undefined) a["@Common.Label"] = s.label;
    if (s.nonFilterable.length > 0) a["@Capabilities.FilterRestrictions"] = { NonFilterableProperties: s.nonFilterable.map((p) => ({ $PropertyPath: p })) };
    if (s.nonSortable.length > 0) a["@Capabilities.SortRestrictions"] = { NonSortableProperties: s.nonSortable.map((p) => ({ $PropertyPath: p })) };
    if (Object.keys(a).length > 0) annotations[`${m.ns}.${m.container}/${s.name}`] = a;
  }
  for (const op of m.ops) for (let i = 0; i < op.imports; i++) container[op.imports > 1 ? `${op.name}_${i}` : op.name] = { [op.kind === "Action" ? "$Action" : "$Function"]: `${m.ns}.${op.name}`, ...(op.entitySet ? { $EntitySet: op.entitySet } : {}) };
  schema[m.container] = container;
  if (Object.keys(annotations).length > 0) schema.$Annotations = annotations;
  const doc: Record<string, unknown> = {
    $Version: r.chance(0.9) ? "4.0" : "4.01",
    $Reference: {
      "https://example.invalid/Common.xml": { $Include: [{ $Namespace: "com.sap.vocabularies.Common.v1", $Alias: "Common" }] },
      "https://example.invalid/Core.xml": { $Include: [{ $Namespace: "Org.OData.Core.V1", $Alias: "Core" }] },
      "https://example.invalid/Capabilities.xml": { $Include: [{ $Namespace: "Org.OData.Capabilities.V1", $Alias: "Capabilities" }] },
    },
    [m.ns]: schema,
  };
  // The same container name in many further schemas: one annotation target, many sets.
  for (let i = 0; i < m.extraContainers; i++) doc[`X${i}`] = { [m.container]: { $Kind: "EntityContainer", [m.sets[0]?.name ?? "S"]: { $Collection: true, $Type: m.sets[0]?.type ?? "X.T" } } };
  let json = JSON.stringify(doc);
  // What only JSON can spell, sometimes: a NUL or a lone surrogate in a name or label.
  if (r.chance(0.03)) json = json.replace('"Label', '"La\\u0000bel');
  if (r.chance(0.03)) json = json.replace('"Label', '"La\\ud800bel');
  return json;
}

/** Cut short, spliced or wrapped: what a broken or hostile answer looks like. */
function corrupt(doc: string, r: Rand): string {
  switch (r.int(0, 5)) {
    case 0:
      return doc.slice(0, r.int(0, doc.length));
    case 1: {
      const at = r.int(0, doc.length);
      return doc.slice(0, at) + r.pick(["<", "&undefined;", "]]>", '"', "{", "\u0000", "<!DOCTYPE x>"]) + doc.slice(at);
    }
    case 2:
      return `<!DOCTYPE x [<!ENTITY a "aaaa">]>${doc}`;
    case 3:
      return `${"<a>".repeat(r.int(60, 200))}${doc}`;
    case 4:
      return doc.replace(/Version="(1\.0|4\.0)"/, 'Version="9.9"');
    default:
      return `   \n${doc}`;
  }
}

// ---------------------------------------------------------------- the property

function timed<T>(fn: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = fn();
  return { value, ms: performance.now() - started };
}

/** Every read path's render of a prepared contract, under its own budget; returns what each wrote. */
function readPaths(p: Extract<PreparedContract, { ok: true }>, entitySet: string): { schema: number; kit: number; document: number } {
  const schemas = standaloneSchemas(p.contract, toTypeName(entitySet));
  const schema = measureJson({ schemas, requestSchema: schemas.create }, schemaLimit(p.bytes));
  const iface = {
    id: "c".repeat(25),
    name: "Fuzzed interface",
    externalId: "custom:/sap/opu/odata/sap/ZFUZZ_SRV",
    sapProduct: "s4hana-onprem",
    operation: "CREATE",
    mode: "WRITE",
    entitySet,
    version: 1,
    solutionName: "Fuzz",
    compiled: { semver: "1.0.0", snapshotId: "s", contentHash: "0", compiledAt: "2026-10-21T00:00:00.000Z", contract: p.contract },
  };
  const kitBudget = new OutputBudget("kit", kitLimit(p.bytes));
  buildScaffold(iface, "https://coreedge.example/api/northbound", [], [], kitBudget);
  const docBudget = new OutputBudget("document", documentLimit([p.bytes]));
  documentJson(
    buildNorthboundOpenApi({
      version: "3.1.0",
      baseUrl: "https://coreedge.example/api/northbound",
      title: "Fuzz",
      infoVersion: "1.0.0",
      description: "Fuzz",
      interfaces: [{ ...iface, contract: { source: "metadata", contract: p.contract, semver: "1.0.0" } }],
      discovery: true,
      safe: safeName,
    }),
    docBudget,
  );
  return { schema, kit: kitBudget.spent, document: docBudget.spent };
}

interface Stats {
  cases: number;
  compiled: number;
  refusals: Map<string, number>;
  datasets: number;
  prepared: number;
  datasetRefusals: Map<string, number>;
  envelopeRuns: number;
  /** Envelope runs whose answer was checked against the in-process one, field by field. */
  envelopeAgreements: number;
  maxInput: number;
  maxContractPerSource: number;
  maxSchemaPerContract: number;
  maxKitPerContract: number;
  maxDocumentPerContract: number;
  maxCompileMsPerMb: number;
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/**
 * The envelope's answer is the in-process one: compiled or refused alike, for
 * the same reason; the same datasets and version; the first dataset prepared
 * alike, to the same hash and size, or refused for the same reason.
 */
function expectSameAnswer(where: string, inEnvelope: CompiledService, inProcess: CompiledService): void {
  expect(inEnvelope.ok, `${where}: compiled in one and not the other`).toBe(inProcess.ok);
  if (!inEnvelope.ok || !inProcess.ok) {
    expect(inEnvelope.ok ? null : inEnvelope.reason, `${where}: refusal`).toBe(inProcess.ok ? null : inProcess.reason);
    return;
  }
  expect(inEnvelope.datasets, `${where}: datasets`).toEqual(inProcess.datasets);
  expect(inEnvelope.odataVersion, `${where}: OData version`).toBe(inProcess.odataVersion);
  expect(inEnvelope.sourceLength, `${where}: source length`).toBe(inProcess.sourceLength);
  const a = inEnvelope.dataset;
  const b = inProcess.dataset;
  expect(a === null, `${where}: a dataset in one only`).toBe(b === null);
  if (!a || !b) return;
  expect(a.ok, `${where}: dataset prepared in one only`).toBe(b.ok);
  if (a.ok && b.ok) {
    expect(a.hash, `${where}: dataset hash`).toBe(b.hash);
    expect(a.bytes, `${where}: dataset bytes`).toBe(b.bytes);
  } else if (!a.ok && !b.ok) {
    expect(a.reason, `${where}: dataset refusal`).toBe(b.reason);
  }
}

describe("the Contract Compiler against generated descriptions", () => {
  it(
    `${ITERATIONS} cases from seed ${SEED}: never throws, stays inside the envelope, every output and read path inside its bound`,
    async () => {
      const r = new Rand(SEED);
      const stats: Stats = {
        cases: 0,
        compiled: 0,
        refusals: new Map(),
        datasets: 0,
        prepared: 0,
        datasetRefusals: new Map(),
        envelopeRuns: 0,
        envelopeAgreements: 0,
        maxInput: 0,
        maxContractPerSource: 0,
        maxSchemaPerContract: 0,
        maxKitPerContract: 0,
        maxDocumentPerContract: 0,
        maxCompileMsPerMb: 0,
      };
      let previous: InterfaceContract | null = null;

      for (let i = 0; i < ITERATIONS; i++) {
        naming = chooseNaming(r);
        const model = generate(r);
        let doc = model.version === "V4" && r.chance(0.4) ? toJson(model, r) : toXml(model);
        if (r.chance(0.12)) doc = corrupt(doc, r);
        if (doc.length > MAX_INPUT + 1024) doc = doc.slice(0, MAX_INPUT + 1024); // past the cap: refused TOO_LARGE
        const where = `case ${i} (seed ${SEED}, ${model.version}, ${doc.length} chars)`;
        stats.cases += 1;
        stats.maxInput = Math.max(stats.maxInput, doc.length);

        // 1. Never throws: compiles, or a typed refusal — in time linear in its length.
        let compiled: { value: CompileResult; ms: number };
        try {
          compiled = timed(() => compileContract(doc));
        } catch (err) {
          throw new Error(`${where}: the compiler threw ${err instanceof Error ? err.name : String(err)}`);
        }
        expect(compiled.ms, `${where}: compile time`).toBeLessThan(compileBudgetMs(doc.length));
        stats.maxCompileMsPerMb = Math.max(stats.maxCompileMsPerMb, (compiled.ms * 1024 * 1024) / Math.max(doc.length, 64 * 1024));
        // What the verify learns in process: the summary, with the first dataset prepared (or the refusal).
        const firstSet = compiled.value.ok ? (compiled.value.ir.entitySets[0]?.name ?? null) : null;
        const summary = compiledServiceOf(compiled.value, firstSet, null);

        // 4. The real envelope, for a sample — refused descriptions too: the same answer, never stopped by its limits.
        if (i % ENVELOPE_EVERY === 0) {
          stats.envelopeRuns += 1;
          const e = await runInEnvelope({ kind: "compile", input: { body: doc, entitySet: firstSet, subject: null } });
          if (!e.ok) throw new Error(`${where}: the envelope refused it (${e.reason})`);
          expectSameAnswer(where, e.value, summary);
          stats.envelopeAgreements += 1;
        }

        if (!compiled.value.ok) {
          expect(REFUSALS.has(compiled.value.reason), `${where}: refusal ${compiled.value.reason}`).toBe(true);
          bump(stats.refusals, compiled.value.reason);
          if (process.env.CONTRACTS_FUZZ_DEBUG) console.info(where, compiled.value.reason, compiled.value.detail.slice(0, 160));
          continue;
        }
        stats.compiled += 1;
        const ir = compiled.value.ir;

        // 2. Every dataset (a sample of a large service's): prepared without throwing, inside its budgets.
        const sets = ir.entitySets.length <= 6 ? ir.entitySets : [ir.entitySets[0]!, ...Array.from({ length: 5 }, () => r.pick(ir.entitySets))];
        for (const set of sets) {
          stats.datasets += 1;
          const service = set === sets[0] ? summary : compiledServiceOf(compiled.value, set.name, null);
          if (!service.ok) throw new Error(`${where}: the summary refused what compiled`);
          const p = service.dataset;
          if (!p) throw new Error(`${where}: no dataset for ${set.name}`);
          if (!p.ok) {
            expect(DATASET_REFUSALS.has(p.reason), `${where}: dataset refusal ${p.reason}`).toBe(true);
            bump(stats.datasetRefusals, p.reason);
            continue;
          }
          stats.prepared += 1;
          // The contract is in proportion to its description, and capped.
          expect(p.bytes, `${where}: contract bytes`).toBeLessThanOrEqual(contractLimit(compiled.value.sourceLength));
          stats.maxContractPerSource = Math.max(stats.maxContractPerSource, p.bytes / doc.length);
          // What the record measured is inside each read path's budget…
          expect(p.rendered.schema).toBeLessThanOrEqual(schemaLimit(p.bytes));
          expect(p.rendered.kit).toBeLessThanOrEqual(kitLimit(p.bytes));
          expect(p.rendered.document).toBeLessThanOrEqual(documentLimit([p.bytes]));
          // …and each read path, rendering it again, stays inside it, in linear time.
          const read = timed(() => readPaths(p, set.name));
          expect(read.ms, `${where}: read paths' time`).toBeLessThan(renderBudgetMs(read.value.kit + read.value.document + read.value.schema));
          // The factor each read path writes per contract byte, beyond its budget's floor (its fixed text).
          const factor = (out: number, floor: number) => Math.max(0, out - floor) / p.bytes;
          stats.maxSchemaPerContract = Math.max(stats.maxSchemaPerContract, factor(read.value.schema, LIMITS.schema.floor));
          stats.maxKitPerContract = Math.max(stats.maxKitPerContract, factor(read.value.kit, LIMITS.kit.floor));
          stats.maxDocumentPerContract = Math.max(stats.maxDocumentPerContract, factor(read.value.document, LIMITS.document.floor + LIMITS.document.perInterface));

          // 3. The diff against the previous case's contract, as stored: bounded, in linear time.
          if (previous) {
            const d = timed(() => diffJob({ previous: [previous!], next: p.contract }));
            expect(measureJson(d.value[0]!.stored)).toBeLessThanOrEqual(MAX_STORED_DIFF_BYTES);
            expect(d.ms, `${where}: diff time`).toBeLessThan(renderBudgetMs(p.bytes * 4));
          }
          previous = p.contract;
        }

      }

      const report = {
        seed: SEED,
        ...stats,
        refusals: Object.fromEntries(stats.refusals),
        datasetRefusals: Object.fromEntries(stats.datasetRefusals),
        maxContractPerSource: Number(stats.maxContractPerSource.toFixed(2)),
        maxSchemaPerContract: Number(stats.maxSchemaPerContract.toFixed(2)),
        maxKitPerContract: Number(stats.maxKitPerContract.toFixed(2)),
        maxDocumentPerContract: Number(stats.maxDocumentPerContract.toFixed(2)),
        maxCompileMsPerMb: Math.round(stats.maxCompileMsPerMb),
      };
      console.info("[contracts-fuzz]", JSON.stringify(report));
      // The grammar reaches both outcomes: a run that compiled nothing, or prepared nothing, tested nothing.
      expect(stats.compiled).toBeGreaterThan(ITERATIONS / 4);
      expect(stats.prepared).toBeGreaterThan(ITERATIONS / 4);
      expect(stats.refusals.size).toBeGreaterThan(1);
      // The envelope was compared, not merely run.
      expect(stats.envelopeAgreements).toBe(stats.envelopeRuns);
      expect(stats.envelopeAgreements).toBeGreaterThan(0);
    },
    Math.max(120_000, ITERATIONS * 4_000),
  );
});
