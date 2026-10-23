/**
 * The oracle's own OData reader, for the v1 subset P1.4a emits (A2).
 * Imports nothing from src/.
 *
 * Written from the OASIS ABNF (V4 `primitiveLiteral`, `SQUOTE-in-string`) and
 * the OData V2 Overview §6 literal forms, not from the compiler:
 *
 *   filter     = term *( SP "and" SP term )
 *   term       = "(" cmp *( SP "or" SP cmp ) ")" / cmp
 *   cmp        = identifier SP ( "eq" / "gt" / "ge" / "lt" / "le" ) SP literal
 *   key        = "(" literal ")" / "(" identifier "=" literal *( "," identifier "=" literal ) ")"
 *   orderby    = identifier SP ( "asc" / "desc" ) *( "," identifier SP ( "asc" / "desc" ) )
 *   select     = identifier *( "," identifier )
 *
 * A literal is read by the type of the identifier before it, from the test's
 * own model of the policy, so the reader never guesses. The result is a
 * neutral tree — field, operator, typed value — compared with the generator's
 * own model of what it asked for.
 */

import { OracleError } from "./uri";

export type OracleType = "S" | "G" | "B" | "U8" | "I8" | "I16" | "I32" | "I64" | "D" | "DT" | "DTO" | "DA";

export type NeutralPredicate =
  | { readonly op: "eq"; readonly v: string }
  | { readonly op: "in"; readonly vs: readonly string[] }
  | { readonly op: "range"; readonly lo?: { readonly incl: boolean; readonly v: string }; readonly hi?: { readonly incl: boolean; readonly v: string } };

export const IDENT = /[A-Za-z_][A-Za-z0-9_]{0,127}/y;

const DATE = "[0-9]{4}-[0-9]{2}-[0-9]{2}";
const TIME = "[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\\.[0-9]+)?)?";
const TIME_S = "[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?";
const OFFSET = "(?:Z|[+-][0-9]{2}:[0-9]{2})";
const GUID = "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}";

/** Unquoted literal forms, per type and version: [prefix, body pattern, suffix]. */
function form(t: OracleType, version: "V2" | "V4"): [string, string, string] {
  switch (t) {
    case "S":
      return ["'", "", "'"]; // read by hand: quote doubling
    case "G":
      return version === "V2" ? ["guid'", GUID, "'"] : ["", GUID, ""];
    case "B":
      return ["", "true|false", ""];
    case "U8":
    case "I8":
    case "I16":
    case "I32":
      return ["", "-?[0-9]+", ""];
    case "I64":
      return version === "V2" ? ["", "-?[0-9]+", "L"] : ["", "-?[0-9]+", ""];
    case "D":
      return version === "V2" ? ["", "-?[0-9]+\\.[0-9]+", "M"] : ["", "-?[0-9]+(?:\\.[0-9]+)?", ""];
    case "DT":
      if (version === "V4") throw new OracleError("Edm.DateTime has no V4 literal");
      return ["datetime'", `${DATE}T${TIME}`, "'"];
    case "DTO":
      return version === "V2" ? ["datetimeoffset'", `${DATE}T${TIME_S}${OFFSET}`, "'"] : ["", `${DATE}T${TIME_S}${OFFSET}`, ""];
    case "DA":
      if (version === "V2") throw new OracleError("Edm.Date has no V2 literal");
      return ["", DATE, ""];
  }
}

/** The neutral form of a value, by type: what two spellings of one value share. */
export function normalise(t: OracleType, text: string): string {
  switch (t) {
    case "G":
      return text.toLowerCase();
    case "U8":
    case "I8":
    case "I16":
    case "I32":
    case "I64":
      return BigInt(text).toString();
    case "D": {
      const neg = text.startsWith("-");
      const [int = "0", frac = ""] = (neg ? text.slice(1) : text).split(".");
      const i = int.replace(/^0+(?=[0-9])/, "");
      const f = frac.replace(/0+$/, "");
      const body = f ? `${i}.${f}` : i;
      return neg && body !== "0" ? `-${body}` : body;
    }
    case "DT": {
      // Seconds are written when absent: 10:15 is 10:15:00.
      const m = /^(.{10}T[0-9]{2}:[0-9]{2})(:[0-9]{2}(?:\.[0-9]+)?)?$/.exec(text);
      if (!m) throw new OracleError("not a datetime");
      return `${m[1]}${m[2] ?? ":00"}`;
    }
    default:
      return text;
  }
}

class Reader {
  i = 0;
  constructor(readonly s: string) {}
  done(): boolean {
    return this.i >= this.s.length;
  }
  peek(t: string): boolean {
    return this.s.startsWith(t, this.i);
  }
  take(t: string): void {
    if (!this.peek(t)) throw new OracleError(`expected ${JSON.stringify(t)} at ${this.i}`);
    this.i += t.length;
  }
  ident(): string {
    IDENT.lastIndex = this.i;
    const m = IDENT.exec(this.s);
    if (!m) throw new OracleError(`expected a name at ${this.i}`);
    this.i += m[0].length;
    return m[0];
  }
  word(words: readonly string[]): string {
    for (const w of words) {
      if (this.peek(w)) {
        this.i += w.length;
        return w;
      }
    }
    throw new OracleError(`expected one of ${words.join(", ")} at ${this.i}`);
  }
  /** A literal of `t`, read whole, then a boundary: the end, a space, `)` or `,`. */
  literal(t: OracleType, version: "V2" | "V4"): string {
    const [prefix, body, suffix] = form(t, version);
    let value: string;
    if (t === "S") {
      this.take("'");
      let out = "";
      for (;;) {
        if (this.done()) throw new OracleError("an unterminated string");
        if (this.peek("''")) {
          out += "'";
          this.i += 2;
        } else if (this.peek("'")) {
          this.i += 1;
          break;
        } else {
          const cp = this.s.codePointAt(this.i)!;
          out += String.fromCodePoint(cp);
          this.i += cp > 0xffff ? 2 : 1;
        }
      }
      value = out;
    } else {
      this.take(prefix);
      const re = new RegExp(body, "y");
      re.lastIndex = this.i;
      const m = re.exec(this.s);
      if (!m) throw new OracleError(`expected a ${t} literal at ${this.i}`);
      this.i += m[0].length;
      this.take(suffix);
      value = m[0];
    }
    if (!this.done() && !this.peek(" ") && !this.peek(")") && !this.peek(",")) throw new OracleError(`a literal runs on at ${this.i}`);
    return t === "S" ? value : normalise(t, value);
  }
}

type TypeOf = (field: string) => OracleType | undefined;

function typed(typeOf: TypeOf, field: string): OracleType {
  const t = typeOf(field);
  if (t === undefined) throw new OracleError(`a name the policy does not have: ${field}`);
  return t;
}

/** A decoded $filter, as field → predicate. Throws OracleError on anything outside the grammar. */
export function parseFilter(text: string, version: "V2" | "V4", typeOf: TypeOf): Map<string, NeutralPredicate> {
  const r = new Reader(text);
  const out = new Map<string, NeutralPredicate>();
  const cmp = (): { f: string; op: string; v: string } => {
    const f = r.ident();
    r.take(" ");
    const op = r.word(["eq", "gt", "ge", "lt", "le"]);
    r.take(" ");
    return { f, op, v: r.literal(typed(typeOf, f), version) };
  };
  for (;;) {
    if (r.peek("(")) {
      r.take("(");
      const terms = [cmp()];
      while (r.peek(" or ")) {
        r.take(" or ");
        terms.push(cmp());
      }
      r.take(")");
      const f = terms[0]!.f;
      if (terms.some((t) => t.f !== f || t.op !== "eq")) throw new OracleError("an or that is not one field's set of eq");
      if (out.has(f)) throw new OracleError(`two predicates on ${f}`);
      if (terms.length < 2) throw new OracleError("an or chain of one term");
      // A set: two spellings of one value (V2 writes 1 and 1.0 alike) are one member.
      const vs = [...new Set(terms.map((t) => t.v))].sort();
      out.set(f, vs.length === 1 ? { op: "eq", v: vs[0]! } : { op: "in", vs });
    } else {
      const { f, op, v } = cmp();
      const prev = out.get(f);
      if (op === "eq") {
        if (prev) throw new OracleError(`two predicates on ${f}`);
        out.set(f, { op: "eq", v });
      } else {
        if (prev && prev.op !== "range") throw new OracleError(`a bound beside eq or in on ${f}`);
        const range = (prev ?? { op: "range" }) as { op: "range"; lo?: { incl: boolean; v: string }; hi?: { incl: boolean; v: string } };
        const bound = { incl: op === "ge" || op === "le", v };
        if (op === "gt" || op === "ge") {
          if (range.lo) throw new OracleError(`two lower bounds on ${f}`);
          out.set(f, { ...range, lo: bound });
        } else {
          if (range.hi) throw new OracleError(`two upper bounds on ${f}`);
          out.set(f, { ...range, hi: bound });
        }
      }
    }
    if (r.done()) break;
    r.take(" and ");
  }
  return out;
}

/** A decoded key predicate, `(…)`, as field → value, in the order written. */
export function parseKeyPredicate(text: string, version: "V2" | "V4", keyOrder: readonly string[], typeOf: TypeOf): Map<string, string> {
  const r = new Reader(text);
  const out = new Map<string, string>();
  r.take("(");
  IDENT.lastIndex = r.i;
  const named = IDENT.test(text) && text[IDENT.lastIndex] === "=";
  if (!named) {
    if (keyOrder.length !== 1) throw new OracleError("a single-value key on a composite key");
    out.set(keyOrder[0]!, r.literal(typed(typeOf, keyOrder[0]!), version));
  } else {
    for (;;) {
      const f = r.ident();
      r.take("=");
      if (out.has(f)) throw new OracleError(`${f} twice in a key`);
      out.set(f, r.literal(typed(typeOf, f), version));
      if (!r.peek(",")) break;
      r.take(",");
    }
  }
  r.take(")");
  if (!r.done()) throw new OracleError("text after a key predicate");
  return out;
}

export function parseOrderby(text: string): { f: string; desc: boolean }[] {
  const r = new Reader(text);
  const out: { f: string; desc: boolean }[] = [];
  for (;;) {
    const f = r.ident();
    r.take(" ");
    out.push({ f, desc: r.word(["asc", "desc"]) === "desc" });
    if (r.done()) return out;
    r.take(",");
  }
}

export function parseSelect(text: string): string[] {
  const r = new Reader(text);
  const out: string[] = [];
  for (;;) {
    out.push(r.ident());
    if (r.done()) return out;
    r.take(",");
  }
}
