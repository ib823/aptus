// @vitest-environment node
/**
 * NO CALLER BYTE CHANGES THE STRUCTURE OF THE SAP QUERY (P1.4, acceptance
 * criterion A2; threats N1, N2, N4).
 *
 * Generated policies over generated bases (with hostile property names that
 * must never be emitted) and generated requests, their values drawn with
 * adversarial weights: quotes and doubled quotes, `' or 1 eq 1 or 'a' eq '`,
 * `&$expand=x`, `#`, `%`, `%27`, `%2527`, `+`, `=`, `?`, `/`, `\`,
 * parentheses, commas, semicolons, CR, LF, NUL, U+2028, NBSP, ZWJ, RTL marks,
 * combining marks, astral characters, U+FFFD, lone surrogates, values at
 * exactly the length caps, and numeric and date edge cases. Each request goes
 * the way a real one does — serialised as a query string, parsed back by the
 * WHATWG URL parser — through parseQueryParams, checkQuery, compileQuery and
 * buildSapUrl, and the URL is then read AS FETCH SENDS IT
 * (`new URL(url).href`) by an independent oracle (./odata-oracle, which
 * imports nothing from src/).
 *
 * FOR EVERY CASE:
 *   1. refuse or emit: never a throw, never both; a refusal is from the
 *      closed sets, and a request the generator built to be refused is;
 *   2. the option names are exactly the expected ones, in order, each once,
 *      and `sap-client` at most once;
 *   3. round trip: the decoded, parsed $filter and key predicate equal the
 *      GENERATOR'S OWN model (field, operator, typed value) — not the
 *      compiler's AST — for V2 and V4 separately;
 *   4. the path is exactly servicePath/EntitySet plus `(predicate)`: no `?`,
 *      `#` or extra `/` comes from a value;
 *   5. every name in the URL is one of the policy's;
 *   6. queryShape carries no literal content;
 *   7. the URL is at most 4,000 characters, or the refusal is SAP_URL_TOO_LONG.
 *
 * A CANARY proves the oracle can see a break: with the compiler's literal
 * encoder swapped for one that does not double quotes, or for plain
 * encodeURIComponent, the same run reports a violation within 200 cases.
 * And a parser fuzz: random query strings never make parseQueryParams throw,
 * and each parses in under 5 ms.
 *
 * CI runs ODATA_FUZZ_ITERATIONS (default 3,000) cases from ODATA_FUZZ_SEED
 * (default 20261027); the nightly job runs 100,000.
 */

import { describe, expect, it, vi } from "vitest";

import { normalise, parseFilter, parseKeyPredicate, parseOrderby, parseSelect, type NeutralPredicate, type OracleType } from "./odata-oracle/odata";
import { OracleError, splitQuery, splitUri, strictPercentDecode } from "./odata-oracle/uri";

import type { QueryBasisV1, BasisProperty } from "@/lib/odata/basis";
import type * as LiteralsModule from "@/lib/odata/literals";
import { queryShape } from "@/lib/odata/ast";
import { checkPolicyAvailable, checkQuery } from "@/lib/odata/check";
import { buildQueryUrl, compileQuery } from "@/lib/odata/operation-compiler";
import { parseQueryParams } from "@/lib/odata/params";
import { compileQueryPolicy } from "@/lib/odata/policy-compiler";
import { DEFAULT_PAGE, type CompiledQueryPolicyV1, type PreparedPolicy } from "@/lib/odata/policy";
import { QUERY_REFUSAL_STATUS, QUERY_RULE_LIST } from "@/lib/odata/rules";

const broken = vi.hoisted(() => ({ mode: null as null | "no-doubling" | "encodeURIComponent" }));

vi.mock("@/lib/odata/literals", async (importOriginal) => {
  const real = await importOriginal<typeof LiteralsModule>();
  return {
    ...real,
    serialiseLiteral: (lit: { t: Parameters<typeof real.literalForm>[0]; v: string }, odata: "V2" | "V4") => {
      const f = real.literalForm(lit.t, odata);
      if (broken.mode === null || f === null || lit.t === "B") return real.serialiseLiteral(lit, odata);
      const enc = broken.mode === "encodeURIComponent" ? encodeURIComponent : (s: string) => real.encLit(s).replaceAll("''", "'");
      return `${f.prefix}${enc(f.content(lit.v))}${f.suffix}`;
    },
  };
});

const ITERATIONS = Number(process.env.ODATA_FUZZ_ITERATIONS ?? 3000);
const SEED = Number(process.env.ODATA_FUZZ_SEED ?? 20261027);

// ---------------------------------------------------------------- randomness

class Rand {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  subset<T>(xs: readonly T[], p: number): T[] {
    return xs.filter(() => this.chance(p));
  }
}

// ---------------------------------------------------------------- the model

type Version = "V2" | "V4";
type GType = OracleType | "OTHER";

interface GProp {
  readonly n: string;
  readonly t: GType;
  readonly bad: boolean;
  readonly ml?: number;
  readonly p?: number;
  readonly s?: number;
  readonly dateOnly?: boolean;
}

const RESERVED = new Set(["select", "expand", "filter", "orderby", "count", "pageSize", "cursor", "key"]);
const HOSTILE_NAMES = ["a'b", "x&$expand=y", "Straße", "__proto__", "a b", "a.b", "to_Item/Material", "q=1", `L${"x".repeat(128)}`, "1abc", "ID)", "$filter"];
const V2_TYPES: GType[] = ["S", "S", "S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "OTHER"];
const V4_TYPES: GType[] = ["S", "S", "S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DTO", "DA", "OTHER"];
const IDENT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_".split("");

interface World {
  readonly version: Version;
  readonly props: readonly GProp[];
  readonly basis: QueryBasisV1;
  readonly compiled: CompiledQueryPolicyV1;
  readonly policy: PreparedPolicy;
  /** The generator's own type for each good name: the oracle reads literals by it. */
  readonly typeOf: (f: string) => OracleType | undefined;
  readonly target: { baseUrl: string; servicePath: string; entitySet: string; client: string | null };
}

const literalTypes = new Set<GType>(["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA"]);

function makeWorld(rand: Rand): World | null {
  const version: Version = rand.chance(0.5) ? "V2" : "V4";
  const props: GProp[] = [];
  const used = new Set<string>();
  const count = rand.int(2, 12);
  for (let i = 0; i < count; i++) {
    let n: string;
    let bad = false;
    if (rand.chance(0.15)) {
      n = rand.pick(HOSTILE_NAMES);
      bad = true;
    } else {
      n = `F${i}_${Array.from({ length: rand.int(0, 12) }, () => rand.pick(IDENT_CHARS)).join("")}`;
    }
    if (used.has(n)) continue;
    used.add(n);
    const t = rand.pick(version === "V2" ? V2_TYPES : V4_TYPES);
    const p: { -readonly [K in keyof GProp]: GProp[K] } = { n, t, bad };
    if (t === "S" && rand.chance(0.6)) p.ml = rand.pick([1, 4, 10, 40, 255, 256, 300]);
    if (t === "D") {
      p.p = rand.int(1, 34);
      p.s = rand.int(0, Math.min(p.p, 10));
    }
    if (t === "DT" && rand.chance(0.5)) p.dateOnly = true;
    props.push(p);
  }
  const good = props.filter((p) => !p.bad);
  const keyable = good.filter((p) => literalTypes.has(p.t) && p.t !== "B");
  if (keyable.length === 0) return null;
  const keys = rand.subset(keyable, 0.3).slice(0, 3).map((p) => p.n);
  if (keys.length === 0) keys.push(keyable[0]!.n);
  if (version === "V4" && rand.chance(0.2)) {
    props.push({ n: "IsActiveEntity", t: "B", bad: false });
    keys.push("IsActiveEntity");
  }
  const set: { -readonly [K in keyof QueryBasisV1["set"]]: QueryBasisV1["set"][K] } = {};
  if (rand.chance(0.08)) set.pageable = false;
  if (rand.chance(0.05)) set.topSupported = false;
  if (rand.chance(0.08)) set.countable = false;
  if (rand.chance(0.1)) set.selectSupported = false;
  if (rand.chance(0.05)) set.addressable = false;
  if (rand.chance(0.05)) set.requiresFilter = true;
  const basisProps: BasisProperty[] = props.map((p) => {
    const b: { -readonly [K in keyof BasisProperty]: BasisProperty[K] } = { n: p.n.slice(0, 128), edm: p.t === "OTHER" ? "Edm.Double" : `Edm.${p.t}`, t: p.t, nullable: true };
    if (p.ml !== undefined) b.ml = p.ml;
    if (p.p !== undefined) b.p = p.p;
    if (p.s !== undefined) b.s = p.s;
    if (p.dateOnly) b.dateOnly = true;
    if (p.bad) b.bad = "NAME";
    if (!p.bad && rand.chance(0.05)) b.filterable = false;
    if (!p.bad && rand.chance(0.05)) b.sortable = false;
    return b;
  });
  const entitySet = rand.pick(["A_SalesOrder", "Orders", "cust_Travel", "YY1_BONUS"]);
  const basis: QueryBasisV1 = {
    v: 1,
    snapshot: { id: "snap_fuzz", semver: "1.0.0", contentHash: "f".repeat(64) },
    entitySet,
    odata: version,
    source: "METADATA",
    set,
    keys,
    properties: basisProps,
  };
  const goodNames = good.map((p) => p.n);
  const filterable = good.filter((p) => literalTypes.has(p.t)).map((p) => p.n);
  const maxSize = rand.int(1, 100);
  const result = compileQueryPolicy(
    {
      v: 1,
      select: rand.chance(0.6) ? "*" : [...new Set([...keys.filter((k) => k !== "IsActiveEntity"), ...rand.subset(goodNames, 0.6)])],
      filter: rand.subset(filterable, 0.7).map((field) => ({ field, ops: rand.subset(["eq", "in", "gt", "ge", "lt", "le"] as const, 0.6).concat("eq") })),
      sort: rand.subset(filterable, 0.5),
      requireFilterOn: [],
      keyLookup: rand.chance(0.8),
      count: rand.chance(0.5),
      page: { defaultSize: rand.int(1, maxSize), maxSize, rowCap: rand.int(maxSize, 1000), byteCap: DEFAULT_PAGE.byteCap },
    },
    basis,
    { mode: "verify", interface: { entitySet, odataVersion: version }, revision: 1, now: new Date("2026-10-27T00:00:00Z") },
  );
  if (!result.ok || result.compiled.state !== "READY") return null;
  const available = checkPolicyAvailable(JSON.parse(JSON.stringify(result.compiled)), { entitySet });
  if (!available.ok) throw new Error(`a READY policy was not available: ${available.detail.rule}`);
  const types = new Map<string, OracleType>();
  for (const p of props) if (!p.bad && p.t !== "OTHER") types.set(p.n, p.t);
  return {
    version,
    props,
    basis,
    compiled: result.compiled,
    policy: available.policy,
    typeOf: (f) => types.get(f),
    target: {
      baseUrl: rand.pick(["https://sap.example.invalid:44300", "https://my000000-api.s4hana.example", "http://10.0.0.5:8000"]),
      servicePath: rand.pick(["/sap/opu/odata/sap/API_SALES_ORDER_SRV", "/sap/opu/odata4/sap/z_api/srvd_a2x/sap/z_api/0001", "/odata/v2"]),
      entitySet,
      client: rand.chance(0.5) ? "100" : null,
    },
  };
}

// ---------------------------------------------------------------- values

/** A value the generator built, its own neutral form, and whether it must be accepted. */
interface GValue {
  readonly text: string;
  readonly neutral: string;
  readonly valid: boolean;
}

const PIECES = [
  "'", "''", "' or 1 eq 1 or 'a' eq '", "&$expand=x", "#", "%", "%27", "%2527", "%2F", "+", "=", "?", "/", "\\", "(", ")", ",", ";",
  "\r", "\n", "\u0000", " ", " ", "‍", "‮", "́", "\u{1F600}", "�", "\uD800", "\uDC00", "\u0085", "\u007f",
  " ", "a", "Z", "0", "9", "-", ".", "_", "~", "é", "ß", "漢", "$", "@", "!", "*", "[", "]", "{", "}", "|", "^", "`", "\"", "<", ">",
];
const SAFE_PIECES = ["'", "''", "' or 1 eq 1 or 'a' eq '", "&$expand=x", "#", "%", "+", "=", "?", "/", "\\", "(", ")", ",", ";", " ", " ", "‍", "‮", "́", "\u{1F600}", " ", "a", "Z", "0", "é", "漢", "$", "@", "\"", "<"];

function codePoints(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function textValid(s: string): boolean {
  if (!s.isWellFormed()) return false;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return false;
  }
  return codePoints(s) <= 256 && !/%[0-9A-Fa-f]{2}/.test(s);
}

function stringValue(rand: Rand, ml: number | undefined, allowEmpty: boolean, adversarial: boolean): GValue {
  let text: string;
  if (rand.chance(0.05)) {
    // Exactly at a length cap.
    const cap = Math.min(ml ?? 256, 256);
    text = rand.pick(["'", "a", "\u{1F600}", "é"]).repeat(cap + (rand.chance(0.3) ? 1 : 0));
  } else {
    const pool = adversarial ? PIECES : SAFE_PIECES;
    text = Array.from({ length: rand.int(0, 6) }, () => rand.pick(pool)).join("");
  }
  const valid = textValid(text) && (ml === undefined || codePoints(text) <= ml) && (allowEmpty || text.length > 0);
  return { text, neutral: text, valid };
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

function dateParts(rand: Rand): { y: number; m: number; d: number; real: boolean } {
  const y = rand.chance(0.1) ? rand.pick([1, 2000, 2024, 9999]) : rand.int(1990, 2030);
  const m = rand.chance(0.05) ? 13 : rand.int(1, 12);
  const d = rand.chance(0.1) ? rand.pick([29, 30, 31]) : rand.int(1, 28);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
  return { y, m, d, real: m <= 12 && d <= days };
}

function typedValue(rand: Rand, p: GProp, allowEmpty: boolean, adversarial: boolean): GValue {
  const t = p.t as OracleType;
  const garbage = (): GValue => ({ text: rand.pick(["", "x", "1e3", "NaN", "INF", "-0", "01", " 1", "+1", "1'", "true or 1 eq 1", "2026-02-30", "%27"]), neutral: "", valid: false });
  // Text no typed literal accepts; a string field draws its own adversarial text below.
  if (t !== "S" && adversarial && rand.chance(0.08)) return garbage();
  switch (t) {
    case "S":
      return stringValue(rand, p.ml, allowEmpty, adversarial);
    case "G": {
      const hex = (n: number) => Array.from({ length: n }, () => rand.pick("0123456789abcdefABCDEF".split(""))).join("");
      const text = `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
      return { text, neutral: text.toLowerCase(), valid: true };
    }
    case "B": {
      const text = rand.pick(["true", "false"]);
      return { text, neutral: text, valid: true };
    }
    case "U8":
    case "I8":
    case "I16":
    case "I32":
    case "I64": {
      const bounds: Record<string, [bigint, bigint]> = {
        U8: [BigInt(0), BigInt(255)],
        I8: [BigInt(-128), BigInt(127)],
        I16: [BigInt(-32768), BigInt(32767)],
        I32: [BigInt(-2147483648), BigInt(2147483647)],
        I64: [BigInt("-9223372036854775808"), BigInt("9223372036854775807")],
      };
      const [lo, hi] = bounds[t]!;
      const one = BigInt(1);
      const n = rand.pick([lo, hi, lo - one, hi + one, BigInt(0), BigInt(rand.int(-1000, 1000)), BigInt(rand.int(0, 255))]);
      const valid = n >= lo && n <= hi;
      return { text: n.toString(), neutral: n.toString(), valid };
    }
    case "D": {
      const neg = rand.chance(0.3);
      const intDigits = rand.int(0, 6);
      const int = intDigits === 0 ? "0" : `${rand.int(1, 9)}${Array.from({ length: intDigits - 1 }, () => rand.int(0, 9)).join("")}`;
      const frac = Array.from({ length: rand.int(0, 5) }, () => rand.int(0, 9)).join("");
      const text = `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
      const digits = (int === "0" ? 0 : int.length) + frac.length;
      const zero = int === "0" && /^0*$/.test(frac);
      const valid = !(neg && zero) && (p.p === undefined || digits <= p.p) && (p.s === undefined || frac.length <= p.s);
      return { text, neutral: normalise("D", text), valid };
    }
    case "DT": {
      const { y, m, d, real } = dateParts(rand);
      const date = `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
      if (p.dateOnly) {
        const midnight = rand.chance(0.3);
        return { text: midnight ? `${date}T00:00:00` : date, neutral: `${date}T00:00:00`, valid: real };
      }
      const h = rand.chance(0.05) ? 24 : rand.int(0, 23);
      const mi = rand.int(0, 59);
      const withSeconds = rand.chance(0.6);
      const text = `${date}T${pad(h, 2)}:${pad(mi, 2)}${withSeconds ? `:${pad(rand.int(0, 59), 2)}${rand.chance(0.3) ? `.${rand.int(1, 9999999)}` : ""}` : ""}`;
      return { text, neutral: normalise("DT", text), valid: real && h <= 23 };
    }
    case "DTO": {
      const { y, m, d, real } = dateParts(rand);
      const oh = rand.chance(0.1) ? rand.pick([14, 15]) : rand.int(0, 13);
      const om = oh === 14 && rand.chance(0.5) ? 30 : rand.pick([0, 30, 45]);
      const offset = rand.chance(0.3) ? "Z" : `${rand.pick(["+", "-"])}${pad(oh, 2)}:${pad(om, 2)}`;
      const text = `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}T${pad(rand.int(0, 23), 2)}:${pad(rand.int(0, 59), 2)}:${pad(rand.int(0, 59), 2)}${offset}`;
      const offsetOk = offset === "Z" || oh < 14 || (oh === 14 && om === 0);
      return { text, neutral: text, valid: real && offsetOk };
    }
    case "DA": {
      const { y, m, d, real } = dateParts(rand);
      const text = `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
      return { text, neutral: text, valid: real };
    }
  }
}

// ---------------------------------------------------------------- requests

interface Expectation {
  /** The generator built something that must be refused. */
  readonly mustRefuse: boolean;
  readonly kind: "LIST" | "KEY" | "KEY_VIA_FILTER";
  readonly filter: Map<string, NeutralPredicate>;
  readonly key: Map<string, string> | null;
  readonly orderby: { f: string; desc: boolean }[];
  readonly count: boolean;
  readonly literals: string[];
}

interface Request {
  readonly params: [string, string][];
  readonly expect: Expectation;
  readonly position: { skip: number; page0: boolean };
}

function makeRequest(rand: Rand, w: World): Request {
  const c = w.compiled;
  const params: [string, string][] = [];
  const literals: string[] = [];
  let mustRefuse = false;
  const adversarial = rand.chance(0.7);
  const fields = new Map(c.fields.map((f) => [f.n, f]));
  const gprop = (n: string) => w.props.find((p) => p.n === n && !p.bad)!;

  const doKey = c.key !== null && rand.chance(0.25);
  if (doKey) {
    const key = new Map<string, string>();
    let slash = false;
    for (const k of c.key!) {
      const v = typedValue(rand, gprop(k), false, adversarial);
      params.push([`key.${k}`, v.text]);
      literals.push(v.text);
      if (!v.valid) mustRefuse = true;
      key.set(k, v.neutral);
      if (gprop(k).t === "S" && (v.text.includes("/") || v.text.includes("\\"))) slash = true;
    }
    if (slash && !c.keyViaFilter) mustRefuse = true;
    if (w.policy.readable.length > 0 && rand.chance(0.3)) params.push(["select", [...new Set(rand.subset(w.policy.readable, 0.5).concat(w.policy.readable[0]!))].join(",")]);
    if (rand.chance(0.03)) {
      params.push(["filter.Anything.eq", "1"]);
      mustRefuse = true;
    }
    for (const p of c.pinned) key.set(p.f, "true");
    const viaFilter = slash && c.keyViaFilter;
    const filter = new Map<string, NeutralPredicate>();
    if (viaFilter) for (const [f, v] of key) filter.set(f, { op: "eq", v });
    return {
      params,
      expect: { mustRefuse, kind: viaFilter ? "KEY_VIA_FILTER" : "KEY", filter, key: viaFilter ? null : key, orderby: [], count: false, literals },
      position: { skip: 0, page0: true },
    };
  }

  const filter = new Map<string, NeutralPredicate>();
  const filterable = c.fields.filter((f) => f.ops !== undefined);
  const chosen = rand.subset(filterable, 0.4).slice(0, 5);
  if (chosen.length === 0 && c.requiresAnyFilter && filterable.length > 0) chosen.push(filterable[0]!);
  if (chosen.length === 0 && c.requiresAnyFilter) mustRefuse = true;
  for (const f of chosen) {
    const p = gprop(f.n);
    const ops = f.ops!;
    const lower = ops.filter((o) => o === "gt" || o === "ge");
    const upper = ops.filter((o) => o === "lt" || o === "le");
    const kinds = ["eq", ...(ops.includes("in") ? ["in"] : []), ...(lower.length + upper.length > 0 ? ["range"] : [])];
    const kind = rand.pick(kinds);
    if (kind === "eq") {
      const v = typedValue(rand, p, true, adversarial);
      params.push([`filter.${f.n}.eq`, v.text]);
      literals.push(v.text);
      if (!v.valid) mustRefuse = true;
      filter.set(f.n, { op: "eq", v: v.neutral });
    } else if (kind === "in") {
      const values = Array.from({ length: rand.int(1, 6) }, () => typedValue(rand, p, true, adversarial));
      for (const v of values) {
        params.push([`filter.${f.n}.in`, v.text]);
        literals.push(v.text);
        if (!v.valid) mustRefuse = true;
      }
      const set = [...new Set(values.map((v) => v.neutral))].sort();
      filter.set(f.n, set.length === 1 ? { op: "eq", v: set[0]! } : { op: "in", vs: set });
    } else {
      const range: { op: "range"; lo?: { incl: boolean; v: string }; hi?: { incl: boolean; v: string } } = { op: "range" };
      const useLo = lower.length > 0 && (upper.length === 0 || rand.chance(0.7));
      const useHi = upper.length > 0 && (!useLo || rand.chance(0.6));
      if (useLo) {
        const op = rand.pick(lower);
        const v = typedValue(rand, p, false, adversarial);
        params.push([`filter.${f.n}.${op}`, v.text]);
        literals.push(v.text);
        if (!v.valid) mustRefuse = true;
        range.lo = { incl: op === "ge", v: v.neutral };
      }
      if (useHi) {
        const op = rand.pick(upper);
        const v = typedValue(rand, p, false, adversarial);
        params.push([`filter.${f.n}.${op}`, v.text]);
        literals.push(v.text);
        if (!v.valid) mustRefuse = true;
        range.hi = { incl: op === "le", v: v.neutral };
      }
      filter.set(f.n, range);
    }
  }
  // Things the generator knows must be refused.
  if (rand.chance(0.04)) {
    params.push([rand.pick(["$filter", "$expand", "$top", "limit", "entity", "_"]), rand.pick(["Customer eq '1'", "x", "1"])]);
    mustRefuse = true;
  }
  if (rand.chance(0.04)) {
    params.push([`filter.${rand.pick(HOSTILE_NAMES)}.eq`, "1"]);
    mustRefuse = true;
  }
  if (rand.chance(0.03)) {
    const unfilterable = c.fields.find((f) => f.ops === undefined);
    if (unfilterable) {
      params.push([`filter.${unfilterable.n}.eq`, "1"]);
      mustRefuse = true;
    }
  }
  for (const p of c.pinned) filter.set(p.f, { op: "eq", v: "true" });

  if (w.policy.readable.length > 0 && rand.chance(0.3)) params.push(["select", [...new Set(rand.subset(w.policy.readable, 0.4).concat(w.policy.readable[0]!))].join(",")]);
  const orderby: { f: string; desc: boolean }[] = [];
  if (rand.chance(0.4)) {
    for (const f of rand.subset(w.policy.sortable, 0.5).slice(0, 3)) orderby.push({ f, desc: rand.chance(0.5) });
    if (orderby.length > 0) params.push(["orderby", orderby.map((o) => `${o.desc ? "-" : ""}${o.f}`).join(",")]);
  }
  if (c.paging === "OFFSET") {
    const listed = new Set(orderby.map((o) => o.f));
    for (const k of c.tieBreak) if (!listed.has(k)) orderby.push({ f: k, desc: false });
  }
  const count = c.count && rand.chance(0.4);
  if (count) params.push(["count", "true"]);
  if (rand.chance(0.5)) params.push(["pageSize", String(rand.int(1, c.page.maxSize))]);
  // A request with no reserved name is a legacy read, which this property is not about.
  if (!params.some(([k]) => RESERVED.has(k) || k.startsWith("filter.") || k.startsWith("key."))) params.push(["pageSize", "1"]);
  // The order of a query string is the caller's.
  for (let i = params.length - 1; i > 0; i--) {
    const j = rand.int(0, i);
    [params[i], params[j]] = [params[j]!, params[i]!];
  }
  const page0 = c.paging !== "OFFSET" || rand.chance(0.6);
  return {
    params,
    expect: { mustRefuse, kind: "LIST", filter, key: null, orderby, count, literals },
    position: { skip: page0 ? 0 : rand.int(1, 5000), page0 },
  };
}

// ---------------------------------------------------------------- the run

const REFUSAL_REASONS = new Set(Object.keys(QUERY_REFUSAL_STATUS));
const RULES = new Set<string>(QUERY_RULE_LIST);
const TYPE_CODES = new Set(["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA", "?"]);

/** One case: null when every property holds, or the first violation, in words. */
function runCase(rand: Rand, w: World): string | null {
  const req = makeRequest(rand, w);
  const e = req.expect;
  // As a real request arrives: serialised, then parsed by the WHATWG URL parser.
  const sent = new URLSearchParams();
  for (const [k, v] of req.params) sent.append(k, v);
  const incoming = new URL(`https://coreedge.example/api/northbound/v1/interfaces/if_1/data?${sent.toString()}`);

  let outcome: { refused: { reason: string; rule: string } } | { href: string; shape: string; kind: string; top: number | null };
  try {
    const parsed = parseQueryParams(incoming.searchParams, incoming.search.length);
    if (!parsed.surface) return "a request with reserved names was not on the query surface";
    if (!parsed.ok) outcome = { refused: { reason: "QUERY_INVALID", rule: parsed.rule } };
    else {
      const checked = checkQuery(parsed, w.policy);
      if (!checked.ok) outcome = { refused: { reason: checked.reason, rule: checked.detail.rule } };
      else {
        const pageSize = checked.ast.pageSize ?? 1;
        const q = compileQuery(checked.ast, w.policy, { skip: req.position.skip, top: pageSize + 1, page0: req.position.page0 }, checked.project);
        const built = buildQueryUrl(q, w.target);
        if (!built.ok) outcome = { refused: { reason: built.reason, rule: built.detail.rule } };
        else outcome = { href: new URL(built.url).href, shape: queryShape(checked.ast), kind: built.query.kind, top: built.query.top };
      }
    }
  } catch (err) {
    return `threw: ${(err as Error).name}: ${(err as Error).message}`;
  }

  // 1 — refuse or emit.
  if ("refused" in outcome) {
    const { reason, rule } = outcome.refused;
    if (!REFUSAL_REASONS.has(reason) || !RULES.has(rule)) return `a refusal outside the closed sets: ${reason}/${rule}`;
    if (!e.mustRefuse && rule !== "SAP_URL_TOO_LONG" && rule !== "TOO_COMPLEX") return `a valid request refused: ${rule}`;
    return null;
  }
  if (e.mustRefuse) return `emitted a request the model says must be refused: ${JSON.stringify(req.params)}`;
  if (outcome.kind !== e.kind) return `kind ${outcome.kind}, expected ${e.kind}`;

  // 7 — length, as sent.
  if (outcome.href.length > 4000) return `a URL of ${outcome.href.length} characters`;

  try {
    const uri = splitUri(outcome.href);
    const base = new URL(w.target.baseUrl);
    if (`${uri.scheme}:` !== base.protocol || uri.authority !== base.host) return "the URL's origin is not the connection's";
    if (uri.fragment !== null) return "a fragment in the URL";
    if (uri.query === null) return "no query string";

    // 4 — the path.
    const prefix = `${w.target.servicePath}/${encodeURIComponent(w.target.entitySet)}`;
    if (!uri.path.startsWith(prefix)) return "the path does not start with the service path and entity set";
    const suffix = uri.path.slice(prefix.length);
    if (e.kind === "KEY") {
      if (!suffix.startsWith("(") || !suffix.endsWith(")")) return "a key lookup without a key predicate";
      if (suffix.includes("/") || /%2F|%5C/i.test(suffix)) return "a slash in a key path segment";
      const key = parseKeyPredicate(strictPercentDecode(suffix), w.version, w.compiled.key!, (f) => w.typeOf(f));
      // 3 — the key round trip.
      if (JSON.stringify([...key].sort()) !== JSON.stringify([...e.key!].sort())) {
        return `key round trip: ${JSON.stringify([...key])} != ${JSON.stringify([...e.key!])}`;
      }
    } else if (suffix !== "") return "a path suffix on a list";

    // 2 — the options.
    const options = splitQuery(uri.query);
    const names = options.map(([n]) => n);
    if (names.filter((n) => n === "sap-client").length > (w.target.client ? 1 : 0)) return "sap-client more than once";
    const c = w.compiled;
    const expected: string[] = [];
    if (e.kind === "KEY") expected.push("$format");
    else if (e.kind === "KEY_VIA_FILTER") expected.push("$filter", "$top", "$format");
    else {
      if (e.filter.size > 0) expected.push("$filter");
      if (e.orderby.length > 0) expected.push("$orderby");
      if (c.topSupported) expected.push("$top");
      if (req.position.skip > 0) expected.push("$skip");
      if (req.position.page0 && e.count) expected.push(w.version === "V2" ? "$inlinecount" : "$count");
      expected.push("$format");
    }
    if (w.target.client) expected.push("sap-client");
    const withoutSelect = names.filter((n) => n !== "$select");
    if (names.length - withoutSelect.length > 1) return "$select more than once";
    if (names.includes("$select") && names[0] !== "$select") return "$select out of order";
    if (JSON.stringify(withoutSelect) !== JSON.stringify(expected)) return `options ${JSON.stringify(names)}, expected ${JSON.stringify(expected)}`;
    const value = (n: string) => options.find(([k]) => k === n)?.[1];

    // 5 — names.
    const policyNames = new Set([...w.policy.readable, ...c.pinned.map((p) => p.f)]);
    const select = value("$select");
    if (select !== undefined) for (const n of parseSelect(select)) if (!policyNames.has(n)) return `$select names ${n}`;

    // 3 — the filter round trip.
    const filterText = value("$filter");
    const filter = filterText === undefined ? new Map<string, NeutralPredicate>() : parseFilter(filterText, w.version, (f) => (policyNames.has(f) ? w.typeOf(f) : undefined));
    const canon = (m: Map<string, NeutralPredicate>) => JSON.stringify([...m].sort(([a], [b]) => (a < b ? -1 : 1)));
    if (canon(filter) !== canon(e.filter)) return `filter round trip:\n  got ${canon(filter)}\n  expected ${canon(e.filter)}`;
    const orderbyText = value("$orderby");
    const orderby = orderbyText === undefined ? [] : parseOrderby(orderbyText);
    if (JSON.stringify(orderby) !== JSON.stringify(e.orderby)) return `orderby ${JSON.stringify(orderby)}, expected ${JSON.stringify(e.orderby)}`;
    for (const o of orderby) if (!policyNames.has(o.f)) return `$orderby names ${o.f}`;
    const top = value("$top");
    if (top !== undefined && top !== String(outcome.top)) return "$top is not what was asked";
    if (req.position.skip > 0 && value("$skip") !== String(req.position.skip)) return "$skip is not the position";
    if (value("$format") !== "json") return "$format is not json";
    if (w.target.client && value("sap-client") !== w.target.client) return "sap-client is not the connection's";
  } catch (err) {
    if (err instanceof OracleError) return `oracle: ${err.message} in ${outcome.href}`;
    return `oracle threw: ${(err as Error).message}`;
  }

  // 6 — the audit shape carries no literal.
  const tokens = outcome.shape.split(/[|,:=[\]]/).filter((t) => t !== "");
  const allowedNames = new Set([...w.policy.readable]);
  for (const t of tokens) {
    const bare = t.startsWith("-") ? t.slice(1) : t;
    if (allowedNames.has(bare) || TYPE_CODES.has(t) || /^(L|K|s|f|o|c|k|n|eq|range|ge|gt|le|lt|\*|\+cut|in[0-9]+|[0-9]+)$/.test(t)) continue;
    return `queryShape carries ${JSON.stringify(t)}`;
  }
  return null;
}

/** Run `iterations` cases from `seed`; the first violation, with the case number, or null. */
function fuzz(seed: number, iterations: number): { violation: string; at: number } | null {
  const rand = new Rand(seed);
  let world: World | null = null;
  for (let i = 0; i < iterations; i++) {
    if (world === null || rand.chance(0.1)) {
      world = null;
      for (let tries = 0; world === null && tries < 20; tries++) world = makeWorld(rand);
      if (world === null) continue;
    }
    const violation = runCase(rand, world);
    if (violation !== null) return { violation, at: i };
  }
  return null;
}

describe("A2: the injection fuzz", () => {
  it(`${ITERATIONS} cases from seed ${SEED}: every property holds`, () => {
    const r = fuzz(SEED, ITERATIONS);
    expect(r, r ? `case ${r.at}: ${r.violation}` : "").toBeNull();
  }, 120_000);

  it("the oracle is not vacuous: valid requests are emitted, in both versions, in every kind", () => {
    const rand = new Rand(SEED);
    const seen = new Set<string>();
    let world: World | null = null;
    for (let i = 0; i < 600; i++) {
      if (world === null || rand.chance(0.1)) world = makeWorld(rand);
      if (world === null) continue;
      const fork = new Rand(rand.int(0, 2 ** 31));
      const req = makeRequest(fork, world);
      if (req.expect.mustRefuse) continue;
      const params = new URLSearchParams(req.params);
      const parsed = parseQueryParams(params, params.toString().length + 1);
      if (!parsed.surface || !parsed.ok) continue;
      const checked = checkQuery(parsed, world.policy);
      if (!checked.ok) continue;
      const q = compileQuery(checked.ast, world.policy, { skip: 0, top: (checked.ast.pageSize ?? 1) + 1, page0: true }, checked.project);
      seen.add(`${world.version}:${q.kind}`);
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining(["V2:KEY", "V2:LIST", "V4:KEY", "V4:LIST"]));
  });
});

describe("the canary: the oracle sees a broken encoder", () => {
  it.each(["no-doubling", "encodeURIComponent"] as const)("%s is caught within 200 cases", (mode) => {
    broken.mode = mode;
    try {
      const r = fuzz(SEED, 200);
      expect(r, "the oracle did not notice a broken encoder").not.toBeNull();
      // Caught by reading the URL, not by anything else going wrong.
      expect(r!.violation).toMatch(/^(oracle|filter round trip|key round trip)/);
    } finally {
      broken.mode = null;
    }
  });
});

describe("the parser fuzz", () => {
  it("random query strings never make parseQueryParams throw, and each parses in under 5 ms", () => {
    const rand = new Rand(SEED ^ 0x5a5a);
    const atoms = [
      "select", "filter.", "filter.A.eq", "filter.A.in", "filter.__proto__.eq", "key.", "key.A", "orderby", "count", "pageSize", "cursor", "expand", "limit", "$filter",
      "=", "&", "%", "%27", "%2527", "%ZZ", "%C3%A9", "%ED%A0%80", "%00", "+", ".", ",", "-", "'", "A", "B", "_", "1", "true", "é", "\u{1F600}", "constructor", "__proto__",
    ];
    for (let i = 0; i < Math.min(ITERATIONS, 5000); i++) {
      const raw = Array.from({ length: rand.int(0, 60) }, () => rand.pick(atoms)).join("");
      const timed = () => {
        const params = new URLSearchParams(raw);
        const t0 = performance.now();
        parseQueryParams(params, raw.length + 1);
        return performance.now() - t0;
      };
      let ms = timed();
      // A garbage collection or a JIT pause is not the parser's time: the
      // same input, again, at most twice.
      for (let retry = 0; ms >= 5 && retry < 2; retry++) ms = Math.min(ms, timed());
      expect(ms, raw).toBeLessThan(5);
    }
  });
});

describe("the oracle itself", () => {
  it("reads quote doubling, keywords and every literal form", () => {
    const typeOf = (f: string): OracleType | undefined => ({ S: "S", G: "G", L: "I64", D: "D", T: "DT", O: "DTO", A: "DA", B: "B" })[f] as OracleType | undefined;
    expect(parseFilter("S eq 'O''N and x' and (S2 eq 'a' or S2 eq 'b')", "V2", (f) => (f === "S2" ? "S" : typeOf(f)))).toEqual(
      new Map<string, NeutralPredicate>([
        ["S", { op: "eq", v: "O'N and x" }],
        ["S2", { op: "in", vs: ["a", "b"] }],
      ]),
    );
    expect([...parseFilter("G eq guid'0050568D-393C-1EE8-AB8E-8E8E2B4C5B6A' and L ge 5L and D lt 10.0M and T le datetime'2026-01-01T10:15'", "V2", typeOf)]).toEqual([
      ["G", { op: "eq", v: "0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a" }],
      ["L", { op: "range", lo: { incl: true, v: "5" } }],
      ["D", { op: "range", hi: { incl: false, v: "10" } }],
      ["T", { op: "range", hi: { incl: true, v: "2026-01-01T10:15:00" } }],
    ]);
    expect([...parseFilter("O gt 2026-01-01T00:00:00+02:00 and A eq 2026-01-01 and B eq true", "V4", typeOf)]).toEqual([
      ["O", { op: "range", lo: { incl: false, v: "2026-01-01T00:00:00+02:00" } }],
      ["A", { op: "eq", v: "2026-01-01" }],
      ["B", { op: "eq", v: "true" }],
    ]);
    for (const bad of ["S eq 'a' or S eq 'b'", "S eq 'a", "S eq 'a'b'", "S eq 'a' and", "X eq 'a'", "S ne 'a'", "S eq 'a' and S eq 'b'", "L ge 5"]) {
      expect(() => parseFilter(bad, "V2", typeOf), bad).toThrow(OracleError);
    }
    expect([...parseKeyPredicate("(SalesOrder='1',IsActiveEntity=true)", "V4", ["SalesOrder"], (f) => (f === "SalesOrder" ? "S" : "B"))]).toEqual([
      ["SalesOrder", "1"],
      ["IsActiveEntity", "true"],
    ]);
    expect(() => strictPercentDecode("%2")).toThrow(OracleError);
    expect(() => strictPercentDecode("%ED%A0%80")).toThrow(OracleError);
    expect(() => strictPercentDecode("a b")).toThrow(OracleError);
    expect(strictPercentDecode("O%27%27N")).toBe("O''N");
    expect(splitUri("https://h:1/p/q('a')?x=1#f")).toEqual({ scheme: "https", authority: "h:1", path: "/p/q('a')", query: "x=1", fragment: "f" });
  });
});
