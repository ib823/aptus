/**
 * The oracle's own URI handling (P1.4, A2). Imports nothing from src/: an
 * oracle that shared the compiler's code would share its mistakes.
 *
 * RFC 3986 Appendix B splits a URI reference into its five parts; a strict
 * single percent-decoder then turns each part into text, failing on anything
 * a single decode cannot read exactly: a `%` not followed by two hex digits,
 * bytes that are not UTF-8, or a raw character a serialised URL never holds.
 */

export class OracleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OracleError";
  }
}

export interface SplitUri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string | null;
  readonly fragment: string | null;
}

/** RFC 3986 Appendix B, verbatim. */
const APPENDIX_B = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;

export function splitUri(uri: string): SplitUri {
  const m = APPENDIX_B.exec(uri);
  if (!m) throw new OracleError("not a URI reference");
  return {
    scheme: m[2] ?? "",
    authority: m[4] ?? "",
    path: m[5] ?? "",
    query: m[6] === undefined ? null : (m[7] ?? ""),
    fragment: m[8] === undefined ? null : (m[9] ?? ""),
  };
}

/** What may appear raw in a serialised URL: RFC 3986 unreserved, sub-delims, `:`, `@`, `/`, `?` and `%`. */
const URI_CHARS = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/?%]*$/;

const fatal = new TextDecoder("utf-8", { fatal: true });

/**
 * Decode once, strictly. `rawPlus`: a raw `+` is refused (the compiler never
 * writes one into a query, and a server may read it as a space).
 */
export function strictPercentDecode(s: string, opts: { readonly rawPlus?: boolean } = {}): string {
  if (!URI_CHARS.test(s)) throw new OracleError("a raw character a serialised URL never carries");
  if (opts.rawPlus === false && s.includes("+")) throw new OracleError("a raw + in a query");
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "%") {
      const hex = s.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw new OracleError("a bad percent sequence");
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  try {
    return fatal.decode(new Uint8Array(bytes));
  } catch {
    throw new OracleError("bytes that are not UTF-8");
  }
}

/** A query string's parameters, split on the raw `&` and the first raw `=`, names and values decoded. */
export function splitQuery(query: string): [string, string][] {
  if (query === "") return [];
  return query.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq <= 0) throw new OracleError("a query parameter without a name or a value");
    return [strictPercentDecode(pair.slice(0, eq), { rawPlus: false }), strictPercentDecode(pair.slice(eq + 1), { rawPlus: false })];
  });
}
