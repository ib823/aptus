/**
 * Shared hardening for the two intentional auth backdoors
 * (/api/auth/test-login and /api/auth/verify-izzat).
 *
 * Both mint a real session — test-login as `platform_admin` by default. They stay
 * reachable on Preview deployments because the E2E suite and internal demos need
 * them, and three things now hold that were not true before (audit E14):
 *
 *   1. A PRODUCTION RUNTIME REFUSES THEM UNLESS THE DEPLOYMENT SAID SO AT DEPLOY
 *      TIME. `scripts/check-production-env.js` already refuses to BUILD a
 *      production deploy carrying these flags unless `INTERNAL_TEST_DEPLOYMENT`
 *      acknowledges it — but nothing checked that acknowledgement at RUNTIME, so
 *      a variable set after the build (the exact case the strip script's own
 *      header warns about) opened the backdoor without it. `productionBackdoorBlock`
 *      closes that: the build-time contract and the runtime contract are now the
 *      same contract.
 *
 *   2. EVERY ATTEMPT LEAVES A ROW. `logBackdoorAttempt` wrote `console.warn`
 *      under a comment calling it "audit-logged". It now writes a
 *      `BackdoorAttempt` row as well, so a successful sign-in is queryable inside
 *      the product and not only in whatever log sink happens to be attached.
 *
 *   3. A SUCCESS THAT CANNOT BE RECORDED DOES NOT HAPPEN. `recordBackdoorSuccess`
 *      returns false if the row cannot be written, and both routes refuse on
 *      false. Denials stay best-effort — losing the record of a refusal is a gap
 *      in the trail; granting a platform_admin session with no record of it is
 *      the thing the trail exists for.
 */

import { prisma } from "@/lib/db/prisma";
import { getClientIp } from "@/lib/security/client-ip";

export type BackdoorOutcome =
  | "success"
  | "denied:disabled"
  | "denied:env"
  | "denied:secret"
  | "denied:ip"
  | "denied:user"
  | "denied:role";

function parseAllowList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * Is this a production runtime that never acknowledged being an internal test
 * deployment? Returns a reason when the backdoor must be refused, else null.
 *
 * THE ASYMMETRY THIS FIXES. `check-production-env.js` treats two signals as
 * required together — the feature flag AND `INTERNAL_TEST_DEPLOYMENT=true` — and
 * fails the build when the first is present without the second. The runtime only
 * ever consulted the first. So the build-time gate protected a deploy whose env
 * was set BEFORE the build, and nothing protected one whose env was set after,
 * which is the ordinary shape of an operator toggling a variable in a dashboard.
 */
export function productionBackdoorBlock(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.INTERNAL_TEST_DEPLOYMENT === "true") return null;
  return (
    "a production runtime that has not declared INTERNAL_TEST_DEPLOYMENT=true; " +
    "the backdoor is refused regardless of its own feature flags"
  );
}

/**
 * Returns true if the client's IP is permitted to reach a backdoor endpoint.
 *
 * When an allow-list IS configured, the client IP (resolved from the
 * Vercel-trusted, non-spoofable header — see getClientIp) must be a member.
 *
 * When NO allow-list is configured:
 *   - in development we stay open (the env flag + secret are the primary gates),
 *   - in production we fail CLOSED, so an enabled backdoor is never reachable
 *     from an unrestricted IP range by default. An operator who deliberately
 *     runs secret-only (e.g. an internal E2E deployment that cannot pin caller
 *     IPs) can opt back in with ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST=true.
 */
export function isIpAllowed(headers: Headers, allowListEnv: string): boolean {
  const allowList = parseAllowList(process.env[allowListEnv]);
  if (allowList.size === 0) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST !== "true"
    ) {
      return false;
    }
    return true;
  }
  const ip = getClientIp(headers);
  return allowList.has(ip);
}

interface AttemptParams {
  endpoint: string;
  outcome: BackdoorOutcome;
  headers: Headers;
  email?: string;
  /** Set only once a session has actually been minted for a real user. */
  userId?: string;
}

function attemptRow(params: AttemptParams) {
  const ip = getClientIp(params.headers);
  return {
    endpoint: params.endpoint,
    outcome: params.outcome,
    ipAddress: ip === "unknown" ? null : ip,
    // A user agent is attacker-controlled and unbounded; the column is not a
    // place to let a caller write a megabyte.
    userAgent: (params.headers.get("user-agent") ?? "").slice(0, 300) || null,
    email: params.email ?? null,
    userId: params.userId ?? null,
  };
}

function warn(params: AttemptParams): void {
  const row = attemptRow(params);
  console.warn(
    `[backdoor] ${params.endpoint} outcome=${params.outcome} ip=${row.ipAddress ?? "unknown"} ` +
      `ua=${JSON.stringify(row.userAgent ?? "").slice(0, 120)}` +
      (params.email ? ` email=${params.email}` : ""),
  );
}

/**
 * Record a REFUSED attempt. Best-effort in both directions: the log line always
 * goes out, and a database failure never turns a refusal into an error the
 * caller could use to tell "wrong secret" from "database down".
 */
export async function logBackdoorAttempt(params: AttemptParams): Promise<void> {
  warn(params);
  try {
    await prisma.backdoorAttempt.create({ data: attemptRow(params) });
  } catch (err) {
    console.error("[backdoor] failed to record attempt", {
      endpoint: params.endpoint,
      outcome: params.outcome,
      err,
    });
  }
}

/**
 * Record a SUCCESSFUL attempt, and say whether it was recorded.
 *
 * Returns false when the row could not be written, and both callers refuse on
 * false. That is the one place in this codebase where an audit failure fails the
 * request, and it is deliberate: everywhere else the rule is "losing the caller's
 * work because the audit failed is worse than a gap in the trail", but here the
 * caller's work IS a platform_admin session obtained without credentials. An
 * unrecorded one is exactly what must not exist.
 */
export async function recordBackdoorSuccess(params: Omit<AttemptParams, "outcome">): Promise<boolean> {
  const full: AttemptParams = { ...params, outcome: "success" };
  warn(full);
  try {
    await prisma.backdoorAttempt.create({ data: attemptRow(full) });
    return true;
  } catch (err) {
    console.error("[backdoor] REFUSING a session that could not be audited", {
      endpoint: params.endpoint,
      err,
    });
    return false;
  }
}
