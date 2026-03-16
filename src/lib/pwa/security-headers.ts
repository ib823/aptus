/** Security headers configuration (Phase 27 + Security Audit hardening) */

/**
 * Build the Content-Security-Policy directive string.
 *
 * Note on 'unsafe-inline': Next.js App Router injects inline scripts for
 * hydration and route prefetching. Until Next.js supports nonce-based CSP
 * in the App Router (tracked upstream), 'unsafe-inline' is required.
 *
 * DO NOT add 'strict-dynamic' without also implementing nonce-based scripts.
 * Per CSP Level 3, 'strict-dynamic' causes 'self' and 'unsafe-inline' to be
 * ignored — which blocks ALL scripts and breaks React hydration entirely.
 */
export function getCspDirectives(): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://api.qrserver.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.qrserver.com https://*.vercel-storage.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Return the full set of security headers for Next.js headers() config.
 */
export function getSecurityHeaders(): Array<{ key: string; value: string }> {
  return [
    {
      key: "Content-Security-Policy",
      value: getCspDirectives(),
    },
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
