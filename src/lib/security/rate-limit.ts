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
    ephemeralCache: false,
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
        console.error("[RATE LIMIT] Shared backend failed, falling back to in-memory limiter", error);
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
    pathname === "/api/sap/tdd/hub-content/probe-all"
  );
}

/**
 * Extract client IP from request headers.
 * Takes the first IP from X-Forwarded-For (leftmost = client).
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return headers.get("x-real-ip") ?? "unknown";
}
