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

export type NorthboundErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
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
