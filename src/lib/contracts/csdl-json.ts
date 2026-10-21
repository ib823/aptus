/**
 * OData V4 CSDL JSON → Contract IR.
 *
 * The JSON form of the same description (OASIS CSDL JSON 4.01). Cheap to
 * support beside XML because it maps onto the same IR, and some V4 producers
 * (CAP among them) serve it.
 *
 * TWO DEFAULTS DIFFER FROM XML, and getting either wrong would quietly invert
 * a contract: an absent `$Type` is Edm.String, and an absent `$Nullable` is
 * FALSE (XML's Nullable defaults to true).
 *
 * The input has already passed the same byte bound as XML (compile.ts) and is
 * walked only to the fixed depth of the format; annotation values are read to
 * a bounded depth, so a hostile document cannot drive recursion.
 */

import { applyAnnotations } from "@/lib/contracts/annotate";
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
} from "@/lib/contracts/ir";
import { AliasTable, mergeAnnotations, type AnnotationSet, type AnnotationValue } from "@/lib/contracts/vocabulary";
import type { CsdlResult } from "@/lib/contracts/csdl-xml";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

const MAX_ANNOTATION_DEPTH = 16;

function isObject(v: Json | undefined): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: Json | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** A JSON annotation value → the IR's value shape; depth-bounded. */
function annotationValue(v: Json, depth = 0): AnnotationValue {
  if (depth > MAX_ANNOTATION_DEPTH) return "";
  if (v === null) return "";
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => annotationValue(x, depth + 1));
  // { "$PropertyPath": "X" } and its siblings read as the path.
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0]!.startsWith("$")) {
    const inner = v[keys[0]!];
    if (typeof inner === "string") return inner;
  }
  const out: Record<string, AnnotationValue> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith("@") || k.startsWith("$")) continue;
    out[k] = annotationValue(x, depth + 1);
  }
  return out;
}

/** The unqualified "@Term" members of an object. */
function annotationsOf(obj: JsonObject, aliases: AliasTable): AnnotationSet {
  const set: AnnotationSet = new Map();
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith("@") || k.includes("#")) continue;
    const canonical = aliases.canonicalTerm(k.slice(1));
    if (canonical) set.set(canonical, annotationValue(v));
  }
  return set;
}

function facets(obj: JsonObject): Partial<IrProperty> {
  const out: Partial<IrProperty> = {};
  const maxLength = obj.$MaxLength;
  if (typeof maxLength === "number" && Number.isInteger(maxLength) && maxLength >= 0) out.maxLength = maxLength;
  else if (maxLength === "max") out.maxLength = "max";
  if (typeof obj.$Precision === "number" && Number.isInteger(obj.$Precision)) out.precision = obj.$Precision;
  const scale = obj.$Scale;
  if (typeof scale === "number" && Number.isInteger(scale)) out.scale = scale;
  else if (scale === "variable" || scale === "floating") out.scale = scale;
  if (obj.$DefaultValue !== undefined && obj.$DefaultValue !== null) out.defaultValue = String(obj.$DefaultValue);
  return out;
}

export function compileCsdlJson(doc: unknown): CsdlResult {
  if (!isObject(doc as Json) || typeof (doc as JsonObject).$Version !== "string") {
    return { ok: false, reason: "NOT_EDMX", detail: "The document is JSON but not a CSDL JSON service description." };
  }
  const root = doc as JsonObject;
  const edmxVersion = root.$Version as string;
  if (edmxVersion !== "4.0" && edmxVersion !== "4.01") {
    return { ok: false, reason: "UNSUPPORTED_VERSION", detail: "CSDL JSON is defined for OData 4.0 and 4.01 only." };
  }

  const aliases = new AliasTable();
  if (isObject(root.$Reference)) {
    for (const ref of Object.values(root.$Reference)) {
      if (!isObject(ref) || !Array.isArray(ref.$Include)) continue;
      for (const inc of ref.$Include) {
        if (isObject(inc) && typeof inc.$Namespace === "string") aliases.add(inc.$Namespace, str(inc.$Alias));
      }
    }
  }
  const schemaEntries = Object.entries(root).filter(
    (e): e is [string, JsonObject] => !e[0].startsWith("$") && isObject(e[1]),
  );
  if (schemaEntries.length === 0) {
    return { ok: false, reason: "INVALID_CSDL", detail: "The service description declares no schema." };
  }
  for (const [ns, schema] of schemaEntries) aliases.add(ns, str(schema.$Alias));

  const typeDefinitions = new Map<string, { underlying: string; facets: Partial<IrProperty> }>();
  /** Each action/function's first UNBOUND overload — the one an import names — found in one pass (see csdl-xml.ts). */
  const unbound = new Map<string, { kind: "action" | "function"; overload: JsonObject }>();
  for (const [ns, schema] of schemaEntries) {
    for (const [name, member] of Object.entries(schema)) {
      if (name.startsWith("$") || name.startsWith("@")) continue;
      if (isObject(member) && member.$Kind === "TypeDefinition" && typeof member.$UnderlyingType === "string") {
        typeDefinitions.set(`${ns}.${name}`, { underlying: aliases.qualify(member.$UnderlyingType), facets: facets(member) });
      }
      if (Array.isArray(member)) {
        for (const o of member) {
          if (!isObject(o) || (o.$Kind !== "Action" && o.$Kind !== "Function") || o.$IsBound === true) continue;
          const qn = `${ns}.${name}`;
          if (!unbound.has(qn)) unbound.set(qn, { kind: o.$Kind === "Action" ? "action" : "function", overload: o });
        }
      }
    }
  }
  const resolve = (raw: string | undefined): { type: string; facets?: Partial<IrProperty> } => {
    const qualified = aliases.qualify(raw ?? "Edm.String");
    const td = typeDefinitions.get(qualified);
    return td ? { type: td.underlying, facets: td.facets } : { type: qualified };
  };

  const annotations = new Map<string, AnnotationSet>();
  const entityTypes: IrEntityType[] = [];
  const complexTypes: IrComplexType[] = [];
  const enumTypes: IrEnumType[] = [];
  const entitySets: IrEntitySet[] = [];
  const operations: IrOperation[] = [];
  const namespaces = schemaEntries.map(([ns]) => ns);

  const readMembers = (qn: string, obj: JsonObject): { properties: IrProperty[]; navigations: IrNavigation[] } => {
    const properties: IrProperty[] = [];
    const navigations: IrNavigation[] = [];
    for (const [name, m] of Object.entries(obj)) {
      if (name.startsWith("$") || name.startsWith("@") || !isObject(m)) continue;
      if (m.$Kind === "NavigationProperty") {
        const nav: IrNavigation = {
          name,
          target: aliases.qualify(str(m.$Type) ?? ""),
          collection: m.$Collection === true,
        };
        if (!nav.collection) nav.nullable = m.$Nullable === true;
        const partner = str(m.$Partner);
        if (partner) nav.partner = partner;
        if (m.$ContainsTarget === true) nav.containsTarget = true;
        if (isObject(m.$ReferentialConstraint)) {
          const rcs = Object.entries(m.$ReferentialConstraint)
            .filter((e): e is [string, string] => !e[0].includes("@") && typeof e[1] === "string")
            .map(([property, referencedProperty]) => ({ property, referencedProperty }));
          if (rcs.length > 0) nav.referentialConstraints = rcs;
        }
        navigations.push(nav);
      } else if (m.$Kind === undefined || m.$Kind === "Property") {
        const t = resolve(str(m.$Type));
        const prop: IrProperty = { name, type: t.type, nullable: m.$Nullable === true, ...t.facets, ...facets(m) };
        if (m.$Collection === true) prop.collection = true;
        properties.push(prop);
      }
      mergeAnnotations(annotations, `${qn}/${name}`, annotationsOf(m, aliases));
    }
    return { properties, navigations };
  };

  let container: string | undefined;
  const declaredContainer = str(root.$EntityContainer);

  for (const [ns, schema] of schemaEntries) {
    for (const [name, member] of Object.entries(schema)) {
      if (name.startsWith("$") || name.startsWith("@") || !isObject(member)) continue;
      const qn = `${ns}.${name}`;
      if (member.$Kind === "EntityType" || member.$Kind === "ComplexType") {
        const { properties, navigations } = readMembers(qn, member);
        const base = {
          name,
          qualifiedName: qn,
          properties,
          navigations,
          ...(typeof member.$BaseType === "string" ? { baseType: aliases.qualify(member.$BaseType) } : {}),
          ...(member.$Abstract === true ? { abstract: true as const } : {}),
          ...(member.$OpenType === true ? { openType: true as const } : {}),
        };
        if (member.$Kind === "EntityType") {
          const key = Array.isArray(member.$Key)
            ? member.$Key.flatMap((k) => (typeof k === "string" ? [k] : isObject(k) ? Object.values(k).filter((v): v is string => typeof v === "string") : []))
            : [];
          entityTypes.push({ ...base, key, ...(member.$HasStream === true ? { hasStream: true as const } : {}) });
        } else {
          complexTypes.push(base);
        }
        mergeAnnotations(annotations, qn, annotationsOf(member, aliases));
      } else if (member.$Kind === "EnumType") {
        const members = Object.entries(member)
          .filter(([k]) => !k.startsWith("$") && !k.includes("@"))
          .map(([k, v]) => ({ name: k, value: String(v) }));
        enumTypes.push({
          name,
          qualifiedName: qn,
          underlyingType: aliases.qualify(str(member.$UnderlyingType) ?? "Edm.Int32"),
          members,
          ...(member.$IsFlags === true ? { isFlags: true as const } : {}),
        });
      } else if (member.$Kind === "EntityContainer") {
        if (container === undefined || aliases.qualify(declaredContainer ?? "") === qn) container = qn;
        for (const [cName, c] of Object.entries(member)) {
          if (cName.startsWith("$") || cName.startsWith("@") || !isObject(c)) continue;
          if (typeof c.$Action === "string" || typeof c.$Function === "string") {
            const target = aliases.qualify((c.$Action ?? c.$Function) as string);
            const overload = unbound.get(target);
            if (overload) operations.push(readOperation(cName, overload.kind, overload.overload, resolve, str(c.$EntitySet)));
            continue;
          }
          if (typeof c.$Type !== "string") continue;
          const set: IrEntitySet = { name: cName, entityType: aliases.qualify(c.$Type), capabilities: {} };
          if (c.$Collection !== true) set.singleton = true;
          if (isObject(c.$NavigationPropertyBinding)) {
            const bindings = Object.entries(c.$NavigationPropertyBinding)
              .filter((e): e is [string, string] => typeof e[1] === "string")
              .map(([path, target]) => ({ path, target }));
            if (bindings.length > 0) set.navigationBindings = bindings;
          }
          entitySets.push(set);
          mergeAnnotations(annotations, `${qn}/${cName}`, annotationsOf(c, aliases));
        }
      }
    }
    // Bound operations belong to the type they bind.
    for (const [name, member] of Object.entries(schema)) {
      if (!Array.isArray(member)) continue;
      for (const o of member) {
        if (!isObject(o) || o.$IsBound !== true || (o.$Kind !== "Action" && o.$Kind !== "Function")) continue;
        operations.push(readOperation(name, o.$Kind === "Action" ? "action" : "function", o, resolve));
      }
    }
    if (isObject(schema.$Annotations)) {
      for (const [target, set] of Object.entries(schema.$Annotations)) {
        if (isObject(set)) mergeAnnotations(annotations, aliases.target(target), annotationsOf(set, aliases));
      }
    }
  }

  const ir: ContractIR = {
    irVersion: CONTRACT_IR_VERSION,
    odataVersion: "V4",
    edmxVersion,
    namespaces,
    entityTypes,
    complexTypes,
    enumTypes,
    entitySets,
    operations,
  };
  if (container) ir.container = container;
  applyAnnotations(ir, annotations);
  return { ok: true, ir };
}

function readOperation(
  name: string,
  kind: "action" | "function",
  o: JsonObject,
  resolve: (raw: string | undefined) => { type: string },
  entitySet?: string,
): IrOperation {
  const parameters: IrParameter[] = Array.isArray(o.$Parameter)
    ? o.$Parameter.flatMap((p): IrParameter[] => {
        if (!isObject(p) || typeof p.$Name !== "string") return [];
        const param: IrParameter = { name: p.$Name, type: resolve(str(p.$Type)).type, nullable: p.$Nullable === true };
        if (p.$Collection === true) param.collection = true;
        return [param];
      })
    : [];
  const op: IrOperation = { name, kind, parameters };
  if (o.$IsBound === true && parameters[0]) {
    op.bound = true;
    op.bindingType = parameters[0].type;
    if (parameters[0].collection) op.bindingCollection = true;
  }
  if (isObject(o.$ReturnType)) {
    op.returnType = {
      type: resolve(str(o.$ReturnType.$Type)).type,
      ...(o.$ReturnType.$Collection === true ? { collection: true as const } : {}),
      nullable: o.$ReturnType.$Nullable === true,
    };
  }
  const es = entitySet ?? str(o.$EntitySetPath);
  if (es) op.entitySet = es;
  return op;
}
