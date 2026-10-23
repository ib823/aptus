/**
 * One page of a query-surface read: what to ask SAP for, what to serve of
 * what came back, and the cursor to the next page (P1.4, 3.9.5 and 3.10).
 *
 * OFFSET PAGING WITH A LOOK-AHEAD ROW. Each page asks SAP for one row more
 * than it will serve ($top = size + 1): if that row comes back there is a
 * next page, and if it does not, the chain is complete — so a 10,000-row run
 * at 100 a page is exactly 100 calls, with no empty page at the end to spend
 * one of the caller's 60 a minute on. A server-side page cap (SAP returning
 * fewer rows than asked, with a next link) is handled by advancing the offset
 * by the rows actually served.
 *
 * NOT TRUSTING SAP TO HAVE PAGED. Two checks, both from what CoreEdge asked:
 *   - more rows than $top asked for: SAP ignored $top. The rows that fit are
 *     served, no cursor is issued (paging on would skip or repeat), and the
 *     page says so (stopped: UPSTREAM_IGNORED_PAGING).
 *   - a later page containing the row that ended the previous one, or
 *     beginning with the row that began the chain: SAP ignored $skip. 502,
 *     retrying will not help. The first row matters because adaptive $top
 *     can ask for fewer rows than the previous page served, and an answer
 *     from offset 0 then stops before the previous page's last row; it is
 *     looked for only where such an answer puts it, so a row a concurrent
 *     edit moved later is not taken for one (cursor.ts repeatsChain).
 *     Only the rows that could be served (the look-ahead row included) are
 *     checked, so a service that also ignores $top costs a page's worth of
 *     tags, not one per row of its answer.
 *
 * A BYTE CAP PER PAGE. The body is written here, row by row, and stops before
 * it would pass the policy's byte cap (at most 4,000,000 bytes, below the
 * platform's response limit under either reading of "4.5 MB"), keeping a
 * fixed reserve for the envelope's tail. A page cut short resumes exactly
 * where it stopped. Later pages ask for about as many rows as fit (adaptive
 * $top), from the running mean of bytes per row, so a wide dataset does not
 * fetch, parse and discard most of a 16 MiB answer on every page.
 *
 * THE LEGACY GUARD. A `?limit` read keeps its bytes exactly, and answers 413
 * in CoreEdge's own envelope — and audits 413 — when it would be larger than
 * the platform returns, instead of the platform's bare 413 after a 200 was
 * audited.
 */

import { compareCodeUnits, queryBind, type QueryAstV1 } from "@/lib/odata/ast";
import type { PreparedPolicy } from "@/lib/odata/policy";
import type { AnswerRow } from "@/lib/odata/response";
import type { QueryFlag } from "@/lib/odata/rules";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import { QUERY_OUTCOME_ANSWER } from "@/lib/odata/query-status";
import type { TokenRing } from "@/lib/security/token-ring";
import {
  CHAIN_TTL_SECONDS,
  CURSOR_TTL_SECONDS,
  firstKeyMark,
  grantTags,
  lastKeyTag,
  MAX_CHAIN_PAGES,
  newChainId,
  repeatsChain,
  sealCursor,
  type CursorBinding,
  type CursorPayloadV1,
  type OpenedCursor,
} from "@/lib/northbound/query/cursor";

/** The most bytes a query-surface page may be, whatever its policy says. */
export const MAX_PAGE_BYTES = 4_000_000;
/** Kept free for the envelope after the rows: count, interface, note, page (cursor included) and totalCount. */
export const PAGE_TAIL_RESERVE = 8192;
/**
 * The legacy read's ceiling: 4.5 MiB, the larger reading of the "4.5 MB"
 * Vercel documents for a function's response. It refuses nothing the platform
 * serves only where that limit applies, and Vercel says a streamed response
 * (on by default for Node.js functions) has none. So it is MEASURED on the
 * production plan before this guard reaches production
 * (scripts/measure-response-limit.ts), and set from the run: to the largest
 * body served less 16 KiB, or to Infinity (no guard) when the platform serves
 * everything a ?limit read can produce.
 */
export const LEGACY_RESPONSE_CAP = 4_718_592;

const HEAD = '{"data":{"records":[';

export type PageStopped = "ROW_CAP" | "NOT_PAGEABLE" | "UPSTREAM_IGNORED_PAGING";

/** The `page` object of a query-surface answer. */
export interface PageInfo {
  readonly index: number;
  /** Rows asked of SAP for this page (adaptive $top may lower it); the caller's pageSize is the upper bound. */
  readonly size: number;
  /** Rows served in the chain, this page included. */
  readonly rowsServed: number;
  readonly nextCursor: string | null;
  /** SAP has no more rows for this query. */
  readonly complete: boolean;
  /** Rows remain, but no cursor is issued, and why. */
  readonly stopped: PageStopped | null;
}

export interface PagePlan {
  readonly page0: boolean;
  readonly pageIndex: number;
  /** $skip. */
  readonly skip: number;
  /** The most rows this page may serve: the page size, within the chain's row cap. */
  readonly eff: number;
  /** The rows this page serves at most (adaptive on later pages). */
  readonly top: number;
  /** $top to send (top + 1, the look-ahead), or null when SAP does not take $top. */
  readonly ask: number | null;
}

/** What to ask SAP for on this page. A LIST query only. */
export function planPage(policy: PreparedPolicy, ast: QueryAstV1, cursor: CursorPayloadV1 | null): PagePlan {
  if (ast.kind !== "LIST" || ast.pageSize === null) throw new QueryCompilerInvariantError("Only a list is paged.");
  const c = policy.compiled;
  const rs = cursor?.rs ?? 0;
  const eff = Math.min(ast.pageSize, c.page.rowCap - rs);
  if (eff < 1) throw new QueryCompilerInvariantError("A page past the chain's row cap.");
  const cap = Math.min(c.page.byteCap, MAX_PAGE_BYTES);
  const top = cursor === null ? eff : Math.max(1, Math.min(eff, Math.floor((0.9 * (cap - PAGE_TAIL_RESERVE)) / Math.max(1, cursor.rb))));
  return {
    page0: cursor === null,
    pageIndex: cursor?.pi ?? 0,
    skip: cursor?.off ?? 0,
    eff,
    top,
    ask: c.topSupported ? top + 1 : null,
  };
}

/**
 * The rows that fit: JSON per row, stopping before the body (with its head
 * and the tail reserve) would pass `cap` bytes.
 */
export function fitRows(rows: readonly Record<string, unknown>[], cap: number, limit = rows.length): { parts: string[]; bytes: number[] } {
  const parts: string[] = [];
  const bytes: number[] = [];
  let used = Buffer.byteLength(HEAD);
  for (const row of rows.slice(0, limit)) {
    const s = JSON.stringify(row);
    const b = Buffer.byteLength(s, "utf8") + (parts.length > 0 ? 1 : 0);
    if (used + b + PAGE_TAIL_RESERVE > cap) break;
    parts.push(s);
    bytes.push(b);
    used += b;
  }
  return { parts, bytes };
}

/**
 * The body: the rows as written, then the tail, as one JSON text, asserted
 * within `cap`. The tail's keys follow the legacy envelope's order, then
 * `page` and `totalCount`.
 */
export function buildPageBody(parts: readonly string[], tail: Record<string, unknown>, cap: number): { text: string; bytes: number } {
  const tailJson = JSON.stringify(tail);
  if (Buffer.byteLength(tailJson, "utf8") > PAGE_TAIL_RESERVE) throw new QueryCompilerInvariantError("A page's tail is larger than its reserve.");
  const text = `${HEAD}${parts.join(",")}],${tailJson.slice(1)}}`;
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > cap) throw new QueryCompilerInvariantError("A page body is larger than its cap.");
  return { text, bytes };
}

function noteFor(served: number): string {
  return served === 0
    ? "No records. The service answered successfully and has nothing to return."
    : `${served} record${served === 1 ? "" : "s"}.`;
}

export interface PageContext {
  readonly policy: PreparedPolicy;
  readonly ast: QueryAstV1;
  readonly plan: PagePlan;
  /** The opened cursor this page continues, or null on page 0. */
  readonly cursor: OpenedCursor | null;
  /** What SAP answered, parsed and projected (response.ts). */
  readonly answer: { readonly rows: readonly AnswerRow[]; readonly more: boolean; readonly totalCount: number | null; readonly projected: boolean };
  readonly binding: CursorBinding;
  readonly ring: TokenRing;
  readonly now: Date;
  readonly interface: { readonly id: string; readonly name: string; readonly version: number };
  readonly connection: { readonly id: string; readonly revision: number };
  /** The grants authorising this call (resolveAccess): recorded on page 0. */
  readonly authorisingGrantIds: readonly string[];
  /**
   * False where a page is the only page there will be — the Test Console
   * runs page 0 and refuses a cursor — so none is sealed: `nextCursor` stays
   * null and the page says only whether SAP has more. Defaults to true.
   */
  readonly issueCursor?: boolean;
}

export type PageResult =
  | {
      readonly ok: true;
      readonly body: string;
      readonly bytes: number;
      readonly served: number;
      readonly page: PageInfo;
      readonly chainId: string;
      readonly chainRows: number;
      readonly flags: readonly QueryFlag[];
    }
  | {
      readonly ok: false;
      /** ROW_TOO_LARGE: 422. UPSTREAM_IGNORED_PAGING: 502, SAP repeated the last page's row, or began again at the chain's first. */
      readonly rule: "ROW_TOO_LARGE" | "UPSTREAM_IGNORED_PAGING";
      readonly chainId: string;
      readonly flags: readonly QueryFlag[];
    };

/** Assemble one LIST page from SAP's answer: the checks, the byte cap, and the next cursor. */
export function assemblePage(ctx: PageContext): PageResult {
  const { policy, plan, answer, cursor } = ctx;
  const c = policy.compiled;
  const flags = new Set<QueryFlag>();
  if (answer.projected) flags.add("PROJECTED");
  if (c.pinned.length > 0) flags.add("PINNED_ACTIVE");
  if (plan.top < plan.eff) flags.add("ADAPTIVE_TOP");
  const chainId = cursor?.payload.ch ?? newChainId();
  const rs = cursor?.payload.rs ?? 0;

  // SAP ignored $skip: the row that ended the last page is back, or the answer begins with the chain's first row.
  if (cursor !== null && repeatsChain(ctx.ring, cursor, answer.rows.slice(0, plan.top + 1).map((r) => r.keyText))) {
    flags.add("SKIP_NOT_HONOURED");
    return { ok: false, rule: "UPSTREAM_IGNORED_PAGING", chainId, flags: [...flags] };
  }
  // SAP ignored $top.
  const topIgnored = plan.ask !== null && answer.rows.length > plan.ask;
  if (topIgnored) flags.add("TOP_NOT_HONOURED");

  const cap = Math.min(c.page.byteCap, MAX_PAGE_BYTES);
  const records = answer.rows.map((r) => r.record);
  const { parts, bytes } = fitRows(records, cap, plan.top);
  const k = parts.length;
  if (k === 0 && answer.rows.length > 0) return { ok: false, rule: "ROW_TOO_LARGE", chainId, flags: [...flags] };
  if (k < Math.min(plan.top, answer.rows.length)) flags.add("CUT_BY_BYTES");

  const more = answer.rows.length > k || answer.more;
  let nextCursor: string | null = null;
  let complete = false;
  let stopped: PageStopped | null = null;
  if (!more) complete = true;
  else if (topIgnored || k === 0) stopped = "UPSTREAM_IGNORED_PAGING";
  // The row cap, or the most pages a chain may have, whichever comes first.
  else if (rs + k >= c.page.rowCap || plan.pageIndex + 1 > MAX_CHAIN_PAGES) {
    stopped = "ROW_CAP";
    flags.add("ROW_CAP");
  } else if (c.paging !== "OFFSET") stopped = "NOT_PAGEABLE";
  else if (ctx.issueCursor !== false) {
    // A governed read is always authorised by some grant; a chain bound to
    // none could never be checked against the live set.
    if (cursor === null && ctx.authorisingGrantIds.length === 0) {
      throw new QueryCompilerInvariantError("A paging chain with no authorising grant.");
    }
    const seconds = Math.floor(ctx.now.getTime() / 1000);
    const servedBytes = bytes.reduce((a, b) => a + b, 0);
    const rb = Math.max(1, Math.round(((cursor?.payload.rb ?? 0) * rs + servedBytes) / (rs + k)));
    const payload: CursorPayloadV1 = {
      v: 1,
      ch: chainId,
      pi: plan.pageIndex + 1,
      off: plan.skip + k,
      rs: rs + k,
      iv: ctx.interface.version,
      pr: c.rev,
      qb: queryBind(ctx.ast).toString("base64url"),
      g: cursor?.payload.g ?? grantTags(ctx.authorisingGrantIds),
      cn: ctx.connection.id,
      cr: ctx.connection.revision,
      lk: lastKeyTag(ctx.ring, ctx.ring.active, answer.rows[k - 1]!.keyText),
      fk: cursor?.payload.fk ?? firstKeyMark(ctx.ring, answer.rows[0]!.keyText),
      rb,
      iat: seconds,
      exp: seconds + CURSOR_TTL_SECONDS,
      cx: cursor?.payload.cx ?? seconds + CHAIN_TTL_SECONDS,
    };
    nextCursor = sealCursor(payload, ctx.binding, ctx.ring);
  }

  const page: PageInfo = { index: plan.pageIndex, size: plan.top, rowsServed: rs + k, nextCursor, complete, stopped };
  const tail: Record<string, unknown> = {
    count: k,
    interface: { id: ctx.interface.id, name: ctx.interface.name, version: ctx.interface.version },
    empty: k === 0,
    note: noteFor(k),
    page,
  };
  if (plan.page0 && ctx.ast.count) tail.totalCount = answer.totalCount;
  const body = buildPageBody(parts, tail, cap);
  return {
    ok: true,
    body: body.text,
    bytes: body.bytes,
    served: k,
    page,
    chainId,
    chainRows: rs + k,
    flags: [...flags].sort(compareCodeUnits),
  };
}

export type KeyResult =
  | { readonly ok: true; readonly body: string; readonly bytes: number; readonly flags: readonly QueryFlag[] }
  | { readonly ok: false; readonly outcome: "NO_RECORD" | "KEY_NOT_UNIQUE" | "ROW_TOO_LARGE"; readonly flags: readonly QueryFlag[] };

/**
 * A key lookup's answer: `records: [record]`, `count: 1`, no `page`. Through
 * the key-as-filter fallback, no row is no record and two rows are SAP's
 * fault (the key is not unique there), never a choice CoreEdge makes.
 */
export function assembleKey(ctx: {
  readonly policy: PreparedPolicy;
  readonly kind: "KEY" | "KEY_VIA_FILTER";
  readonly answer: { readonly rows: readonly AnswerRow[]; readonly projected: boolean };
  readonly interface: { readonly id: string; readonly name: string; readonly version: number };
}): KeyResult {
  const flags = new Set<QueryFlag>();
  if (ctx.answer.projected) flags.add("PROJECTED");
  if (ctx.policy.compiled.pinned.length > 0) flags.add("PINNED_ACTIVE");
  if (ctx.kind === "KEY_VIA_FILTER") flags.add("KEY_VIA_FILTER");
  const rows = ctx.answer.rows;
  if (rows.length === 0) return { ok: false, outcome: "NO_RECORD", flags: [...flags] };
  if (rows.length > 1) return { ok: false, outcome: "KEY_NOT_UNIQUE", flags: [...flags] };
  const cap = Math.min(ctx.policy.compiled.page.byteCap, MAX_PAGE_BYTES);
  const { parts } = fitRows([rows[0]!.record], cap);
  if (parts.length === 0) return { ok: false, outcome: "ROW_TOO_LARGE", flags: [...flags] };
  const body = buildPageBody(
    parts,
    { count: 1, interface: { id: ctx.interface.id, name: ctx.interface.name, version: ctx.interface.version }, empty: false, note: noteFor(1) },
    cap,
  );
  return { ok: true, body: body.text, bytes: body.bytes, flags: [...flags].sort(compareCodeUnits) };
}

/** What a legacy read over LEGACY_RESPONSE_CAP is told (413 VALIDATION_ERROR, rule RESPONSE_TOO_LARGE). */
export const LEGACY_TOO_LARGE_MESSAGE = QUERY_OUTCOME_ANSWER.RESPONSE_TOO_LARGE.message;

/**
 * The legacy read's body, serialised once: the same bytes NextResponse.json
 * would send, so the response is unchanged, and its size known before it is
 * sent and audited.
 */
export function legacyBody(data: unknown): { readonly ok: true; readonly text: string; readonly bytes: number } | { readonly ok: false; readonly bytes: number } {
  const text = JSON.stringify({ data });
  const bytes = Buffer.byteLength(text, "utf8");
  return bytes <= LEGACY_RESPONSE_CAP ? { ok: true, text, bytes } : { ok: false, bytes };
}
