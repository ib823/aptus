/**
 * Shared plumbing for the /api/studio/* surface.
 *
 * One error envelope, `{ code, message, correlationId }`, so a developer can
 * quote a single id when something goes wrong and it can be found in the logs.
 * Messages are deliberately non-specific about WHY a lookup failed: "not found"
 * and "not yours" return the same 404, because distinguishing them would let a
 * caller probe for the existence of another tenant's records.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export type StudioErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  /** A generated document that would be larger than its stated budget (doc-inputs.ts). */
  | "TOO_LARGE"
  /** The organisation has used an allowance (its Contract Compiler time for today, contract-time.ts). */
  | "RATE_LIMITED"
  /** The Contract Compiler could not take the job just now (busy, turned off); a retry may succeed. */
  | "UNAVAILABLE"
  /** A request body past its stated size, refused before it was read in full (P1.2's description upload). */
  | "PAYLOAD_TOO_LARGE"
  /** Well formed, and refused for what it says: a description the Contract Compiler would not compile (P1.2). */
  | "UNPROCESSABLE"
  | "INTERNAL";

const STATUS: Record<StudioErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  TOO_LARGE: 422,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
};

export function studioError(
  code: StudioErrorCode,
  message: string,
  correlationId: string = randomUUID(),
): NextResponse {
  return NextResponse.json(
    { error: { code, message, correlationId } },
    { status: STATUS[code], headers: { "x-correlation-id": correlationId } },
  );
}

/** studioError for a known wait: the message says when, and Retry-After says it to a client. */
export function studioErrorRetryAfter(code: StudioErrorCode, message: string, retryAfterSeconds: number): NextResponse {
  const res = studioError(code, message);
  res.headers.set("retry-after", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  return res;
}

export function studioOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/**
 * studioOk for an answer already written as JSON — `{"data":…}`, with
 * rendered text spliced in (contracts/raw-json.ts): the same status and
 * content type, and the body as given.
 */
export function studioOkJson(text: string | Uint8Array<ArrayBuffer>, status = 200): NextResponse {
  return new NextResponse(text, { status, headers: { "content-type": "application/json" } });
}
