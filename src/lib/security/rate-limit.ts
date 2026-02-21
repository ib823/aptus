/** In-memory sliding-window rate limiter for API endpoints */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 600_000);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, 300_000);

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

/**
 * Check rate limit for a given key (typically IP or user ID).
 */
export function checkRateLimit(
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

/** Pre-configured rate limits */
export const RATE_LIMITS = {
  /** Login/magic link: 5 requests per 15 minutes */
  auth: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** MFA verification: 10 attempts per 5 minutes */
  mfa: { limit: 10, windowMs: 5 * 60 * 1000 },
  /** API mutations (POST/PUT/DELETE): 60 per minute */
  apiMutation: { limit: 60, windowMs: 60 * 1000 },
  /** API reads: 120 per minute */
  apiRead: { limit: 120, windowMs: 60 * 1000 },
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
