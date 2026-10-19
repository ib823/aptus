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

import { TOKEN_REQUEST_TIMEOUT_MS } from "@/lib/sap-public/connection-resolver";
import { SamlBearerExchangeError } from "@/lib/sap-public/oauth-saml-bearer";
import { credentialFailureKind, OAuthTokenRequestError } from "@/lib/sap-public/upstream-failure";

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

/**
 * The broker's outcome when the CREDENTIAL STEP failed — before any request
 * reached the tenant (audit A08, A55). Shared by the read and the write so the
 * two cannot draw the line differently.
 *
 *   NEEDS_SETUP — the connection cannot produce a credential, or the token
 *                 endpoint refused it: fixed in Studio, so not worth a retry.
 *   TIMEOUT     — the token endpoint did not answer within ITS limit, which is
 *                 the one named; the tenant's read timeout never started.
 *   ERROR       — the token endpoint failed or could not be reached.
 *
 * `detail` is generic on purpose, like every broker detail: SuccessFactors'
 * own words are for the connection's administrators on the Test result, not
 * for the app calling the broker. `failureReason` keeps the typed error's code;
 * FETCH_FAILED — "the upstream never answered" — becomes its own code, so the
 * audit row says it was the token step that did not answer, not the tenant.
 * So does any other code a token endpoint that could not be reached leaves
 * (ECONNRESET, ENOTFOUND, UND_ERR_SOCKET): prefixed TOKEN_, because on its own
 * it is word for word the row an unreachable TENANT leaves, and correlation
 * lookup, broker traffic and the server log all sent triage there.
 *
 * ONLY AN OUTAGE IS WORTH A RETRY. A token endpoint that answered 408, 429 or
 * a 5xx is briefly unwell; any other answer without a token — a 404 or 405
 * from a wrong path, a 2xx or 3xx login page — is the token URL pointing at the
 * wrong thing, and no retry cures it. A 2xx or 3xx was ERROR "retry later", so
 * a client following the message retried forever against a misconfiguration
 * and the upstream-errors incident counted it as an outage; a 404 was blamed on
 * the credentials. Each is NEEDS_SETUP, and says to check the token URL.
 */
export function credentialStepOutcome(err: unknown): {
  status: "NEEDS_SETUP" | "TIMEOUT" | "ERROR";
  detail: string;
  failureReason: string;
} {
  const reason = failureReasonFromError(err);
  const answered = tokenEndpointAnswer(err);
  const kind =
    answered === null ? credentialFailureKind(err) : isTokenEndpointOutage(answered) ? "unavailable" : "refused";
  const failureReason =
    reason === "FETCH_FAILED"
      ? "CREDENTIAL_UNAVAILABLE"
      : kind === "unavailable" && answered === null
        ? `TOKEN_${reason}`
        : reason;
  switch (kind) {
    case "refused": {
      const wrongUrl = wrongTokenUrlAnswer(err);
      return {
        status: "NEEDS_SETUP",
        detail:
          wrongUrl !== null
            ? `The connection's token endpoint answered HTTP ${wrongUrl} without issuing a token, so the tenant was not called. Check the connection's token URL in Studio.`
            : "The connection's credentials could not be used (a credential is missing, or the token endpoint refused it), so the tenant was not called. Fix the connection in Studio.",
        failureReason,
      };
    }
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
  return err instanceof OAuthTokenRequestError || err instanceof SamlBearerExchangeError ? err.httpStatus : null;
}

/** The token endpoint is briefly unwell, and the same request may work later. */
function isTokenEndpointOutage(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Token-endpoint answers that refuse the credential itself: RFC 6749's 400
 * (invalid_grant, an assertion SuccessFactors will not take) and 401
 * (invalid_client, a rotated secret), and a gateway's 403.
 */
const CREDENTIAL_REFUSED = new Set([400, 401, 403]);

/**
 * The status, when the token endpoint answered without a token in a way that
 * says its URL is wrong rather than that the credential was refused or that it
 * is briefly unwell: a 404 or 405, a 2xx or 3xx login page. Null otherwise.
 */
export function wrongTokenUrlAnswer(err: unknown): number | null {
  const status = tokenEndpointAnswer(err);
  return status !== null && !CREDENTIAL_REFUSED.has(status) && !isTokenEndpointOutage(status) ? status : null;
}

function causeOf(err: unknown): unknown {
  return err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
}

function codeOf(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const code = (v as { code?: unknown }).code;
  return typeof code === "string" && CODE.test(code) ? code : null;
}
