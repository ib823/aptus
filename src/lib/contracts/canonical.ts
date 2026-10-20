/**
 * Canonical JSON and the content hash of a contract.
 *
 * Two descriptions that say the same thing must hash the same, whatever order
 * SAP happened to emit them in: object keys are sorted, and the named lists of
 * a contract (properties, navigations, types, operations, enum members) are
 * ordered by name. Key order is the one order kept — it decides how a key
 * predicate is written. So a reshuffled $metadata is not a new contract
 * version; a changed one always is.
 */

import { createHash } from "crypto";

import type { InterfaceContract } from "@/lib/contracts/ir";

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

const byName = <T extends { name: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

/** The contract with every order-insensitive list in name order. */
export function normalizeContract(c: InterfaceContract): InterfaceContract {
  const structured = <T extends { properties: { name: string }[]; navigations: { name: string }[] }>(t: T): T => ({
    ...t,
    properties: byName(t.properties),
    navigations: byName(t.navigations),
  });
  return {
    ...c,
    entityType: structured(c.entityType),
    complexTypes: byName(c.complexTypes).map(structured),
    enumTypes: byName(c.enumTypes).map((e) => ({ ...e, members: byName(e.members) })),
    operations: byName(c.operations).map((o) => ({ ...o })),
    entitySet: {
      ...c.entitySet,
      ...(c.entitySet.navigationBindings
        ? {
            navigationBindings: [...c.entitySet.navigationBindings].sort((a, b) =>
              a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
            ),
          }
        : {}),
    },
  };
}

/** sha256 over the canonical JSON of the normalized contract, hex. */
export function contractHash(c: InterfaceContract): string {
  return createHash("sha256").update(canonicalJson(normalizeContract(c))).digest("hex");
}
