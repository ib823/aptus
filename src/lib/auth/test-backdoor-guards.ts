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

function getClientIp(headers: Headers): string {
  // Vercel populates x-forwarded-for with `<client>, <proxy>, ...`.
  // The leftmost entry is the originating client per the X-F-F spec but
  // can be spoofed; we trust it here only for *audit logging* and IP
  // allow-listing where downside is "operator misses an attempt", not
  // privilege escalation.
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() ?? "unknown";
}

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
 * Returns true if either:
 *   - no allow-list is configured (fail-open by design — the env flag is
 *     the primary gate), OR
 *   - the configured allow-list contains the client's IP.
 */
export function isIpAllowed(headers: Headers, allowListEnv: string): boolean {
  const allowList = parseAllowList(process.env[allowListEnv]);
  if (allowList.size === 0) return true;
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
