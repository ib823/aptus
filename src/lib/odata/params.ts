/**
 * The query surface's request grammar: what a caller may put on `/data`
 * (P1.4).
 *
 *   select=A,B                    the fields to return
 *   filter.<F>.eq|gt|ge|lt|le=v   one predicate on a field
 *   filter.<F>.in=v (repeated)    any of 1 to 50 values
 *   orderby=-A,B                  at most 4 fields, `-` for descending
 *   key.<K>=v                     a key lookup: every key part, once
 *   count=true                    SAP's total on the first page
 *   pageSize=n                    rows per page, up to the policy's maximum
 *   cursor=cec1.…                 the next page of a chain
 *
 * WHEN IT APPLIES. A request is on the query surface only if it carries a
 * RESERVED name: one of the parameters above, `expand`, or any name starting
 * `filter.` or `key.`. Anything else is a legacy `?limit` read and runs
 * today's code, byte for byte, so nothing a deployed app sends today changes
 * meaning. `expand` and bare `filter` and `key` are reserved so that they are
 * refused rather than silently ignored: a filter that is ignored serves every
 * row.
 *
 * ONCE ON THE SURFACE, NOTHING IS IGNORED. Every name must match exactly one
 * grammar row. `limit` is refused (use pageSize), any `$…` is refused (CoreEdge
 * builds the OData query itself), and so are `entity` and a cache buster such
 * as `_`: a parameter CoreEdge does not act on is one the caller believes it
 * does.
 *
 * PURE, AND BEFORE AUTHORISATION. It runs before any statement, and a refusal
 * here says nothing about any interface: the same request is refused the same
 * way whatever its path names. Values stay raw strings; they are typed
 * against the policy in the checker (check.ts), which runs after the grant is
 * known.
 *
 * Entries go into a Map, never a plain object, so `__proto__` and
 * `constructor` are names like any other.
 */

import type { QueryRule } from "@/lib/odata/rules";
import { echoParameter } from "@/lib/odata/rules";

/** The names that put a request on the query surface. */
export const RESERVED_NAMES = ["select", "expand", "filter", "orderby", "count", "pageSize", "cursor", "key"] as const;

export const MAX_QUERY_STRING_LENGTH = 8192;
export const MAX_PARAMETERS = 128;
export const MAX_FILTER_FIELDS = 16;
export const MAX_IN_VALUES_PER_FIELD = 50;
export const MAX_IN_VALUES = 100;
/** Code points of literal values (filter.* and key.*), in all. */
export const MAX_LITERAL_TEXT = 2048;
export const MAX_SELECT_FIELDS = 256;
export const MAX_ORDERBY_FIELDS = 4;
/** Code points of one literal value. */
export const MAX_VALUE_CODE_POINTS = 256;

export const FILTER_OPERATORS = ["eq", "in", "gt", "ge", "lt", "le"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** What the caller sent for one field: one of eq, in, or an interval of at most one bound each side. */
export interface FilterOps {
  readonly eq?: string;
  readonly in?: readonly string[];
  readonly gt?: string;
  readonly ge?: string;
  readonly lt?: string;
  readonly le?: string;
}

export type ParsedQuery =
  | { readonly surface: false }
  | {
      readonly surface: true;
      readonly ok: false;
      readonly rule: QueryRule;
      /** Safe for the caller: names a parameter only when it is safe to echo, never a value. */
      readonly message: string;
      readonly parameter?: string;
    }
  | {
      readonly surface: true;
      readonly ok: true;
      readonly kind: "LIST" | "KEY";
      readonly select: readonly string[] | null;
      readonly filter: ReadonlyMap<string, FilterOps>;
      readonly orderby: readonly { readonly f: string; readonly desc: boolean }[];
      readonly key: ReadonlyMap<string, string> | null;
      readonly count: boolean;
      readonly pageSize: number | null;
      readonly cursor: string | null;
    };

export type ParsedQueryOk = Extract<ParsedQuery, { ok: true }>;
export type ParsedQueryRefusal = Extract<ParsedQuery, { ok: false }>;

const ID = "[A-Za-z_][A-Za-z0-9_]{0,127}";
const FILTER_NAME = new RegExp(`^filter\\.(${ID})\\.(eq|in|gt|ge|lt|le)$`);
const KEY_NAME = new RegExp(`^key\\.(${ID})$`);
const SELECT_VALUE = new RegExp(`^${ID}(,${ID})*$`);
const ORDERBY_VALUE = new RegExp(`^-?${ID}(,-?${ID})*$`);
const PAGE_SIZE_VALUE = /^[1-9][0-9]{0,3}$/;
const PERCENT_SEQUENCE = /%[0-9A-Fa-f]{2}/;

/** Does this name put a request on the query surface? */
export function isReservedName(name: string): boolean {
  return (RESERVED_NAMES as readonly string[]).includes(name) || name.startsWith("filter.") || name.startsWith("key.");
}

type Classified =
  | { readonly k: "select" | "orderby" | "count" | "pageSize" | "cursor" }
  | { readonly k: "filter"; readonly field: string; readonly op: FilterOperator }
  | { readonly k: "key"; readonly field: string }
  | { readonly k: "refused"; readonly rule: QueryRule; readonly message: string };

/** A name in a message, or a stand-in when it is not safe to repeat. */
function nameIn(name: string, max = 64): string {
  return echoParameter(name, max) ?? "A parameter";
}

function classify(name: string): Classified {
  switch (name) {
    case "select":
    case "orderby":
    case "count":
    case "pageSize":
    case "cursor":
      return { k: name };
    case "expand":
      return { k: "refused", rule: "UNKNOWN_PARAMETER", message: "expand: $expand is not served in this version." };
    case "limit":
      return { k: "refused", rule: "UNKNOWN_PARAMETER", message: "limit is not accepted with query parameters; use pageSize." };
    case "entity":
      return {
        k: "refused",
        rule: "UNKNOWN_PARAMETER",
        message: "entity is not a query parameter: the dataset is part of the interface's definition.",
      };
    case "filter":
      return {
        k: "refused",
        rule: "MALFORMED",
        message: "filter parameters are named filter.<Field>.<op>, with op one of eq, in, gt, ge, lt and le.",
      };
    case "key":
      return { k: "refused", rule: "MALFORMED", message: "key parameters are named key.<Field>, one per key field." };
  }
  const f = FILTER_NAME.exec(name);
  if (f) return { k: "filter", field: f[1]!, op: f[2] as FilterOperator };
  if (name.startsWith("filter.")) {
    return {
      k: "refused",
      rule: "MALFORMED",
      message: `${nameIn(name, 140)}: filter parameters are named filter.<Field>.<op>, with op one of eq, in, gt, ge, lt and le.`,
    };
  }
  const k = KEY_NAME.exec(name);
  if (k) return { k: "key", field: k[1]! };
  if (name.startsWith("key.")) {
    return { k: "refused", rule: "MALFORMED", message: `${nameIn(name, 140)}: key parameters are named key.<Field>, one per key field.` };
  }
  if (name.startsWith("$")) {
    return {
      k: "refused",
      rule: "ODATA_SYNTAX_REFUSED",
      message: `${nameIn(name)}: CoreEdge builds the OData query itself; use filter.<Field>.<op>, select, orderby and pageSize.`,
    };
  }
  return {
    k: "refused",
    rule: "UNKNOWN_PARAMETER",
    message: `${nameIn(name)} is not a query parameter of this interface. The parameters are select, filter.<Field>.<op>, orderby, key.<Field>, count, pageSize and cursor.`,
  };
}

/**
 * Why a literal value is refused, or null. Code points are counted for the
 * caller's own sake: an astral character is one character to them.
 *
 *   - well-formed UTF-16 (a lone surrogate reaches here only through the
 *     Test Console's JSON; a real URL cannot carry one);
 *   - no U+FFFD, which is what the WHATWG decoder makes of invalid UTF-8;
 *   - no C0 or C1 control character and no DEL;
 *   - no `%` followed by two hex digits. The caller's URL has been decoded
 *     once already, so `%27` here was sent as `%2527`: text that a layer in
 *     front of SAP that decodes twice would turn into a quote (D18).
 */
function valueProblem(value: string): { rule: "VALUE_INVALID" | "VALUE_TOO_LONG"; why: string } | null {
  if (!value.isWellFormed()) return { rule: "VALUE_INVALID", why: "is not well-formed text" };
  let points = 0;
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd) return { rule: "VALUE_INVALID", why: "contains a replacement character (U+FFFD): it was not valid UTF-8" };
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return { rule: "VALUE_INVALID", why: "contains a control character" };
    points++;
  }
  if (points > MAX_VALUE_CODE_POINTS) return { rule: "VALUE_TOO_LONG", why: `is longer than ${MAX_VALUE_CODE_POINTS} characters` };
  if (PERCENT_SEQUENCE.test(value)) {
    return {
      rule: "VALUE_INVALID",
      why: "contains % followed by two hexadecimal digits after decoding; send each character percent-encoded once",
    };
  }
  return null;
}

function codePoints(value: string): number {
  let n = 0;
  for (const _ of value) n++;
  return n;
}

/**
 * Parse a request's parameters. `rawSearchLength` is the length of the raw
 * query string (`request.nextUrl.search`), checked before any value is.
 */
export function parseQueryParams(params: URLSearchParams, rawSearchLength: number): ParsedQuery {
  let surface = false;
  for (const name of params.keys()) {
    if (isReservedName(name)) {
      surface = true;
      break;
    }
  }
  if (!surface) return { surface: false };

  const refuse = (rule: QueryRule, message: string, parameter?: string, echoMax = 140): ParsedQueryRefusal => {
    const echoed = parameter === undefined ? undefined : echoParameter(parameter, echoMax);
    return echoed === undefined
      ? { surface: true, ok: false, rule, message }
      : { surface: true, ok: false, rule, message, parameter: echoed };
  };

  // 1 — size, before any value is looked at.
  if (rawSearchLength > MAX_QUERY_STRING_LENGTH) {
    return refuse("TOO_COMPLEX", `The query string is longer than ${MAX_QUERY_STRING_LENGTH.toLocaleString("en-GB")} characters.`);
  }
  // 2 — every entry, by name, in a Map.
  const entries = new Map<string, string[]>();
  let count = 0;
  for (const [name, value] of params) {
    if (++count > MAX_PARAMETERS) return refuse("TOO_COMPLEX", `A query may carry at most ${MAX_PARAMETERS} parameters.`);
    const list = entries.get(name);
    if (list) list.push(value);
    else entries.set(name, [value]);
  }

  // 3 — every name matches exactly one grammar row.
  const classified = new Map<string, Classified>();
  for (const name of entries.keys()) {
    const c = classify(name);
    // An unknown name is echoed only when short (64); a malformed member of a
    // known family may be as long as the family allows (140).
    if (c.k === "refused") return refuse(c.rule, c.message, name, c.rule === "MALFORMED" ? 140 : 64);
    classified.set(name, c);
  }

  // 4 — no repetition, but for the one family that repeats.
  for (const [name, values] of entries) {
    const c = classified.get(name)!;
    if (values.length > 1 && !(c.k === "filter" && c.op === "in")) {
      return refuse("DUPLICATE_PARAMETER", `${name} was sent more than once; only filter.<Field>.in may repeat.`, name);
    }
  }

  // 5 — combinations.
  const isKey = [...classified.values()].some((c) => c.k === "key");
  if (isKey) {
    for (const [name, c] of classified) {
      if (c.k !== "key" && c.k !== "select") {
        return refuse(
          "PARAMETER_CONFLICT",
          `${name} cannot be sent with key.*: a key lookup returns one record and allows only select beside its key fields.`,
          name,
        );
      }
    }
  }
  const filter = new Map<string, { eq?: string; in?: string[]; gt?: string; ge?: string; lt?: string; le?: string }>();
  const key = new Map<string, string>();
  for (const [name, c] of classified) {
    const values = entries.get(name)!;
    if (c.k === "filter") {
      const ops = filter.get(c.field) ?? {};
      if (c.op === "in") ops.in = values;
      else ops[c.op] = values[0]!;
      filter.set(c.field, ops);
    } else if (c.k === "key") {
      key.set(c.field, values[0]!);
    }
  }
  for (const [field, ops] of filter) {
    const point = (ops.eq !== undefined ? 1 : 0) + (ops.in !== undefined ? 1 : 0);
    const lower = (ops.gt !== undefined ? 1 : 0) + (ops.ge !== undefined ? 1 : 0);
    const upper = (ops.lt !== undefined ? 1 : 0) + (ops.le !== undefined ? 1 : 0);
    if (point > 1 || (point === 1 && lower + upper > 0) || lower > 1 || upper > 1) {
      return refuse(
        "PARAMETER_CONFLICT",
        `filter.${field} takes one predicate: eq, in, or a range of at most one lower bound (gt or ge) and one upper bound (lt or le).`,
        `filter.${field}`,
      );
    }
  }

  // 6 — values.
  let literalText = 0;
  let inValues = 0;
  for (const [name, c] of classified) {
    if (c.k !== "filter" && c.k !== "key") continue;
    for (const value of entries.get(name)!) {
      const problem = valueProblem(value);
      if (problem) return refuse(problem.rule, `${name} ${problem.why}.`, name);
      literalText += codePoints(value);
    }
  }
  let select: string[] | null = null;
  const selectRaw = entries.get("select")?.[0];
  if (selectRaw !== undefined) {
    if (!SELECT_VALUE.test(selectRaw)) {
      return refuse("MALFORMED", "select is a comma-separated list of field names.", "select");
    }
    select = selectRaw.split(",");
    if (new Set(select).size !== select.length) return refuse("MALFORMED", "select names a field more than once.", "select");
  }
  const orderby: { f: string; desc: boolean }[] = [];
  const orderbyRaw = entries.get("orderby")?.[0];
  if (orderbyRaw !== undefined) {
    if (!ORDERBY_VALUE.test(orderbyRaw)) {
      return refuse("MALFORMED", "orderby is a comma-separated list of field names, each optionally preceded by -.", "orderby");
    }
    for (const term of orderbyRaw.split(",")) {
      const desc = term.startsWith("-");
      orderby.push({ f: desc ? term.slice(1) : term, desc });
    }
    if (new Set(orderby.map((o) => o.f)).size !== orderby.length) {
      return refuse("MALFORMED", "orderby names a field more than once.", "orderby");
    }
  }
  let countFlag = false;
  const countRaw = entries.get("count")?.[0];
  if (countRaw !== undefined) {
    if (countRaw !== "true" && countRaw !== "false") return refuse("MALFORMED", "count is true or false.", "count");
    countFlag = countRaw === "true";
  }
  let pageSize: number | null = null;
  const pageSizeRaw = entries.get("pageSize")?.[0];
  if (pageSizeRaw !== undefined) {
    if (!PAGE_SIZE_VALUE.test(pageSizeRaw)) return refuse("MALFORMED", "pageSize is a whole number from 1 to 9999.", "pageSize");
    pageSize = Number(pageSizeRaw);
  }
  // The cursor's own shape is checked where it is opened (cursor.ts), so
  // that every unusable cursor gets the same one answer.
  const cursor = entries.get("cursor")?.[0] ?? null;

  // 7 — caps.
  if (filter.size > MAX_FILTER_FIELDS) return refuse("TOO_COMPLEX", `A query may filter on at most ${MAX_FILTER_FIELDS} fields.`);
  for (const [field, ops] of filter) {
    const n = ops.in?.length ?? 0;
    if (n > MAX_IN_VALUES_PER_FIELD) {
      return refuse("TOO_COMPLEX", `filter.${field}.in takes at most ${MAX_IN_VALUES_PER_FIELD} values.`, `filter.${field}.in`);
    }
    inValues += n;
  }
  if (inValues > MAX_IN_VALUES) return refuse("TOO_COMPLEX", `A query may carry at most ${MAX_IN_VALUES} in values in all.`);
  if (literalText > MAX_LITERAL_TEXT) {
    return refuse("TOO_COMPLEX", `A query may carry at most ${MAX_LITERAL_TEXT.toLocaleString("en-GB")} characters of values in all.`);
  }
  if (select !== null && select.length > MAX_SELECT_FIELDS) {
    return refuse("TOO_COMPLEX", `select names at most ${MAX_SELECT_FIELDS} fields.`, "select");
  }
  if (orderby.length > MAX_ORDERBY_FIELDS) return refuse("TOO_COMPLEX", `orderby takes at most ${MAX_ORDERBY_FIELDS} fields.`, "orderby");

  return {
    surface: true,
    ok: true,
    kind: isKey ? "KEY" : "LIST",
    select,
    filter,
    orderby,
    key: isKey ? key : null,
    count: countFlag,
    pageSize,
    cursor,
  };
}
