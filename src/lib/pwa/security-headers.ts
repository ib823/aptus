/** Security headers configuration (Phase 27) */

/**
 * Build the Content-Security-Policy directive string.
 */
export function getCspDirectives(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
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
      key: "X-XSS-Protection",
      value: "1; mode=block",
    },
  ];
}
