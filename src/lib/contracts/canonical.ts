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
 *
 * THE SAME AS THE DOCUMENTS' BUDGET (MAX_DOCUMENT_CONTRACT_BYTES,
 * doc-inputs.ts). At 4 MB a contract was accepted by the verify, rendered by
 * /schema at 35 MB and seconds of CPU per call, and refused as TOO_LARGE by
 * the kit and the solution document (hostile-input review round 2): what is
 * accepted is now servable on every read path.
 */
export const MAX_CONTRACT_BYTES = 2 * 1024 * 1024;

/** sha256 over the canonical JSON of the normalized contract, hex. */
export function contractHash(c: InterfaceContract): string {
  return contractDigest(c).hash;
}

/** The content hash, and the size in bytes of the canonical JSON it was taken over. */
export function contractDigest(c: InterfaceContract): { hash: string; bytes: number } {
  const json = canonicalJson(normalizeContract(c));
  return { hash: createHash("sha256").update(json).digest("hex"), bytes: Buffer.byteLength(json, "utf8") };
}

/**
 * A LOWER BOUND on the UTF-8 length of `JSON.stringify(value)`, counted
 * without serialising anything, and given up on as soon as it passes `limit`
 * (the result is then some number above it). Exact for ASCII that needs no
 * escaping; an escape or a non-ASCII character only adds bytes. Every value
 * visited adds at least one, so the walk visits at most `limit + 1` values
 * however much of the value is shared: a contract whose copies share their
 * strings is small in memory and enormous as JSON, and this is what sees it.
 */
export function jsonBytesAtLeast(value: unknown, limit: number): number {
  let n = 0;
  const walk = (v: unknown): void => {
    if (n > limit) return;
    if (typeof v === "string") n += v.length + 2;
    else if (typeof v === "number") n += JSON.stringify(v).length;
    else if (typeof v === "boolean") n += v ? 4 : 5;
    else if (v === null || v === undefined) n += 4;
    else if (Array.isArray(v)) {
      n += 1 + Math.max(1, v.length);
      for (const x of v) {
        if (n > limit) return;
        walk(x);
      }
    } else if (typeof v === "object") {
      n += 2;
      let first = true;
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (n > limit) return;
        if (x === undefined) continue;
        // `"k":` and, after the first member, its comma.
        n += k.length + 3 + (first ? 0 : 1);
        first = false;
        walk(x);
      }
    }
  };
  walk(value);
  return n;
}

/**
 * The digest of a contract that may be stored, or TOO_LARGE — decided BEFORE
 * serialising when the contract cannot be that small (jsonBytesAtLeast), so
 * no contract is ever written out at hundreds of megabytes only to be
 * refused for its size afterwards (hostile-input review round 2).
 */
export function boundedContractDigest(
  c: InterfaceContract,
  limit: number = MAX_CONTRACT_BYTES,
): { ok: true; hash: string; bytes: number } | { ok: false; bytes: number } {
  const atLeast = jsonBytesAtLeast(c, limit);
  if (atLeast > limit) return { ok: false, bytes: atLeast };
  const { hash, bytes } = contractDigest(c);
  return bytes > limit ? { ok: false, bytes } : { ok: true, hash, bytes };
}
