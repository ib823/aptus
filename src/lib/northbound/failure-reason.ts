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
 * that might contain a host. A failure of the CREDENTIAL step is TOKEN_* when a
 * retry may help (see credentialStepOutcome).
 *
 * The client-facing `detail` stays generic. This is additive, alongside it.
 */

import { TOKEN_REQUEST_TIMEOUT_MS } from "@/lib/sap-public/connection-resolver";
import { credentialFailure, failureReasonFromError } from "@/lib/sap-public/upstream-failure";

// Lives beside the classifier that needs it; re-exported so callers keep this path.
export { failureReasonFromError };

/** The upstream answered with a non-success status, or null when it succeeded. */
export function failureReasonFromHttp(status: number): string | null {
  return status >= 200 && status < 300 ? null : `HTTP_${status}`;
}

/** A 2xx whose body could not be read as the shape the contract requires. */
export const FAILURE_REASON_INVALID_BODY = "INVALID_UPSTREAM_BODY";

/**
 * The broker's outcome when the CREDENTIAL STEP failed — before any request
 * reached the tenant (audit A08, A55). Shared by the read and the write so the
 * two cannot draw the line differently, and drawn by credentialFailure
 * (upstream-failure.ts), the one classifier every surface asks (P0.5):
 *
 *   NEEDS_SETUP (403) — the connection cannot produce a credential, or the
 *                       token endpoint refused it or is the wrong URL: fixed in
 *                       Studio, so not worth a retry.
 *   TIMEOUT     (504) — the token endpoint did not answer within ITS limit,
 *                       which is the one named; the tenant's never started.
 *                       Retryable; TOKEN_TIMEOUT.
 *   ERROR       (502) — the token endpoint answered 408, 429, a 5xx or a 2xx
 *                       without a token, or could not be reached. Retryable;
 *                       TOKEN_HTTP_<n>, TOKEN_NO_TOKEN or TOKEN_<code>.
 *
 * `detail` is generic on purpose, like every broker detail: SuccessFactors'
 * own words are for the connection's administrators on the Test result, not
 * for the app calling the broker. A wrong token URL says so, because no retry
 * cures it and "fix the connection" alone would not say which field.
 */
export function credentialStepOutcome(err: unknown): {
  status: "NEEDS_SETUP" | "TIMEOUT" | "ERROR";
  detail: string;
  failureReason: string;
} {
  const failure = credentialFailure(err);
  const { failureReason } = failure;
  switch (failure.kind) {
    case "refused":
      return {
        status: "NEEDS_SETUP",
        detail: failure.wrongTokenUrl
          ? `The connection's token endpoint answered HTTP ${failure.tokenHttpStatus} without issuing a token, so the tenant was not called. Check the connection's token URL in Studio.`
          : "The connection's credentials could not be used (a credential is missing, or the token endpoint refused it), so the tenant was not called. Fix the connection in Studio.",
        failureReason,
      };
    case "timeout":
      return {
        status: "TIMEOUT",
        detail: `The connection's token endpoint did not respond within ${TOKEN_REQUEST_TIMEOUT_MS}ms, so the tenant was not called.`,
        failureReason,
      };
    case "unavailable":
      return {
        status: "ERROR",
        detail:
          "The connection's token endpoint could not issue a token (it failed or could not be reached), so the tenant was not called.",
        failureReason,
      };
  }
}

/** What the connection's token endpoint answered, when it answered and issued no token. */
export function tokenEndpointAnswer(err: unknown): number | null {
  return credentialFailure(err).tokenHttpStatus;
}

/**
 * The status, when the token endpoint answered without a token in a way that
 * says its URL is wrong rather than that the credential was refused or that it
 * is briefly unwell: a 404 or 405, a 3xx to a login page. Null otherwise.
 */
export function wrongTokenUrlAnswer(err: unknown): number | null {
  const failure = credentialFailure(err);
  return failure.wrongTokenUrl ? failure.tokenHttpStatus : null;
}
