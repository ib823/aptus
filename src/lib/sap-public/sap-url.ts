/**
 * The one place a URL to an SAP system is assembled.
 *
 * WHY THIS EXISTS. Four modules built SAP URLs by concatenation — the catalogue
 * probe, the connection test, the runtime read and the runtime write. Four
 * places that construct a URL is four places to forget a parameter, and the
 * parameter about to arrive is the one that decides WHICH DATA CONTAINER a call
 * lands in. Forgetting `sap-client` on the write path while remembering it on
 * the read path would mean reading one client and writing to another, and the
 * request would succeed.
 *
 * WHY THE CLIENT CANNOT LIVE IN baseUrl. Every caller appends a path after the
 * base, so a base carrying a query string produces
 * `https://host?sap-client=100` + `/sap/opu/odata/...` — a query in the middle
 * of a path, which is not a URL. The client has to be applied AFTER the path is
 * joined, which is precisely what this does.
 *
 * WHY THE QUERY STRING IS BUILT BY HAND rather than with URLSearchParams.
 * OData's system query options are `$top`, `$format`, `$filter`. URLSearchParams
 * percent-encodes `$` in some runtimes and reorders nothing predictably, so
 * routing the existing working calls through it would change bytes that
 * currently reach SAP successfully. This appends and leaves what callers pass
 * untouched, so a connection that works today produces the identical URL until
 * a client is actually configured.
 */

/** SAP clients are three-digit, `000`–`999`. */
const CLIENT_PATTERN = /^\d{3}$/;

export function isValidSapClient(value: string): boolean {
  return CLIENT_PATTERN.test(value);
}

export interface SapUrlParts {
  /** e.g. `https://my403706-api.s4hana.cloud.sap` — no trailing slash expected. */
  baseUrl: string;
  /** Everything after the host, starting with `/`. Joined verbatim. */
  path: string;
  /**
   * The SAP client, or null/undefined where the product has none.
   *
   * NULL IS NOT A MISSING VALUE HERE. S/4HANA Cloud Public, SuccessFactors and
   * Ariba are single-tenant per host and have no client at all, so null is the
   * truth rather than a gap waiting to be filled — and it is what keeps this
   * change inert for every connection that works today.
   */
  client?: string | null | undefined;
  /**
   * Query parameters, appended in insertion order. Values are used verbatim, so
   * a caller that has already encoded something is not double-encoded.
   */
  query?: Record<string, string | number | undefined>;
}

export function buildSapUrl({ baseUrl, path, client, query }: SapUrlParts): string {
  let url = `${baseUrl}${path}`;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    parts.push(`${key}=${value}`);
  }

  /*
   * NEVER TWICE. A URL can already carry the client without this call knowing:
   * SAP echoes `sap-client` into the `Location` header of a create, and that
   * header is fed straight back in for the follow-up DELETE. Appending a second
   * copy produces `?sap-client=100&sap-client=100`, which SAP is under no
   * obligation to resolve the way the caller assumed.
   */
  const alreadyCarriesClient =
    /[?&]sap-client=/.test(url) || parts.some((p) => p.startsWith("sap-client="));

  if (client != null && client !== "" && !alreadyCarriesClient) {
    /*
     * Encoded even though a valid client is three digits. The value reaches
     * here from a database column, and a column that SHOULD hold digits is not
     * the same as one that does — the validation lives at the write boundary,
     * and this is a read.
     */
    parts.push(`sap-client=${encodeURIComponent(client)}`);
  }

  if (parts.length === 0) return url;

  // A path may already carry a query — `$expand` on a service path, say.
  url += (url.includes("?") ? "&" : "?") + parts.join("&");
  return url;
}
