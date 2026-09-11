/**
 * Which header an api-key connection may send its key in.
 *
 * SEPARATE MODULE ON PURPOSE. The rule is enforced in three places — the form
 * that offers the field, the route that stores it, and the header builder that
 * uses it on every call — and the form is a client component, so the predicate
 * cannot live beside prisma. One list, no duplicate of a security rule.
 */

/** The default header name for `api-key` — what SAP's sandbox reads. */
export const DEFAULT_API_KEY_HEADER = "apikey";

/**
 * Header names an api-key connection may NOT claim.
 *
 * AD-12 validated `apiKeyHeader` only as "letters, digits and hyphens", which
 * `Authorization`, `Cookie` and `Host` all satisfy. A connection naming one of
 * those would have its stored key written into a header the transport itself
 * sets: `Authorization` silently replaces whatever authentication the request
 * was making, `Host` redirects virtual-host routing, and `Cookie` attaches a
 * bearer to the wrong origin. None of that is API-key authentication; each is a
 * way to make the request something other than what it says it is.
 */
export const RESERVED_API_KEY_HEADERS: readonly string[] = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "content-type",
  "transfer-encoding",
  "connection",
  "upgrade",
  "te",
  "trailer",
];

/** Is this a header name an api-key connection is allowed to send its key in? */
export function isAllowedApiKeyHeader(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) return false;
  return !RESERVED_API_KEY_HEADERS.includes(trimmed.toLowerCase());
}
