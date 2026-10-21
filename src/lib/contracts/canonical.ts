/**
 * Canonical JSON and the content hash of a contract.
 *
 * Two descriptions that say the same thing must hash the same, whatever order
 * SAP happened to emit them in: object keys are sorted, the named lists of a
 * contract (properties, navigations, types, operations, enum members) are
 * ordered by name — same-named overloads by what else they state — and the
 * sets among its lists (capability property paths, referential constraints,
 * navigation bindings) by value. Key order and parameter order are the orders
 * kept — they decide how a key predicate and a call are written. So a
 * reshuffled $metadata is not a new contract version; a changed one always is.
 */

import { createHash } from "crypto";

import type { InterfaceContract, IrNavigation } from "@/lib/contracts/ir";

/** JSON with object keys sorted at every level; `undefined` members dropped, as JSON.stringify does. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const byName = <T extends { name: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => compare(a.name, b.name));

/** A list ordered by a string key computed once per item. */
const byKey = <T>(list: readonly T[], key: (item: T) => string): T[] =>
  list
    .map((item) => ({ item, k: key(item) }))
    .sort((a, b) => compare(a.k, b.k))
    .map((e) => e.item);

/** The contract with every order-insensitive list in a fixed order. */
export function normalizeContract(c: InterfaceContract): InterfaceContract {
  const navigation = (n: IrNavigation): IrNavigation =>
    n.referentialConstraints
      ? { ...n, referentialConstraints: byKey(n.referentialConstraints, (rc) => `${rc.property}\u0000${rc.referencedProperty}`) }
      : n;
  const structured = <T extends { properties: { name: string }[]; navigations: IrNavigation[] }>(t: T): T => ({
    ...t,
    properties: byName(t.properties),
    navigations: byName(t.navigations).map(navigation),
  });
  // A property-path list is a set: NonFilterableProperties in another order says the same.
  const caps = { ...c.entitySet.capabilities };
  for (const k of ["nonFilterableProperties", "requiredFilterProperties", "nonSortableProperties"] as const) {
    if (caps[k]) caps[k] = [...caps[k]].sort(compare);
  }
  return {
    ...c,
    entityType: structured(c.entityType),
    complexTypes: byName(c.complexTypes).map(structured),
    enumTypes: byName(c.enumTypes).map((e) => ({ ...e, members: byName(e.members) })),
    // Overloads share a name: within one, by everything else they state
    // (binding, parameters, result), so their document order is not a change.
    operations: byKey(c.operations, (o) => `${o.name}\u0000${canonicalJson(o)}`).map((o) => ({ ...o })),
    entitySet: {
      ...c.entitySet,
      capabilities: caps,
      ...(c.entitySet.navigationBindings
        ? { navigationBindings: [...c.entitySet.navigationBindings].sort((a, b) => compare(a.path, b.path)) }
        : {}),
    },
  };
}

/**
 * The largest contract stored, as canonical JSON (snapshot.ts). A slice of a
 * real dataset is tens of kilobytes; one this size is a description built to
 * be expensive. Here, beside the size it bounds, so the slice (slice.ts) can
 * refuse a contract this large before anything serialises it.
 */
export const MAX_CONTRACT_BYTES = 4 * 1024 * 1024;

/** sha256 over the canonical JSON of the normalized contract, hex. */
export function contractHash(c: InterfaceContract): string {
  return contractDigest(c).hash;
}

/** The content hash, and the size in bytes of the canonical JSON it was taken over. */
export function contractDigest(c: InterfaceContract): { hash: string; bytes: number } {
  const json = canonicalJson(normalizeContract(c));
  return { hash: createHash("sha256").update(json).digest("hex"), bytes: Buffer.byteLength(json, "utf8") };
}
