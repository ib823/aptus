/**
 * The structural diff between two versions of an interface's contract, and the
 * semantic-version bump it implies.
 *
 * THE RULES (a consumer's view: would code written against the old contract
 * still be right against the new one?):
 *
 *   MAJOR — something a consumer relied on is gone or tighter:
 *     the dataset or key changed; a property, navigation, operation, enum
 *     member or parameter removed (a rename is a removal plus an addition); a
 *     type changed; a property became mandatory on create, or a mandatory one
 *     was added (required-added); nullability changed either way (a reader's
 *     generated types are non-null, or a writer's null is now refused); a
 *     length, precision or scale got smaller; a capability withdrawn (no
 *     longer creatable, updatable, deletable, filterable, sortable,
 *     addressable, pageable, …) or a filter newly required; a property became
 *     computed or immutable; an open entity or complex type closed. An
 *     operation is compared with its own overload (same name and binding),
 *     never with another of the same name.
 *   MINOR — something was added or loosened: an optional property,
 *     navigation, operation (or overload), enum member or optional parameter
 *     added; a length, precision or scale grew; a capability granted; a
 *     closed entity or complex type opened.
 *   PATCH — only what the contract SAYS about itself changed: labels, quick
 *     info, semantics, display formats, PersonalData annotations, default
 *     values, partners, bindings, an entity type's own name.
 *
 * A change of SOURCE (sampled rows ↔ $metadata) compares what both can say —
 * property names — and is major when a property disappears, minor otherwise:
 * the two descriptions are not comparable field by field, and pretending they
 * were would turn every first $metadata compile into a "type change". Two
 * SAMPLED contracts are compared the same way: what a sample observed (a type
 * only where a value was seen, null only where one happened to be) is not a
 * declaration, and a capture whose rows held a value where the last one's held
 * null has not changed the service.
 */

import { canonicalJson } from "@/lib/contracts/canonical";
import type {
  InterfaceContract,
  IrEntitySetCapabilities,
  IrNavigation,
  IrOperation,
  IrProperty,
  IrPropertyCapabilities,
} from "@/lib/contracts/ir";

export type Bump = "major" | "minor" | "patch";

export interface ContractChange {
  bump: Bump;
  /** Where: "property:BirthDate", "entitySet", "operation:Release", … */
  at: string;
  /** One plain sentence. */
  change: string;
}

export interface ContractDiff {
  /** null when nothing a consumer can see changed. */
  bump: Bump | null;
  changes: ContractChange[];
}

const RANK: Record<Bump, number> = { patch: 1, minor: 2, major: 3 };

/**
 * WHAT A SNAPSHOT STORES OF ITS DIFF, BOUNDED. A diff is cheap to compute but
 * repeats a name in every change made against it: 2,000 renamed parameters of
 * one bound action whose name ran to 65,000 characters were a 260 MB diff
 * from a 170 KB contract, past PostgreSQL's jsonb limit, and at 200,000 a
 * RangeError while it was serialised — so the interface could never record
 * again (hostile-input review round 1). The bump is always kept whole; of
 * the changes, at most MAX_STORED_CHANGES (the most severe first when there
 * are more, with the count left out in `omitted`), each `at` and `change` cut
 * to MAX_CHANGE_TEXT characters. So a stored diff is under
 * MAX_STORED_DIFF_BYTES whatever the contract, which storedDiff asserts.
 */
export const MAX_STORED_CHANGES = 200;
export const MAX_CHANGE_TEXT = 300;
/** 200 changes of two 300-character strings (up to 3 UTF-8 bytes each, 6 once escaped) and their keys. */
export const MAX_STORED_DIFF_BYTES = 1024 * 1024;

export interface StoredContractDiff extends ContractDiff {
  /** How many changes were left out of `changes`; absent when none were. */
  omitted?: number;
}

/** A string cut to `max` UTF-16 units, never between the halves of a surrogate pair. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  let end = max - 1;
  const code = s.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${s.slice(0, end)}…`;
}

export function storedDiff(diff: ContractDiff): StoredContractDiff {
  let kept = diff.changes;
  if (kept.length > MAX_STORED_CHANGES) {
    // Stable: the most severe first, each severity in the diff's own order.
    kept = kept
      .map((c, i) => ({ c, i }))
      .sort((a, b) => RANK[b.c.bump] - RANK[a.c.bump] || a.i - b.i)
      .slice(0, MAX_STORED_CHANGES)
      .map((e) => e.c);
  }
  const out: StoredContractDiff = {
    bump: diff.bump,
    changes: kept.map((c) => ({ bump: c.bump, at: cut(c.at, MAX_CHANGE_TEXT), change: cut(c.change, MAX_CHANGE_TEXT) })),
  };
  if (kept.length < diff.changes.length) out.omitted = diff.changes.length - kept.length;
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_STORED_DIFF_BYTES) {
    // Unreachable with the caps above; a guard, so the bound holds if they change.
    return { bump: diff.bump, changes: [], omitted: diff.changes.length };
  }
  return out;
}

/**
 * Canonical, so key order never reads as a change: a snapshot read back from
 * the database is JSONB, which does not keep the order its keys were written in.
 */
const canon = (v: unknown): string => canonicalJson(v);

export function diffContracts(prev: InterfaceContract, next: InterfaceContract): ContractDiff {
  const changes: ContractChange[] = [];
  const add = (bump: Bump, at: string, change: string) => changes.push({ bump, at, change });

  if (prev.entitySet.name !== next.entitySet.name) {
    add("major", "entitySet", `The dataset changed from ${prev.entitySet.name} to ${next.entitySet.name}.`);
  }
  if (prev.odataVersion !== next.odataVersion) {
    add("major", "odataVersion", `The service changed from OData ${prev.odataVersion} to ${next.odataVersion}.`);
  }

  if (prev.source !== next.source || next.source === "SAMPLED") {
    const nextNames = new Set(next.entityType.properties.map((p) => p.name));
    for (const p of prev.entityType.properties) {
      if (!nextNames.has(p.name)) add("major", `property:${p.name}`, `${p.name} is no longer described.`);
    }
    if (prev.source === next.source) {
      const prevNames = new Set(prev.entityType.properties.map((p) => p.name));
      for (const p of next.entityType.properties) {
        if (!prevNames.has(p.name)) add("minor", `property:${p.name}`, `${p.name} was added.`);
      }
      return finish(changes);
    }
    add(
      "minor",
      "source",
      next.source === "METADATA"
        ? "The contract is now compiled from the service's own description instead of sampled rows."
        : "The contract is now inferred from sampled rows; the service's description could not be read.",
    );
    return finish(changes);
  }

  // Entity set and type.
  diffSetCapabilities(prev.entitySet.capabilities, next.entitySet.capabilities, add);
  if ((prev.entitySet.label ?? "") !== (next.entitySet.label ?? "")) add("patch", "entitySet", "The dataset's label changed.");
  if (canon(prev.entitySet.navigationBindings ?? []) !== canon(next.entitySet.navigationBindings ?? [])) {
    add("patch", "entitySet", "The dataset's navigation bindings changed.");
  }
  if (prev.entityType.qualifiedName !== next.entityType.qualifiedName) {
    add("patch", "entityType", `The entity type is now called ${next.entityType.qualifiedName}.`);
  }
  if ((prev.entityType.label ?? "") !== (next.entityType.label ?? "")) add("patch", "entityType", "The entity type's label changed.");
  if (canon(prev.entityType.personalData ?? {}) !== canon(next.entityType.personalData ?? {})) {
    add("patch", "entityType", "The entity type's personal-data annotations changed.");
  }
  if (prev.entityType.key.join(",") !== next.entityType.key.join(",")) {
    add("major", "key", `The key changed from (${prev.entityType.key.join(", ")}) to (${next.entityType.key.join(", ")}).`);
  }
  // Closing an open type withdraws the dynamic properties clients sent and read.
  if (prev.entityType.openType === true && next.entityType.openType !== true) {
    add("major", "entityType", "The entity type no longer accepts dynamic properties.");
  } else if (prev.entityType.openType !== true && next.entityType.openType === true) {
    add("minor", "entityType", "The entity type now accepts dynamic properties.");
  }

  diffProperties("property", prev.entityType.properties, next.entityType.properties, add);
  diffNavigations(prev.entityType.navigations, next.entityType.navigations, add);

  // Reachable complex and enum types.
  const prevComplex = new Map(prev.complexTypes.map((t) => [t.qualifiedName, t]));
  for (const t of next.complexTypes) {
    const before = prevComplex.get(t.qualifiedName);
    if (!before) continue;
    diffProperties(`complexType:${t.name}`, before.properties, t.properties, add);
    // Its schema's additionalProperties follows openType (json-schema.ts):
    // closed, the dynamic properties clients send are refused.
    if (before.openType === true && t.openType !== true) {
      add("major", `complexType:${t.name}`, `${t.name} no longer accepts dynamic properties.`);
    } else if (before.openType !== true && t.openType === true) {
      add("minor", `complexType:${t.name}`, `${t.name} now accepts dynamic properties.`);
    }
  }
  const prevEnum = new Map(prev.enumTypes.map((t) => [t.qualifiedName, t]));
  for (const t of next.enumTypes) {
    const before = prevEnum.get(t.qualifiedName);
    if (!before) continue;
    const now = new Map(t.members.map((m) => [m.name, m.value]));
    for (const m of before.members) {
      if (!now.has(m.name)) add("major", `enumType:${t.name}`, `The value ${m.name} was removed.`);
      else if (now.get(m.name) !== m.value) add("major", `enumType:${t.name}`, `The value ${m.name} changed its number.`);
    }
    const then = new Set(before.members.map((m) => m.name));
    for (const m of t.members) if (!then.has(m.name)) add("minor", `enumType:${t.name}`, `The value ${m.name} was added.`);
  }

  diffOperations(prev.operations, next.operations, add);
  return finish(changes);
}

function finish(changes: ContractChange[]): ContractDiff {
  let bump: Bump | null = null;
  for (const c of changes) if (bump === null || RANK[c.bump] > RANK[bump]) bump = c.bump;
  return { bump, changes };
}

type Add = (bump: Bump, at: string, change: string) => void;

/** Treat "not stated" as allowed: V2's rule for an omitted sap: flag, and the V4 default. */
function allowed(v: boolean | undefined): boolean {
  return v !== false;
}

function diffSetCapabilities(prev: IrEntitySetCapabilities, next: IrEntitySetCapabilities, add: Add): void {
  const flags: (keyof IrEntitySetCapabilities)[] = [
    "creatable",
    "updatable",
    "deletable",
    "addressable",
    "pageable",
    "topSupported",
    "skipSupported",
    "countable",
    "searchable",
    "filterable",
    "sortable",
    "selectSupported",
    "expandable",
  ];
  for (const f of flags) {
    const a = prev[f] as boolean | undefined;
    const b = next[f] as boolean | undefined;
    if (a === b) continue;
    if (allowed(a) && !allowed(b)) add("major", "entitySet", `The dataset is no longer ${f}.`);
    else if (!allowed(a) && allowed(b)) add("minor", "entitySet", `The dataset is now ${f}.`);
    else add("patch", "entitySet", `The dataset's ${f} flag is now stated differently.`);
  }
  if (prev.requiresFilter !== true && next.requiresFilter === true) add("major", "entitySet", "Reading the dataset now requires a filter.");
  if (prev.requiresFilter === true && next.requiresFilter !== true) add("minor", "entitySet", "Reading the dataset no longer requires a filter.");
}

function compareFacet(
  at: string,
  what: string,
  a: number | string | undefined,
  b: number | string | undefined,
  add: Add,
): void {
  if (a === b) return;
  // "max", "variable", "floating" and an absent facet are unbounded.
  const num = (v: number | string | undefined) => (typeof v === "number" ? v : Number.POSITIVE_INFINITY);
  if (num(b) < num(a)) add("major", at, `${what} shrank from ${a ?? "unbounded"} to ${b ?? "unbounded"}.`);
  else if (num(b) > num(a)) add("minor", at, `${what} grew from ${a ?? "unbounded"} to ${b ?? "unbounded"}.`);
  else add("patch", at, `${what} is now stated as ${b ?? "unbounded"}.`);
}

function diffPropertyCapabilities(at: string, a: IrPropertyCapabilities = {}, b: IrPropertyCapabilities = {}, add: Add): void {
  for (const f of ["creatable", "updatable", "filterable", "sortable"] as const) {
    if (allowed(a[f]) && !allowed(b[f])) add("major", at, `It is no longer ${f}.`);
    else if (!allowed(a[f]) && allowed(b[f])) add("minor", at, `It is now ${f}.`);
  }
  for (const f of ["computed", "immutable", "requiredInFilter"] as const) {
    if (a[f] !== true && b[f] === true) add("major", at, `It is now ${f === "requiredInFilter" ? "required in every filter" : f}.`);
    else if (a[f] === true && b[f] !== true) add("minor", at, `It is no longer ${f === "requiredInFilter" ? "required in every filter" : f}.`);
  }
  if (a.mandatory !== true && b.mandatory === true) add("major", at, "It must now be sent on create.");
  else if (a.mandatory === true && b.mandatory !== true) add("minor", at, "It no longer has to be sent on create.");
}

function diffProperties(scope: string, prev: readonly IrProperty[], next: readonly IrProperty[], add: Add): void {
  const before = new Map(prev.map((p) => [p.name, p]));
  const after = new Map(next.map((p) => [p.name, p]));
  for (const [name, a] of before) {
    const at = `${scope}:${name}`;
    const b = after.get(name);
    if (!b) {
      add("major", at, `${name} was removed.`);
      continue;
    }
    if (a.type !== b.type || (a.collection ?? false) !== (b.collection ?? false)) {
      add("major", at, `Its type changed from ${typeLabel(a)} to ${typeLabel(b)}.`);
    }
    if (a.nullable !== b.nullable) {
      add("major", at, b.nullable ? "It may now be null." : "It may no longer be null.");
    }
    compareFacet(at, "Its maximum length", a.maxLength, b.maxLength, add);
    compareFacet(at, "Its precision", a.precision, b.precision, add);
    compareFacet(at, "Its scale", a.scale, b.scale, add);
    diffPropertyCapabilities(at, a.capabilities, b.capabilities, add);
    for (const f of ["label", "quickInfo", "semantics", "displayFormat", "defaultValue"] as const) {
      if ((a[f] ?? "") !== (b[f] ?? "")) add("patch", at, `Its ${f} changed.`);
    }
    if ((a.fixedLength ?? false) !== (b.fixedLength ?? false)) add("patch", at, "Its fixed-length flag changed.");
    if (canon(a.personalData ?? {}) !== canon(b.personalData ?? {})) {
      add("patch", at, "Its personal-data annotations changed.");
    }
  }
  for (const [name, b] of after) {
    if (before.has(name)) continue;
    if (b.capabilities?.mandatory === true) add("major", `${scope}:${name}`, `${name} was added and must be sent on create.`);
    else add("minor", `${scope}:${name}`, `${name} was added.`);
  }
}

function typeLabel(p: IrProperty): string {
  return p.collection ? `Collection(${p.type})` : p.type;
}

function diffNavigations(prev: readonly IrNavigation[], next: readonly IrNavigation[], add: Add): void {
  const after = new Map(next.map((n) => [n.name, n]));
  for (const a of prev) {
    const at = `navigation:${a.name}`;
    const b = after.get(a.name);
    if (!b) add("major", at, `${a.name} was removed.`);
    else if (a.target !== b.target || a.collection !== b.collection) add("major", at, "Its target or cardinality changed.");
    else if (
      (a.nullable ?? null) !== (b.nullable ?? null) ||
      (a.partner ?? "") !== (b.partner ?? "") ||
      (a.containsTarget ?? false) !== (b.containsTarget ?? false) ||
      canon(a.referentialConstraints ?? []) !== canon(b.referentialConstraints ?? [])
    ) {
      add("patch", at, "Its partner, containment or constraints changed.");
    }
  }
  const before = new Set(prev.map((n) => n.name));
  for (const b of next) if (!before.has(b.name)) add("minor", `navigation:${b.name}`, `${b.name} was added.`);
}

/**
 * Which operation of the other contract each one is a version of. A name is
 * not enough: bound overloads share one (bound to the type, to a collection
 * of it, to a base type), and comparing each with the last of its name read
 * unrelated parameters as changed — a major bump for an added optional
 * property (P1 wave A review). Operations are matched by name and binding;
 * where that still leaves several on a side (function overloads that differ
 * by their parameters), by their parameter names as well. One left over is
 * an overload removed or added.
 */
function matchOperations(
  prev: readonly IrOperation[],
  next: readonly IrOperation[],
): { pairs: [IrOperation, IrOperation][]; removed: IrOperation[]; added: IrOperation[] } {
  const binding = (o: IrOperation) =>
    `${o.name}\u0000${o.bound === true ? `${o.bindingCollection === true ? "Collection:" : ""}${o.bindingType ?? ""}` : ""}`;
  const signature = (o: IrOperation) =>
    `${binding(o)}\u0000${o.parameters
      .slice(o.bound === true ? 1 : 0)
      .map((p) => p.name)
      .sort()
      .join(",")}`;
  const group = (ops: readonly IrOperation[], key: (o: IrOperation) => string) => {
    const out = new Map<string, IrOperation[]>();
    for (const o of ops) {
      const k = key(o);
      const list = out.get(k);
      if (list) list.push(o);
      else out.set(k, [o]);
    }
    return out;
  };
  const pairs: [IrOperation, IrOperation][] = [];
  const removed: IrOperation[] = [];
  const added: IrOperation[] = [];
  const before = group(prev, binding);
  const after = group(next, binding);
  for (const [k, as] of before) {
    const bs = after.get(k) ?? [];
    if (as.length === 1 && bs.length === 1) {
      // The ordinary case: one operation of this name and binding, whatever its parameters became.
      pairs.push([as[0]!, bs[0]!]);
      continue;
    }
    const bySignature = group(bs, signature);
    for (const a of as) {
      const b = bySignature.get(signature(a))?.shift();
      if (b) pairs.push([a, b]);
      else removed.push(a);
    }
    for (const rest of bySignature.values()) added.push(...rest);
  }
  for (const [k, bs] of after) if (!before.has(k)) added.push(...bs);
  return { pairs, removed, added };
}

/** " (bound to X)" for a bound operation, so two overloads' changes read apart. */
function boundTo(o: IrOperation): string {
  if (o.bound !== true) return "";
  return ` (bound to ${o.bindingCollection === true ? `Collection(${o.bindingType ?? ""})` : (o.bindingType ?? "")})`;
}

function diffOperations(prev: readonly IrOperation[], next: readonly IrOperation[], add: Add): void {
  const { pairs, removed, added } = matchOperations(prev, next);
  for (const a of removed) add("major", `operation:${a.name}`, `${a.name}${boundTo(a)} was removed.`);
  for (const [a, b] of pairs) {
    const at = `operation:${a.name}`;
    if (a.kind !== b.kind || (a.httpMethod ?? "") !== (b.httpMethod ?? "") || (a.bound ?? false) !== (b.bound ?? false)) {
      add("major", at, "How it is invoked changed.");
    }
    if (canon(a.returnType ?? null) !== canon(b.returnType ?? null)) add("major", at, "Its result changed.");
    const params = new Map(b.parameters.map((p) => [p.name, p]));
    for (const p of a.parameters) {
      const q = params.get(p.name);
      if (!q) add("major", at, `Its parameter ${p.name} was removed.`);
      else if (p.type !== q.type || (p.collection ?? false) !== (q.collection ?? false)) add("major", at, `Its parameter ${p.name} changed type.`);
      else if (p.nullable && !q.nullable) add("major", at, `Its parameter ${p.name} is now required.`);
    }
    const had = new Set(a.parameters.map((p) => p.name));
    for (const q of b.parameters) {
      if (had.has(q.name)) continue;
      add(q.nullable ? "minor" : "major", at, `It gained the ${q.nullable ? "optional" : "required"} parameter ${q.name}.`);
    }
    if ((a.label ?? "") !== (b.label ?? "")) add("patch", at, "Its label changed.");
  }
  for (const b of added) add("minor", `operation:${b.name}`, `${b.name}${boundTo(b)} was added.`);
}

/** "1.4.2" + "minor" → "1.5.0"; the first version is 1.0.0. An unreadable previous version reads as 0.0.0. */
export function nextSemver(previous: string | null, bump: Bump): string {
  if (previous === null) return "1.0.0";
  const parts = previous.split(".").map((n) => Number.parseInt(n, 10));
  const [major, minor, patch] = parts.length === 3 && parts.every((n) => Number.isInteger(n) && n >= 0) ? parts : [0, 0, 0];
  if (bump === "major") return `${major! + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor! + 1}.0`;
  return `${major}.${minor}.${patch! + 1}`;
}

/** "1.4.2" → [1, 4, 2]; for ordering and the database's unique key. */
export function semverParts(v: string): [number, number, number] {
  const parts = v.split(".").map((n) => Number.parseInt(n, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
