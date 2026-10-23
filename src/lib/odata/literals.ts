/**
 * Literals: the caller's text, typed, and the same value as OData writes it
 * (P1.4).
 *
 * TWO HALVES, NEVER MIXED. parseLiteral turns what the caller sent for a
 * field into a canonical value of the field's type, or refuses it; nothing it
 * returns is OData text. serialiseLiteral turns a canonical value into one
 * version's literal syntax, and it is the only place a caller's bytes are put
 * next to OData syntax. Between the two the value is data, in the AST.
 *
 * THE ENCODING RULE (encLit). Literal content keeps RFC 3986's unreserved
 * characters and doubles a quote; every other UTF-8 byte becomes `%XX`. So the
 * content is always in the language `([A-Za-z0-9-._~] | %[0-9A-F]{2} | '')*`,
 * and a caller can never write a raw `&`, `#`, `=`, `+`, space, parenthesis,
 * comma, slash, question mark or backslash into the URL, nor end a string
 * early: their quote is always doubled. Every structural token — the quotes
 * around a string, `guid'…'`, `L`, `M`, operators, parentheses — is a
 * constant of the compiler, never derived from input.
 *
 * ON THE WIRE the WHATWG URL serialiser, which fetch uses, writes every `'` in
 * a query string as `%27` (the special-query percent-encode set) and leaves a
 * path's `'` alone. SAP decodes once and sees `''` inside the literal either
 * way. The fuzz (tests/property/odata-query-injection) checks the URL as
 * fetch serialises it, not as this module wrote it.
 *
 * NO VALUE IS EVER ECHOED. A refusal names the form expected
 * ("a date, YYYY-MM-DD"), never what was sent.
 */

import type { Lit, LitType } from "@/lib/odata/ast";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";

/** The most code points any literal may have, whatever its field allows. */
export const MAX_LITERAL_CODE_POINTS = 256;

/** What a field's contract says about the values it holds. */
export interface LiteralFacets {
  /** MaxLength, when the contract gives a number. */
  readonly ml?: number;
  /** Decimal precision: total digits. */
  readonly p?: number;
  /** Decimal scale: digits after the point, when the contract gives a number. */
  readonly s?: number;
  /** A V2 Edm.DateTime that carries a date only (sap:display-format="Date"). */
  readonly dateOnly?: true;
}

export type LiteralResult =
  | { readonly ok: true; readonly lit: Lit }
  | { readonly ok: false; readonly rule: "VALUE_INVALID" | "VALUE_TOO_LONG"; readonly expected: string };

const INTEGER_RANGE: Partial<Record<LitType, { min: bigint; max: bigint; pattern: RegExp }>> = {
  U8: { min: BigInt(0), max: BigInt(255), pattern: /^(0|[1-9][0-9]{0,2})$/ },
  I8: { min: BigInt(-128), max: BigInt(127), pattern: /^-?(0|[1-9][0-9]{0,9})$/ },
  I16: { min: BigInt(-32768), max: BigInt(32767), pattern: /^-?(0|[1-9][0-9]{0,9})$/ },
  I32: { min: BigInt(-2147483648), max: BigInt(2147483647), pattern: /^-?(0|[1-9][0-9]{0,9})$/ },
  I64: { min: BigInt("-9223372036854775808"), max: BigInt("9223372036854775807"), pattern: /^-?(0|[1-9][0-9]{0,18})$/ },
};

const GUID_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const DECIMAL_PATTERN = /^(-?)(0|[1-9][0-9]{0,33})(?:\.([0-9]{1,34}))?$/;
const DATE_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const DATETIME_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(\.[0-9]{1,7})?)?$/;
const DATETIME_OFFSET_PATTERN =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,7})?(?:Z|([+-])([0-9]{2}):([0-9]{2}))$/;

/** The sentence a refusal uses: "<parameter> must be <expected>". */
export function expectedForm(t: LitType, facets: LiteralFacets = {}): string {
  switch (t) {
    case "S":
      return facets.ml !== undefined ? `text of at most ${Math.min(facets.ml, MAX_LITERAL_CODE_POINTS)} characters` : "text";
    case "G":
      return "a GUID, 8-4-4-4-12 hexadecimal digits";
    case "B":
      return "true or false";
    case "U8":
    case "I8":
    case "I16":
    case "I32":
    case "I64": {
      const r = INTEGER_RANGE[t]!;
      return `a whole number from ${r.min.toString()} to ${r.max.toString()}`;
    }
    case "D": {
      const digits =
        facets.p !== undefined
          ? `, at most ${facets.p} digits${facets.s !== undefined ? ` with at most ${facets.s} after the point` : ""}`
          : facets.s !== undefined
            ? `, with at most ${facets.s} digits after the point`
            : "";
      return `a decimal number such as 12.5, without an exponent${digits}`;
    }
    case "DT":
      return facets.dateOnly ? "a date, YYYY-MM-DD" : "a date and time, YYYY-MM-DDThh:mm:ss, without an offset";
    case "DTO":
      return "a date and time with an offset, YYYY-MM-DDThh:mm:ss followed by Z or +hh:mm";
    case "DA":
      return "a date, YYYY-MM-DD";
  }
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * A real calendar date, year 0001 to 9999, by the proleptic Gregorian
 * calendar that both `Date` and OData use. Counted by hand rather than
 * through `Date.UTC`, which reads a two-digit year as 19xx.
 */
function isCalendarDate(y: number, m: number, d: number): boolean {
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  const days = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
  return d <= days;
}

function isClock(h: number, mi: number, s: number): boolean {
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;
}

const num = (s: string | undefined) => (s === undefined ? 0 : Number(s));

/**
 * Parse what a caller sent for a field of type `t` into its canonical value.
 * `allowEmpty`: an empty string is a value (for `eq` and `in` on text), not a
 * missing one. The text has already passed the request's own checks
 * (params.ts): well-formed, no control characters, no `%XX`, at most 256 code
 * points.
 */
export function parseLiteral(
  t: LitType,
  text: string,
  facets: LiteralFacets = {},
  opts: { readonly allowEmpty?: boolean } = {},
): LiteralResult {
  const refuse = (rule: "VALUE_INVALID" | "VALUE_TOO_LONG" = "VALUE_INVALID"): LiteralResult => ({
    ok: false,
    rule,
    expected: expectedForm(t, facets),
  });
  const ok = (v: string): LiteralResult => ({ ok: true, lit: { t, v } });

  switch (t) {
    case "S": {
      if (text.length === 0 && opts.allowEmpty !== true) return refuse();
      if (!text.isWellFormed()) return refuse();
      // Code points, not UTF-16 units: an astral character is one character
      // to SAP's MaxLength.
      let n = 0;
      for (const _ of text) n++;
      if (n > MAX_LITERAL_CODE_POINTS || (facets.ml !== undefined && n > facets.ml)) return refuse("VALUE_TOO_LONG");
      // As sent: no trim, no case folding, no normalisation. SAP's ALPHA
      // padding of a numeric-looking key is the caller's to send.
      return ok(text);
    }
    case "G":
      return GUID_PATTERN.test(text) ? ok(text.toLowerCase()) : refuse();
    case "B":
      return text === "true" || text === "false" ? ok(text) : refuse();
    case "U8":
    case "I8":
    case "I16":
    case "I32":
    case "I64": {
      const r = INTEGER_RANGE[t]!;
      if (!r.pattern.test(text) || text === "-0") return refuse();
      const n = BigInt(text);
      return n >= r.min && n <= r.max ? ok(text) : refuse();
    }
    case "D": {
      const m = DECIMAL_PATTERN.exec(text);
      if (!m) return refuse();
      const sign = m[1]!;
      const int = m[2]!;
      const frac = m[3] ?? "";
      // -0 and -0.000 are zero with a sign SAP may or may not drop.
      if (sign === "-" && int === "0" && /^0*$/.test(frac)) return refuse();
      // A leading 0 is not a digit of precision: 0.5 is one digit.
      const digits = (int === "0" ? 0 : int.length) + frac.length;
      if (facets.p !== undefined && digits > facets.p) return refuse();
      if (facets.s !== undefined && frac.length > facets.s) return refuse();
      return ok(text);
    }
    case "DT": {
      if (facets.dateOnly) {
        const d = DATE_PATTERN.exec(text) ?? (text.endsWith("T00:00:00") ? DATE_PATTERN.exec(text.slice(0, -9)) : null);
        if (!d) return refuse();
        if (!isCalendarDate(num(d[1]), num(d[2]), num(d[3]))) return refuse();
        return ok(`${d[1]}-${d[2]}-${d[3]}T00:00:00`);
      }
      const m = DATETIME_PATTERN.exec(text);
      if (!m) return refuse();
      if (!isCalendarDate(num(m[1]), num(m[2]), num(m[3])) || !isClock(num(m[4]), num(m[5]), num(m[6]))) return refuse();
      return ok(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${m[7] ?? ""}`);
    }
    case "DTO": {
      const m = DATETIME_OFFSET_PATTERN.exec(text);
      if (!m) return refuse();
      if (!isCalendarDate(num(m[1]), num(m[2]), num(m[3])) || !isClock(num(m[4]), num(m[5]), num(m[6]))) return refuse();
      if (m[8] !== undefined) {
        const oh = num(m[9]);
        const om = num(m[10]);
        // The widest offset in use is ±14:00 (Kiribati); minutes are minutes.
        if (oh > 14 || om > 59 || (oh === 14 && om !== 0)) return refuse();
      }
      return ok(text);
    }
    case "DA": {
      const m = DATE_PATTERN.exec(text);
      if (!m || !isCalendarDate(num(m[1]), num(m[2]), num(m[3]))) return refuse();
      return ok(text);
    }
  }
}

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * Literal content: `'` becomes `''` (raw); RFC 3986 unreserved characters are
 * kept; every other UTF-8 byte becomes `%XX`, upper case. By code point, so a
 * character outside the BMP is its four bytes. A lone surrogate cannot be
 * encoded honestly (UTF-8 has no form for it), and the request's checks refuse
 * one, so meeting one here is a defect rather than something to encode.
 */
export function encLit(s: string): string {
  if (!s.isWellFormed()) throw new QueryCompilerInvariantError("A literal is not well-formed UTF-16.");
  let out = "";
  for (const ch of s) {
    if (ch === "'") out += "''";
    else if (UNRESERVED.test(ch)) out += ch;
    else for (const b of Buffer.from(ch, "utf8")) out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/**
 * How one type is written in one version: a constant prefix and suffix
 * around the encoded content, and what of the canonical value is encoded.
 * Null where the version has no such literal (an Edm.DateTime in V4, an
 * Edm.Date in V2): the basis never maps one there (basis.ts), so meeting one is
 * a defect.
 *
 *   type   V2 (OData V2 Overview §6)       V4 (OData ABNF primitiveLiteral)
 *   S      '…'                              '…'
 *   G      guid'…'                          … (bare)
 *   B      true / false                     true / false
 *   U8…I32 …                                …
 *   I64    …L                               …
 *   D      ….0M (always a point)            …
 *   DT     datetime'…'                      —
 *   DTO    datetimeoffset'…'                … (bare; + and : percent-encoded)
 *   DA     —                                …
 */
export interface LiteralForm {
  readonly prefix: string;
  readonly suffix: string;
  readonly content: (v: string) => string;
}

const asIs = (v: string) => v;
/** V2's decimal grammar is `[0-9]+.[0-9]+M`: 10 is written 10.0M. */
const withPoint = (v: string) => (v.includes(".") ? v : `${v}.0`);

export function literalForm(t: LitType, odata: "V2" | "V4"): LiteralForm | null {
  const bare: LiteralForm = { prefix: "", suffix: "", content: asIs };
  switch (t) {
    case "S":
      return { prefix: "'", suffix: "'", content: asIs };
    case "G":
      return odata === "V2" ? { prefix: "guid'", suffix: "'", content: asIs } : bare;
    case "B":
    case "U8":
    case "I8":
    case "I16":
    case "I32":
      return bare;
    case "I64":
      return odata === "V2" ? { prefix: "", suffix: "L", content: asIs } : bare;
    case "D":
      return odata === "V2" ? { prefix: "", suffix: "M", content: withPoint } : bare;
    case "DT":
      return odata === "V2" ? { prefix: "datetime'", suffix: "'", content: asIs } : null;
    case "DTO":
      return odata === "V2" ? { prefix: "datetimeoffset'", suffix: "'", content: asIs } : bare;
    case "DA":
      return odata === "V4" ? bare : null;
  }
}

/** One literal as `odata` writes it, already encoded for a URL. */
export function serialiseLiteral(lit: Lit, odata: "V2" | "V4"): string {
  const form = literalForm(lit.t, odata);
  if (form === null) throw new QueryCompilerInvariantError(`A ${lit.t} literal has no ${odata} form.`);
  // Booleans are compiler constants, never the caller's bytes.
  if (lit.t === "B") {
    if (lit.v !== "true" && lit.v !== "false") throw new QueryCompilerInvariantError("A boolean literal is neither true nor false.");
    return lit.v === "true" ? "true" : "false";
  }
  return `${form.prefix}${encLit(form.content(lit.v))}${form.suffix}`;
}
