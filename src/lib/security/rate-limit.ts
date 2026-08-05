/**
 * Sliding-window rate limiter for API endpoints.
 * Uses Upstash Redis when configured (recommended for production/serverless).
 * Falls back to in-memory Map which is per-invocation in serverless — ineffective
 * for distributed rate limiting but provides basic protection in single-instance mode.
 */

import { Ratelimit } from "@upstash/ratelimit";
// This module is imported from src/middleware.ts, which runs on Vercel Edge.
// The "/cloudflare" entry of @upstash/redis ships the Web-API client (fetch +
// Web Crypto only) and is the supported path for any V8-isolate runtime —
// Cloudflare Workers, Vercel Edge, Next.js middleware. The default "." entry
// pulls in node:crypto and is reserved for Node API routes; using it from
// middleware bloats the Edge bundle. Same Redis class, same wire format.
import { Redis } from "@upstash/redis/cloudflare";

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const hasSharedBackend = Boolean(redisUrl && redisToken);
const redis = hasSharedBackend
  ? new Redis({
      url: redisUrl!,
      token: redisToken!,
    })
  : null;
const limiterCache = new Map<string, Ratelimit>();
let warnedAboutBackendFailure = false;
let warnedAboutMissingBackend = false;

interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

function toWindowDuration(windowMs: number): `${number} s` {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  return `${seconds} s`;
}

function getLimiter(config: RateLimitConfig): Ratelimit | null {
  if (!redis) {
    return null;
  }

  const cacheKey = `${config.limit}:${config.windowMs}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, toWindowDuration(config.windowMs)),
    analytics: false,
    // Caches identifiers that are already over the limit for the rest of their
    // window, so a flooding caller is refused in-isolate instead of costing a
    // Redis round trip per request. Allowed traffic still hits Redis — the
    // shared sliding window stays authoritative.
    ephemeralCache: new Map(),
    prefix: `abeam:ratelimit:${cacheKey}`,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}


function checkRateLimitInMemory(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < config.windowMs,
  );

  if (entry.timestamps.length >= config.limit) {
    const oldestInWindow = entry.timestamps[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldestInWindow + config.windowMs - now,
    };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: config.limit - entry.timestamps.length,
    resetMs: config.windowMs,
  };
}

/**
 * Check rate limit for a given key (typically IP or user ID).
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
) : Promise<RateLimitResult> {
  const limiter = getLimiter(config);
  if (limiter) {
    try {
      const result = await limiter.limit(key);
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetMs: Math.max(result.reset - Date.now(), 0),
      };
    } catch (error) {
      if (!warnedAboutBackendFailure) {
        warnedAboutBackendFailure = true;
        console.error("[RATE LIMIT] Shared backend failed", error);
      }
      // Fail CLOSED in production. The per-instance in-memory limiter is
      // ineffective on serverless, so falling back to it during a Redis outage
      // would silently disable throttling on exactly the sensitive buckets this
      // guards (auth brute-force, SAP-tenant amplification). Denying for the
      // duration of the outage is the safer trade for those routes. In dev we
      // fall through to the in-memory limiter so local work is unaffected.
      if (process.env.NODE_ENV === "production") {
        return { allowed: false, remaining: 0, resetMs: config.windowMs };
      }
    }
  }

  if (!hasSharedBackend && process.env.NODE_ENV === "production" && !warnedAboutMissingBackend) {
    warnedAboutMissingBackend = true;
    // CI/CD must catch this via scripts/check-production-env.js; this log
    // is the runtime backstop if a deploy slipped through without Redis.
    console.error(
      "[RATE LIMIT] FATAL CONFIG: UPSTASH_REDIS_REST_URL/TOKEN missing in production. " +
        "Per-instance memory limiter is ineffective in serverless — rate limiting is effectively disabled.",
    );
  }

  return checkRateLimitInMemory(key, config);
}

/**
 * Read a bucket's remaining budget WITHOUT spending any of it.
 *
 * WHY THIS HAD TO EXIST. The operations console shows a live throttle gauge, and
 * the obvious implementation is to call `checkRateLimit` and render its
 * `remaining`. That call is CONSUMING: the in-memory path pushes a timestamp and
 * the Upstash path spends a token. A dashboard polling it would eat the very
 * budget it reports -- and, on the tight per-credential northbound bucket, could
 * manufacture the 429s it is supposed to be warning about. A gauge that changes
 * the thing it measures is worse than no gauge.
 *
 * Upstash exposes `getRemaining` for exactly this. The in-memory path filters the
 * window and counts without pushing.
 *
 * FAILURE BEHAVIOUR IS THE OPPOSITE OF `checkRateLimit`, deliberately. That
 * function fails CLOSED because denying a request during an outage is safer than
 * admitting it. This one is a read for a display, and denying nothing: on a
 * backend error it returns null, so the caller renders "unknown" rather than a
 * fabricated headroom figure. Nothing is gated on the answer.
 */
export async function peekRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<{ remaining: number; limit: number } | null> {
  const limiter = getLimiter(config);
  if (limiter) {
    try {
      const remaining = await limiter.getRemaining(key);
      const value = typeof remaining === "number" ? remaining : remaining.remaining;
      return { remaining: Math.max(value, 0), limit: config.limit };
    } catch (error) {
      if (!warnedAboutBackendFailure) {
        warnedAboutBackendFailure = true;
        console.error("[RATE LIMIT] Shared backend failed", error);
      }
      // Unknown, not zero. Zero would read as "this credential is throttled".
      return null;
    }
  }

  // In-memory: count what is inside the window without adding to it.
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) return { remaining: config.limit, limit: config.limit };
  const live = entry.timestamps.filter((t) => now - t < config.windowMs).length;
  return { remaining: Math.max(config.limit - live, 0), limit: config.limit };
}

/** Pre-configured rate limits */
export const RATE_LIMITS = {
  /** Auth mutations (signin, callback, signout): 30 per minute */
  auth: { limit: 30, windowMs: 60 * 1000 },
  /** MFA verification: 10 attempts per 5 minutes */
  mfa: { limit: 10, windowMs: 5 * 60 * 1000 },
  /** API mutations (POST/PUT/DELETE): 120 per minute */
  apiMutation: { limit: 120, windowMs: 60 * 1000 },
  /** API reads: 300 per minute */
  apiRead: { limit: 300, windowMs: 60 * 1000 },
  /** Report generation: 10 per minute */
  report: { limit: 10, windowMs: 60 * 1000 },
  /**
   * Expensive LIVE-SAP routes (see isLiveSapTenantRoute): a tight, dedicated
   * bucket so they can't amplify load onto the SAP tenant even within the
   * generous apiRead/apiMutation ceilings.
   */
  sapLive: { limit: 20, windowMs: 60 * 1000 },
  /**
   * The northbound broker's data read, keyed PER CLIENT TOKEN rather than per
   * IP. A deployed application calls from a small set of server addresses, so an
   * IP key would make one busy customer throttle another — and would let a
   * leaked token hide behind a shared address. Keyed by token, a runaway or
   * stolen credential throttles only itself, and the audit shows exactly which.
   *
   * Higher than sapLive because this is an application's normal traffic rather
   * than a human clicking, but still bounded: it reaches a customer's production
   * system on every call.
   */
  northbound: { limit: 60, windowMs: 60 * 1000 },
} as const;

/**
 * Routes that reach the live SAP tenant and therefore belong in the tight
 * `sapLive` bucket. Every path here amplifies onto the tenant on a cache miss:
 *   - /operations                 curated live sample
 *   - /preview                    per-entity live row reads (universal show-data)
 *   - /entities                   metadata inspect + the ~3.6s probe=1 confirm
 *   - /hub-content/probe-all      the bounded live probe sweep
 * Kept as a pure pathname predicate (no query-string dependence) so /preview
 * and /entities are throttled regardless of params — a per-service fan-out must
 * not be able to slip the throttle by omitting probe=1.
 */
export function isLiveSapTenantRoute(pathname: string): boolean {
  return (
    pathname === "/api/sap/tdd/operations" ||
    pathname === "/api/sap/tdd/preview" ||
    pathname === "/api/sap/tdd/entities" ||
    pathname === "/api/sap/tdd/hub-content/probe-all" ||
    // Studio's per-connection connectivity probe. It reaches a CLIENT's SAP
    // system with that client's own credentials, so it amplifies onto a tenant
    // exactly like the routes above and belongs in the same tight bucket — not
    // the generous default API ceiling. Matched by shape because the id is
    // dynamic; anchored at both ends so no other path can slip in.
    /^\/api\/studio\/connections\/[^/]+\/test$/.test(pathname)
  );
}

// Trusted client-IP extraction lives in ./client-ip and is re-exported here so
// existing importers (middleware, webauthn routes) keep their import path.
export { getClientIp } from "./client-ip";

/**
 * Which backend is actually enforcing the limits right now.
 *
 * EXPORTED SO A SCREEN CANNOT GUESS. The throttle endpoint printed a caveat
 * about in-memory limits unconditionally, which is wrong in both directions: on
 * a deployment WITH Upstash it told an operator their headroom was per-instance
 * when it was deployment-wide, and on one WITHOUT it buried a real warning among
 * routine provenance notes. The difference is knowable here, so it is reported
 * rather than hedged.
 *
 * It matters: with no shared backend, every serverless instance keeps its own
 * counter, so the effective limit is the configured one MULTIPLIED by however
 * many instances happen to be warm — which is not a number anyone can see.
 */
export function rateLimitBackend(): "shared" | "in-memory" {
  return hasSharedBackend ? "shared" : "in-memory";
}
