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
 *
 * WRITTEN BY THE ONE BUDGETED WRITER (budget.ts). The canonical form is the
 * text JSON.stringify(sortKeys(v)) always produced — every hash recorded
 * before stays the hash of the same contract — but it is streamed: the
 * digest feeds the hash piece by piece and charges each piece to the
 * contract budget, so a contract that cannot be stored is refused after at
 * most that many bytes of work, and is never written out whole first.
 */

import { createHash } from "crypto";

import { BudgetExceeded, jsonBytesUpTo, jsonText, LIMITS, OutputBudget, UNLIMITED, writeJson } from "@/lib/contracts/budget";
import type { InterfaceContract, IrNavigation } from "@/lib/contracts/ir";

/**
 * JSON with object keys sorted at every level; `undefined` members dropped, as
 * JSON.stringify does. No limit: what is canonicalised outside the digest is a
 * few fields at a time (diff.ts's comparisons, an operation's sort key).
 */
export function canonicalJson(value: unknown): string {
  return jsonText(value, UNLIMITED(), { sortKeys: true });
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const byName = <T extends { name: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => compare(a.name, b.name));

/** A list ordered by a string key computed once per item. */
const byKey = <T>(list: readonly T[], key: (item: T) => string): T[] =>
  list
    .map((item) => ({ item, k: key(item) }))
    .sort((a, b) => compare(a.k, b.k))
    .map((e) => e.item);

/**
 * The contract with every order-insensitive list in a fixed order.
 *
 * `limit`: the most bytes the operations' sort keys may add up to. Each key
 * is an operation's own canonical JSON, so together they are never longer
 * than the contract's canonical JSON: a digest under a budget passes its
 * limit here, and a contract whose operations alone are past it is refused
 * (BudgetExceeded) while its keys are written, never after.
 */
export function normalizeContract(c: InterfaceContract, limit: number = Number.POSITIVE_INFINITY): InterfaceContract {
  const keyBudget = new OutputBudget("contract", limit);
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
    operations: byKey(c.operations, (o) => `${o.name}\u0000${jsonText(o, keyBudget, { sortKeys: true })}`).map((o) => ({ ...o })),
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
 * The largest contract stored, as canonical JSON (snapshot.ts): the contract
 * budget's absolute cap (budget.ts, LIMITS.contract). A slice of a real
 * dataset is tens of kilobytes; one this size is a description built to be
 * expensive. Every read path renders a stored contract under its own budget
 * (budget.ts), which the record measured inside the envelope before storing.
 */
export const MAX_CONTRACT_BYTES = LIMITS.contract.cap;

/** sha256 over the canonical JSON of the normalized contract, hex. */
export function contractHash(c: InterfaceContract): string {
  return contractDigest(c).hash;
}

/**
 * The content hash, and the size in bytes of the canonical JSON it was taken
 * over. Streamed into the hash, each piece charged to `budget` first: past
 * it, BudgetExceeded — after at most that many bytes of work, however much
 * the contract's parts share.
 */
export function contractDigest(c: InterfaceContract, budget: OutputBudget = UNLIMITED()): { hash: string; bytes: number } {
  const hash = createHash("sha256");
  const before = budget.spent;
  writeJson(normalizeContract(c, budget.remaining), budget, (piece) => hash.update(piece), { sortKeys: true });
  return { hash: hash.digest("hex"), bytes: budget.spent - before };
}

/**
 * The size of JSON.stringify(value), or some number above `limit` once it is
 * known to be past it: counted by the budgeted writer, which stops there.
 * Exact, so also the lower bound callers relied on.
 */
export function jsonBytesAtLeast(value: unknown, limit: number): number {
  return jsonBytesUpTo(value, limit);
}

/**
 * The digest of a contract that may be stored, or TOO_LARGE — refused by the
 * contract budget while the canonical JSON is written (contractDigest).
 */
export function boundedContractDigest(
  c: InterfaceContract,
  limit: number = MAX_CONTRACT_BYTES,
): { ok: true; hash: string; bytes: number } | { ok: false; bytes: number } {
  try {
    const { hash, bytes } = contractDigest(c, new OutputBudget("contract", limit));
    return { ok: true, hash, bytes };
  } catch (err) {
    if (err instanceof BudgetExceeded && err.budget === "contract") return { ok: false, bytes: err.spent };
    throw err;
  }
}
