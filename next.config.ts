import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/pwa/security-headers";

/** The Contract Compiler's worker chunk (lib/contracts/envelope.ts: its webpackChunkName). */
const CONTRACT_WORKER_CHUNK = "contract-compiler-worker";

/**
 * THE CONTRACT COMPILER'S WORKER IS ONE SELF-CONTAINED CHUNK (structural
 * hardening round 3). Next splits every module two server chunks share into
 * a chunk of its own (splitChunks: chunks "all", minChunks 2), and the
 * worker's chunk then began with `require("./96351.js")` — the northbound
 * error catalogue openapi.ts uses. A deployed function carries only the
 * files its trace lists: the routes that import that catalogue themselves
 * had the companion chunk, capture-schema did not, and every sampled
 * contract there ended UNAVAILABLE (MODULE_NOT_FOUND) on Vercel, while
 * `next start` (the whole .next directory) worked. Keeping the worker out of
 * the split leaves nothing for it to load but itself and Node's built-ins, so
 * tracing the one chunk (outputFileTracingIncludes, below) is tracing all of
 * it — whatever it comes to import. scripts/check-runtime-assets.mjs --built
 * starts the worker from a copy of each spawning route's trace and fails the
 * build when it cannot.
 */
function keepContractWorkerWhole(config: { optimization?: { splitChunks?: unknown } }): void {
  const split = config.optimization?.splitChunks;
  if (!split || typeof split !== "object") return;
  const s = split as { chunks?: unknown };
  const chunks = s.chunks ?? "async";
  const included = (chunk: { name?: string | null; canBeInitial(): boolean }): boolean =>
    chunks === "all" ? true : chunks === "initial" ? chunk.canBeInitial() : chunks === "async" ? !chunk.canBeInitial() : typeof chunks === "function" ? Boolean((chunks as (c: unknown) => unknown)(chunk)) : true;
  s.chunks = (chunk: { name?: string | null; canBeInitial(): boolean }) => chunk.name !== CONTRACT_WORKER_CHUNK && included(chunk);
}

const nextConfig: NextConfig = {
  transpilePackages: [],
  /*
   * THE BUILD NO LONGER TYPE-CHECKS OR LINTS, because two stricter gates
   * already do and the third copy was what ran the deploy out of memory.
   *
   * Measured on this repo, peak non-cache memory for a full `next build`:
   *
   *   main, as it was                               7422 MiB
   *   with build-time ESLint off                    6652 MiB   (−100)
   *   with build-time ESLint AND type-check off     5061 MiB   (−1600)
   *
   * Vercel's build container is 2 cores / 8 GB. At ~7.4 GB the deploy was a
   * coin flip, and on 2026-09-13 it came up tails: exit 137, SIGKILL, during
   * "Linting and checking validity of types". Not a type error — an OOM kill
   * while checking types that had already passed twice in CI.
   *
   * WHAT STILL CHECKS, and it is more than before:
   *   - CI Quality Gates: `pnpm typecheck:strict` (tsc --noEmit --strict) and
   *     `pnpm lint:strict` (--max-warnings 0), each a separate failing step,
   *     both stricter than what `next build` ran.
   *   - The pre-push hook, which now runs those two scripts instead of a build.
   *   - The editor, continuously.
   *
   * WHAT NO LONGER CHECKS: the deploy. That is the deliberate trade. A build
   * that fails on a type error is a slower, more expensive way to learn what
   * the three gates above already told you — and here it was not even failing
   * on type errors.
   */
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // /help/developer-guide reads this file at request time; without the trace
  // it exists in the repo and not in the deployed function, and the page's
  // fallback would report the document unreadable on every production request.
  outputFileTracingIncludes: {
    "/help/developer-guide": ["./docs/coreedge-developer-guide.md"],
    /*
     * The Contract Compiler runs in a worker thread (lib/contracts/envelope.ts),
     * which webpack emits as its own, named chunk. A worker chunk is not part
     * of the route's chunk graph, so the trace left it out, and a deployed
     * function would have no compiler: every verify answered as if the
     * description could not be compiled. Each route that spawns it carries it.
     * scripts/check-runtime-assets.mjs --built fails the build if any of
     * their traces lacks it. GET /schema never spawns it, so it carries none.
     */
    "/api/studio/interfaces/[id]/verify-service": ["./.next/server/chunks/contract-compiler-worker.js"],
    "/api/studio/interfaces/[id]/capture-schema": ["./.next/server/chunks/contract-compiler-worker.js"],
    "/api/studio/interfaces/[id]/capture-fixture": ["./.next/server/chunks/contract-compiler-worker.js"],
    "/api/studio/interfaces/[id]/scaffold": ["./.next/server/chunks/contract-compiler-worker.js"],
    "/api/studio/solutions/[id]/openapi": ["./.next/server/chunks/contract-compiler-worker.js"],
  },
  webpack(config, { isServer, dev }) {
    if (isServer && !dev) keepContractWorkerWhole(config);
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
