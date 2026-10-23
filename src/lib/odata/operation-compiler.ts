/**
 * The operation compiler: a checked query, as one OData version writes it
 * (P1.4, 3.7). The roadmap's named file.
 *
 * COREEDGE BUILDS EVERY QUERY FROM THE CHECKED AST. Nothing the caller sent
 * reaches this module as text: names come from the compiled policy's field
 * table (asserted once more as they are written, emitName), values arrive as
 * typed canonical literals and leave through serialiseLiteral's one encoding
 * rule, and every structural token — operators, `and`, `or`, parentheses, the
 * `%20` between tokens, option names — is a constant here. So the SAP query's
 * structure is CoreEdge's whatever the caller typed (threat N1).
 *
 * THE ONE URL BUILDER. The URL itself is assembled by buildSapUrl, unchanged:
 * its origin guard holds, and it adds `sap-client` once. This module only
 * decides the path suffix and the options, already encoded.
 *
 *   $select      the effective select plus the key parts the overlap check
 *                needs, in policy order; left out when SAP does not support
 *                it, when it would name every column anyway, or when it would
 *                push the URL past the cap. It is an optimisation: the
 *                projection (response.ts) is the enforcement.
 *   $filter      the predicates in canonical order, then the draft pin; `in`
 *                is an `or` chain on both versions (SAP's V4 stacks are 4.0,
 *                and `in` is 4.01).
 *   $orderby     the caller's terms, then every key part not already listed,
 *                so the order is total and offset paging is stable.
 *   $top/$skip   rows asked (the page plus one look-ahead row) and the offset.
 *   count        page 0 only: V2 $inlinecount=allpages, V4 $count=true.
 *   $format=json always, as the legacy read sends it.
 *
 * A KEY IS ALWAYS IN PARENTHESES, never key-as-segment. A key value with a
 * `/` or `\` is never put in a path segment at all, because a layer in front
 * of SAP that decodes `%2F` would split it (threat N4): it is read as a LIST
 * filtered on the key instead, with $top=2 so a second row is noticed.
 */

import type { KeyPart, Lit, Predicate, QueryAstV1 } from "@/lib/odata/ast";
import { emitName, QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import { serialiseLiteral } from "@/lib/odata/literals";
import type { PreparedPolicy } from "@/lib/odata/policy";
import { queryRefusal, type QueryFlag, type QueryRefusal } from "@/lib/odata/rules";
import { buildSapUrl } from "@/lib/sap-public/sap-url";

export { emitName, QueryCompilerInvariantError };

export type SapOption = "$select" | "$filter" | "$orderby" | "$top" | "$skip" | "$inlinecount" | "$count" | "$format";
export type SapQueryKind = "LIST" | "KEY" | "KEY_VIA_FILTER";

export interface SapQuery {
  readonly kind: SapQueryKind;
  readonly odata: "V2" | "V4";
  /** "" or "(<encoded key predicate>)". */
  readonly pathSuffix: string;
  /** In emission order; values already encoded. */
  readonly options: readonly (readonly [SapOption, string])[];
  /** Rows asked of SAP ($top), or null when none is sent. */
  readonly top: number | null;
  /** What every row is projected to, in policy order. */
  readonly project: readonly string[];
  /** The names $select carries, or null when it is not sent: SAP may then return any column. */
  readonly selectSent: readonly string[] | null;
  /** The key parts in key order (pinned excluded): the overlap check's canonical key. */
  readonly keyParts: readonly string[];
  /** PINNED_ACTIVE, KEY_VIA_FILTER and SELECT_DROPPED, for the audit row. */
  readonly flags: readonly QueryFlag[];
  /** Request headers the version needs: V4 pins the `odata.` prefix on control information (JSON 4.01 §3.1). */
  readonly headers: Readonly<Record<string, string>>;
}

export interface CompilePosition {
  /** $skip; 0 sends none. */
  readonly skip: number;
  /** $top: the rows asked of SAP, look-ahead included; null sends none. */
  readonly top: number | null;
  /** Page 0 of a chain: the only page that asks for a count. */
  readonly page0: boolean;
}

const SP = "%20";

function lit(l: Lit, odata: "V2" | "V4"): string {
  return serialiseLiteral(l, odata);
}

function predicateText(p: Predicate, odata: "V2" | "V4"): string {
  const f = emitName(p.f);
  switch (p.op) {
    case "eq":
      return `${f}${SP}eq${SP}${lit(p.v, odata)}`;
    case "in":
      if (p.vs.length < 2) throw new QueryCompilerInvariantError("An in predicate has fewer than two values.");
      return `(${p.vs.map((v) => `${f}${SP}eq${SP}${lit(v, odata)}`).join(`${SP}or${SP}`)})`;
    case "range": {
      const parts: string[] = [];
      if (p.lo) parts.push(`${f}${SP}${p.lo.incl ? "ge" : "gt"}${SP}${lit(p.lo.v, odata)}`);
      if (p.hi) parts.push(`${f}${SP}${p.hi.incl ? "le" : "lt"}${SP}${lit(p.hi.v, odata)}`);
      if (parts.length === 0) throw new QueryCompilerInvariantError("A range predicate has no bound.");
      return parts.join(`${SP}and${SP}`);
    }
  }
}

const andJoin = (terms: readonly string[]) => terms.join(`${SP}and${SP}`);

/** A key part a path segment must never carry. */
const unsafeInPath = (k: KeyPart) => k.v.t === "S" && (k.v.v.includes("/") || k.v.v.includes("\\"));

/** The key parts in key order, from the fields the policy flags as keys. */
function keyPartsOf(policy: PreparedPolicy): string[] {
  const c = policy.compiled;
  if (c.tieBreak.length > 0) return [...c.tieBreak];
  if (c.key !== null) return [...c.key];
  return [];
}

/**
 * The query for one page (or one key lookup). `project` is the checker's
 * effective select (check.ts); the default is the policy's readable fields,
 * narrowed by the AST's select.
 */
export function compileQuery(
  ast: QueryAstV1,
  policy: PreparedPolicy,
  position: CompilePosition,
  project: readonly string[] = policy.readable.filter((n) => ast.select === null || ast.select.includes(n)),
): SapQuery {
  const c = policy.compiled;
  const odata = c.odata;
  const flags: QueryFlag[] = [];
  const pinned = c.pinned.map((p) => `${emitName(p.f)}${SP}eq${SP}${lit(p.v, odata)}`);
  if (pinned.length > 0) flags.push("PINNED_ACTIVE");
  const headers: Record<string, string> = odata === "V4" ? { "OData-MaxVersion": "4.0" } : {};
  for (const n of project) {
    if (!policy.fields.has(n)) throw new QueryCompilerInvariantError("A projected field is not in the policy.");
  }

  // $select: names the policy vouched for, in policy order.
  const allColumns = ast.select === null && c.allReadable && project.length === policy.readable.length;
  const selectFor = (withKeys: readonly string[]): string[] | null => {
    if (!c.selectSupported || allColumns) return null;
    const wanted = new Set([...project, ...withKeys]);
    return policy.readable.filter((n) => wanted.has(n));
  };
  const options: [SapOption, string][] = [];
  const pushSelect = (names: string[] | null) => {
    if (names !== null && names.length > 0) options.push(["$select", names.map(emitName).join(",")]);
  };

  if (ast.kind === "KEY") {
    const key = ast.key;
    if (key === null || c.key === null || key.length !== c.key.length) throw new QueryCompilerInvariantError("A key lookup does not match the policy's key.");
    key.forEach((k, i) => {
      if (k.f !== c.key![i]) throw new QueryCompilerInvariantError("A key lookup's parts are out of key order.");
    });
    const select = selectFor([]);
    if (key.some(unsafeInPath)) {
      if (!c.keyViaFilter) throw new QueryCompilerInvariantError("A key value with a slash reached the compiler without the fallback.");
      flags.push("KEY_VIA_FILTER");
      pushSelect(select);
      const terms = key.map((k) => `${emitName(k.f)}${SP}eq${SP}${lit(k.v, odata)}`);
      options.push(["$filter", andJoin([...terms, ...pinned])]);
      options.push(["$top", "2"]);
      options.push(["$format", "json"]);
      return { kind: "KEY_VIA_FILTER", odata, pathSuffix: "", options, top: 2, project, selectSent: select, keyParts: c.key, flags, headers };
    }
    pushSelect(select);
    options.push(["$format", "json"]);
    const named = [...key.map((k) => `${emitName(k.f)}=${lit(k.v, odata)}`), ...c.pinned.map((p) => `${emitName(p.f)}=${lit(p.v, odata)}`)];
    const pathSuffix = key.length === 1 && c.pinned.length === 0 ? `(${lit(key[0]!.v, odata)})` : `(${named.join(",")})`;
    return { kind: "KEY", odata, pathSuffix, options, top: null, project, selectSent: select, keyParts: c.key, flags, headers };
  }

  // A LIST page.
  const keyParts = keyPartsOf(policy);
  const select = selectFor(keyParts.filter((k) => policy.fields.has(k)));
  pushSelect(select);
  const filter = [...ast.filter.map((p) => predicateText(p, odata)), ...pinned];
  if (filter.length > 0) options.push(["$filter", andJoin(filter)]);
  const terms = ast.orderby.map((o) => `${emitName(o.f)}${SP}${o.desc ? "desc" : "asc"}`);
  if (c.paging === "OFFSET") {
    const listed = new Set(ast.orderby.map((o) => o.f));
    for (const k of c.tieBreak) if (!listed.has(k)) terms.push(`${emitName(k)}${SP}asc`);
  }
  if (terms.length > 0) options.push(["$orderby", terms.join(",")]);
  const top = c.topSupported ? position.top : null;
  if (top !== null) {
    if (!Number.isInteger(top) || top < 1) throw new QueryCompilerInvariantError("$top must be a positive integer.");
    options.push(["$top", String(top)]);
  }
  if (position.skip > 0) {
    if (!Number.isInteger(position.skip) || c.paging !== "OFFSET") throw new QueryCompilerInvariantError("$skip on a dataset that does not page.");
    options.push(["$skip", String(position.skip)]);
  }
  if (position.page0 && ast.count) {
    if (!c.count) throw new QueryCompilerInvariantError("A count the policy does not allow.");
    options.push(odata === "V2" ? ["$inlinecount", "allpages"] : ["$count", "true"]);
  }
  options.push(["$format", "json"]);
  return { kind: "LIST", odata, pathSuffix: "", options, top, project, selectSent: select, keyParts, flags, headers };
}

/** The most characters of URL a query may be, measured as fetch sends it. */
export const SAP_URL_MAX_LENGTH = 4000;

export interface QueryTarget {
  readonly baseUrl: string;
  readonly servicePath: string;
  readonly entitySet: string;
  readonly client?: string | null | undefined;
}

function urlFor(query: SapQuery, target: QueryTarget): string {
  return buildSapUrl({
    baseUrl: target.baseUrl,
    path: `${target.servicePath}/${encodeURIComponent(target.entitySet)}${query.pathSuffix}`,
    client: target.client,
    query: Object.fromEntries(query.options),
  });
}

/**
 * The URL a query is sent to, through buildSapUrl, measured as fetch
 * serialises it (`new URL(url).href`, which is what SAP receives: a query's
 * `'` becomes `%27`). Over SAP_URL_MAX_LENGTH, $select is dropped first (the
 * projection still holds); still over, the query is refused.
 */
export function buildQueryUrl(
  query: SapQuery,
  target: QueryTarget,
): { readonly ok: true; readonly url: string; readonly query: SapQuery } | QueryRefusal {
  const first = urlFor(query, target);
  if (new URL(first).href.length <= SAP_URL_MAX_LENGTH) return { ok: true, url: first, query };
  if (query.selectSent !== null) {
    const dropped: SapQuery = {
      ...query,
      options: query.options.filter(([name]) => name !== "$select"),
      selectSent: null,
      flags: [...query.flags, "SELECT_DROPPED"],
    };
    const second = urlFor(dropped, target);
    if (new URL(second).href.length <= SAP_URL_MAX_LENGTH) return { ok: true, url: second, query: dropped };
  }
  return queryRefusal("QUERY_INVALID", "SAP_URL_TOO_LONG", "The OData query this request needs is longer than SAP accepts; ask for fewer values.");
}

/**
 * What the Test Console shows as sent: the service path, the entity set, the
 * key and the options — never the host, the port or the client.
 */
export function sentLine(query: SapQuery, target: Pick<QueryTarget, "servicePath" | "entitySet">): string {
  const options = query.options.map(([name, value]) => `${name}=${value}`).join("&");
  return `${target.servicePath}/${encodeURIComponent(target.entitySet)}${query.pathSuffix}${options ? `?${options}` : ""}`;
}
