/**
 * The checked query, as CoreEdge holds it between the caller and SAP (P1.4).
 *
 * VERSION-NEUTRAL AND JSON. Nothing here is OData text: a literal is a type
 * code and a canonical value (literals.ts parses caller text into it), and
 * the compiler (operation-compiler.ts) is the only place either version's
 * syntax is written. That keeps one tree for V2 and V4, and it is the input
 * the in-memory twin (P1.6a) will evaluate, so the shape is fixed now.
 *
 * CANONICAL BY CONSTRUCTION. The checker builds the tree in one order: select
 * sorted and unique, one predicate per field sorted by field, `in` values
 * unique and sorted, key parts in key order. Two requests that mean the same
 * query give the same tree, and so the same text (canonicalAst), the same
 * cursor binding (queryBind) and the same audit hash (queryHash). Orderby is
 * the one list kept in the caller's order: its order is its meaning.
 *
 * THE TWO HASHES ARE DIFFERENT THINGS. queryBind is sealed inside the cursor
 * and checks that the next page was asked with the same parameters; it never
 * leaves CoreEdge in the clear. queryHash goes into the audit row, which a
 * database reader can see (threat A5), and it covers literals: unkeyed, a
 * hash of `Customer eq '17100001'` is brute-forced in seconds. So it is an
 * HMAC under a per-organisation key from the token ring (roadmap §9.1 #11).
 * queryShape is the literal-free description beside it.
 */

import { createHash, createHmac } from "node:crypto";

import { deriveTokenKey, readTokenRing, TOKEN_PURPOSES, type TokenRing } from "@/lib/security/token-ring";

export type LitType = "S" | "G" | "B" | "U8" | "I8" | "I16" | "I32" | "I64" | "D" | "DT" | "DTO" | "DA";

/** Every literal type, in a fixed order. */
export const LIT_TYPES: readonly LitType[] = ["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA"];

/** A typed value in canonical text (literals.ts). Never OData text. */
export interface Lit {
  readonly t: LitType;
  readonly v: string;
}

export interface Bound {
  readonly incl: boolean;
  readonly v: Lit;
}

export type Predicate =
  | { readonly f: string; readonly op: "eq"; readonly v: Lit }
  /** 2..50 values, unique, sorted by v in code-unit order. */
  | { readonly f: string; readonly op: "in"; readonly vs: readonly Lit[] }
  /** At least one bound. */
  | { readonly f: string; readonly op: "range"; readonly lo?: Bound; readonly hi?: Bound };

export interface OrderTerm {
  readonly f: string;
  readonly desc: boolean;
}

export interface KeyPart {
  readonly f: string;
  readonly v: Lit;
}

export interface QueryAstV1 {
  readonly v: 1;
  readonly kind: "LIST" | "KEY";
  /** Sorted, unique; null = every readable field. */
  readonly select: readonly string[] | null;
  /** Implicit AND; one predicate per field; sorted by field. */
  readonly filter: readonly Predicate[];
  /** The caller's order, which is significant. */
  readonly orderby: readonly OrderTerm[];
  /** Key order, without pinned parts; null on a LIST. */
  readonly key: readonly KeyPart[] | null;
  readonly count: boolean;
  /** Effective (the policy's default applied); null for KEY. */
  readonly pageSize: number | null;
}

/** Code-unit order, the one order every list here is sorted in. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const str = (s: string) => JSON.stringify(s);
const lit = (l: Lit) => `{"t":${str(l.t)},"v":${str(l.v)}}`;
const bound = (b: Bound) => `{"incl":${b.incl ? "true" : "false"},"v":${lit(b.v)}}`;

function predicate(p: Predicate): string {
  switch (p.op) {
    case "eq":
      return `{"f":${str(p.f)},"op":"eq","v":${lit(p.v)}}`;
    case "in":
      return `{"f":${str(p.f)},"op":"in","vs":[${p.vs.map(lit).join(",")}]}`;
    case "range": {
      let out = `{"f":${str(p.f)},"op":"range"`;
      if (p.lo) out += `,"lo":${bound(p.lo)}`;
      if (p.hi) out += `,"hi":${bound(p.hi)}`;
      return `${out}}`;
    }
  }
}

const selectText = (ast: QueryAstV1) => (ast.select === null ? "null" : `[${ast.select.map(str).join(",")}]`);
const filterText = (ast: QueryAstV1) => `[${ast.filter.map(predicate).join(",")}]`;
const orderbyText = (ast: QueryAstV1) =>
  `[${ast.orderby.map((o) => `{"f":${str(o.f)},"desc":${o.desc ? "true" : "false"}}`).join(",")}]`;
const keyText = (ast: QueryAstV1) =>
  ast.key === null ? "null" : `[${ast.key.map((k) => `{"f":${str(k.f)},"v":${lit(k.v)}}`).join(",")}]`;

/**
 * The tree as JSON, written by hand with its keys in the declared order and
 * no whitespace, so the text does not depend on how an object happened to be
 * built.
 */
export function canonicalAst(ast: QueryAstV1): string {
  return (
    `{"v":1,"kind":${str(ast.kind)},"select":${selectText(ast)},"filter":${filterText(ast)},` +
    `"orderby":${orderbyText(ast)},"key":${keyText(ast)},"count":${ast.count ? "true" : "false"},` +
    `"pageSize":${ast.pageSize === null ? "null" : String(ast.pageSize)}}`
  );
}

/** The cursor's binding to its query: the first 16 bytes of SHA-256(canonicalAst). Sealed in the cursor only. */
export function queryBind(ast: QueryAstV1): Buffer {
  return createHash("sha256").update(canonicalAst(ast), "utf8").digest().subarray(0, 16);
}

/** The most characters queryShape returns. */
export const QUERY_SHAPE_MAX = 1024;
const QUERY_SHAPE_CUT_AT = 1000;

function predicateShape(p: Predicate): string {
  switch (p.op) {
    case "eq":
      return `${p.f}:eq:${p.v.t}`;
    case "in":
      return `${p.f}:in${p.vs.length}:${p.vs[0]?.t ?? "?"}`;
    case "range": {
      const ops: string[] = [];
      if (p.lo) ops.push(p.lo.incl ? "ge" : "gt");
      if (p.hi) ops.push(p.hi.incl ? "le" : "lt");
      return `${p.f}:range[${ops.join(",")}]:${(p.lo ?? p.hi)?.v.t ?? "?"}`;
    }
  }
}

/**
 * The query without its literals, for the audit row:
 * `L|s=*|f=CompanyCode:eq:S,CreationDate:range[ge,lt]:DT,OverallStatus:in2:S|o=-CreationDate|c=1|n=200`.
 * Every part is a field name (an identifier), an operator, a count or a type
 * code, so nothing the caller typed as a value can appear in it. Past
 * QUERY_SHAPE_MAX it is cut to 1,000 characters and marked `|+cut`.
 */
export function queryShape(ast: QueryAstV1): string {
  const parts: string[] = [ast.kind === "LIST" ? "L" : "K"];
  parts.push(`s=${ast.select === null ? "*" : ast.select.join(",")}`);
  if (ast.kind === "KEY") {
    parts.push(`k=${(ast.key ?? []).map((k) => `${k.f}:${k.v.t}`).join(",")}`);
  } else {
    parts.push(`f=${ast.filter.map(predicateShape).join(",")}`);
    parts.push(`o=${ast.orderby.map((o) => `${o.desc ? "-" : ""}${o.f}`).join(",")}`);
    parts.push(`c=${ast.count ? "1" : "0"}`);
    parts.push(`n=${ast.pageSize === null ? "-" : String(ast.pageSize)}`);
  }
  const shape = parts.join("|");
  return shape.length <= QUERY_SHAPE_MAX ? shape : `${shape.slice(0, QUERY_SHAPE_CUT_AT)}|+cut`;
}

/**
 * The query, literals included, without what changes along a paging run:
 * pageSize, count and the position are left out, so a chain restarted with
 * the same filter hashes the same, and P3.5 can see a restarted bulk read.
 */
function hashInput(ast: QueryAstV1): string {
  return `{"select":${selectText(ast)},"filter":${filterText(ast)},"orderby":${orderbyText(ast)},"key":${keyText(ast)}}`;
}

/**
 * `qh1.<kid>.` + base64url(first 16 bytes of HMAC-SHA256(K_org, "ceq1|" +
 * interfaceId + "|" + the query)), where K_org is HKDF over the active ring
 * key with the organisation id as salt. Two organisations' identical queries
 * hash differently, and the key never sits beside the rows it protects.
 */
export function queryHash(
  ast: QueryAstV1,
  ctx: { readonly organizationId: string; readonly interfaceId: string },
  ring: TokenRing = readTokenRing(),
): string {
  const key = deriveTokenKey(ring, ring.active, TOKEN_PURPOSES.auditQueryHash, ctx.organizationId);
  const mac = createHmac("sha256", key).update(`ceq1|${ctx.interfaceId}|${hashInput(ast)}`, "utf8").digest();
  return `qh1.${ring.active}.${mac.subarray(0, 16).toString("base64url")}`;
}
