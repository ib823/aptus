/**
 * Shared hardening helpers for the two intentional auth backdoors
 * (/api/auth/test-login and /api/auth/verify-izzat).
 *
 * The backdoors stay enabled by env flag because production CI / demo
 * environments rely on them, but every successful AND failed attempt
 * is audit-logged with the source IP, and an optional IP allow-list
 * (TEST_LOGIN_ALLOWED_IPS / SIMULATION_BRIDGE_ALLOWED_IPS) gives
 * operators a way to lock down the endpoint to known callers without
 * disabling it entirely.
 */

import { getClientIp } from "@/lib/security/client-ip";

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
 *
 * (In real production these backdoors are already blocked outright by
 * scripts/check-production-env.js unless INTERNAL_TEST_DEPLOYMENT is set, so this
 * is defence-in-depth for the internal-test case.)
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

/**
 * Audit-log a backdoor authentication attempt. Writes to console.warn so
 * it surfaces in Vercel's runtime logs / Sentry breadcrumbs. The shape is
 * stable enough for log-based alerting on `endpoint` + `outcome`.
 */
export function logBackdoorAttempt(params: {
  endpoint: string;
  outcome: "success" | "denied:disabled" | "denied:env" | "denied:secret" | "denied:ip" | "denied:user";
  headers: Headers;
  email?: string;
}): void {
  const ip = getClientIp(params.headers);
  const ua = params.headers.get("user-agent") ?? "";
  console.warn(
    `[backdoor] ${params.endpoint} outcome=${params.outcome} ip=${ip} ua=${JSON.stringify(ua).slice(0, 120)}` +
      (params.email ? ` email=${params.email}` : ""),
  );
}
