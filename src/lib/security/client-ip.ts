/**
 * Trusted client-IP extraction, shared by the rate limiter and the auth
 * backdoor guards.
 *
 * SECURITY: the leftmost `x-forwarded-for` entry is supplied by the client and
 * is trivially spoofable. Using it to key rate limits or IP allow-lists lets an
 * attacker rotate the header to dodge throttles or forge an allow-listed source.
 * On Vercel the platform injects the true connecting IP into
 * `x-vercel-forwarded-for` (and `x-real-ip`); these sit above any client XFF and
 * cannot be forged by the client. Prefer them; fall back to XFF only for
 * non-Vercel / local environments, where it must never be the trusted source in
 * production.
 */
export function getClientIp(headers: Headers): string {
  // Vercel-trusted, not client-forgeable.
  const vercelForwarded = headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const ip = vercelForwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  // Last resort (local dev / non-Vercel proxies): the leftmost XFF hop.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return "unknown";
}
