/**
 * What a FAILED console read is recorded and answered as (audit A26).
 *
 * The console routes (/preview, /entities, /operations) recorded every failure
 * as 502: SAP's own 401, 403 and 404 — a refusal SAP gave correctly — and a
 * credential CoreEdge could not even build, so no request was sent at all.
 * The upstream-errors incident counts audited 5xx and tells the operator "a
 * 5xx is the tenant's answer", so five Preview clicks on an entity set a DEV
 * arrangement does not release raised a MAJOR incident against a healthy
 * tenant, and an expired communication-user password read "SAP metadata
 * request failed". This module keeps the console's own header true:
 * 401/403 ("not set up") and 5xx/timeout ("unreachable") stay distinct.
 *
 *   SAP answered 401/403/404     → audited as that status, said as that refusal
 *   credential could not be used → audited 403, said as a setup problem
 *   anything else                → 502, as before: a timeout, a network error,
 *                                  a 5xx, a token endpoint that failed, or a
 *                                  body that was not OData
 */
import { ERROR_CODES } from "@/types/api";
import {
  FAILURE_REASON_INVALID_BODY,
  failureReasonFromError,
  failureReasonFromHttp,
} from "@/lib/northbound/failure-reason";
import { credentialFailureKind, SapCredentialError, SapHttpError } from "@/lib/sap-public/upstream-failure";

export interface ConsoleReadFailure {
  /** The audit row's status. A 5xx only when the tenant failed or never answered. */
  auditStatus: number;
  /** The bounded cause for the audit row — see failure-reason.ts. */
  failureReason: string;
  /** The console route's own response status, code and sentence. */
  status: number;
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
  message: string;
}

/**
 * Classify an error a console read threw. `fallbackMessage` is the route's
 * existing generic sentence, kept for everything this does not recognise —
 * the raw error is never repeated, since it can carry tenant topology.
 */
export function consoleReadFailure(err: unknown, fallbackMessage: string): ConsoleReadFailure {
  if (err instanceof SapCredentialError) {
    const failureReason = failureReasonFromError(err.cause);
    if (credentialFailureKind(err) === "refused") {
      return {
        auditStatus: 403,
        failureReason,
        status: 403,
        code: ERROR_CODES.FORBIDDEN,
        message:
          "CoreEdge could not authenticate to this tenant (a credential is missing, or the token endpoint refused it), so no request was sent. Fix the connection, then try again.",
      };
    }
    return {
      auditStatus: 502,
      failureReason,
      status: 502,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "The tenant's token endpoint did not issue a token (it failed, timed out or could not be reached), so no request was sent.",
    };
  }
  if (err instanceof SapHttpError) {
    const refusal = refusalFor(err.status);
    if (refusal) return { ...refusal, auditStatus: err.status, failureReason: `HTTP_${err.status}` };
    return {
      auditStatus: 502,
      // A 2xx that threw is a body the connector could not read, not an HTTP_200.
      failureReason: failureReasonFromHttp(err.status) ?? FAILURE_REASON_INVALID_BODY,
      status: 502,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: fallbackMessage,
    };
  }
  return {
    auditStatus: 502,
    failureReason: failureReasonFromError(err),
    status: 502,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: fallbackMessage,
  };
}

/** SAP's refusals, as the console says them. 401 and 403 have different fixes. */
function refusalFor(status: number): Pick<ConsoleReadFailure, "status" | "code" | "message"> | null {
  if (status === 401) {
    return {
      status: 403,
      code: ERROR_CODES.FORBIDDEN,
      message:
        "SAP rejected the connection's credentials (HTTP 401): the communication user's password or token is wrong or expired.",
    };
  }
  if (status === 403) {
    return {
      status: 403,
      code: ERROR_CODES.FORBIDDEN,
      message:
        "SAP refused the request (HTTP 403): the communication arrangement is not set up for this service, or the connected user is not authorised.",
    };
  }
  if (status === 404) {
    return {
      status: 404,
      code: ERROR_CODES.NOT_FOUND,
      message: "SAP does not serve this on this tenant (HTTP 404).",
    };
  }
  return null;
}
