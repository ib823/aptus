/**
 * The part of a service ONE INTERFACE is a contract for (see InterfaceContract
 * in ir.ts for why a slice, not the whole service).
 *
 * The slice is self-contained: base types are folded into the entity type, the
 * entity set's per-property restrictions (V4 FilterRestrictions and
 * SortRestrictions) are folded into the properties they name, and every
 * complex and enum type a property reaches is carried along. A consumer of the
 * slice never needs the service's other types.
 */

import {
  CONTRACT_IR_VERSION,
  type ContractIR,
  type InterfaceContract,
  type IrComplexType,
  type IrEntityType,
  type IrEnumType,
  type IrProperty,
} from "@/lib/contracts/ir";

/** A base-type chain longer than this is treated as a cycle. */
const MAX_INHERITANCE_DEPTH = 16;

export type SliceResult =
  | { ok: true; contract: InterfaceContract }
  | { ok: false; reason: "NO_SUCH_ENTITY_SET" | "NO_SUCH_ENTITY_TYPE"; detail: string };

export function sliceForEntitySet(ir: ContractIR, entitySetName: string): SliceResult {
  const set = ir.entitySets.find((s) => s.name === entitySetName);
  if (!set) {
    return { ok: false, reason: "NO_SUCH_ENTITY_SET", detail: `The service declares no dataset called "${entitySetName}".` };
  }
  const types = new Map(ir.entityTypes.map((t) => [t.qualifiedName, t]));
  const root = types.get(set.entityType);
  if (!root) {
    return {
      ok: false,
      reason: "NO_SUCH_ENTITY_TYPE",
      detail: `The dataset "${entitySetName}" names an entity type the service does not declare.`,
    };
  }

  // Fold the base-type chain: base properties first, the nearest declared key.
  const chain: IrEntityType[] = [];
  for (let t: IrEntityType | undefined = root; t && chain.length < MAX_INHERITANCE_DEPTH; ) {
    if (chain.includes(t)) break;
    chain.push(t);
    t = t.baseType ? types.get(t.baseType) : undefined;
  }
  const lineage = [...chain].reverse();
  const entityType: IrEntityType = {
    ...root,
    key: chain.find((t) => t.key.length > 0)?.key ?? [],
    properties: lineage.flatMap((t) => t.properties.map((p) => ({ ...p }))),
    navigations: lineage.flatMap((t) => t.navigations.map((n) => ({ ...n }))),
  };
  delete entityType.baseType;

  // Set-level restrictions name properties of this set's type: fold them in.
  const caps = set.capabilities;
  const mark = (paths: string[] | undefined, apply: (p: IrProperty) => void) => {
    for (const path of paths ?? []) {
      const p = entityType.properties.find((x) => x.name === path);
      if (p) apply(p);
    }
  };
  mark(caps.nonFilterableProperties, (p) => (p.capabilities = { ...p.capabilities, filterable: false }));
  mark(caps.requiredFilterProperties, (p) => (p.capabilities = { ...p.capabilities, requiredInFilter: true }));
  mark(caps.nonSortableProperties, (p) => (p.capabilities = { ...p.capabilities, sortable: false }));

  // Every complex and enum type reachable from the entity type's properties.
  const complexByName = new Map(ir.complexTypes.map((t) => [t.qualifiedName, t]));
  const enumByName = new Map(ir.enumTypes.map((t) => [t.qualifiedName, t]));
  const complexTypes: IrComplexType[] = [];
  const enumTypes: IrEnumType[] = [];
  const seen = new Set<string>();
  const queue: IrProperty[] = [...entityType.properties];
  while (queue.length > 0) {
    const p = queue.shift()!;
    if (seen.has(p.type)) continue;
    seen.add(p.type);
    const ct = complexByName.get(p.type);
    if (ct) {
      // A complex type's own base chain is folded the same way.
      const props: IrProperty[] = [];
      const ctChain: IrComplexType[] = [];
      for (let t: IrComplexType | undefined = ct; t && ctChain.length < MAX_INHERITANCE_DEPTH; ) {
        if (ctChain.includes(t)) break;
        ctChain.push(t);
        t = t.baseType ? complexByName.get(t.baseType) : undefined;
      }
      for (const t of ctChain.reverse()) props.push(...t.properties.map((x) => ({ ...x })));
      const folded: IrComplexType = { ...ct, properties: props, navigations: [] };
      delete folded.baseType;
      complexTypes.push(folded);
      queue.push(...props);
      continue;
    }
    const en = enumByName.get(p.type);
    if (en) enumTypes.push(en);
  }

  const typeNames = new Set(chain.map((t) => t.qualifiedName));
  const operations = ir.operations.filter((op) =>
    op.bound ? op.bindingType !== undefined && typeNames.has(op.bindingType) : op.entitySet === set.name,
  );

  const entitySet = { ...set, capabilities: { ...set.capabilities } };
  return {
    ok: true,
    contract: {
      irVersion: CONTRACT_IR_VERSION,
      odataVersion: ir.odataVersion,
      source: "METADATA",
      entitySet,
      entityType,
      complexTypes,
      enumTypes,
      operations,
    },
  };
}
