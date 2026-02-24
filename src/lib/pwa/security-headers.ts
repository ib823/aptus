/** Security headers configuration (Phase 27 + Security Audit hardening) */

/**
 * Build the Content-Security-Policy directive string.
 */
export function getCspDirectives(): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // 'unsafe-inline' needed for Next.js inline scripts; 'unsafe-eval' only in dev (HMR)
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
      key: "X-XSS-Protection",
      value: "1; mode=block",
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
