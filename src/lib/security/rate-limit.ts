/**
 * Sliding-window rate limiter for API endpoints.
 * Uses Upstash Redis when configured (recommended for production/serverless).
 * Falls back to in-memory Map which is per-invocation in serverless — ineffective
 * for distributed rate limiting but provides basic protection in single-instance mode.
 */

import { Ratelimit } from "@upstash/ratelimit";
// Default export of @upstash/redis works on Vercel Edge runtime.
// The "/cloudflare" subpath is Cloudflare-Workers-only and silently fails on Vercel,
// degrading the limiter to its per-instance in-memory fallback.
import { Redis } from "@upstash/redis";

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
    console.error(
      "[RATE LIMIT] UPSTASH_REDIS_REST_URL/TOKEN are not configured; in-memory fallback is ineffective in serverless.",
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
} as const;

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
