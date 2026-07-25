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
