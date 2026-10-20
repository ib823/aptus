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

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  /**
   * WHY a refused request was refused; absent when it was allowed.
   *
   *   limited     — this bucket is spent. The caller is told 429 and when to
   *                 come back.
   *   unavailable — the shared backend could not be asked, so nothing was
   *                 counted and nobody was over any limit. The request is still
   *                 refused in production (see checkRateLimit), but it must be
   *                 said as 503 LIMITER_UNAVAILABLE, never 429 (audit A44): the
   *                 two came back in one shape, so a Redis outage told every
   *                 credential it was throttled, was audited as 429, and
   *                 raised the throttled incident against callers who had done
   *                 nothing. Tell them apart with isLimiterOutage
   *                 (rate-limit-response.ts).
   */
  reason?: "limited" | "unavailable";
}

/**
 * How long a caller refused during a limiter outage is told to wait. Not the
 * bucket's window: nothing was counted, so there is no window to wait out.
 */
export const LIMITER_UNAVAILABLE_RETRY_MS = 30_000;

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
      reason: "limited",
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
        ...(result.success ? {} : { reason: "limited" as const }),
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
      //
      // REFUSED, AND SAID AS AN OUTAGE (audit A44). The refusal is unchanged;
      // the reason is what lets every caller answer 503 LIMITER_UNAVAILABLE
      // rather than tell the caller it was throttled.
      if (process.env.NODE_ENV === "production") {
        return { allowed: false, remaining: 0, resetMs: LIMITER_UNAVAILABLE_RETRY_MS, reason: "unavailable" };
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
  /**
   * Governance step-up ceremonies, per client IP: a backstop only. The step-up
   * routes need a session and limit each PERSON (mfa, auth); keyed by IP alone,
   * approvers behind one office egress address would spend each other's
   * allowance and the eleventh would be locked out of revoking anything.
   */
  stepUpPerIp: { limit: 120, windowMs: 60 * 1000 },
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
  /**
   * The edge bucket for an authenticated MACHINE route, keyed by the credential
   * PRESENTED (a hash of the bearer, see machineCredentialKey) rather than the
   * caller's address (audit A43, P0.5). A ceiling, not the budget: the route's
   * own per-credential buckets (`northbound`, 60 reads and 60 writes a minute)
   * refuse long before it, with an audit row. It exists so a runaway key is
   * stopped at the edge without spending anyone else's allowance.
   */
  machineCredential: { limit: 600, windowMs: 60 * 1000 },
  /**
   * The per-address BACKSTOP behind machineCredential: the only thing a flood
   * of random keys (each its own bucket) runs into. Ten credentials' worth of
   * ceiling, so one runaway key — refused at its own ceiling first — spends at
   * most a tenth of it, and a vendor serving many customers from one egress
   * address is not throttled by its own fleet.
   */
  machineIpBackstop: { limit: 6000, windowMs: 60 * 1000 },
  /**
   * FAILED credential lookups per caller address on the machine routes
   * (`machine-authfail:<ip>`, see src/lib/northbound/auth-failures.ts).
   *
   * Keying by the presented credential gives every made-up bearer a fresh
   * bucket, so without this a client sending a new junk key on every call met
   * only the backstop above — 6,000 Postgres lookups a minute per address
   * where the old per-IP bucket allowed 120. The route spends this on each
   * 401 for a presented key; the edge reads it, without spending, before
   * anything else, and refuses the address once it is empty. A valid key
   * never spends it, so only an address sending failing keys can empty it.
   */
  machineAuthFailure: { limit: 60, windowMs: 60 * 1000 },
  /**
   * Sign-up requests per caller address (P0.13): POST /api/auth/signup, keyed
   * `signup:<ip>` at the edge. An hour's window, because each one can send an
   * email from this host's domain and, with developer sign-up open, create an
   * organization; a person signing up needs a handful, not thirty a minute.
   */
  signupPerIp: { limit: 10, windowMs: 60 * 60 * 1000 },
  /**
   * Sign-up attempts per email ADDRESS (P0.13), keyed by its hash in the route
   * (developer-workspace.ts). The per-address bucket above cannot stop one
   * inbox being sent link after link from many addresses; this does.
   */
  signupPerEmail: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

/**
 * Authenticated MACHINE routes: called by an application, an event sender, a
 * CI runner or an agent with a bearer credential, never by a browser session.
 * Only `/api/northbound` exists today; the rest are the paths the roadmap
 * reserves for machine callers (the twin, event ingest, the management API,
 * governed outbound routes, MCP), listed now so each is limited per credential
 * from its first deploy instead of inheriting the per-IP browser bucket.
 */
export const MACHINE_API_PREFIXES = [
  "/api/northbound",
  "/api/twin",
  "/api/events/ingest",
  "/api/mgmt",
  "/api/outbound",
  "/api/mcp",
] as const;

/** Whole path segments only: `/api/mcp` is a machine route, `/api/mcpx` is not. */
export function isMachineApiRoute(pathname: string): boolean {
  return MACHINE_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * How the edge keys a machine route, from COREEDGE_MACHINE_RATE_LIMIT.
 *
 *   credential (default) — per presented credential, with the per-IP backstop.
 *   ip                   — the old shared per-IP API buckets. A rollback
 *                          switch, nothing more: it brings A43 back.
 *
 * Anything else reads as the default. Read per request rather than at load.
 */
export function machineRateLimitMode(): "credential" | "ip" {
  return process.env.COREEDGE_MACHINE_RATE_LIMIT?.trim().toLowerCase() === "ip" ? "ip" : "credential";
}

/**
 * The edge bucket key for a presented bearer credential.
 *
 * A HASH, NEVER THE CREDENTIAL. The key is stored in Redis and can surface in
 * its logs and metrics; a raw bearer there would be a credential leak for a
 * window's lifetime. SHA-256 through Web Crypto (this runs on the Edge), cut to
 * 128 bits: wide enough that two live keys never share a bucket, and not the
 * full digest SolutionClient.tokenHash stores, so the Redis key is not a lookup
 * key into that table either.
 */
export async function machineCredentialKey(bearer: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `machine:cred:${hex.slice(0, 32)}`;
}

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
    /*
     * THE CATALOGUE ROUTES CAN GO LIVE TOO, so they take the same bucket.
     * The premise that kept them out — "hub-content reads Postgres, not the
     * tenant" — was true of the default load and false of the surface: the
     * list with ?dataProbe=1 fires up to 60 $metadata probes PLUS 60 one-row
     * data reads, the detail live-probes on every expansion unless probe=0,
     * and /capabilities probes ~60 services per call. Kept as a pure pathname
     * predicate (no query-string dependence), same as /preview and /entities:
     * a caller must not be able to slip the throttle by the param it omits.
     */
    pathname === "/api/sap/tdd/hub-content" ||
    // The item-detail route (live-probes on expansion) — but NOT the admin
    // import endpoints that share the path prefix: seed, harvest-import and
    // api-reference-import are DB-only (they fetch GitHub, never the tenant),
    // and the two imports are driven as rapid chunk loops from the client that
    // a 20/min bucket would break mid-import. `write-test` is deliberately NOT
    // in this exclusion any more: it performs $metadata + create + delete
    // against the tenant, which is the most amplifying call under this prefix.
    // probe-all is listed by name above.
    (/^\/api\/sap\/tdd\/hub-content\/[^/]+$/.test(pathname) &&
      !/\/(seed|harvest-import|api-reference-import|probe-all)$/.test(pathname)) ||
    pathname === "/api/sap/tdd/capabilities" ||
    // The guarded write-back: a CSRF handshake plus a POST against the tenant.
    // Its GET returns feature flags only and is cheap, but the predicate is
    // pathname-only by design, so the whole path takes the bucket.
    pathname === "/api/sap/tdd/write" ||
    // Ariba's live REST read — an OAuth exchange plus a call against a
    // customer realm. Different protocol, same amplification.
    pathname === "/api/sap/ariba/call" ||
    // Studio's per-connection connectivity probe. It reaches a CLIENT's SAP
    // system with that client's own credentials, so it amplifies onto a tenant
    // exactly like the routes above and belongs in the same tight bucket — not
    // the generous default API ceiling. Matched by shape because the id is
    // dynamic; anchored at both ends so no other path can slip in.
    /^\/api\/studio\/connections\/[^/]+\/test$/.test(pathname) ||
    // Studio's per-interface service verification: the same $metadata GET as
    // the connection test, on the interface's own service path, through the
    // same client connection. Same amplification, same bucket.
    /^\/api\/studio\/interfaces\/[^/]+\/verify-service$/.test(pathname) ||
    // The same $metadata probe, fired from the Operations "Probe now" action.
    // Identical upstream call to the Studio test above; it sat in the
    // generous mutation bucket only because it was added later.
    pathname === "/api/ops/connections-health/probe" ||
    // Studio's Test Console dry run: a full entity-set read through the
    // client's own connection — the broker's read, minus the audit row.
    pathname === "/api/studio/test/broker-run"
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
