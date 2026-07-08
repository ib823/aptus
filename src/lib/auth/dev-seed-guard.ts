/**
 * Shared gate for the /api/dev/seed-* demo endpoints.
 *
 * These endpoints mint real abeam-sessions and mutate durable data, so they
 * must never be reachable in production and must never ship a usable secret
 * inside the repo. The gate mirrors the /api/auth/test-login posture:
 *
 *   1. The endpoint's secret env var must be set — no in-repo fallback. If it
 *      is unset the route behaves as if it does not exist (404).
 *   2. In production it stays 404 unless ALLOW_DEV_SEED_IN_PROD === "true".
 *   3. In production the secret must be at least 24 chars — a short secret is
 *      a configuration mistake, so fail closed.
 *   4. The provided secret is compared in constant time.
 *
 * A denied request is indistinguishable from a route that does not exist
 * (always 404) so the endpoint's presence isn't advertised to probers.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const NOT_FOUND = new NextResponse(null, { status: 404 });

export interface DevSeedGateResult {
  /** Present when the request is rejected — return it directly. */
  response?: NextResponse;
  /** The validated expected secret, present only when the gate passes. */
  secret?: string;
}

function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * @param envKey  the env var holding the endpoint's secret (e.g. DEV_SEED_SECRET)
 * @param provided the secret supplied by the caller (query param), may be null
 */
export function checkDevSeedAccess(
  envKey: string,
  provided: string | null,
): DevSeedGateResult {
  const isProduction = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === "production"
    : process.env.NODE_ENV === "production";

  // Gate 1: production is off-limits unless explicitly opted in.
  if (isProduction && process.env.ALLOW_DEV_SEED_IN_PROD !== "true") {
    return { response: NOT_FOUND };
  }

  // Gate 2: the secret env var must be configured — no in-repo fallback.
  const expected = process.env[envKey];
  if (!expected) {
    return { response: NOT_FOUND };
  }

  // Gate 3: reject trivially short secrets in production.
  if (isProduction && expected.length < 24) {
    return { response: NOT_FOUND };
  }

  // Gate 4: constant-time secret comparison.
  if (!provided || !secretsMatch(provided, expected)) {
    return { response: NOT_FOUND };
  }

  return { secret: expected };
}
