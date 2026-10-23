/**
 * The query policy: what a builder lets callers ask of one interface, and
 * the compiled form the governed read enforces (P1.4).
 *
 * THREE SHAPES, THREE WRITERS.
 *   the source    (Interface.queryPolicy) — what the builder chose in Studio,
 *                 validated here by a strict schema;
 *   the basis     (Interface.queryBasis) — what the current contract lets a
 *                 query do, derived by the verify (basis.ts);
 *   the compiled  (Interface.queryPolicyCompiled) — the source narrowed to
 *                 the basis (policy-compiler.ts), the only one a call reads.
 *
 * A POLICY ONLY NARROWS. In P1.4a a READ grant approves "rows of this
 * dataset, all fields"; the policy decides which of those fields a caller may
 * read, filter and sort on, and how many rows a paging run may take. It
 * cannot widen what the grant approved, which is why a builder may edit it
 * without a second approver (D10).
 *
 * READ ON EVERY CALL, PARSED ONCE PER REVISION. The compiled JSON rides in the
 * access-load statement on query-surface calls (at most 64 KiB), and
 * parseCompiledPolicy checks it again before trusting it: the size, the
 * version, every name against the identifier rule, every list within its
 * bound. A parse is held in a small in-instance LRU keyed by `rev`, which is a
 * content hash: equal keys are equal content, so a hit is never stale.
 */

import { createHash } from "node:crypto";

import { z } from "zod";

import { LIMITS } from "@/lib/contracts/budget";
import { canonicalJson } from "@/lib/contracts/canonical";
import type { Lit } from "@/lib/odata/ast";
import { IDENTIFIER_PATTERN, isQueryIdentifier } from "@/lib/odata/identifiers";

export const QUERY_FILTER_OPS = ["eq", "in", "gt", "ge", "lt", "le"] as const;
export type QueryFilterOp = (typeof QUERY_FILTER_OPS)[number];

/** The source's JSON text, at most. */
export const QUERY_POLICY_SOURCE_MAX_BYTES = 32 * 1024;
/** The compiled policy's JSON text, at most: it rides in a governed call's statement. */
export const QUERY_POLICY_COMPILED_MAX_BYTES = LIMITS.queryPolicyCompiled.bytes;

export const MAX_POLICY_SELECT = 512;
export const MAX_POLICY_FILTER = 128;
export const MAX_POLICY_SORT = 128;
export const MAX_POLICY_REQUIRE_FILTER = 8;
/** The compiled form keeps at most this many fields; a basis holds at most 1,000 properties. */
export const MAX_COMPILED_FIELDS = 1000;
export const MAX_POLICY_WARNINGS = 10;
export const MAX_POLICY_WARNING_LENGTH = 200;

/** The bounds of the page settings (D5). */
export const PAGE_BOUNDS = {
  maxSize: 1000,
  rowCap: 100_000,
  byteCapMin: 262_144,
  byteCapMax: 4_000_000,
} as const;

/** What Studio offers when a builder turns queries on. */
export const DEFAULT_PAGE = { defaultSize: 100, maxSize: 500, rowCap: 10_000, byteCap: 4_000_000 } as const;

export interface QueryPolicySourceV1 {
  readonly v: 1;
  /** Readable fields. "*" = every addressable property of the current contract, which is what today's ?limit read returns. */
  readonly select: "*" | readonly string[];
  readonly filter: readonly { readonly field: string; readonly ops: readonly QueryFilterOp[] }[];
  readonly sort: readonly string[];
  /** LIST queries must constrain these with eq, in or a two-sided range (beyond SAP's required-in-filter fields). */
  readonly requireFilterOn: readonly string[];
  readonly keyLookup: boolean;
  readonly count: boolean;
  readonly page: {
    readonly defaultSize: number;
    readonly maxSize: number;
    readonly rowCap: number;
    readonly byteCap: number;
  };
}

const identifier = z
  .string()
  .regex(IDENTIFIER_PATTERN, "is not a name CoreEdge can address")
  .refine((n) => n !== "__proto__", "is not a name CoreEdge can address");

/** A list of names, deduplicated in order: naming a field twice means naming it once. */
const nameArray = (max: number) =>
  z
    .array(identifier)
    .max(max)
    .transform((list) => [...new Set(list)]);

const queryPolicySourceSchema = z
  .strictObject({
    v: z.literal(1),
    select: z.union([z.literal("*"), nameArray(MAX_POLICY_SELECT)]),
    filter: z
      .array(
        z.strictObject({
          field: identifier,
          ops: z
            .array(z.enum(QUERY_FILTER_OPS))
            .min(1)
            .max(QUERY_FILTER_OPS.length * 2)
            .transform((list) => QUERY_FILTER_OPS.filter((op) => list.includes(op))),
        }),
      )
      .max(MAX_POLICY_FILTER),
    sort: nameArray(MAX_POLICY_SORT),
    requireFilterOn: nameArray(MAX_POLICY_REQUIRE_FILTER),
    keyLookup: z.boolean(),
    count: z.boolean(),
    page: z.strictObject({
      defaultSize: z.number().int().min(1).max(PAGE_BOUNDS.maxSize),
      maxSize: z.number().int().min(1).max(PAGE_BOUNDS.maxSize),
      rowCap: z.number().int().min(1).max(PAGE_BOUNDS.rowCap),
      byteCap: z.number().int().min(PAGE_BOUNDS.byteCapMin).max(PAGE_BOUNDS.byteCapMax),
    }),
  })
  .superRefine((s, ctx) => {
    if (s.page.defaultSize > s.page.maxSize) {
      ctx.addIssue({ code: "custom", path: ["page", "defaultSize"], message: "must be at most the maximum page size" });
    }
    if (s.page.rowCap < s.page.maxSize) {
      ctx.addIssue({ code: "custom", path: ["page", "rowCap"], message: "must be at least the maximum page size" });
    }
    const seen = new Set<string>();
    s.filter.forEach((f, i) => {
      if (seen.has(f.field)) {
        ctx.addIssue({ code: "custom", path: ["filter", i, "field"], message: "is listed twice; list each field once with all its operators" });
      }
      seen.add(f.field);
    });
  });

export interface PolicyError {
  readonly field?: string;
  readonly rule: string;
  readonly message: string;
}

/**
 * Validate a source as Studio sends it. Unknown keys are refused, not
 * dropped: a source carrying `expand` was written for a surface that does not
 * exist, and saving it without that key would tell its builder it worked.
 */
export function parseQueryPolicySource(raw: unknown): { ok: true; source: QueryPolicySourceV1 } | { ok: false; errors: PolicyError[] } {
  let text: string | undefined;
  try {
    text = JSON.stringify(raw);
  } catch {
    text = undefined;
  }
  if (text === undefined) return { ok: false, errors: [{ rule: "INVALID", message: "The query policy is not JSON." }] };
  if (Buffer.byteLength(text, "utf8") > QUERY_POLICY_SOURCE_MAX_BYTES) {
    return { ok: false, errors: [{ rule: "TOO_LARGE", message: `The query policy is larger than ${QUERY_POLICY_SOURCE_MAX_BYTES / 1024} KiB.` }] };
  }
  const r = queryPolicySourceSchema.safeParse(raw);
  if (r.success) return { ok: true, source: r.data };
  return {
    ok: false,
    errors: r.error.issues.slice(0, 20).map((issue): PolicyError => {
      const where = issue.path.map(String).join(".");
      return where
        ? { field: where, rule: "INVALID", message: `${where} ${issue.message}.` }
        : { rule: "INVALID", message: `The policy: ${issue.message}.` };
    }),
  };
}

// ---------------------------------------------------------------- compiled

export const STALE_REASONS = ["KEY_CHANGED", "ENTITY_SET_CHANGED", "VERSION_CHANGED", "NOT_METADATA", "SINGLETON", "BASIS_TOO_LARGE"] as const;
export type StaleReason = (typeof STALE_REASONS)[number];

/** A type a basis property maps to. OTHER can be read but not filtered, sorted or keyed. */
export type EdmScalar = Lit["t"] | "OTHER";

export interface CompiledField {
  /** Passes the identifier rule, not __proto__. */
  readonly n: string;
  readonly t: EdmScalar;
  readonly ml?: number;
  readonly p?: number;
  readonly s?: number;
  readonly dateOnly?: true;
  /** Absent: not filterable. */
  readonly ops?: readonly QueryFilterOp[];
  readonly sort?: true;
  /** A key part (pinned parts included). */
  readonly key?: true;
}

export interface CompiledQueryPolicyV1 {
  readonly v: 1;
  readonly state: "READY" | "STALE";
  readonly stale?: { readonly reason: StaleReason; readonly at: string };
  /** "qp1:" + 22 characters of base64url(sha256) over the effective policy (compiledPolicyRev). */
  readonly rev: string;
  readonly revision: number;
  readonly compiledAt: string;
  readonly entitySet: string;
  readonly odata: "V2" | "V4";
  readonly snapshot: { readonly id: string; readonly semver: string; readonly contentHash: string };
  /** Readable fields in policy order; always includes key parts when keyLookup or paging is on. */
  readonly fields: readonly CompiledField[];
  /** fields == every addressable property: the default query sends no $select. */
  readonly allReadable: boolean;
  /** Key-lookup parts in key order (pinned parts excluded); null = no key lookup. */
  readonly key: readonly string[] | null;
  /** Every key part is SAP-filterable: enables the key-as-filter fallback. */
  readonly keyViaFilter: boolean;
  /** V4 draft: [{ f: "IsActiveEntity", v: { t: "B", v: "true" } }]. */
  readonly pinned: readonly { readonly f: string; readonly v: Lit }[];
  readonly paging: "OFFSET" | "SINGLE";
  /** Key parts (pinned excluded); [] in SINGLE. */
  readonly tieBreak: readonly string[];
  /** The builder's ∪ SAP's required-in-filter. */
  readonly requireFilterOn: readonly string[];
  /** sap:requires-filter / V4 RequiresFilter. */
  readonly requiresAnyFilter: boolean;
  readonly count: boolean;
  readonly selectSupported: boolean;
  readonly topSupported: boolean;
  readonly page: { readonly defaultSize: number; readonly maxSize: number; readonly rowCap: number; readonly byteCap: number };
  /** At most 10, each at most 200 characters, shown in Studio. */
  readonly warnings: readonly string[];
}

/**
 * The content hash a compiled policy is known by. Over everything that
 * changes what a call may do — which includes `state` and the stale REASON,
 * so a stale policy and the ready one it was are never the same entry —
 * and nothing that does not: not the revision counter, not when it was
 * compiled or went stale, not its warnings. So a re-verify that changes
 * nothing keeps `rev`, and every open cursor survives it.
 */
export function compiledPolicyRev(c: Omit<CompiledQueryPolicyV1, "rev">): string {
  const { revision: _revision, compiledAt: _compiledAt, warnings: _warnings, stale, ...effective } = c;
  const hashed = stale ? { ...effective, staleReason: stale.reason } : effective;
  return `qp1:${createHash("sha256").update(canonicalJson(hashed), "utf8").digest("base64url").slice(0, 22)}`;
}

/** What a call works from: the compiled policy, checked, with its fields by name. */
export interface PreparedPolicy {
  readonly compiled: CompiledQueryPolicyV1;
  /** Null-prototype lookups: a name the caller sent is never a property of Object. */
  readonly fields: ReadonlyMap<string, CompiledField>;
  /** Field names in policy order. */
  readonly readable: readonly string[];
  readonly filterable: readonly string[];
  readonly sortable: readonly string[];
}

const REV_PATTERN = /^qp1:[A-Za-z0-9_-]{22}$/;
const LIT_TYPE_SET = new Set<string>(["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA"]);
const EDM_SCALARS = new Set<string>([...LIT_TYPE_SET, "OTHER"]);
const OP_SET = new Set<string>(QUERY_FILTER_OPS);

class Unreadable extends Error {}

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function need(cond: boolean): asserts cond {
  if (!cond) throw new Unreadable();
}

function int(v: unknown, min: number, max: number): number {
  need(typeof v === "number" && Number.isInteger(v) && v >= min && v <= max);
  return v as number;
}

function text(v: unknown, max: number): string {
  need(typeof v === "string" && v.length <= max);
  return v as string;
}

function nameList(v: unknown, max: number): string[] {
  need(Array.isArray(v) && v.length <= max);
  const out: string[] = [];
  for (const n of v as unknown[]) {
    need(isQueryIdentifier(n));
    out.push(n as string);
  }
  return out;
}

function lit(v: unknown): Lit {
  need(isPlain(v) && typeof v.t === "string" && LIT_TYPE_SET.has(v.t));
  return { t: (v as { t: Lit["t"] }).t, v: text((v as { v: unknown }).v, 256) };
}

function field(v: unknown): CompiledField {
  need(isPlain(v) && isQueryIdentifier(v.n) && typeof v.t === "string" && EDM_SCALARS.has(v.t));
  const out: { -readonly [K in keyof CompiledField]: CompiledField[K] } = { n: v.n as string, t: v.t as EdmScalar };
  if (v.ml !== undefined) out.ml = int(v.ml, 0, Number.MAX_SAFE_INTEGER);
  if (v.p !== undefined) out.p = int(v.p, 0, 1000);
  if (v.s !== undefined) out.s = int(v.s, 0, 1000);
  if (v.dateOnly !== undefined) {
    need(v.dateOnly === true);
    out.dateOnly = true;
  }
  if (v.ops !== undefined) {
    need(Array.isArray(v.ops) && v.ops.length >= 1 && v.ops.length <= QUERY_FILTER_OPS.length);
    for (const op of v.ops as unknown[]) need(typeof op === "string" && OP_SET.has(op));
    out.ops = v.ops as QueryFilterOp[];
  }
  if (v.sort !== undefined) {
    need(v.sort === true);
    out.sort = true;
  }
  if (v.key !== undefined) {
    need(v.key === true);
    out.key = true;
  }
  return out;
}

/** Validate a compiled policy read from the column. Throws Unreadable. */
function readCompiled(raw: unknown): CompiledQueryPolicyV1 {
  need(isPlain(raw) && raw.v === 1);
  need(raw.state === "READY" || raw.state === "STALE");
  const fieldsRaw = raw.fields;
  need(Array.isArray(fieldsRaw) && fieldsRaw.length <= MAX_COMPILED_FIELDS);
  const fields = (fieldsRaw as unknown[]).map(field);
  need(new Set(fields.map((f) => f.n)).size === fields.length);
  const snapshot = raw.snapshot;
  need(isPlain(snapshot));
  const page = raw.page;
  need(isPlain(page));
  const pinnedRaw = raw.pinned;
  need(Array.isArray(pinnedRaw) && pinnedRaw.length <= 4);
  const pinned = (pinnedRaw as unknown[]).map((p) => {
    need(isPlain(p) && isQueryIdentifier(p.f));
    return { f: p.f as string, v: lit(p.v) };
  });
  need(raw.paging === "OFFSET" || raw.paging === "SINGLE");
  need(raw.odata === "V2" || raw.odata === "V4");
  need(raw.key === null || Array.isArray(raw.key));
  const warnings = raw.warnings;
  need(Array.isArray(warnings) && warnings.length <= MAX_POLICY_WARNINGS);
  for (const w of warnings as unknown[]) text(w, MAX_POLICY_WARNING_LENGTH);
  for (const b of [raw.allReadable, raw.keyViaFilter, raw.requiresAnyFilter, raw.count, raw.selectSupported, raw.topSupported]) {
    need(typeof b === "boolean");
  }
  const compiled: { -readonly [K in keyof CompiledQueryPolicyV1]: CompiledQueryPolicyV1[K] } = {
    v: 1,
    state: raw.state as "READY" | "STALE",
    rev: text(raw.rev, 26),
    revision: int(raw.revision, 0, Number.MAX_SAFE_INTEGER),
    compiledAt: text(raw.compiledAt, 40),
    entitySet: text(raw.entitySet, 512),
    odata: raw.odata as "V2" | "V4",
    snapshot: { id: text(snapshot.id, 64), semver: text(snapshot.semver, 64), contentHash: text(snapshot.contentHash, 128) },
    fields,
    allReadable: raw.allReadable as boolean,
    key: raw.key === null ? null : nameList(raw.key, 32),
    keyViaFilter: raw.keyViaFilter as boolean,
    pinned,
    paging: raw.paging as "OFFSET" | "SINGLE",
    tieBreak: nameList(raw.tieBreak, 32),
    requireFilterOn: nameList(raw.requireFilterOn, 64),
    requiresAnyFilter: raw.requiresAnyFilter as boolean,
    count: raw.count as boolean,
    selectSupported: raw.selectSupported as boolean,
    topSupported: raw.topSupported as boolean,
    page: {
      defaultSize: int(page.defaultSize, 1, PAGE_BOUNDS.maxSize),
      maxSize: int(page.maxSize, 1, PAGE_BOUNDS.maxSize),
      rowCap: int(page.rowCap, 1, PAGE_BOUNDS.rowCap),
      byteCap: int(page.byteCap, 1, PAGE_BOUNDS.byteCapMax),
    },
    warnings: warnings as string[],
  };
  need(REV_PATTERN.test(compiled.rev));
  if (raw.stale !== undefined) {
    const stale = raw.stale;
    need(isPlain(stale) && typeof stale.reason === "string" && (STALE_REASONS as readonly string[]).includes(stale.reason));
    compiled.stale = { reason: stale.reason as StaleReason, at: text(stale.at, 40) };
  }
  need(compiled.state === "STALE" || compiled.stale === undefined);
  // Every name the policy refers to is one of its fields, so nothing reaches
  // a URL that the field table did not vouch for.
  const known = new Set(fields.map((f) => f.n));
  for (const n of [...(compiled.key ?? []), ...compiled.tieBreak, ...compiled.requireFilterOn]) need(known.has(n));
  need(compiled.page.defaultSize <= compiled.page.maxSize && compiled.page.maxSize <= compiled.page.rowCap);
  // The rev is a content hash: one that does not match its content was not
  // written by the compiler, and would poison the cache below.
  const { rev: _rev, ...rest } = compiled;
  need(compiledPolicyRev(rest) === compiled.rev);
  return compiled;
}

function prepare(compiled: CompiledQueryPolicyV1): PreparedPolicy {
  const fields = new Map<string, CompiledField>();
  for (const f of compiled.fields) fields.set(f.n, f);
  return {
    compiled,
    fields,
    readable: compiled.fields.map((f) => f.n),
    filterable: compiled.fields.filter((f) => f.ops !== undefined).map((f) => f.n),
    sortable: compiled.fields.filter((f) => f.sort === true).map((f) => f.n),
  };
}

/** Parses kept per instance, by rev. Small: an instance serves few interfaces' policies at once. */
const CACHE_SIZE = 256;
const cache = new Map<string, PreparedPolicy>();

/**
 * The compiled policy as a call reads it from the column, or `unreadable`
 * when it is not one the compiler wrote. Never throws.
 */
export function parseCompiledPolicy(raw: unknown): PreparedPolicy | { readonly unreadable: true } {
  if (!isPlain(raw)) return { unreadable: true };
  const rev = raw.rev;
  if (typeof rev === "string" && REV_PATTERN.test(rev)) {
    const hit = cache.get(rev);
    if (hit) {
      // Most recently used last, so the oldest is the first evicted.
      cache.delete(rev);
      cache.set(rev, hit);
      return hit;
    }
  }
  let compiled: CompiledQueryPolicyV1;
  try {
    let size: number;
    try {
      size = Buffer.byteLength(JSON.stringify(raw), "utf8");
    } catch {
      return { unreadable: true };
    }
    if (size > QUERY_POLICY_COMPILED_MAX_BYTES) return { unreadable: true };
    compiled = readCompiled(raw);
  } catch (err) {
    if (err instanceof Unreadable) return { unreadable: true };
    throw err;
  }
  const prepared = prepare(compiled);
  cache.set(compiled.rev, prepared);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return prepared;
}

/** The compiled policy as the compiler made it, for code that holds it in hand (Studio, tests). */
export function preparedFrom(compiled: CompiledQueryPolicyV1): PreparedPolicy {
  return prepare(compiled);
}
