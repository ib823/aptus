import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/pwa/security-headers";

/*
 * IS THIS BUILD A CUSTOMER-FACING PRODUCTION DEPLOY?
 *
 * Same test as scripts/check-production-env.js, deliberately: on Vercel only
 * the production environment is production, and Preview deployments legitimately
 * carry the internal-testing surfaces. Off Vercel, NODE_ENV decides.
 */
const isProductionDeploy = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === "production"
  : process.env.NODE_ENV === "production";

/*
 * THE INTERNAL-TESTING AUTH SURFACES ARE NOT COMPILED INTO A PRODUCTION BUILD.
 *
 * /api/auth/test-login and /dev-login mint a real session for a test user. They
 * were protected by four runtime env gates and a secret, which is a good set of
 * gates and still the wrong shape: every one of them is a condition evaluated by
 * code that is present and reachable in the production bundle, so the whole
 * backdoor hinges on four environment variables staying unset. One of them set
 * by mistake — or set deliberately for an internal test deploy and never
 * unset — and the only thing between the internet and a platform_admin session
 * is E2E_TEST_SECRET.
 *
 * Naming those files `route.e2e.ts` / `page.e2e.tsx` and listing the `e2e.*`
 * extensions only for non-production builds makes them absent rather than
 * disabled: on a production deploy Next does not treat them as routes at all,
 * the paths 404 from the router, and no env var can bring them back. The
 * runtime gates stay exactly where they are — they are what protects a Preview
 * deployment, which does compile them.
 *
 * Ordered before the defaults so an `e2e` file wins if both ever exist; the
 * default list is restated because setting this option replaces it.
 */
const PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];
const TEST_AUTH_PAGE_EXTENSIONS = ["e2e.tsx", "e2e.ts"];

const nextConfig: NextConfig = {
  transpilePackages: [],
  pageExtensions: isProductionDeploy
    ? PAGE_EXTENSIONS
    : [...TEST_AUTH_PAGE_EXTENSIONS, ...PAGE_EXTENSIONS],
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
