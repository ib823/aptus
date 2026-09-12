import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/pwa/security-headers";

const nextConfig: NextConfig = {
  transpilePackages: [],
  // /help/developer-guide reads this file at request time; without the trace
  // it exists in the repo and not in the deployed function, and the page's
  // fallback would report the document unreadable on every production request.
  outputFileTracingIncludes: {
    "/help/developer-guide": ["./docs/coreedge-developer-guide.md"],
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      // The tenant-scope guard (lib/db/tenant-guard) uses AsyncLocalStorage to
      // carry declared cross-tenant contexts. Several client components import
      // modules that transitively reach lib/db/prisma (a long-standing pattern
      // that works because @prisma/client ships a browser stub); async_hooks
      // has no browser build, so it resolves to an empty module on the client
      // and the guard degrades to inert there — where no query ever runs.
      config.resolve.fallback = { ...config.resolve.fallback, async_hooks: false };
    }
    return config;
  },
  serverExternalPackages: [
    "exceljs",
    "mammoth",
    "adm-zip",
    "nodemailer",
    "web-push",
    "jspdf",
    "pptxgenjs",
    "archiver",
    "sanitize-html",
    "sharp",
    "@prisma/client",
    "prisma",
    "@sentry/nextjs",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: getSecurityHeaders(),
      },
      {
        // Presales external route group. Per locked decision: never cache
        // the guest-rendered HTML (signed PDF + IP-bearing fields cannot
        // sit in a proxy), and strip the Referer so client URLs do not
        // leak the grant token to upstream analytics or CDN logs.
        source: "/c/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // Affirm external executive guest surface. Same locked-decision
        // hardening as /c: never cache guest-rendered HTML, and strip the
        // Referer so the grant token in /a/[token] URLs never leaks to CDN or
        // analytics logs.
        source: "/a/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
