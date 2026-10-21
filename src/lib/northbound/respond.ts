/**
 * The northbound response envelope.
 *
 * Every response carries a `correlationId`, echoed in a header as well as the
 * body, so a developer reporting "call X failed" gives us one string that finds
 * the exact audit row. That is the difference between debugging their integration
 * and guessing at it.
 *
 * AUTH FAILURES ARE ALL THE SAME 401. Internally we distinguish unknown from
 * revoked from expired — that detail is audited and logged, because operations
 * needs it. The CALLER gets one message, because "that token existed once but is
 * revoked" is a free oracle for anyone probing with stolen strings.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import type { RateLimitResult } from "@/lib/security/rate-limit";
import {
  isLimiterOutage,
  LIMITER_UNAVAILABLE_MESSAGE,
  retryAfterSeconds,
} from "@/lib/security/rate-limit-response";

export type NorthboundErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  /**
   * The CALLER'S ADDRESS is over a limit, not this credential: the edge's
   * per-address backstop, or too many failed credential lookups from it
   * (middleware.ts, machineRefusal). Sent only by the edge; listed here so the
   * vocabulary is in one place. Another key or tenant on a shared egress may
   * have spent it, so backing off one key is not the answer.
   */
  | "RATE_LIMITED_ADDRESS"
  /**
   * The customer's SAP connection cannot be bound for this call — none is
   * configured for the product, none declares the credential's environment, or
   * the candidates are ambiguous.
   *
   * It exists so a developer's application can tell "our customer has not
   * finished connecting their SAP yet" from "our credentials were rejected"
   * (FORBIDDEN) — both were previously one 403 separated only by prose, which is
   * the same dishonesty the empty ≠ needs-setup ≠ error rule forbids on the
   * success axis, merely moved to the failure axis. The HTTP status stays 403:
   * what was indistinguishable was the CODE, and that is what a client branches
   * on.
   */
  | "CONNECTION_NOT_CONFIGURED"
  /** Idempotency: same key, different payload — or a request still in flight. */
  | "CONFLICT"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  /**
   * The rate limiter could not be asked, so the call was refused for safety:
   * 503 with Retry-After, nothing sent to SAP. Never RATE_LIMITED — that says
   * THIS credential used its budget, and during an outage nobody had (A44).
   */
  | "LIMITER_UNAVAILABLE"
  /**
   * The circuit breaker for the SAP system behind the bound connection is
   * open (P0.14): 503 with Retry-After, nothing sent to SAP. Answered only
   * when COREEDGE_CIRCUIT_BREAKER=enforce; the default observes and never
   * refuses (lib/governed/containment.ts).
   */
  | "CIRCUIT_OPEN"
  | "INTERNAL";

export function newCorrelationId(): string {
  return randomUUID();
}

export function northboundError(
  code: NorthboundErrorCode,
  message: string,
  status: number,
  correlationId: string,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message, correlationId } },
    {
      status,
      headers: {
        "x-correlation-id": correlationId,
        "cache-control": "no-store",
        ...extraHeaders,
      },
    },
  );
}

/** The audit row's failureReason for a call refused because the limiter was down. */
export const FAILURE_REASON_LIMITER_UNAVAILABLE = "LIMITER_UNAVAILABLE";

/**
 * A per-credential throttle refused the call: what to answer, and what to
 * audit. The routes that limit a credential all go through this, so a limiter
 * outage cannot be told to one of them as throttling (audit A44).
 *
 *   limited     — 429 RATE_LIMITED with Retry-After: this credential used its
 *                 budget. Audited 429, which the traffic screen calls
 *                 throttled and the throttled incident counts.
 *   unavailable — 503 LIMITER_UNAVAILABLE with Retry-After. Audited 503 with
 *                 failureReason LIMITER_UNAVAILABLE, so neither the throttle
 *                 view nor the throttled incident sees it, and the
 *                 upstream-errors incident leaves it out by that reason: SAP
 *                 was not called.
 */
export function northboundThrottleRefusal(
  rate: RateLimitResult,
  correlationId: string,
  limitedMessage: string,
): { status: 429 | 503; failureReason: string | null; response: NextResponse } {
  const headers = { "retry-after": retryAfterSeconds(rate) };
  if (isLimiterOutage(rate)) {
    return {
      status: 503,
      failureReason: FAILURE_REASON_LIMITER_UNAVAILABLE,
      response: northboundError("LIMITER_UNAVAILABLE", LIMITER_UNAVAILABLE_MESSAGE, 503, correlationId, headers),
    };
  }
  return {
    status: 429,
    failureReason: null,
    response: northboundError("RATE_LIMITED", limitedMessage, 429, correlationId, headers),
  };
}

/** The single, deliberately uninformative response for every auth failure. */
export function unauthenticated(correlationId: string): NextResponse {
  return northboundError(
    "UNAUTHENTICATED",
    "Missing or invalid client token.",
    401,
    correlationId,
  );
}

export function northboundOk<T>(data: T, correlationId: string, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    {
      status,
      headers: {
        "x-correlation-id": correlationId,
        // Client SAP data must never sit in a shared cache.
        "cache-control": "no-store",
      },
    },
  );
}
