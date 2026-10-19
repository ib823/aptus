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
import { isTokenRefusal, publicSamlFailure } from "@/lib/sap-public/oauth-saml-bearer";

export { isTokenRefusal } from "@/lib/sap-public/oauth-saml-bearer";

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
    this.code = isTokenRefusal(httpStatus)
      ? "OAUTH_TOKEN_REJECTED"
      : httpStatus >= 200 && httpStatus < 300
        ? "OAUTH_TOKEN_MISSING"
        : `OAUTH_TOKEN_HTTP_${httpStatus}`;
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
  const cause = err instanceof SapCredentialError ? err.cause : err;
  if (cause instanceof Error && cause.name === "AbortError") return "timeout";
  return publicCredentialFailure(cause)?.status === "UNAUTHORIZED" ? "refused" : "unavailable";
}
