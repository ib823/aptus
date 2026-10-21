/**
 * CSDL XML → Contract IR, for OData V2 EDMX (Version 1.0) and OData V4 CSDL
 * XML (Version 4.0 / 4.01).
 *
 * ONE PASS OVER A BOUNDED TREE. xml.ts has already refused anything hostile
 * (DOCTYPE, size, depth, floods); this walks the element tree it built. No
 * regular expression touches the document.
 *
 * V2 AND V4 DIFFER IN THREE PLACES THAT MATTER HERE:
 *   - capabilities: V2 states them as `sap:` attributes on the EntitySet and
 *     Property (an omitted flag means true); V4 states them as
 *     `Capabilities.*` annotations on the entity set. Both land in the same
 *     IR fields; an absent flag stays absent, and its reader decides.
 *   - navigations: V2 names an Association and a role; V4 names the target
 *     type directly. Both resolve to a target entity type and a cardinality.
 *   - operations: V2 has FunctionImport with an HTTP method; V4 has Action and
 *     Function declarations, bound or reached through imports.
 * SAP V2 services also carry V4-style `<Annotations>` blocks (that is where a
 * CDS view's @PersonalData lands), so annotations are read in both.
 */

import {
  CONTRACT_IR_VERSION,
  type ContractIR,
  type IrComplexType,
  type IrEntitySet,
  type IrEntityType,
  type IrEnumType,
  type IrNavigation,
  type IrOperation,
  type IrParameter,
  type IrProperty,
  type IrPropertyCapabilities,
  type ODataVersion,
} from "@/lib/contracts/ir";
import {
  AliasTable,
  enumMemberName,
  mergeAnnotations,
  type AnnotationSet,
  type AnnotationValue,
} from "@/lib/contracts/vocabulary";
import { applyAnnotations } from "@/lib/contracts/annotate";
import { attr, type XmlElement } from "@/lib/contracts/xml";

export const EDMX_V2_NS = "http://schemas.microsoft.com/ado/2007/06/edmx";
export const EDMX_V4_NS = "http://docs.oasis-open.org/odata/ns/edmx";
const EDM_NAMESPACES: ReadonlySet<string> = new Set([
  "http://schemas.microsoft.com/ado/2006/04/edm",
  "http://schemas.microsoft.com/ado/2007/05/edm",
  "http://schemas.microsoft.com/ado/2008/09/edm",
  "http://schemas.microsoft.com/ado/2009/11/edm",
  "http://docs.oasis-open.org/odata/ns/edm",
]);
const EDMX_NAMESPACES: ReadonlySet<string> = new Set([EDMX_V2_NS, EDMX_V4_NS]);
/** SAP's V2 annotation attributes (`sap:label`, `sap:creatable`, …). */
export const SAP_NS = "http://www.sap.com/Protocols/SAPData";
/** V2 metadata attributes (`m:DataServiceVersion`, `m:HttpMethod`, …). */
export const METADATA_NS = "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata";

export type CsdlRefusal = "NOT_EDMX" | "UNSUPPORTED_VERSION" | "INVALID_CSDL";

export type CsdlResult = { ok: true; ir: ContractIR } | { ok: false; reason: CsdlRefusal; detail: string };

function edm(el: XmlElement, local: string): XmlElement[] {
  return el.children.filter((c) => c.local === local && EDM_NAMESPACES.has(c.uri));
}

function edmx(el: XmlElement, local: string): XmlElement[] {
  return el.children.filter((c) => c.local === local && EDMX_NAMESPACES.has(c.uri));
}

function sap(el: XmlElement, local: string): string | undefined {
  return attr(el, local, SAP_NS);
}

/** A V2 `sap:` boolean flag: only "true"/"false" count; anything else is "not stated". */
function sapFlag(el: XmlElement, local: string): boolean | undefined {
  const v = sap(el, local);
  return v === "true" ? true : v === "false" ? false : undefined;
}

function xmlBool(v: string | undefined): boolean | undefined {
  return v === "true" ? true : v === "false" ? false : undefined;
}

function nonEmpty(v: string | undefined): string | undefined {
  return v !== undefined && v.trim() !== "" ? v : undefined;
}

/** "Collection(ns.T)" → { type: "ns.T", collection: true }. */
function splitCollection(raw: string): { type: string; collection: boolean } {
  const t = raw.trim();
  if (t.startsWith("Collection(") && t.endsWith(")")) return { type: t.slice(11, -1).trim(), collection: true };
  return { type: t, collection: false };
}

function parseIntFacet(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** An EDM annotation's value: its value attribute, its child expression, or (a tag term) true. */
function annotationValue(el: XmlElement, aliases: AliasTable): AnnotationValue {
  for (const a of el.attributes) {
    if (a.uri !== "") continue;
    const v = constantFromAttribute(a.local, a.value);
    if (v !== undefined) return v;
  }
  const expr = el.children.find((c) => EDM_NAMESPACES.has(c.uri) && c.local !== "Annotation");
  return expr ? expressionValue(expr, aliases) : true;
}

function constantFromAttribute(local: string, value: string): AnnotationValue | undefined {
  switch (local) {
    case "Bool":
      return value === "true";
    case "String":
      return value;
    case "Int":
    case "Decimal":
    case "Float": {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    case "EnumMember":
      return enumMemberName(value);
    case "Path":
    case "PropertyPath":
    case "NavigationPropertyPath":
    case "AnnotationPath":
      return value;
    case "Date":
    case "DateTimeOffset":
    case "TimeOfDay":
    case "Duration":
    case "Guid":
      return value;
    default:
      // Term, Qualifier, Target and anything else are not values.
      return undefined;
  }
}

function expressionValue(el: XmlElement, aliases: AliasTable): AnnotationValue {
  switch (el.local) {
    case "Bool":
      return el.text === "true";
    case "Int":
    case "Decimal":
    case "Float": {
      const n = Number(el.text);
      return Number.isFinite(n) ? n : el.text;
    }
    case "EnumMember":
      return enumMemberName(el.text);
    case "Collection":
      return el.children.filter((c) => EDM_NAMESPACES.has(c.uri)).map((c) => expressionValue(c, aliases));
    case "Record": {
      const out: Record<string, AnnotationValue> = {};
      for (const pv of edm(el, "PropertyValue")) {
        const name = attr(pv, "Property");
        if (!name) continue;
        out[name] = annotationValue(pv, aliases);
      }
      return out;
    }
    default:
      // String, Path, PropertyPath, NavigationPropertyPath, AnnotationPath,
      // Date and the rest: their text. Dynamic expressions (If, Apply, …) read
      // as their text too, which is to say not as a constant the IR uses.
      return el.text;
  }
}

/** The unqualified annotations directly inside an element, by canonical term. */
function inlineAnnotations(el: XmlElement, aliases: AliasTable): AnnotationSet {
  const set: AnnotationSet = new Map();
  for (const a of edm(el, "Annotation")) {
    if (attr(a, "Qualifier") !== undefined) continue;
    const term = attr(a, "Term");
    const canonical = term ? aliases.canonicalTerm(term) : null;
    if (!canonical) continue;
    set.set(canonical, annotationValue(a, aliases));
  }
  return set;
}

interface V2Association {
  ends: Map<string, { type: string; multiplicity: string }>;
}

export function compileCsdlXml(root: XmlElement): CsdlResult {
  if (root.local !== "Edmx" || !EDMX_NAMESPACES.has(root.uri)) {
    return { ok: false, reason: "NOT_EDMX", detail: "The document is XML but not a service description (EDMX)." };
  }
  const edmxVersion = attr(root, "Version") ?? "";
  let odataVersion: ODataVersion;
  if (edmxVersion === "1.0") odataVersion = "V2";
  else if (edmxVersion === "4.0" || edmxVersion === "4.01") odataVersion = "V4";
  else {
    return {
      ok: false,
      reason: "UNSUPPORTED_VERSION",
      detail: "The service description's version is neither OData V2 (EDMX 1.0) nor OData V4 (4.0, 4.01).",
    };
  }

  const aliases = new AliasTable();
  for (const ref of edmx(root, "Reference")) {
    for (const inc of edmx(ref, "Include")) {
      const ns = attr(inc, "Namespace");
      if (ns) aliases.add(ns, nonEmpty(attr(inc, "Alias")));
    }
  }
  const dataServices = edmx(root, "DataServices")[0];
  if (!dataServices) {
    return { ok: false, reason: "INVALID_CSDL", detail: "The service description has no DataServices element." };
  }
  const schemas = edm(dataServices, "Schema");
  if (schemas.length === 0) {
    return { ok: false, reason: "INVALID_CSDL", detail: "The service description declares no schema." };
  }
  const namespaces: string[] = [];
  for (const s of schemas) {
    const ns = attr(s, "Namespace");
    if (!ns) return { ok: false, reason: "INVALID_CSDL", detail: "A schema has no namespace." };
    namespaces.push(ns);
    aliases.add(ns, nonEmpty(attr(s, "Alias")));
  }

  const annotations = new Map<string, AnnotationSet>();
  const typeDefinitions = new Map<string, { underlying: string; facets: Partial<IrProperty> }>();
  const associations = new Map<string, V2Association>();
  const entityTypes: IrEntityType[] = [];
  const complexTypes: IrComplexType[] = [];
  const enumTypes: IrEnumType[] = [];
  const entitySets: IrEntitySet[] = [];
  const operations: IrOperation[] = [];
  /**
   * V4 schema-level actions/functions by qualified name: the FIRST UNBOUND
   * overload, which is the one an import names. Found in one pass and looked
   * up per import — scanning every overload for each import made a
   * description full of bound overloads, each imported, quadratic in size.
   */
  const v4Unbound = new Map<string, { kind: "action" | "function"; el: XmlElement }>();
  let container: string | undefined;
  const containerOf = new Map<string, string>();

  // Pass 1: names that later declarations refer to.
  for (const s of schemas) {
    const ns = attr(s, "Namespace")!;
    for (const td of edm(s, "TypeDefinition")) {
      const name = attr(td, "Name");
      const underlying = attr(td, "UnderlyingType");
      if (!name || !underlying) continue;
      typeDefinitions.set(`${ns}.${name}`, { underlying: aliases.qualify(underlying), facets: facetsOf(td) });
    }
    for (const a of edm(s, "Association")) {
      const name = attr(a, "Name");
      if (!name) continue;
      const ends = new Map<string, { type: string; multiplicity: string }>();
      for (const end of edm(a, "End")) {
        const role = attr(end, "Role");
        const type = attr(end, "Type");
        if (role && type) ends.set(role, { type: aliases.qualify(type), multiplicity: attr(end, "Multiplicity") ?? "1" });
      }
      associations.set(`${ns}.${name}`, { ends });
    }
    for (const kind of ["Action", "Function"] as const) {
      for (const op of edm(s, kind)) {
        const name = attr(op, "Name");
        if (!name || attr(op, "IsBound") === "true") continue;
        const qn = `${ns}.${name}`;
        if (!v4Unbound.has(qn)) v4Unbound.set(qn, { kind: kind === "Action" ? "action" : "function", el: op });
      }
    }
  }

  const resolveType = (raw: string): { type: string; collection: boolean; facets?: Partial<IrProperty> } => {
    const { type, collection } = splitCollection(raw);
    const qualified = aliases.qualify(type);
    const td = typeDefinitions.get(qualified);
    return td ? { type: td.underlying, collection, facets: td.facets } : { type: qualified, collection };
  };

  const readProperty = (p: XmlElement): IrProperty | null => {
    const name = attr(p, "Name");
    const rawType = attr(p, "Type");
    if (!name || !rawType) return null;
    const t = resolveType(rawType);
    const prop: IrProperty = {
      name,
      type: t.type,
      // XML CSDL: Nullable defaults to true, in V2 and V4 alike.
      nullable: attr(p, "Nullable") !== "false",
      ...t.facets,
      ...facetsOf(p),
    };
    if (t.collection) prop.collection = true;
    const label = nonEmpty(sap(p, "label"));
    if (label) prop.label = label;
    const quickInfo = nonEmpty(sap(p, "quickinfo"));
    if (quickInfo) prop.quickInfo = quickInfo;
    const displayFormat = nonEmpty(sap(p, "display-format"));
    if (displayFormat) prop.displayFormat = displayFormat;
    const semantics = nonEmpty(sap(p, "semantics"));
    if (semantics) prop.semantics = semantics;
    const caps: IrPropertyCapabilities = {};
    const creatable = sapFlag(p, "creatable");
    if (creatable !== undefined) caps.creatable = creatable;
    const updatable = sapFlag(p, "updatable");
    if (updatable !== undefined) caps.updatable = updatable;
    const filterable = sapFlag(p, "filterable");
    if (filterable !== undefined) caps.filterable = filterable;
    const sortable = sapFlag(p, "sortable");
    if (sortable !== undefined) caps.sortable = sortable;
    const requiredInFilter = sapFlag(p, "required-in-filter");
    if (requiredInFilter !== undefined) caps.requiredInFilter = requiredInFilter;
    // SuccessFactors states "must be sent on create" this way.
    const required = sapFlag(p, "required");
    if (required !== undefined) caps.mandatory = required;
    if (Object.keys(caps).length > 0) prop.capabilities = caps;
    return prop;
  };

  const readNavigation = (n: XmlElement): IrNavigation | null => {
    const name = attr(n, "Name");
    if (!name) return null;
    const relationship = attr(n, "Relationship");
    if (relationship !== undefined) {
      // V2: the association's ToRole end names the target and its multiplicity.
      const assoc = associations.get(aliases.qualify(relationship));
      const toRole = attr(n, "ToRole");
      const end = toRole ? assoc?.ends.get(toRole) : undefined;
      if (!end) return null;
      const nav: IrNavigation = { name, target: end.type, collection: end.multiplicity === "*" };
      if (end.multiplicity !== "*") nav.nullable = end.multiplicity === "0..1";
      return nav;
    }
    const rawType = attr(n, "Type");
    if (!rawType) return null;
    const t = splitCollection(rawType);
    const nav: IrNavigation = { name, target: aliases.qualify(t.type), collection: t.collection };
    if (!t.collection) nav.nullable = attr(n, "Nullable") !== "false";
    const partner = nonEmpty(attr(n, "Partner"));
    if (partner) nav.partner = partner;
    if (attr(n, "ContainsTarget") === "true") nav.containsTarget = true;
    const constraints = edm(n, "ReferentialConstraint")
      .map((rc) => ({ property: attr(rc, "Property") ?? "", referencedProperty: attr(rc, "ReferencedProperty") ?? "" }))
      .filter((rc) => rc.property !== "" && rc.referencedProperty !== "");
    if (constraints.length > 0) nav.referentialConstraints = constraints;
    return nav;
  };

  // Pass 2: types, containers, operations, annotations.
  for (const s of schemas) {
    const ns = attr(s, "Namespace")!;

    for (const et of edm(s, "EntityType")) {
      const name = attr(et, "Name");
      if (!name) continue;
      const qn = `${ns}.${name}`;
      const type: IrEntityType = {
        name,
        qualifiedName: qn,
        key: edm(et, "Key").flatMap((k) => edm(k, "PropertyRef").map((r) => attr(r, "Name") ?? "")).filter(Boolean),
        properties: edm(et, "Property").map(readProperty).filter((p): p is IrProperty => p !== null),
        navigations: edm(et, "NavigationProperty").map(readNavigation).filter((n): n is IrNavigation => n !== null),
      };
      const baseType = attr(et, "BaseType");
      if (baseType) type.baseType = aliases.qualify(baseType);
      if (attr(et, "Abstract") === "true") type.abstract = true;
      if (attr(et, "OpenType") === "true") type.openType = true;
      if (attr(et, "HasStream") === "true" || attr(et, "HasStream", METADATA_NS) === "true") type.hasStream = true;
      const label = nonEmpty(sap(et, "label"));
      if (label) type.label = label;
      entityTypes.push(type);
      collectInline(et, qn, aliases, annotations);
    }

    for (const ct of edm(s, "ComplexType")) {
      const name = attr(ct, "Name");
      if (!name) continue;
      const qn = `${ns}.${name}`;
      const type: IrComplexType = {
        name,
        qualifiedName: qn,
        properties: edm(ct, "Property").map(readProperty).filter((p): p is IrProperty => p !== null),
        navigations: edm(ct, "NavigationProperty").map(readNavigation).filter((n): n is IrNavigation => n !== null),
      };
      const baseType = attr(ct, "BaseType");
      if (baseType) type.baseType = aliases.qualify(baseType);
      if (attr(ct, "Abstract") === "true") type.abstract = true;
      if (attr(ct, "OpenType") === "true") type.openType = true;
      const label = nonEmpty(sap(ct, "label"));
      if (label) type.label = label;
      complexTypes.push(type);
      collectInline(ct, qn, aliases, annotations);
    }

    for (const en of edm(s, "EnumType")) {
      const name = attr(en, "Name");
      if (!name) continue;
      let next = 0;
      const members = edm(en, "Member").flatMap((m) => {
        const mName = attr(m, "Name");
        if (!mName) return [];
        const declared = attr(m, "Value");
        const value = declared ?? String(next);
        const n = Number(value);
        next = Number.isFinite(n) ? n + 1 : next + 1;
        return [{ name: mName, value }];
      });
      const type: IrEnumType = {
        name,
        qualifiedName: `${ns}.${name}`,
        underlyingType: aliases.qualify(attr(en, "UnderlyingType") ?? "Edm.Int32"),
        members,
      };
      if (attr(en, "IsFlags") === "true") type.isFlags = true;
      enumTypes.push(type);
    }

    for (const c of edm(s, "EntityContainer")) {
      const cName = attr(c, "Name");
      if (!cName) continue;
      const cqn = `${ns}.${cName}`;
      // V2 may declare several containers; the default one names the service.
      if (container === undefined || attr(c, "IsDefaultEntityContainer", METADATA_NS) === "true") container = cqn;

      for (const es of edm(c, "EntitySet")) {
        const name = attr(es, "Name");
        const entityType = attr(es, "EntityType");
        if (!name || !entityType) continue;
        entitySets.push(readEntitySet(es, name, aliases.qualify(entityType)));
        containerOf.set(name, cqn);
        collectInline(es, `${cqn}/${name}`, aliases, annotations);
      }
      for (const sg of edm(c, "Singleton")) {
        const name = attr(sg, "Name");
        const type = attr(sg, "Type");
        if (!name || !type) continue;
        const set = readEntitySet(sg, name, aliases.qualify(type));
        set.singleton = true;
        entitySets.push(set);
        containerOf.set(name, cqn);
        collectInline(sg, `${cqn}/${name}`, aliases, annotations);
      }
      // V2 function imports carry their whole signature.
      for (const fi of edm(c, "FunctionImport")) {
        const name = attr(fi, "Name");
        if (!name) continue;
        if (odataVersion === "V2") {
          operations.push(readV2FunctionImport(fi, name, aliases));
        } else {
          const fn = attr(fi, "Function");
          const op = fn ? v4Unbound.get(aliases.qualify(fn)) : undefined;
          if (op) operations.push(readV4Operation(op.el, op.kind, name, resolveType, attr(fi, "EntitySet")));
        }
      }
      for (const ai of edm(c, "ActionImport")) {
        const name = attr(ai, "Name");
        const action = attr(ai, "Action");
        if (!name || !action) continue;
        const op = v4Unbound.get(aliases.qualify(action));
        if (op) operations.push(readV4Operation(op.el, op.kind, name, resolveType, attr(ai, "EntitySet")));
      }
    }

    // Bound V4 operations are part of the type they bind to.
    for (const kind of ["Action", "Function"] as const) {
      for (const op of edm(s, kind)) {
        if (attr(op, "IsBound") !== "true") continue;
        const name = attr(op, "Name");
        if (!name) continue;
        operations.push(readV4Operation(op, kind === "Action" ? "action" : "function", name, resolveType));
      }
    }

    for (const block of edm(s, "Annotations")) {
      const target = attr(block, "Target");
      if (!target || attr(block, "Qualifier") !== undefined) continue;
      mergeAnnotations(annotations, aliases.target(target), inlineAnnotations(block, aliases));
    }
  }

  // Inline annotations on properties, keyed like external ones: "ns.Type/Prop".
  for (const s of schemas) {
    const ns = attr(s, "Namespace")!;
    for (const kind of ["EntityType", "ComplexType"]) {
      for (const t of edm(s, kind)) {
        const name = attr(t, "Name");
        if (!name) continue;
        for (const p of [...edm(t, "Property"), ...edm(t, "NavigationProperty")]) {
          const pName = attr(p, "Name");
          if (pName) collectInline(p, `${ns}.${name}/${pName}`, aliases, annotations);
        }
      }
    }
  }

  const ir: ContractIR = {
    irVersion: CONTRACT_IR_VERSION,
    odataVersion,
    edmxVersion,
    namespaces,
    entityTypes,
    complexTypes,
    enumTypes,
    entitySets,
    operations,
  };
  const dsv = nonEmpty(attr(dataServices, "DataServiceVersion", METADATA_NS));
  if (dsv) ir.dataServiceVersion = dsv;
  if (container) ir.container = container;
  applyAnnotations(ir, annotations, containerOf);
  return { ok: true, ir };
}

function collectInline(el: XmlElement, target: string, aliases: AliasTable, into: Map<string, AnnotationSet>): void {
  // Inline first; an external <Annotations> block for the same target, read
  // later, overrides it term by term.
  const set = inlineAnnotations(el, aliases);
  if (set.size === 0) return;
  const existing = into.get(target);
  if (!existing) {
    into.set(target, set);
    return;
  }
  for (const [k, v] of set) if (!existing.has(k)) existing.set(k, v);
}

function facetsOf(el: XmlElement): Partial<IrProperty> {
  const out: Partial<IrProperty> = {};
  const maxLength = attr(el, "MaxLength");
  if (maxLength !== undefined) {
    if (maxLength.toLowerCase() === "max") out.maxLength = "max";
    else {
      const n = parseIntFacet(maxLength);
      if (n !== undefined) out.maxLength = n;
    }
  }
  const precision = parseIntFacet(attr(el, "Precision"));
  if (precision !== undefined) out.precision = precision;
  const scale = attr(el, "Scale");
  if (scale !== undefined) {
    const lower = scale.toLowerCase();
    if (lower === "variable" || lower === "floating") out.scale = lower;
    else {
      const n = parseIntFacet(scale);
      if (n !== undefined) out.scale = n;
    }
  }
  const fixed = xmlBool(attr(el, "FixedLength"));
  if (fixed !== undefined) out.fixedLength = fixed;
  const def = attr(el, "DefaultValue");
  if (def !== undefined) out.defaultValue = def;
  return out;
}

function readEntitySet(es: XmlElement, name: string, entityType: string): IrEntitySet {
  const set: IrEntitySet = { name, entityType, capabilities: {} };
  const label = nonEmpty(sap(es, "label"));
  if (label) set.label = label;
  const caps = set.capabilities;
  const flags: [keyof typeof caps, string][] = [
    ["creatable", "creatable"],
    ["updatable", "updatable"],
    ["deletable", "deletable"],
    ["addressable", "addressable"],
    ["pageable", "pageable"],
    ["countable", "countable"],
    ["searchable", "searchable"],
    ["requiresFilter", "requires-filter"],
  ];
  for (const [field, local] of flags) {
    const v = sapFlag(es, local);
    if (v !== undefined) (caps as Record<string, boolean>)[field] = v;
  }
  const bindings = edm(es, "NavigationPropertyBinding")
    .map((b) => ({ path: attr(b, "Path") ?? "", target: attr(b, "Target") ?? "" }))
    .filter((b) => b.path !== "" && b.target !== "");
  if (bindings.length > 0) set.navigationBindings = bindings;
  return set;
}

function readV2FunctionImport(fi: XmlElement, name: string, aliases: AliasTable): IrOperation {
  const httpMethod = (attr(fi, "HttpMethod", METADATA_NS) ?? "GET").toUpperCase();
  const op: IrOperation = {
    name,
    kind: httpMethod === "GET" ? "function" : "action",
    httpMethod,
    parameters: edm(fi, "Parameter").flatMap((p): IrParameter[] => {
      const pName = attr(p, "Name");
      const pType = attr(p, "Type");
      if (!pName || !pType) return [];
      const t = splitCollection(pType);
      const param: IrParameter = { name: pName, type: aliases.qualify(t.type), nullable: attr(p, "Nullable") !== "false" };
      if (t.collection) param.collection = true;
      const mode = nonEmpty(attr(p, "Mode"));
      if (mode) param.mode = mode;
      return [param];
    }),
  };
  const returnType = attr(fi, "ReturnType");
  if (returnType) {
    const t = splitCollection(returnType);
    op.returnType = { type: aliases.qualify(t.type), ...(t.collection ? { collection: true as const } : {}) };
  }
  const entitySet = nonEmpty(attr(fi, "EntitySet"));
  if (entitySet) op.entitySet = entitySet;
  const label = nonEmpty(sap(fi, "label"));
  if (label) op.label = label;
  return op;
}

function readV4Operation(
  el: XmlElement,
  kind: "action" | "function",
  name: string,
  resolveType: (raw: string) => { type: string; collection: boolean },
  importEntitySet?: string,
): IrOperation {
  const params = edm(el, "Parameter").flatMap((p): IrParameter[] => {
    const pName = attr(p, "Name");
    const pType = attr(p, "Type");
    if (!pName || !pType) return [];
    const t = resolveType(pType);
    const param: IrParameter = { name: pName, type: t.type, nullable: attr(p, "Nullable") !== "false" };
    if (t.collection) param.collection = true;
    return [param];
  });
  const op: IrOperation = { name, kind, parameters: params };
  if (attr(el, "IsBound") === "true" && params[0]) {
    op.bound = true;
    op.bindingType = params[0].type;
    if (params[0].collection) op.bindingCollection = true;
  }
  const rt = edm(el, "ReturnType")[0];
  const rtType = rt ? attr(rt, "Type") : undefined;
  if (rt && rtType) {
    const t = resolveType(rtType);
    op.returnType = {
      type: t.type,
      ...(t.collection ? { collection: true as const } : {}),
      nullable: attr(rt, "Nullable") !== "false",
    };
  }
  const entitySet = nonEmpty(importEntitySet ?? attr(el, "EntitySetPath"));
  if (entitySet) op.entitySet = entitySet;
  return op;
}
