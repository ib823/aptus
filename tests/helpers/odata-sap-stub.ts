/**
 * An in-memory SAP for the query surface's integration tests (P1.4): one
 * OData V2 or V4 entity set over a list of rows, evaluating the subset of a
 * query CoreEdge sends — `$filter` (comparisons with eq, gt, ge, lt and le,
 * joined by `and`, with parenthesised `or` chains), `$orderby`, `$top`,
 * `$skip`, `$select`, `$inlinecount` / `$count`, `$format` and key
 * predicates in the path.
 *
 * INDEPENDENT ON PURPOSE. It imports nothing from src/: it is written from
 * the OData URL conventions (V2 URI Conventions, V4 URL Conventions and ABNF)
 * and reads the URL as fetch sends it, so a mistake in CoreEdge's compiler
 * cannot be shared by the service that checks it. It answers as SAP's stacks
 * do in the cases the tests name: V2 `d.results` with `__metadata`, `__count`
 * as a string and `__next`, and, with no `$select`, a deferred navigation
 * (`to_Header: { __deferred: { uri } }`) on every row; V4 `value` with
 * `@odata.context`, `@odata.id`, `@odata.count` and `@odata.nextLink`, and
 * on every row 4.01's `@id` and a `to_Header@navigationLink`; every envelope
 * link absolute, on the service's own host, which is what the tests must
 * never see leave CoreEdge (spec 3.21 item 8).
 *
 * STRICT. An option it does not know, a `$filter` it cannot parse, a field
 * the entity does not have or a literal of the wrong form answers 400, as a
 * Gateway would; the tests read that as CoreEdge sending something it should
 * not.
 */

export type StubType = "S" | "I" | "D" | "DATE";

export interface StubRow {
  /** Values in canonical form: strings, integers, decimals as strings, dates as YYYY-MM-DD. */
  readonly [field: string]: string | number | null;
}

export interface OdataStubOptions {
  readonly odata: "V2" | "V4";
  /** scheme://host:port, the service's own address. */
  readonly origin: string;
  readonly servicePath: string;
  readonly entitySet: string;
  readonly keys: readonly string[];
  readonly types: Readonly<Record<string, StubType>>;
  readonly rows: () => readonly StubRow[];
  /** SAP's own page cap: at most this many rows, with a next link when more remain. */
  readonly serverPageCap?: number;
  /** Every SAP call takes this long; `advance` moves a virtual clock instead of waiting. */
  readonly latencyMs?: number;
  readonly advance?: (ms: number) => void;
  /** Answer this status, with an error body, when the URL matches. */
  readonly failWhen?: (url: URL) => number | null;
}

export interface StubCall {
  readonly href: string;
  readonly headers: Record<string, string>;
  readonly redirect: string | undefined;
}

class BadRequest extends Error {}

const V2_OPTIONS = new Set(["$select", "$filter", "$orderby", "$top", "$skip", "$inlinecount", "$format", "sap-client"]);
const V4_OPTIONS = new Set(["$select", "$filter", "$orderby", "$top", "$skip", "$count", "$format", "sap-client"]);

/* ── $filter ──────────────────────────────────────────────────────────── */

type Tok = { k: "id" | "op" | "kw" | "lp" | "rp" | "lit"; v: string; lit?: Literal };
type Literal = { t: "S" | "N" | "B" | "DATE" | "DT"; v: string };
type Expr = { and: Expr[] } | { or: Expr[] } | { f: string; op: string; v: Literal };

function tokenize(text: string, odata: "V2" | "V4"): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const quoted = (start: number): [string, number] => {
    let s = "";
    let j = start;
    for (;;) {
      if (j >= text.length) throw new BadRequest("unterminated string");
      if (text[j] === "'") {
        if (text[j + 1] === "'") {
          s += "'";
          j += 2;
          continue;
        }
        return [s, j + 1];
      }
      s += text[j];
      j++;
    }
  };
  while (i < text.length) {
    const c = text[i]!;
    if (c === " ") {
      i++;
    } else if (c === "(") {
      out.push({ k: "lp", v: c });
      i++;
    } else if (c === ")") {
      out.push({ k: "rp", v: c });
      i++;
    } else if (c === "'") {
      const [s, j] = quoted(i + 1);
      out.push({ k: "lit", v: s, lit: { t: "S", v: s } });
      i = j;
    } else {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
      if (m) {
        const word = m[0];
        if (odata === "V2" && word === "datetime" && text[i + word.length] === "'") {
          const [s, j] = quoted(i + word.length + 1);
          out.push({ k: "lit", v: s, lit: { t: "DT", v: s } });
          i = j;
          continue;
        }
        if (["eq", "ne", "gt", "ge", "lt", "le"].includes(word)) out.push({ k: "op", v: word });
        else if (word === "and" || word === "or") out.push({ k: "kw", v: word });
        else if (word === "true" || word === "false") out.push({ k: "lit", v: word, lit: { t: "B", v: word } });
        else out.push({ k: "id", v: word });
        i += word.length;
        continue;
      }
      const date = /^\d{4}-\d{2}-\d{2}(?![\d:T])/.exec(text.slice(i));
      if (odata === "V4" && date) {
        out.push({ k: "lit", v: date[0], lit: { t: "DATE", v: date[0] } });
        i += date[0].length;
        continue;
      }
      const num = /^-?\d+(\.\d+)?[MmLl]?/.exec(text.slice(i));
      if (num) {
        const raw = num[0];
        const suffix = /[MmLl]$/.test(raw);
        if (odata === "V4" && suffix) throw new BadRequest("a V2 suffix in a V4 literal");
        out.push({ k: "lit", v: raw, lit: { t: "N", v: suffix ? raw.slice(0, -1) : raw } });
        i += raw.length;
        continue;
      }
      throw new BadRequest(`unexpected ${JSON.stringify(c)} in $filter`);
    }
  }
  return out;
}

function parseFilter(text: string, odata: "V2" | "V4"): Expr {
  const toks = tokenize(text, odata);
  let p = 0;
  const peek = () => toks[p];
  const comparison = (): Expr => {
    const f = toks[p++];
    const op = toks[p++];
    const v = toks[p++];
    if (f?.k !== "id" || op?.k !== "op" || v?.k !== "lit") throw new BadRequest("a comparison is field op literal");
    return { f: f.v, op: op.v, v: v.lit! };
  };
  const unary = (): Expr => {
    if (peek()?.k === "lp") {
      p++;
      const e = orExpr();
      if (toks[p++]?.k !== "rp") throw new BadRequest("unbalanced parentheses");
      return e;
    }
    return comparison();
  };
  const andExpr = (): Expr => {
    const parts = [unary()];
    while (peek()?.k === "kw" && peek()!.v === "and") {
      p++;
      parts.push(unary());
    }
    return parts.length === 1 ? parts[0]! : { and: parts };
  };
  const orExpr = (): Expr => {
    const parts = [andExpr()];
    while (peek()?.k === "kw" && peek()!.v === "or") {
      p++;
      parts.push(andExpr());
    }
    return parts.length === 1 ? parts[0]! : { or: parts };
  };
  const e = orExpr();
  if (p !== toks.length) throw new BadRequest("trailing tokens in $filter");
  return e;
}

/** A row value and a literal, compared by the field's type. */
function compare(type: StubType, value: string | number | null, lit: Literal): number | null {
  if (value === null) return null;
  switch (type) {
    case "S":
      if (lit.t !== "S") throw new BadRequest("a string field compared with a non-string");
      return String(value) < lit.v ? -1 : String(value) > lit.v ? 1 : 0;
    case "I":
    case "D":
      if (lit.t !== "N") throw new BadRequest("a numeric field compared with a non-number");
      return Math.sign(Number(value) - Number(lit.v));
    case "DATE": {
      const day = lit.t === "DATE" ? lit.v : lit.t === "DT" ? lit.v.slice(0, 10) : null;
      if (day === null) throw new BadRequest("a date field compared with a non-date");
      if (lit.t === "DT" && !/T00:00(:00(\.0+)?)?$/.test(lit.v)) throw new BadRequest("a date-only field compared with a time");
      return String(value) < day ? -1 : String(value) > day ? 1 : 0;
    }
  }
}

function matches(e: Expr, row: StubRow, types: OdataStubOptions["types"]): boolean {
  if ("and" in e) return e.and.every((x) => matches(x, row, types));
  if ("or" in e) return e.or.some((x) => matches(x, row, types));
  const type = types[e.f];
  if (!type) throw new BadRequest(`no field ${e.f}`);
  const c = compare(type, row[e.f] ?? null, e.v);
  if (c === null) return false;
  switch (e.op) {
    case "eq":
      return c === 0;
    case "gt":
      return c > 0;
    case "ge":
      return c >= 0;
    case "lt":
      return c < 0;
    case "le":
      return c <= 0;
    default:
      throw new BadRequest(`operator ${e.op} is not served`);
  }
}

/* ── the key predicate ────────────────────────────────────────────────── */

function parseKey(text: string, keys: readonly string[], odata: "V2" | "V4"): Record<string, Literal> {
  const out: Record<string, Literal> = {};
  // Split on commas outside quotes.
  const parts: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'") {
      if (inQuote && text[i + 1] === "'") {
        cur += "''";
        i++;
        continue;
      }
      inQuote = !inQuote;
    }
    if (ch === "," && !inQuote) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  if (parts.length === 1 && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[0]!)) {
    if (keys.length !== 1) throw new BadRequest("an unnamed key on a composite key");
    const [t] = tokenize(parts[0]!, odata);
    if (!t?.lit) throw new BadRequest("a key value is a literal");
    out[keys[0]!] = t.lit;
    return out;
  }
  for (const part of parts) {
    const eq = part.indexOf("=");
    const name = part.slice(0, eq);
    const [t] = tokenize(part.slice(eq + 1), odata);
    if (!keys.includes(name) || !t?.lit || name in out) throw new BadRequest("a key names each key field once");
    out[name] = t.lit;
  }
  if (Object.keys(out).length !== keys.length) throw new BadRequest("a key names every key field");
  return out;
}

/* ── the wire ─────────────────────────────────────────────────────────── */

function keyText(row: StubRow, opts: OdataStubOptions): string {
  const lit = (f: string) => (opts.types[f] === "S" ? `'${String(row[f]).replace(/'/g, "''")}'` : String(row[f]));
  return opts.keys.length === 1 ? `(${lit(opts.keys[0]!)})` : `(${opts.keys.map((k) => `${k}=${lit(k)}`).join(",")})`;
}

/** A row as each version writes it: V2 decimals as strings and dates as /Date(ms)/, V4 numbers and dates as they are. */
function wireRow(row: StubRow, opts: OdataStubOptions, select: readonly string[] | null): Record<string, unknown> {
  const fields = select ?? Object.keys(opts.types);
  const self = `${opts.origin}${opts.servicePath}/${opts.entitySet}${keyText(row, opts)}`;
  const out: Record<string, unknown> =
    opts.odata === "V2"
      ? { __metadata: { id: self, uri: self, type: `ZSRV.${opts.entitySet}Type` } }
      : { "@odata.id": self, "@id": self, "@odata.etag": 'W/"1"', "to_Header@navigationLink": `${self}/to_Header` };
  // A V2 Gateway writes each navigation it did not expand as a deferred link, unless $select leaves it out.
  if (opts.odata === "V2" && select === null) out.to_Header = { __deferred: { uri: `${self}/to_Header` } };
  for (const f of fields) {
    const v = row[f] ?? null;
    const t = opts.types[f];
    if (opts.odata === "V2") out[f] = v === null ? null : t === "DATE" ? `/Date(${Date.parse(`${String(v)}T00:00:00Z`)})/` : t === "D" ? String(v) : v;
    else out[f] = v === null ? null : t === "D" ? Number(v) : v;
  }
  return out;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * The stub's fetch, for a test to stand in for the global one: requests to
 * `origin` are answered, anything else goes to `passThrough`.
 */
export function odataStub(opts: OdataStubOptions, passThrough: typeof fetch = fetch): { fetch: typeof fetch; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const sorted = (rows: readonly StubRow[], orderby: string | null): StubRow[] => {
    const terms = (orderby ?? "").split(",").filter(Boolean).map((t) => {
      const [f, dir] = t.split(" ");
      if (!f || !opts.types[f] || (dir !== undefined && dir !== "asc" && dir !== "desc")) throw new BadRequest(`$orderby term ${t}`);
      return { f, desc: dir === "desc" };
    });
    return [...rows].sort((a, b) => {
      for (const { f, desc } of terms) {
        const t = opts.types[f]!;
        const x = a[f] ?? null;
        const y = b[f] ?? null;
        const c = x === y ? 0 : x === null ? -1 : y === null ? 1 : t === "I" || t === "D" ? Math.sign(Number(x) - Number(y)) : String(x) < String(y) ? -1 : 1;
        if (c !== 0) return desc ? -c : c;
      }
      return 0;
    });
  };

  const answer = async (url: URL): Promise<Response> => {
    const allowed = opts.odata === "V2" ? V2_OPTIONS : V4_OPTIONS;
    for (const name of url.searchParams.keys()) if (!allowed.has(name)) throw new BadRequest(`unknown option ${name}`);
    for (const name of new Set(url.searchParams.keys())) if (url.searchParams.getAll(name).length > 1) throw new BadRequest(`${name} twice`);
    if (url.searchParams.get("$format") !== "json") throw new BadRequest("$format=json is expected");
    const failed = opts.failWhen?.(url) ?? null;
    if (failed !== null) return json({ error: { code: "/IWBEP/CM_MGW_RT/020", message: { lang: "en", value: `Failure at ${url.href}` } } }, failed);

    const prefix = `${opts.servicePath}/${opts.entitySet}`;
    const path = decodeURIComponent(url.pathname);
    if (!path.startsWith(prefix)) return new Response("Not found", { status: 404 });
    const rest = path.slice(prefix.length);
    const select = url.searchParams.get("$select")?.split(",") ?? null;
    if (select) for (const f of select) if (!opts.types[f]) throw new BadRequest(`$select names ${f}`);

    if (rest !== "") {
      const m = /^\((.*)\)$/.exec(rest);
      if (!m) return new Response("Not found", { status: 404 });
      for (const o of ["$filter", "$orderby", "$top", "$skip", "$inlinecount", "$count"]) if (url.searchParams.has(o)) throw new BadRequest(`${o} on an entity`);
      const key = parseKey(m[1]!, opts.keys, opts.odata);
      const row = opts.rows().find((r) => opts.keys.every((k) => compare(opts.types[k]!, r[k] ?? null, key[k]!) === 0));
      if (!row) return json({ error: { code: "NOT_FOUND", message: { value: "Resource not found" } } }, 404);
      const entity = wireRow(row, opts, select);
      return opts.odata === "V2" ? json({ d: entity }) : json({ "@odata.context": `${opts.origin}${opts.servicePath}/$metadata#${opts.entitySet}/$entity`, ...entity });
    }

    const filterText = url.searchParams.get("$filter");
    const filter = filterText === null ? null : parseFilter(filterText, opts.odata);
    const matching = sorted(
      opts.rows().filter((r) => filter === null || matches(filter, r, opts.types)),
      url.searchParams.get("$orderby"),
    );
    const skip = Number(url.searchParams.get("$skip") ?? "0");
    const top = url.searchParams.has("$top") ? Number(url.searchParams.get("$top")) : Infinity;
    if (!Number.isInteger(skip) || skip < 0 || !(top === Infinity || (Number.isInteger(top) && top >= 0))) throw new BadRequest("$skip and $top are whole numbers");
    const window = matching.slice(skip, skip + top);
    const cap = opts.serverPageCap ?? Infinity;
    const served = window.slice(0, cap);
    const more = window.length > served.length;
    const next = more ? `${opts.origin}${opts.servicePath}/${opts.entitySet}?$skiptoken=${skip + served.length}` : null;
    const rows = served.map((r) => wireRow(r, opts, select));
    if (opts.odata === "V2") {
      if (url.searchParams.has("$inlinecount") && url.searchParams.get("$inlinecount") !== "allpages") throw new BadRequest("$inlinecount");
      return json({
        d: {
          ...(url.searchParams.get("$inlinecount") === "allpages" ? { __count: String(matching.length) } : {}),
          results: rows,
          ...(next ? { __next: next } : {}),
        },
      });
    }
    if (url.searchParams.has("$count") && url.searchParams.get("$count") !== "true") throw new BadRequest("$count");
    return json({
      "@odata.context": `${opts.origin}${opts.servicePath}/$metadata#${opts.entitySet}`,
      ...(url.searchParams.get("$count") === "true" ? { "@odata.count": matching.length } : {}),
      value: rows,
      ...(next ? { "@odata.nextLink": next } : {}),
    });
  };

  const stubFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    if (url.origin !== new URL(opts.origin).origin) return passThrough(input, init);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    calls.push({ href: url.href, headers, redirect: init?.redirect });
    if (opts.latencyMs) {
      if (opts.advance) opts.advance(opts.latencyMs);
      else await new Promise((r) => setTimeout(r, opts.latencyMs));
    }
    try {
      return await answer(url);
    } catch (err) {
      if (err instanceof BadRequest) return json({ error: { code: "BAD_REQUEST", message: { value: `${err.message} at ${url.href}` } } }, 400);
      throw err;
    }
  }) as typeof fetch;
  return { fetch: stubFetch, calls };
}
