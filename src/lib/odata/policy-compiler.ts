/**
 * Compiling a query policy against its basis (P1.4, 3.5.6). Pure.
 *
 * A POLICY NEVER ALLOWS WHAT THE CONTRACT DOES NOT. Every field a builder
 * makes readable must exist in the current contract and be addressable;
 * every filter must be on a readable field of a type CoreEdge can write as a
 * literal, on a field SAP says may be filtered; sorting likewise. So filtering
 * and sorting fields are subsets of readable fields, which are a subset of the
 * contract (threat T7: a hidden field cannot be used as an oracle through a
 * filter).
 *
 * SAVING AND VERIFYING DIFFER, ON PURPOSE (D9). On a Studio save, any rule
 * failure refuses the save, one sentence per error: the builder is there to
 * fix it. At verify, nobody is: SAP changed the contract under a live
 * interface, and the same rules NARROW the policy instead — the field or
 * operator that is no longer allowed is dropped, with a warning and a line in
 * the verify's answer, and the rest keeps serving. The policy goes STALE, and
 * stops serving queries until a builder reviews it, only when narrowing
 * cannot preserve what callers rely on: the key changed (a cursor's order
 * and every key lookup depend on it), the entity set or the OData version
 * changed, the contract is no longer from `$metadata`, the dataset is a
 * singleton, or the basis is too large to describe the entity.
 *
 * `rev` IS THE EFFECTIVE POLICY. It changes when what a call may do changes,
 * and not on a re-verify that changes nothing, so open cursors survive one.
 */

import type { BasisProperty, QueryBasisV1 } from "@/lib/odata/basis";
import type { LitType } from "@/lib/odata/ast";
import {
  compiledPolicyRev,
  MAX_POLICY_WARNING_LENGTH,
  MAX_POLICY_WARNINGS,
  QUERY_FILTER_OPS,
  QUERY_POLICY_COMPILED_MAX_BYTES,
  type CompiledField,
  type CompiledQueryPolicyV1,
  type PolicyError,
  type QueryFilterOp,
  type QueryPolicySourceV1,
  type StaleReason,
} from "@/lib/odata/policy";

/** The types CoreEdge can write as a literal, and so filter, sort and key on. */
const LITERAL_TYPES = new Set<string>(["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA"] satisfies LitType[]);

/** The draft key part RAP adds to a draft-enabled entity (D20). */
export const DRAFT_KEY = "IsActiveEntity";

export interface CompileContext {
  /** save: any failure refuses. verify: failures narrow, and some go STALE. */
  readonly mode: "save" | "verify";
  /** The interface as it is now: its entity set, and its OData version when it records one. */
  readonly interface: { readonly entitySet: string | null; readonly odataVersion: "V2" | "V4" | null };
  /** The revision the compiled policy will carry (Interface.queryPolicyRevision after this write). */
  readonly revision: number;
  readonly now: Date;
  /** The compiled policy this one replaces, when there is one: a verify detects a key change against it. */
  readonly previous?: CompiledQueryPolicyV1 | null;
}

export type CompileOutcome =
  | {
      readonly ok: true;
      readonly compiled: CompiledQueryPolicyV1;
      /** What a verify dropped, in words, for the verify's answer and the config audit. */
      readonly narrowed: readonly string[];
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly errors: readonly PolicyError[] };

const STALE_TEXT: Record<StaleReason, string> = {
  KEY_CHANGED: "The dataset's key changed since the policy was saved; review the policy and save it again.",
  ENTITY_SET_CHANGED: "The interface now names another dataset than the one the policy was written for.",
  VERSION_CHANGED: "The service's OData version changed since the policy was saved.",
  NOT_METADATA: "The contract was inferred from sampled rows, not read from the service's $metadata; queries need a verified contract.",
  SINGLETON: "The dataset is a singleton: one record, nothing to query.",
  BASIS_TOO_LARGE: "The dataset has more fields than CoreEdge describes for queries, so queries are not offered on it.",
};

/**
 * BASIS_TOO_LARGE has two causes, and only one is the builder's to fix. A
 * basis cut for size (`tooLarge`) refuses every source, whatever is
 * readable, so its text gives no advice that cannot help. A compiled policy
 * over 64 KiB is the readable fields' doing: that text says so.
 */
const COMPILED_TOO_LARGE_TEXT = "The compiled policy is larger than 64 KiB; make fewer fields readable.";

const cap = (s: string) => (s.length <= MAX_POLICY_WARNING_LENGTH ? s : `${s.slice(0, MAX_POLICY_WARNING_LENGTH - 1)}…`);

/** A name fit to repeat in Studio: an addressable one as it is, any other as a description. */
const shown = (p: BasisProperty | undefined, n: string) => (p && p.bad === undefined ? n : "a field CoreEdge cannot address");

function contractStale(basis: QueryBasisV1, iface: CompileContext["interface"]): StaleReason | null {
  if (basis.source !== "METADATA") return "NOT_METADATA";
  if (basis.set.singleton === true) return "SINGLETON";
  if (basis.tooLarge === true) return "BASIS_TOO_LARGE";
  if (iface.entitySet !== basis.entitySet) return "ENTITY_SET_CHANGED";
  if (iface.odataVersion !== null && iface.odataVersion !== basis.odata) return "VERSION_CHANGED";
  return null;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function finish(body: Omit<CompiledQueryPolicyV1, "rev">): CompiledQueryPolicyV1 {
  return { ...body, rev: compiledPolicyRev(body) };
}

function staleCompiled(
  source: QueryPolicySourceV1,
  basis: QueryBasisV1,
  ctx: CompileContext,
  reason: StaleReason,
  at: string,
  warnings: readonly string[],
): CompiledQueryPolicyV1 {
  return finish({
    v: 1,
    state: "STALE",
    stale: { reason, at },
    revision: ctx.revision,
    compiledAt: ctx.now.toISOString(),
    entitySet: basis.entitySet,
    odata: basis.odata,
    snapshot: basis.snapshot,
    fields: [],
    allReadable: false,
    key: null,
    keyViaFilter: false,
    pinned: [],
    paging: "SINGLE",
    tieBreak: [],
    requireFilterOn: [],
    requiresAnyFilter: false,
    count: false,
    selectSupported: false,
    topSupported: false,
    page: { ...source.page },
    warnings: warnings.slice(0, MAX_POLICY_WARNINGS).map(cap),
  });
}

export function compileQueryPolicy(source: QueryPolicySourceV1, basis: QueryBasisV1, ctx: CompileContext): CompileOutcome {
  const save = ctx.mode === "save";
  const errors: PolicyError[] = [];
  const warnings: string[] = [];
  const narrowed: string[] = [];
  const nowIso = ctx.now.toISOString();

  const stale = (reason: StaleReason, text = STALE_TEXT[reason], at = nowIso): CompileOutcome => ({
    ok: true,
    compiled: staleCompiled(source, basis, ctx, reason, at, [text]),
    narrowed: [],
    warnings: [text],
  });
  /** A rule failed: refuse the save, or narrow the verify with a warning. */
  const fail = (field: string | undefined, rule: string, onSave: string, onVerify: string) => {
    if (save) errors.push(field === undefined ? { rule, message: onSave } : { field, rule, message: onSave });
    else {
      narrowed.push(onVerify);
      warnings.push(onVerify);
    }
  };

  // 1 — the contract itself.
  const contract = contractStale(basis, ctx.interface);
  if (contract !== null) {
    if (save) return { ok: false, errors: [{ rule: contract, message: STALE_TEXT[contract] }] };
    return stale(contract);
  }
  // A key change is a transition, not a state of the contract: once a verify
  // saw one, the policy stays stale until a builder saves it again.
  const previous = ctx.previous ?? null;
  if (!save && previous?.state === "STALE" && previous.stale?.reason === "KEY_CHANGED") {
    return stale("KEY_CHANGED", previous.warnings[0] ?? STALE_TEXT.KEY_CHANGED, previous.stale.at);
  }

  const props = new Map<string, BasisProperty>();
  for (const p of basis.properties) if (!props.has(p.n)) props.set(p.n, p);
  const addressable = [...props.values()].filter((p) => p.bad === undefined).map((p) => p.n);
  const isAddressable = (n: string) => props.get(n)?.bad === undefined && props.has(n);

  // 6 (first, because keys depend on it) — the draft pin.
  const pinnedNames = basis.odata === "V4" ? basis.keys.filter((k) => k === DRAFT_KEY && props.get(k)?.t === "B") : [];
  const keyParts = basis.keys.filter((k) => !pinnedNames.includes(k));
  if (pinnedNames.length > 0) warnings.push("Drafts are never served: IsActiveEntity eq true is added to every query and key lookup.");

  // 2 — readable fields.
  const readableNames: string[] = [];
  if (source.select === "*") readableNames.push(...addressable);
  else {
    for (const n of source.select) {
      if (isAddressable(n)) readableNames.push(n);
      else if (props.has(n)) fail(n, "NOT_ADDRESSABLE", `CoreEdge cannot read ${shown(props.get(n), n)}.`, `${n} is no longer readable: CoreEdge cannot address it.`);
      else fail(n, "FIELD_MISSING", `${n} is not a field of this dataset's current contract.`, `${n} removed: it is no longer in the contract.`);
    }
  }
  const readable = new Set(readableNames);

  // 3 — filters.
  const fieldOps = new Map<string, QueryFilterOp[]>();
  for (const { field, ops } of source.filter) {
    const p = props.get(field);
    if (!readable.has(field) || p === undefined) {
      fail(field, "NOT_READABLE", `${field} must be readable to be filtered on.`, `Filtering on ${field} removed: it is no longer readable.`);
      continue;
    }
    if (pinnedNames.includes(field)) {
      warnings.push(`${field} is pinned to true and is not offered as a filter.`);
      continue;
    }
    if (!LITERAL_TYPES.has(p.t)) {
      fail(field, "TYPE_NOT_FILTERABLE", `${field} (${p.edm}) cannot be filtered on.`, `Filtering on ${field} removed: its type cannot be filtered on.`);
      continue;
    }
    if (p.filterable === false || basis.set.filterable === false) {
      fail(field, "SAP_NOT_FILTERABLE", `SAP does not allow filtering on ${field}.`, `Filtering on ${field} removed: SAP no longer allows it.`);
      continue;
    }
    // `in` is a set of eq's, so allowing it allows eq; a Boolean has one
    // useful operator. Ops outside these rules are dropped, saved or verified.
    let allowed: QueryFilterOp[] = ops.includes("in") && !ops.includes("eq") ? [...ops, "eq"] : [...ops];
    if (p.t === "B") {
      if (allowed.some((op) => op !== "eq")) warnings.push(`${field} is true or false: only eq is offered on it.`);
      allowed = allowed.filter((op) => op === "eq");
    }
    allowed = QUERY_FILTER_OPS.filter((op) => allowed.includes(op));
    if (allowed.length > 0) fieldOps.set(field, allowed);
  }

  // 4 — sorting.
  const sortable = new Set<string>();
  for (const n of source.sort) {
    const p = props.get(n);
    if (!readable.has(n) || p === undefined) fail(n, "NOT_READABLE", `${n} must be readable to be sorted on.`, `Sorting on ${n} removed: it is no longer readable.`);
    else if (!LITERAL_TYPES.has(p.t)) fail(n, "TYPE_NOT_SORTABLE", `${n} (${p.edm}) cannot be sorted on.`, `Sorting on ${n} removed: its type cannot be sorted on.`);
    else if (p.sortable === false || basis.set.sortable === false) fail(n, "SAP_NOT_SORTABLE", `SAP does not allow sorting on ${n}.`, `Sorting on ${n} removed: SAP no longer allows it.`);
    else sortable.add(n);
  }

  // 5 — required filters: SAP's own, then the builder's.
  const requireFilterOn: string[] = [];
  for (const p of props.values()) {
    if (p.requiredInFilter !== true) continue;
    const ops = fieldOps.get(p.n);
    if (!readable.has(p.n) || !ops || !(ops.includes("eq") || ops.includes("in"))) {
      if (save) {
        errors.push({ field: p.n, rule: "SAP_REQUIRES_FILTER", message: `SAP requires a filter on ${shown(p, p.n)}: make it readable and filterable with eq or in.` });
        continue;
      }
      return stale("KEY_CHANGED", `SAP now requires a filter on ${shown(p, p.n)}; review the policy and save it again.`);
    }
    requireFilterOn.push(p.n);
  }
  for (const n of source.requireFilterOn) {
    const ops = fieldOps.get(n) ?? [];
    const twoSided = (ops.includes("gt") || ops.includes("ge")) && (ops.includes("lt") || ops.includes("le"));
    if (!readable.has(n) || !(ops.includes("eq") || ops.includes("in") || twoSided)) {
      fail(n, "REQUIRED_NOT_FILTERABLE", `${n} can be required only when it is readable and filterable with eq, in or a two-sided range.`, `${n} is no longer required: it is no longer filterable.`);
    } else if (!requireFilterOn.includes(n)) requireFilterOn.push(n);
  }

  // A key part is addressable by key only when CoreEdge can write it as a
  // literal; a Boolean key part other than the draft pin is not served (its
  // two values make it a flag, and a key lookup on it is a filter).
  const keyProblem = (): string | null => {
    if (basis.set.addressable === false) return "SAP does not allow access by key on this dataset";
    if (keyParts.length === 0) return "the dataset has no key";
    for (const k of keyParts) {
      const p = props.get(k);
      if (p === undefined || p.bad !== undefined || !LITERAL_TYPES.has(p.t) || p.t === "B") return `the key field ${shown(p, k)} cannot be addressed`;
      if (!readable.has(k)) return `the key field ${k} must be readable`;
    }
    return null;
  };

  // 7 — key lookup.
  let key: string[] | null = null;
  if (source.keyLookup) {
    const problem = keyProblem();
    if (problem === null) key = keyParts;
    else fail("keyLookup", "KEY_LOOKUP", `Key lookup is not possible: ${problem}.`, `Key lookup turned off: ${problem}.`);
  }
  const sapFilterable = (k: string) => props.get(k)?.filterable !== false && basis.set.filterable !== false;
  const keyViaFilter = key !== null && key.every(sapFilterable) && basis.set.topSupported !== false;

  // 8 — paging.
  let pagingProblem: string | null = null;
  if (basis.set.pageable === false || basis.set.topSupported === false || basis.set.skipSupported === false) {
    pagingProblem = "SAP does not support paging on this dataset";
  } else if (keyParts.length === 0) {
    pagingProblem = "the dataset has no key to order pages by";
  } else {
    for (const k of keyParts) {
      const p = props.get(k);
      if (p === undefined || p.bad !== undefined || !readable.has(k) || p.sortable === false || basis.set.sortable === false) {
        pagingProblem = `pages cannot be ordered by the key field ${shown(p, k)}`;
        break;
      }
    }
  }
  const paging: "OFFSET" | "SINGLE" = pagingProblem === null ? "OFFSET" : "SINGLE";
  if (pagingProblem !== null) warnings.push(pagingProblem === "SAP does not support paging on this dataset" ? "SAP does not support paging on this dataset." : `No paging: ${pagingProblem}.`);

  // A verify that finds another key than the policy was compiled with: every
  // open cursor's order, and every key lookup a caller makes, meant the old one.
  if (!save && previous?.state === "READY") {
    const before = previous.paging === "OFFSET" ? previous.tieBreak : previous.key;
    const pinnedBefore = previous.pinned.map((p) => p.f).join(",");
    if (before !== null && (before.join(",") !== keyParts.join(",") || pinnedBefore !== pinnedNames.join(","))) {
      return stale("KEY_CHANGED");
    }
  }

  // 9 — count.
  let count = source.count;
  if (count && basis.set.countable === false) {
    fail("count", "COUNT", "SAP does not count this dataset, so the total count cannot be offered.", "Total count turned off: SAP does not count this dataset.");
    count = false;
  }

  if (errors.length > 0) return { ok: false, errors };

  // 10, 11 — the field table and the limits.
  const keySet = new Set(basis.keys);
  const fields: CompiledField[] = readableNames.map((n) => {
    const p = props.get(n)!;
    const f: Mutable<CompiledField> = { n, t: p.t };
    if (p.ml !== undefined) f.ml = p.ml;
    if (p.p !== undefined) f.p = p.p;
    if (p.s !== undefined) f.s = p.s;
    if (p.dateOnly) f.dateOnly = true;
    const ops = fieldOps.get(n);
    if (ops) f.ops = ops;
    if (sortable.has(n)) f.sort = true;
    if (keySet.has(n)) f.key = true;
    return f;
  });
  const page = { ...source.page };
  if (paging === "SINGLE") page.rowCap = page.maxSize;

  const body: Omit<CompiledQueryPolicyV1, "rev"> = {
    v: 1,
    state: "READY",
    revision: ctx.revision,
    compiledAt: nowIso,
    entitySet: basis.entitySet,
    odata: basis.odata,
    snapshot: basis.snapshot,
    fields,
    allReadable: readableNames.length === addressable.length,
    key,
    keyViaFilter,
    pinned: pinnedNames.map((f) => ({ f, v: { t: "B" as const, v: "true" } })),
    paging,
    tieBreak: paging === "OFFSET" ? keyParts : [],
    requireFilterOn,
    requiresAnyFilter: basis.set.requiresFilter === true,
    count,
    selectSupported: basis.set.selectSupported !== false,
    topSupported: basis.set.topSupported !== false,
    page,
    warnings: [...new Set(warnings)].slice(0, MAX_POLICY_WARNINGS).map(cap),
  };
  const compiled = finish(body);

  // 12 — the size the access-load statement carries.
  if (Buffer.byteLength(JSON.stringify(compiled), "utf8") > QUERY_POLICY_COMPILED_MAX_BYTES) {
    if (save) return { ok: false, errors: [{ rule: "TOO_LARGE", message: COMPILED_TOO_LARGE_TEXT }] };
    return stale("BASIS_TOO_LARGE", COMPILED_TOO_LARGE_TEXT);
  }
  return { ok: true, compiled, narrowed, warnings: compiled.warnings };
}

/**
 * What a save changes, for Studio's summary and the config audit (3.5.8).
 * `widened` lists only the bulk-relevant widenings, the ones recorded as
 * PROMOTE: a row cap raised above 10,000, a maximum page size raised above
 * 500, and count turned on. `narrowed` lists what callers lose.
 *
 * THE ROW CAP ASKED FOR, NOT ONLY THE ONE COMPILED. On a dataset that cannot
 * be paged the compiled row cap is the page size (SINGLE), so a save asking
 * for 100,000 compiled to 500 and was an UPDATE. A later verify that finds
 * the dataset pageable (its metadata changed, or a builder pointed the
 * service elsewhere) compiles the 100,000 the source asked for, and nothing
 * records it as PROMOTE. So, given the sources, the row cap compared is the
 * larger of the compiled one and the one asked for: the save that asks is
 * the PROMOTE, and no verify can raise the cap past what a save asked for.
 */
export function policyChange(
  before: CompiledQueryPolicyV1 | null,
  after: CompiledQueryPolicyV1,
  sources?: { readonly before: QueryPolicySourceV1 | null; readonly after: QueryPolicySourceV1 },
): { readonly widened: readonly string[]; readonly narrowed: readonly string[] } {
  const widened: string[] = [];
  const narrowed: string[] = [];
  const asked = (compiled: CompiledQueryPolicyV1, source: QueryPolicySourceV1 | null | undefined) => Math.max(compiled.page.rowCap, source?.page.rowCap ?? 0);
  const prevRowCap = before?.state === "READY" ? asked(before, sources?.before) : 0;
  const rowCap = asked(after, sources?.after);
  const prevMax = before?.state === "READY" ? before.page.maxSize : 0;
  const prevCount = before?.state === "READY" ? before.count : false;
  if (rowCap > 10_000 && rowCap > prevRowCap) widened.push(`rowCap ${rowCap}`);
  if (after.page.maxSize > 500 && after.page.maxSize > prevMax) widened.push(`maxSize ${after.page.maxSize}`);
  if (after.count && !prevCount) widened.push("count");
  if (before?.state === "READY") {
    const now = new Map(after.fields.map((f) => [f.n, f]));
    for (const f of before.fields) {
      const g = now.get(f.n);
      if (!g) {
        narrowed.push(`${f.n} not readable`);
        continue;
      }
      for (const op of f.ops ?? []) if (!(g.ops ?? []).includes(op)) narrowed.push(`${f.n} ${op}`);
      if (f.sort && !g.sort) narrowed.push(`${f.n} sort`);
    }
    if (before.key !== null && after.key === null) narrowed.push("key lookup");
    if (before.count && !after.count) narrowed.push("count");
    if (after.page.maxSize < before.page.maxSize) narrowed.push(`maxSize ${after.page.maxSize}`);
    if (after.page.rowCap < before.page.rowCap) narrowed.push(`rowCap ${after.page.rowCap}`);
    for (const n of after.requireFilterOn) if (!before.requireFilterOn.includes(n)) narrowed.push(`${n} required`);
  }
  return { widened, narrowed };
}
