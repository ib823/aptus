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
  /** A generated document that could not be rendered just now (no free render slot); a retry may succeed. */
  | "UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<StudioErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  TOO_LARGE: 422,
  UNAVAILABLE: 503,
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

/**
 * UNAVAILABLE for a known wait (contracts/envelope-allowance.ts: an
 * organisation's spent allowance): the message says when, and Retry-After
 * says it to a client.
 */
export function studioUnavailableFor(message: string, retryAfterSeconds: number): NextResponse {
  const res = studioError("UNAVAILABLE", message);
  res.headers.set("retry-after", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  return res;
}

export function studioOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/**
 * studioOk for an answer already written as JSON — `{"data":…}`, with
 * rendered text spliced in (contracts/read-render.ts, RawJson): the same
 * status and content type, and the body as given.
 */
export function studioOkJson(text: string | Uint8Array<ArrayBuffer>, status = 200): NextResponse {
  return new NextResponse(text, { status, headers: { "content-type": "application/json" } });
}
