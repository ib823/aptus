/**
 * A bounded reason for an upstream failure — for the audit row and the server
 * log, never for the client.
 *
 * THE GAP THIS CLOSES. The broker's catch blocks discarded the error object
 * entirely: the client got "The read could not be completed", the audit row got
 * a bare 502, and the server log got nothing. That was the right call for the
 * client — a fetch error commonly carries the host, and on the OAuth path the
 * request — but it was implemented by throwing the cause away for everyone.
 * DNS failure, an expired certificate, a refused connection and a genuine SAP
 * 500 were indistinguishable to the whole organisation, permanently, and the
 * correlation id a caller was told to quote led to a row that could not say why.
 *
 * WHAT A REASON IS. A short upper-case token, never free text: the error's own
 * `code` (Node and undici set one — ENOTFOUND, ECONNREFUSED, ECONNRESET,
 * CERT_HAS_EXPIRED, UND_ERR_CONNECT_TIMEOUT), the same on `cause`, TIMEOUT for
 * our own abort, or HTTP_<status> for an answered request. Anything that fails
 * the shape collapses to FETCH_FAILED rather than being passed through — a
 * message that does not match /^[A-Z][A-Z0-9_]+$/ is exactly the kind of string
 * that might contain a host.
 *
 * The client-facing `detail` stays generic. This is additive, alongside it.
 */

const CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

/** The upstream never answered: why, as a bounded code. */
export function failureReasonFromError(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "TIMEOUT";
  return codeOf(err) ?? codeOf(causeOf(err)) ?? "FETCH_FAILED";
}

/** The upstream answered with a non-success status, or null when it succeeded. */
export function failureReasonFromHttp(status: number): string | null {
  return status >= 200 && status < 300 ? null : `HTTP_${status}`;
}

/** A 2xx whose body could not be read as the shape the contract requires. */
export const FAILURE_REASON_INVALID_BODY = "INVALID_UPSTREAM_BODY";

function causeOf(err: unknown): unknown {
  return err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
}

function codeOf(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const code = (v as { code?: unknown }).code;
  return typeof code === "string" && CODE.test(code) ? code : null;
}
