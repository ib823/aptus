/**
 * Telling a limiter outage from a limit, and answering it (audit A44).
 *
 * ONE ANSWER FOR EVERY ROUTE THAT LIMITS. Each route words its own 429 — a
 * sign-in says "too many attempts", the lane re-check says "checked a moment
 * ago" — because each is about what the caller did. An outage is about nothing
 * the caller did, so it is said once, here, the same everywhere: 503
 * LIMITER_UNAVAILABLE with Retry-After. Nothing was counted and nobody was
 * over a limit; the request was refused because the limiter fails closed in
 * production (see checkRateLimit), and a retry after the outage succeeds.
 *
 * The northbound routes answer in their own envelope (respond.ts,
 * northboundThrottleRefusal), and the edge middleware builds the machine-route
 * shape itself; all of them use this code, status and sentence.
 *
 * Only a TYPE is imported from rate-limit.ts. Route tests mock that module
 * with the two names they need, and a helper read from the mock would be
 * undefined exactly on the outage path these exist for.
 */

import { NextResponse } from "next/server";

import type { RateLimitResult } from "@/lib/security/rate-limit";
import { ERROR_CODES } from "@/types/api";

export const LIMITER_UNAVAILABLE_MESSAGE =
  "Request limits cannot be checked right now, so the request was refused for safety. Nothing was done; try again shortly.";

/** True when a refusal was the limiter failing, not the caller's own use. */
export function isLimiterOutage(result: Pick<RateLimitResult, "allowed" | "reason">): boolean {
  return !result.allowed && result.reason === "unavailable";
}

/** Seconds for a Retry-After header: whole, and never zero. */
export function retryAfterSeconds(result: Pick<RateLimitResult, "resetMs">): string {
  return String(Math.max(1, Math.ceil(result.resetMs / 1000)));
}

/** The 503 for a route whose errors use the standard `{ error: { code, message } }` envelope. */
export function limiterUnavailableResponse(result: Pick<RateLimitResult, "resetMs">): NextResponse {
  return NextResponse.json(
    { error: { code: ERROR_CODES.LIMITER_UNAVAILABLE, message: LIMITER_UNAVAILABLE_MESSAGE } },
    { status: 503, headers: { "Retry-After": retryAfterSeconds(result), "cache-control": "no-store" } },
  );
}
