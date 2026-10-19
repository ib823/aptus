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
import { credentialFailureKind } from "@/lib/sap-public/upstream-failure";

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
 */
export function credentialStepOutcome(err: unknown): {
  status: "NEEDS_SETUP" | "TIMEOUT" | "ERROR";
  detail: string;
  failureReason: string;
} {
  const reason = failureReasonFromError(err);
  const failureReason = reason === "FETCH_FAILED" ? "CREDENTIAL_UNAVAILABLE" : reason;
  switch (credentialFailureKind(err)) {
    case "refused":
      return {
        status: "NEEDS_SETUP",
        detail:
          "The connection's credentials could not be used (a credential is missing, or the token endpoint refused it), so the tenant was not called. Fix the connection in Studio.",
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

function causeOf(err: unknown): unknown {
  return err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
}

function codeOf(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const code = (v as { code?: unknown }).code;
  return typeof code === "string" && CODE.test(code) ? code : null;
}
