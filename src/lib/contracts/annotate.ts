/**
 * Fold the vocabulary annotations a document declared onto the IR it
 * describes. Shared by the XML and JSON readers, so a term means the same
 * thing whichever form the description arrived in.
 *
 * Targets are the CSDL ones: "ns.Type", "ns.Type/Property",
 * "ns.Container/EntitySet". A V2 `sap:` attribute already on the IR wins over
 * the equivalent vocabulary term — it is what SAP's V2 runtime enforces.
 */

import type {
  ContractIR,
  IrEntitySetCapabilities,
  IrPersonalData,
  IrProperty,
  IrPropertyCapabilities,
  IrStructuredType,
} from "@/lib/contracts/ir";
import {
  boolTerm,
  recordBool,
  recordPaths,
  stringTerm,
  type AnnotationSet,
} from "@/lib/contracts/vocabulary";

/**
 * What the readers' MemberBudget offers (csdl-xml.ts). Every property path a
 * capability term copies onto an entity set spends one unit, so what the IR
 * carries stays bounded by the element bound however the targets are named
 * (hostile-input review round 1: one target's P paths copied onto N sets
 * spent nothing, and N×P exhausted the heap).
 */
export interface EmitBudget {
  spend(n?: number): void;
}

export function applyAnnotations(
  ir: ContractIR,
  annotations: ReadonlyMap<string, AnnotationSet>,
  budget: EmitBudget,
  /** The container each entity set was declared in; defaults to the IR's container. */
  containerOf?: ReadonlyMap<string, string>,
): void {
  if (annotations.size === 0) return;

  const structured: IrStructuredType[] = [...ir.entityTypes, ...ir.complexTypes];
  for (const t of structured) {
    const typeSet = annotations.get(t.qualifiedName);
    if (!t.label) {
      const label = stringTerm(typeSet, "Common.Label");
      if (label) t.label = label;
    }
    for (const p of t.properties) applyToProperty(p, annotations.get(`${t.qualifiedName}/${p.name}`));
  }

  for (const et of ir.entityTypes) {
    const set = annotations.get(et.qualifiedName);
    const entitySemantics = stringTerm(set, "PersonalData.EntitySemantics");
    const dataSubjectRole = stringTerm(set, "PersonalData.DataSubjectRole");
    if (entitySemantics || dataSubjectRole) {
      et.personalData = {
        ...(entitySemantics ? { entitySemantics } : {}),
        ...(dataSubjectRole ? { dataSubjectRole } : {}),
      };
    }
  }

  for (const es of ir.entitySets) {
    const container = containerOf?.get(es.name) ?? ir.container;
    if (!container) continue;
    const set = annotations.get(`${container}/${es.name}`);
    if (!set) continue;
    if (!es.label) {
      const label = stringTerm(set, "Common.Label");
      if (label) es.label = label;
    }
    applyCapabilities(es.capabilities, set, budget);
  }
}

function applyToProperty(p: IrProperty, set: AnnotationSet | undefined): void {
  if (!set) return;
  if (!p.label) {
    const label = stringTerm(set, "Common.Label");
    if (label) p.label = label;
  }
  if (!p.quickInfo) {
    const quickInfo = stringTerm(set, "Common.QuickInfo");
    if (quickInfo) p.quickInfo = quickInfo;
  }
  const caps: IrPropertyCapabilities = { ...p.capabilities };
  const computed = boolTerm(set, "Core.Computed");
  if (computed !== undefined) caps.computed = computed;
  const immutable = boolTerm(set, "Core.Immutable");
  if (immutable !== undefined) caps.immutable = immutable;
  // A static field control only; a path (dynamic per record) is not a contract.
  const fieldControl = stringTerm(set, "Common.FieldControl");
  if (fieldControl === "Mandatory" && caps.mandatory === undefined) caps.mandatory = true;
  if (Object.keys(caps).length > 0) p.capabilities = caps;

  const pd: IrPersonalData = {};
  const personal = boolTerm(set, "PersonalData.IsPotentiallyPersonal");
  if (personal !== undefined) pd.isPotentiallyPersonal = personal;
  const sensitive = boolTerm(set, "PersonalData.IsPotentiallySensitive");
  if (sensitive !== undefined) pd.isPotentiallySensitive = sensitive;
  const semantics = stringTerm(set, "PersonalData.FieldSemantics");
  if (semantics) pd.fieldSemantics = semantics;
  if (Object.keys(pd).length > 0) p.personalData = pd;
}

function applyCapabilities(caps: IrEntitySetCapabilities, set: AnnotationSet, budget: EmitBudget): void {
  // A V2 sap: flag already read wins; the term only fills what was not stated.
  const fill = <K extends keyof IrEntitySetCapabilities>(key: K, value: IrEntitySetCapabilities[K] | undefined) => {
    if (value !== undefined && caps[key] === undefined) caps[key] = value;
  };
  fill("creatable", recordBool(set, "Capabilities.InsertRestrictions", "Insertable"));
  fill("updatable", recordBool(set, "Capabilities.UpdateRestrictions", "Updatable"));
  fill("deletable", recordBool(set, "Capabilities.DeleteRestrictions", "Deletable"));
  fill("topSupported", boolTerm(set, "Capabilities.TopSupported"));
  fill("skipSupported", boolTerm(set, "Capabilities.SkipSupported"));
  fill("countable", recordBool(set, "Capabilities.CountRestrictions", "Countable"));
  fill("searchable", recordBool(set, "Capabilities.SearchRestrictions", "Searchable"));
  fill("filterable", recordBool(set, "Capabilities.FilterRestrictions", "Filterable"));
  fill("requiresFilter", recordBool(set, "Capabilities.FilterRestrictions", "RequiresFilter"));
  fill("sortable", recordBool(set, "Capabilities.SortRestrictions", "Sortable"));
  fill("selectSupported", recordBool(set, "Capabilities.SelectSupport", "Supported"));
  fill("expandable", recordBool(set, "Capabilities.ExpandRestrictions", "Expandable"));
  const paths = (key: "nonFilterableProperties" | "requiredFilterProperties" | "nonSortableProperties", term: string, property: string) => {
    if (caps[key] !== undefined) return;
    const list = recordPaths(set, term, property);
    if (!list || list.length === 0) return;
    budget.spend(list.length);
    caps[key] = list;
  };
  paths("nonFilterableProperties", "Capabilities.FilterRestrictions", "NonFilterableProperties");
  paths("requiredFilterProperties", "Capabilities.FilterRestrictions", "RequiredProperties");
  paths("nonSortableProperties", "Capabilities.SortRestrictions", "NonSortableProperties");
}
