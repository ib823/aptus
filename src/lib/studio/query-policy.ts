/**
 * What Studio's query-policy card is shown, and what "Enable queries" saves
 * (P1.4, 3.15). Pure; the route (api/studio/interfaces/[id]/query-policy)
 * reads the row and writes it.
 *
 * THE CARD SEES THE BASIS, THE SOURCE AND A SUMMARY OF THE COMPILED FORM.
 * The basis is the current contract's fields as a query may use them (the
 * verify wrote it); the source is what the builder chose; the compiled form
 * is what callers are actually held to, which a verify may have narrowed
 * since the builder saved. Nothing here is a secret or a host: the basis is
 * what /schema already describes to the same people.
 *
 * THE SAFE DEFAULT IS NARROW ON PURPOSE. Turning queries on lets a caller
 * read every field the legacy `?limit` read already returns, look a record
 * up by key, and filter only by its key and by what SAP itself requires: the
 * least an app needs to page and to fetch one record. Count is off (SAP
 * counts with a scan on many sets). Anything wider is a builder's choice,
 * made in the field table and recorded in the config audit.
 */

import type { QueryBasisV1 } from "@/lib/odata/basis";
import type { LitType } from "@/lib/odata/ast";
import {
  DEFAULT_PAGE,
  parseCompiledPolicy,
  type CompiledQueryPolicyV1,
  type QueryFilterOp,
  type QueryPolicySourceV1,
  type StaleReason,
} from "@/lib/odata/policy";
import { DRAFT_KEY } from "@/lib/odata/policy-compiler";

/** The types a query can write as a literal: the only ones a filter, a sort or a key can use. */
const LITERAL_TYPES = new Set<string>(["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA"] satisfies LitType[]);

/** Studio's sentence per stale reason: what happened, and what the builder does about it. */
export const STALE_SENTENCE: Record<StaleReason, string> = {
  KEY_CHANGED: "The dataset's key, or what SAP requires a filter on, changed since the policy was saved. Review it and save it again.",
  ENTITY_SET_CHANGED: "The interface now names another dataset than the policy was written for. Review it and save it again.",
  VERSION_CHANGED: "The service's OData version changed since the policy was saved. Review it and save it again.",
  NOT_METADATA: "The contract was inferred from sampled rows, not read from the service's $metadata. Verify the service.",
  SINGLETON: "The dataset is a singleton: one record, nothing to query.",
  // Shown only when the basis was not cut for size: the card says a cut basis is not offered queries at all (queryNotOffered).
  BASIS_TOO_LARGE: "The policy compiled for this dataset is larger than CoreEdge carries (64 KiB). Make fewer fields readable, then save it.",
};

/**
 * Why queries cannot be offered on this dataset whatever a builder chooses,
 * or null when they can: a singleton, or a basis cut for size. The compiler
 * refuses every source on either, so the card offers no Enable or Review,
 * and no advice that cannot help.
 */
export function queryNotOffered(basis: Pick<QueryBasisV1, "set" | "tooLarge">): string | null {
  if (basis.set.singleton === true) return "the dataset is a singleton: one record, nothing to query";
  if (basis.tooLarge === true) return "the dataset has more fields than CoreEdge describes for queries";
  return null;
}

/**
 * What "Enable queries" saves: every field the legacy read returns, key
 * lookup where SAP allows it, `eq` and `in` on the key parts and on SAP's
 * required-in-filter fields, sorting by the key, no count, Studio's page
 * defaults. Built only from what the compiler accepts on a save, so the
 * button never offers a policy the route then refuses.
 */
export function suggestedQueryPolicy(basis: QueryBasisV1): QueryPolicySourceV1 {
  const props = new Map(basis.properties.map((p) => [p.n, p]));
  const pinned = basis.odata === "V4" ? new Set(basis.keys.filter((k) => k === DRAFT_KEY && props.get(k)?.t === "B")) : new Set<string>();
  const usable = (n: string) => {
    const p = props.get(n);
    return p !== undefined && p.bad === undefined && LITERAL_TYPES.has(p.t);
  };
  const filterable = (n: string) => usable(n) && props.get(n)!.filterable !== false && basis.set.filterable !== false;
  const sortable = (n: string) => usable(n) && props.get(n)!.sortable !== false && basis.set.sortable !== false;
  const opsFor = (n: string): QueryFilterOp[] => (props.get(n)!.t === "B" ? ["eq"] : ["eq", "in"]);

  const keyParts = basis.keys.filter((k) => !pinned.has(k));
  const filter: { field: string; ops: QueryFilterOp[] }[] = [];
  const seen = new Set<string>();
  const addFilter = (n: string) => {
    if (seen.has(n) || pinned.has(n) || !filterable(n)) return;
    seen.add(n);
    filter.push({ field: n, ops: opsFor(n) });
  };
  for (const k of keyParts) addFilter(k);
  for (const p of basis.properties) if (p.requiredInFilter === true) addFilter(p.n);

  const keyAddressable =
    basis.set.addressable !== false && keyParts.length > 0 && keyParts.every((k) => usable(k) && props.get(k)!.t !== "B");
  return {
    v: 1,
    select: "*",
    filter,
    sort: keyParts.filter(sortable),
    requireFilterOn: [],
    keyLookup: keyAddressable,
    count: false,
    page: { ...DEFAULT_PAGE },
  };
}

/** The compiled form as the card shows it: no field table (the card draws its own from the basis and the source). */
export interface CompiledSummary {
  readonly state: "READY" | "STALE" | "UNREADABLE";
  readonly stale: { readonly reason: StaleReason; readonly at: string; readonly sentence: string } | null;
  readonly rev: string | null;
  readonly revision: number | null;
  readonly compiledAt: string | null;
  readonly snapshot: { readonly id: string; readonly semver: string; readonly contentHash: string } | null;
  readonly warnings: readonly string[];
  readonly paging: "OFFSET" | "SINGLE" | null;
  readonly tieBreak: readonly string[];
  readonly key: readonly string[] | null;
  readonly pinned: readonly string[];
  readonly requireFilterOn: readonly string[];
  readonly count: boolean;
  readonly page: CompiledQueryPolicyV1["page"] | null;
  /** The effective field table: what a caller may read, filter (and how) and sort on now. */
  readonly fields: readonly { readonly n: string; readonly ops: readonly QueryFilterOp[]; readonly sort: boolean }[];
}

export function compiledSummary(raw: unknown): CompiledSummary | null {
  if (raw === null || raw === undefined) return null;
  const parsed = parseCompiledPolicy(raw);
  if ("unreadable" in parsed) {
    return {
      state: "UNREADABLE",
      stale: null,
      rev: null,
      revision: null,
      compiledAt: null,
      snapshot: null,
      warnings: [],
      paging: null,
      tieBreak: [],
      key: null,
      pinned: [],
      requireFilterOn: [],
      count: false,
      page: null,
      fields: [],
    };
  }
  const c = parsed.compiled;
  return {
    state: c.state,
    stale: c.stale ? { reason: c.stale.reason, at: c.stale.at, sentence: STALE_SENTENCE[c.stale.reason] } : null,
    rev: c.rev,
    revision: c.revision,
    compiledAt: c.compiledAt,
    snapshot: c.snapshot,
    warnings: c.warnings,
    paging: c.paging,
    tieBreak: c.tieBreak,
    key: c.key,
    pinned: c.pinned.map((p) => p.f),
    requireFilterOn: c.requireFilterOn,
    count: c.count,
    page: c.page,
    fields: c.fields.map((f) => ({ n: f.n, ops: f.ops ?? [], sort: f.sort === true })),
  };
}
