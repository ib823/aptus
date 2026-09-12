#!/usr/bin/env node
/**
 * SEC-02 — remove the internal-testing sign-in surfaces from a CUSTOMER-FACING
 * PRODUCTION BUILD, before `next build` ever sees them.
 *
 * WHAT THESE ARE. `/api/auth/test-login` and `/dev-login` mint a real session
 * for a test user. They are protected by four runtime environment gates, a
 * secret, a minimum secret length and an optional IP allow-list. Those are good
 * gates and still the wrong shape: every one of them is a condition evaluated by
 * code that is PRESENT AND REACHABLE in the production bundle, so the whole
 * backdoor rests on four environment variables staying unset. One of them set by
 * mistake — or set deliberately for an internal test deploy and never unset —
 * and E2E_TEST_SECRET is the only thing between the internet and a
 * platform_admin session.
 *
 * WHY A DELETION AND NOT `pageExtensions`. The first attempt named the files
 * `route.e2e.ts` / `page.e2e.tsx` and listed the `e2e.*` extensions in
 * next.config only for non-production builds. It worked in `next build` and
 * broke Vercel: a route reached via a dotted page extension is emitted WITHOUT
 * its `route_client-reference-manifest.js`, and Vercel's post-build tracing step
 * — which runs after `next build`, so no local build exercises it — fails with
 *
 *   ENOENT: no such file or directory, lstat
 *   '.next/server/app/api/auth/test-login/route_client-reference-manifest.js'
 *
 * The files keep their ordinary names now, and the exclusion happens one step
 * earlier: they are deleted from the build workspace, so Next never discovers
 * them, the router has no such paths, and no environment variable can bring
 * them back. Nothing unusual reaches the bundler, so nothing unusual reaches
 * Vercel's tracer either.
 *
 * ONLY ON VERCEL, AND ONLY IN PRODUCTION. A build off Vercel is somebody's
 * checkout: deleting source files there would be a worse failure than the one
 * this prevents, so the script reports and exits instead. The runtime gates
 * remain the protection everywhere this does not act — Preview deployments
 * included, which is what the E2E suite needs.
 */

import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every directory whose only purpose is signing in without real credentials. */
export const TEST_AUTH_DIRS = [
  "src/app/api/auth/test-login",
  "src/app/(auth)/dev-login",
];

/**
 * Same test as scripts/check-production-env.js and nothing else, deliberately:
 * two different answers to "is this production" is how a surface ends up
 * excluded from a build whose env check permitted it, or the reverse.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function isProductionDeploy(env = process.env) {
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
}

/**
 * Is this the Vercel builder, as opposed to a contributor's machine or CI?
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function isVercelBuild(env = process.env) {
  return env.VERCEL === "1";
}

/**
 * What this script would do for a given environment — exported so the decision
 * is testable without deleting anything.
 *
 * `act` is the only output that matters: true means the directories go.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function planRemoval(env = process.env) {
  const production = isProductionDeploy(env);
  const vercel = isVercelBuild(env);
  if (!production) {
    return { act: false, reason: "not-production", production, vercel };
  }
  if (!vercel) {
    // A production build in a checkout — `next build` sets NODE_ENV=production,
    // so this is the ordinary local case, not a deploy.
    return { act: false, reason: "not-vercel", production, vercel };
  }
  return { act: true, reason: "production-vercel-build", production, vercel };
}

function main() {
  const plan = planRemoval();

  if (!plan.act) {
    const why =
      plan.reason === "not-production"
        ? `VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"} / NODE_ENV=${process.env.NODE_ENV ?? "(unset)"} — not a production deploy`
        : "not the Vercel builder; a local build must not delete files from your checkout";
    console.log(`[strip-test-auth] Keeping the internal-testing sign-in surfaces: ${why}.`);
    console.log(`[strip-test-auth] Their runtime environment gates are the protection here.`);
    return;
  }

  for (const dir of TEST_AUTH_DIRS) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) {
      console.log(`[strip-test-auth] ${dir} is already absent.`);
      continue;
    }
    rmSync(full, { recursive: true, force: true });
    if (existsSync(full)) {
      // Fail the build rather than ship a production bundle that still carries
      // a session-minting endpoint. A deletion that silently did not happen is
      // the one outcome worse than not trying.
      console.error(`[strip-test-auth] FAILED to remove ${dir}. Refusing to continue.`);
      process.exit(1);
    }
    console.log(`[strip-test-auth] Removed ${dir} from this production build.`);
  }
}

// Only when run as the script, so the exports above stay importable by tests.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
