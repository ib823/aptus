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
  | "INTERNAL";

const STATUS: Record<StudioErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
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

export function studioOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}
