/** Security headers configuration (Phase 27 + Security Audit hardening) */

/**
 * Build the Content-Security-Policy directive string for a specific request,
 * bound to a per-request `nonce`.
 *
 * script-src uses `'nonce-<n>' 'strict-dynamic'` and NO `'unsafe-inline'`:
 * only the nonce'd bootstrap scripts (Next.js framework scripts — auto-nonced
 * when this header is present on the request — plus next-themes, which receives
 * the nonce explicitly) execute, and strict-dynamic lets those load their chunks
 * while still blocking any attacker-injected inline or src script. `'self'` is
 * intentionally omitted from script-src because strict-dynamic ignores it.
 *
 * style-src keeps `'unsafe-inline'` for now: Next/font and Tailwind inject inline
 * styles, and style injection is a much weaker vector than script injection.
 * `'unsafe-eval'` is added only in development for React Fast Refresh.
 */
export function getCspWithNonce(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.vercel-storage.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Return the static security headers for Next.js headers() config.
 *
 * Content-Security-Policy is intentionally NOT here — it is per-request
 * (nonce-bound) and set in middleware via getCspWithNonce(). Everything else is
 * request-independent and applied globally through next.config.
 */
export function getSecurityHeaders(): Array<{ key: string; value: string }> {
  return [
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    {
      // Disabled per OWASP guidance: modern browsers have removed XSS auditor;
      // CSP script-src provides equivalent (and superior) protection.
      key: "X-XSS-Protection",
      value: "0",
    },
    {
      key: "X-DNS-Prefetch-Control",
      value: "off",
    },
    {
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin",
    },
    {
      key: "Cross-Origin-Resource-Policy",
      value: "same-origin",
    },
  ];
}
