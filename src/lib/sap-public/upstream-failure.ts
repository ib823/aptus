/**
 * What a failed SAP call means — decided in one place.
 *
 * TWO QUESTIONS EVERY CALLER ANSWERED THE SAME WRONG WAY (audit A08, A20, A26,
 * A28).
 *
 * 1. WAS SAP ASKED AT ALL? Every request path built its credential inside the
 *    same try as the SAP request, and its catch had one word for anything
 *    thrown: "the upstream never answered". So an OAuth token endpoint
 *    refusing a rotated client secret, an expired SuccessFactors assertion, a
 *    stored row missing its password and SuccessFactors' Basic deletion all
 *    became 502 UPSTREAM_ERROR / FETCH_FAILED on the broker, ERROR — "SAP
 *    unavailable", the client Basis team's lane — on the probe, and "no
 *    response (timeout/network)" on the capability map, while the tenant was
 *    never called. The same mistake, a wrong secret, read as NEEDS_SETUP when
 *    it was a Basic password SAP itself answered 401 to. A setup problem and an
 *    upstream error are never conflated; that now holds for the credential
 *    step too.
 *
 * 2. WHAT DID SAP ANSWER? The capability probe read a service's status out of
 *    the error's TEXT with /HTTP (\d{3})/, so a token endpoint's 404 became the
 *    service's "not activated (not found)" and Probe all stored it over proven
 *    evidence. The status now travels as a field on SapHttpError, which is
 *    thrown only for the tenant's own answer.
 *
 * NO Prisma import: tdd-connector and sf-basic-auth-sunset throw these, and
 * tdd-connector is reachable from client bundles through the product registry.
 */
import {
  isCredentialRefusal,
  isTokenRefusal,
  publicSamlFailure,
  SamlBearerExchangeError,
  tokenAnswerReason,
} from "@/lib/sap-public/oauth-saml-bearer";

export { isTokenEndpointOutage, isTokenRefusal } from "@/lib/sap-public/oauth-saml-bearer";

/**
 * The connection — a stored row, or the deployment's `{PREFIX}_*` variables —
 * cannot produce a credential: a secret is missing, the API-key header is
 * reserved, the auth type is unknown, or SAP has deleted it. Nothing was sent.
 *
 * `publicDetail` names fields, variables and dates only, never a value, so the
 * Test result can say which one to fix instead of "could not be established".
 */
export class ConnectionConfigError extends Error {
  readonly code = "CONNECTION_MISCONFIGURED";
  readonly publicDetail: string;
  constructor(message: string, publicDetail: string = message) {
    super(message);
    this.name = "ConnectionConfigError";
    this.publicDetail = publicDetail;
  }
}

/**
 * An OAuth client-credentials token endpoint answered, without a token. Its
 * status decides what that means (isTokenRefusal): a 4xx refuses the client
 * id, the secret or the token URL — fixed in the connection — while a 5xx or a
 * 429 is the endpoint failing, and nothing was refused.
 *
 * `refusalDetail` is the refusal's sentence for a tenant whose fix is NOT the
 * stored connection: a deployment's `{PREFIX}_*` tenant has none to "save
 * again", and its client id, secret and token URL are variables. Absent, the
 * stored connection's sentence is used. Like every publicDetail, it names
 * fields and variables, never a value.
 */
export class OAuthTokenRequestError extends Error {
  readonly code: string;
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly refusalDetail?: string,
  ) {
    super(message);
    this.name = "OAuthTokenRequestError";
    // The SAML exchange's vocabulary, not a second one (tokenAnswerReason).
    this.code = tokenAnswerReason(httpStatus);
  }
}

/**
 * A connector request was never sent: the tenant's credential could not be
 * obtained. Whatever the credential step threw is kept as `cause`, so a caller
 * can tell "SAP was not asked" from anything SAP said — and still classify the
 * cause with `credentialFailureKind`.
 *
 * The message is built, never copied: the cause's own can name a token
 * endpoint or carry the request, and the operations and write-test routes
 * repeat a connector error's message. It adds only the cause's
 * publicCredentialFailure detail — the sentence built to be shown — so those
 * screens still say which field to fix.
 */
export class SapCredentialError extends Error {
  constructor(cause: unknown) {
    const detail = publicCredentialFailure(cause)?.detail;
    super(
      `The tenant's credentials could not be obtained, so no request was sent to it.${detail ? ` ${detail}` : ""}`,
      { cause },
    );
    this.name = "SapCredentialError";
  }
}

/** The tenant answered a connector request with a status that is not success. */
export class SapHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SapHttpError";
  }
}

/**
 * publicSamlFailure, widened to the stored connection's own credential errors.
 *
 * The ONLY caught errors whose words may reach a screen — every other error
 * returns null and the caller keeps its generic sentence, because a fetch
 * error stringifies with the host, and on the OAuth path with the request.
 * UNAUTHORIZED is the "sign-in could not happen, fix the connection" outcome
 * the status vocabulary hands to the platform admin; ERROR is the endpoint
 * failing.
 */
export function publicCredentialFailure(
  err: unknown,
): { status: "UNAUTHORIZED" | "ERROR"; httpStatus: number | null; detail: string } | null {
  const saml = publicSamlFailure(err);
  if (saml) return saml;
  if (err instanceof ConnectionConfigError) {
    return { status: "UNAUTHORIZED", httpStatus: null, detail: err.publicDetail };
  }
  if (err instanceof OAuthTokenRequestError) {
    const status = err.httpStatus;
    if (isTokenRefusal(status)) {
      return {
        status: "UNAUTHORIZED",
        httpStatus: status,
        detail:
          err.refusalDetail ??
          `The token endpoint rejected the connection's client credentials (HTTP ${status}). Check the client id, the client secret and the token URL, then save the connection again.`,
      };
    }
    return {
      status: "ERROR",
      httpStatus: status,
      detail:
        status >= 200 && status < 300
          ? `The token endpoint answered (HTTP ${status}) without an access token.`
          : `The token endpoint did not issue a token (HTTP ${status}). That is the endpoint failing, not a credentials problem; retry later.`,
    };
  }
  return null;
}

/**
 * What a failure of the CREDENTIAL STEP means. Call it only for an error that
 * step threw (or a SapCredentialError wrapping one), never for one from the
 * request after it:
 *
 *   refused     — a setup problem the connection's administrator fixes: a
 *                 missing field, an unusable key, an expired assertion, or the
 *                 token endpoint refusing what was sent.
 *   timeout     — the token endpoint did not answer in time.
 *   unavailable — the token endpoint failed or could not be reached. Nothing
 *                 was refused.
 */
export type CredentialFailureKind = "refused" | "unavailable" | "timeout";

export function credentialFailureKind(err: unknown): CredentialFailureKind {
  return credentialFailure(err).kind;
}

/**
 * THE ONE CLASSIFIER for a failed credential step (roadmap P0.5): what kind
 * of failure it was, whether a retry can help, and the bounded reason the
 * audit row carries. The broker's read and write (credentialStepOutcome), the
 * console reads (consoleReadFailure), the capability probe and the connection
 * Test all ask it, so a connection whose token endpoint answers one thing
 * cannot be "fix the connection" on one surface and "retry later" on another.
 *
 *   refused     — not retryable; fixed in the connection. A field it lacks, a
 *                 key that cannot sign, a value the assertion cannot carry,
 *                 a reserved header, SAP's Basic deletion, or a token
 *                 endpoint that refused the request as sent: the credential
 *                 (TOKEN_REJECTED) or the URL (TOKEN_URL_HTTP_<n>).
 *   timeout     — retryable. The token endpoint did not answer within its own
 *                 limit: TOKEN_TIMEOUT, never the TIMEOUT a tenant leaves.
 *   unavailable — retryable. The token endpoint answered 408, 429, a 5xx or a
 *                 2xx without a token (TOKEN_HTTP_<n>, TOKEN_NO_TOKEN), or could
 *                 not be reached (TOKEN_<code>: TOKEN_ECONNRESET,
 *                 TOKEN_ENOTFOUND, TOKEN_FETCH_FAILED).
 *
 * EVERY RETRYABLE REASON IS TOKEN_*. An unreachable token endpoint left
 * ECONNRESET or FETCH_FAILED — word for word the row an unreachable TENANT
 * leaves — and a token endpoint's 503 left OAUTH_TOKEN_HTTP_503 or
 * SAML_BEARER_HTTP_503 by auth type; correlation lookup, the traffic screen and
 * the server log sent triage to the tenant, or had two names for one fact.
 *
 * `tokenHttpStatus` is what the token endpoint answered, when it answered
 * without a token; null when it never answered or was never asked.
 */
export interface CredentialFailure {
  kind: CredentialFailureKind;
  retryable: boolean;
  failureReason: string;
  tokenHttpStatus: number | null;
  /** Refused because the token URL points at the wrong thing (a 404, 405, 3xx). */
  wrongTokenUrl: boolean;
}

export function credentialFailure(err: unknown): CredentialFailure {
  const cause = err instanceof SapCredentialError ? err.cause : err;
  if (cause instanceof Error && cause.name === "AbortError") {
    return { kind: "timeout", retryable: true, failureReason: "TOKEN_TIMEOUT", tokenHttpStatus: null, wrongTokenUrl: false };
  }
  if (cause instanceof OAuthTokenRequestError || cause instanceof SamlBearerExchangeError) {
    const status = cause.httpStatus;
    const refused = isTokenRefusal(status);
    return {
      kind: refused ? "refused" : "unavailable",
      retryable: !refused,
      failureReason: tokenAnswerReason(status),
      tokenHttpStatus: status,
      wrongTokenUrl: refused && !isCredentialRefusal(status),
    };
  }
  if (publicCredentialFailure(cause)?.status === "UNAUTHORIZED") {
    // The error's own bounded code: CONNECTION_MISCONFIGURED,
    // SAML_BEARER_MISCONFIGURED, a SAML key or input code.
    return {
      kind: "refused",
      retryable: false,
      failureReason: failureReasonFromError(cause, "CREDENTIAL_UNUSABLE"),
      tokenHttpStatus: null,
      wrongTokenUrl: false,
    };
  }
  return {
    kind: "unavailable",
    retryable: true,
    failureReason: `TOKEN_${failureReasonFromError(cause)}`,
    tokenHttpStatus: null,
    wrongTokenUrl: false,
  };
}

/*
 * ─── A bounded reason for an error ─────────────────────────────────────────
 *
 * Here rather than in northbound/failure-reason.ts (which re-exports it) so
 * the classifier above can use it without importing the connection resolver,
 * and with it Prisma, into a module client bundles reach.
 */

const CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

/**
 * The upstream never answered: why, as a bounded code — the error's own
 * `code` (ENOTFOUND, ECONNREFUSED, CERT_HAS_EXPIRED), else the first one down
 * its `cause` chain, TIMEOUT for our own abort, or `fallback` for anything
 * that fails the shape: a message that is not an upper-case token may contain
 * a host.
 *
 * THREE LEVELS, NOT ONE. undici puts the socket's code on the TypeError's
 * cause, and the SAML exchange wraps that TypeError once more so its message
 * cannot carry the token URL — one level down found nothing, so the same reset
 * socket was TOKEN_ECONNRESET on a client-credentials connection and
 * TOKEN_FETCH_FAILED on a SuccessFactors one.
 */
export function failureReasonFromError(err: unknown, fallback = "FETCH_FAILED"): string {
  if (err instanceof Error && err.name === "AbortError") return "TIMEOUT";
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current; depth++) {
    const code = codeOf(current);
    if (code) return code;
    current = causeOf(current);
  }
  return fallback;
}

function causeOf(err: unknown): unknown {
  return err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
}

function codeOf(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const code = (v as { code?: unknown }).code;
  return typeof code === "string" && CODE.test(code) ? code : null;
}
