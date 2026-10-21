/**
 * The part of a service ONE INTERFACE is a contract for (see InterfaceContract
 * in ir.ts for why a slice, not the whole service).
 *
 * The slice is self-contained: base types are folded into the entity type, the
 * entity set's per-property restrictions (V4 FilterRestrictions and
 * SortRestrictions) are folded into the properties they name, and every
 * complex and enum type a property reaches is carried along. A consumer of the
 * slice never needs the service's other types.
 *
 * BOUNDED BY WHAT IT WAS CUT FROM. Folding copies: each complex type that
 * derives from a base carries its own copy of the base's properties, so N
 * types over one base of B properties are N×B properties from N+B
 * declarations — a 250 KB description became a 210 MB contract, stored and
 * re-read on every /schema call. The slice is refused (TOO_LARGE) once it
 * would hold more than twice the members of the whole description plus a
 * fixed allowance, which no description whose inheritance is ordinary comes
 * near: real base chains are short and shared by few types.
 *
 * IN BYTES TOO. Counting members is not enough: one base property with a
 * 300,000-character label, folded into 2,000 derived types, is 2,000 members
 * and 600 MB of canonical JSON. The copies share the string, so the slice
 * itself stayed small; the digest then serialised all of it before the size
 * check could refuse it, and threw (P1 wave A review). So each copy is also
 * charged its own JSON length — measured once per declaration — and the slice
 * is refused once the copies alone exceed MAX_CONTRACT_BYTES: canonical JSON
 * is never shorter than that, so such a contract could never be stored, and
 * nothing that could have been is refused here. The operations the slice
 * keeps are charged the same way: each import is its own copy of its
 * action's parameters.
 *
 * AND IN PROPORTION TO THE DESCRIPTION. The absolute bound alone let a tiny
 * description make the largest contract stored: one labelled base type
 * folded into 100 derived types was 1.8 MB from 31 KB (58x), an action of 200
 * parameters imported 200 times 2.1 MB from 19 KB (107x), and every /schema
 * call rendered that back at 245x (hostile-input review round 3). So when the
 * caller says how long the document was (CompileResult.sourceLength, which
 * the verify passes), the slice is also refused once it would be larger, as
 * JSON, than SLICE_BYTES_PER_SOURCE_CHAR times that length, or
 * SLICE_BYTES_FLOOR, whichever is more. The copies are charged as they are
 * made; whatever the slice carries that is not a copy (the set, its types'
 * own headers, the enum types, the restrictions folded in) is measured once
 * at the end, by a walk that stops at the limit (jsonBytesAtLeast). So what
 * the slice accepts is at most that many bytes of JSON (exactly, for plain
 * ASCII), and so is what is stored and read back.
 *
 * WHY 12. A slice holds the part of the description its dataset reaches,
 * and the IR spells a declaration out in full where the document may not:
 * CSDL JSON's `"P":{}` is a 48-byte property in the IR (its type, its
 * nullability), and a type definition's facets are copied into every
 * property that uses it. A real description's base chains are short and
 * shared by few types, so its slice stays well under 12x. The floor keeps a
 * small description's ordinary folding from being refused.
 */

import { jsonBytesAtLeast, MAX_CONTRACT_BYTES } from "@/lib/contracts/canonical";
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

/** The allowance on top of twice the description's own members (see above). */
const SLICE_MEMBER_ALLOWANCE = 10_000;

/** A slice's JSON may be this many bytes per character of the description it was cut from (see above)… */
export const SLICE_BYTES_PER_SOURCE_CHAR = 12;
/** …or this many, whichever is more; never more than MAX_CONTRACT_BYTES. */
export const SLICE_BYTES_FLOOR = 128 * 1024;

/** The most bytes of JSON a slice of a `sourceLength`-character description may be. */
export function sliceByteLimit(sourceLength: number | undefined): number {
  if (sourceLength === undefined) return MAX_CONTRACT_BYTES;
  return Math.min(MAX_CONTRACT_BYTES, Math.max(SLICE_BYTES_FLOOR, SLICE_BYTES_PER_SOURCE_CHAR * sourceLength));
}

export type SliceResult =
  | { ok: true; contract: InterfaceContract }
  | { ok: false; reason: "NO_SUCH_ENTITY_SET" | "NO_SUCH_ENTITY_TYPE" | "TOO_LARGE"; detail: string };

/**
 * Properties, navigations and parameters the description itself declares.
 * In V4 an unbound operation in the IR is an IMPORT, a copy of its action's
 * parameters, so its parameters are not counted: counting every copy let the
 * copies raise the very bound they are charged against (hostile-input review
 * round 3). The allowance covers what a real service's imports carry.
 */
function membersOf(ir: ContractIR): number {
  let n = 0;
  for (const t of ir.entityTypes) n += t.properties.length + t.navigations.length;
  for (const t of ir.complexTypes) n += t.properties.length + t.navigations.length;
  for (const op of ir.operations) n += ir.odataVersion === "V4" && op.bound !== true ? 1 : 1 + op.parameters.length;
  return n;
}

class SliceTooLarge extends Error {
  constructor(readonly by: "members" | "bytes") {
    super(by);
  }
}

/**
 * `sourceLength`: the length of the document `ir` was compiled from
 * (CompileResult.sourceLength). Given, the slice is bounded in proportion to
 * it as well as absolutely (see above); every caller that stores or serves
 * the slice passes it.
 */
export function sliceForEntitySet(ir: ContractIR, entitySetName: string, sourceLength?: number): SliceResult {
  const limit = 2 * membersOf(ir) + SLICE_MEMBER_ALLOWANCE;
  const byteLimit = sliceByteLimit(sourceLength);
  const tooLarge = (by: "members" | "bytes"): SliceResult => ({
    ok: false,
    reason: "TOO_LARGE",
    detail:
      by === "members"
        ? `The dataset "${entitySetName}" reaches more than ${limit} members once its types' base types are folded in.`
        : byteLimit < MAX_CONTRACT_BYTES
          ? `The dataset "${entitySetName}" would be more than ${SLICE_BYTES_PER_SOURCE_CHAR} times the size of the service's description once its types' base types and its operations' parameters are copied in.`
          : `The dataset "${entitySetName}" would be larger than ${MAX_CONTRACT_BYTES / (1024 * 1024)} MB once its types' base types are folded in.`,
  });
  try {
    const r = slice(ir, entitySetName, limit, byteLimit);
    // What is not a copy, measured once: never past the limit (jsonBytesAtLeast stops there).
    // At the absolute bound the digest measures it exactly (boundedContractDigest, canonical.ts).
    if (r.ok && byteLimit < MAX_CONTRACT_BYTES && jsonBytesAtLeast(r.contract, byteLimit) > byteLimit) return tooLarge("bytes");
    return r;
  } catch (err) {
    if (!(err instanceof SliceTooLarge)) throw err;
    return tooLarge(err.by);
  }
}

function slice(ir: ContractIR, entitySetName: string, limit: number, byteLimit: number): SliceResult {
  let spent = 0;
  const spend = (n: number) => {
    spent += n;
    if (spent > limit) throw new SliceTooLarge("members");
  };
  let bytes = 0;
  /** Each declaration's JSON length, measured once however many times it is folded. */
  const sizes = new WeakMap<object, number>();
  const spendBytes = (x: object) => {
    let n = sizes.get(x);
    if (n === undefined) {
      n = JSON.stringify(x).length;
      sizes.set(x, n);
    }
    bytes += n;
    if (bytes > byteLimit) throw new SliceTooLarge("bytes");
  };
  /** Copies of each list, in order, with the budget spent before each is made; never a spread of a long array. */
  const copyInto = <T extends object>(into: T[], from: readonly T[]) => {
    spend(from.length);
    for (const x of from) {
      spendBytes(x);
      into.push({ ...x });
    }
  };

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
  const entityType: IrEntityType = { ...root, key: chain.find((t) => t.key.length > 0)?.key ?? [], properties: [], navigations: [] };
  for (const t of lineage) {
    copyInto(entityType.properties, t.properties);
    copyInto(entityType.navigations, t.navigations);
  }
  delete entityType.baseType;

  // Set-level restrictions name properties of this set's type: fold them in.
  // By map, not by a scan per path: a description can list as many paths as
  // properties, and this runs on the verify request.
  const caps = set.capabilities;
  const propertyByName = new Map<string, IrProperty>();
  for (const p of entityType.properties) if (!propertyByName.has(p.name)) propertyByName.set(p.name, p);
  const mark = (paths: string[] | undefined, apply: (p: IrProperty) => void) => {
    for (const path of paths ?? []) {
      const p = propertyByName.get(path);
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
  const queue: IrProperty[] = entityType.properties.slice();
  // A cursor, not shift(): shifting a long array is linear each time.
  for (let next = 0; next < queue.length; next++) {
    const p = queue[next]!;
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
      for (const t of ctChain.reverse()) copyInto(props, t.properties);
      const folded: IrComplexType = { ...ct, properties: props, navigations: [] };
      delete folded.baseType;
      complexTypes.push(folded);
      for (const x of props) queue.push(x);
      continue;
    }
    const en = enumByName.get(p.type);
    if (en) enumTypes.push(en);
  }

  // Bound to the type (V4), acting on it (V2 sap:action-for), or returning into the set.
  const typeNames = new Set(chain.map((t) => t.qualifiedName));
  const operations = ir.operations.filter((op) =>
    op.bound
      ? op.bindingType !== undefined && typeNames.has(op.bindingType)
      : op.entitySet === set.name || (op.actionFor !== undefined && typeNames.has(op.actionFor)),
  );
  // Charged in bytes as well as members, like a folded property: an import
  // carries its action's parameters, sharing their strings, so 399 imports
  // of one action with 1,000 long-named parameters were a 1.6 MB description
  // and 600 MB of canonical JSON that the digest threw on, or exhausted the
  // heap building (hostile-input review round 2).
  for (const op of operations) {
    spend(1 + op.parameters.length);
    spendBytes(op);
  }

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
