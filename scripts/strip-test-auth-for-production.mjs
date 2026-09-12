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
 * ON EVERY PRODUCTION BUILD PIPELINE, NOT ONLY VERCEL'S. This used to require
 * `VERCEL=1`, so a Docker image, a self-hosted runner or any other pipeline
 * producing a production build shipped both endpoints and rested entirely on four
 * environment variables staying unset. The condition that actually matters is not
 * which host is building but whether the checkout is DISPOSABLE — see
 * `isDisposableCheckout`.
 *
 * A CONTRIBUTOR'S MACHINE IS STILL NEVER TOUCHED. `next build` sets
 * NODE_ENV=production locally too, and deleting source files from somebody's
 * working tree would be a worse failure than the one this prevents. There the
 * script reports and exits, and the runtime gates are the protection — which
 * since audit E14 include the deploy-time acknowledgement
 * (INTERNAL_TEST_DEPLOYMENT), checked at runtime and not only at build time, so a
 * variable set after the build can no longer open either endpoint on its own.
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
 * Is this a BUILD PIPELINE of any kind, as opposed to a contributor's machine?
 *
 * WHY THIS EXISTS (audit E14). The removal used to require `VERCEL=1`, so the
 * only production build these surfaces were stripped from was Vercel's. Every
 * other way of producing a production build — a Docker image, a self-hosted
 * runner, a GitHub Actions job that deploys somewhere else — shipped both
 * session-minting endpoints and relied entirely on four environment variables
 * staying unset. "Only on Vercel" was never the rule anyone wanted; it was the
 * consequence of Vercel being the only pipeline that existed when this was
 * written.
 *
 * THE DISTINCTION THAT ACTUALLY MATTERS is not which host is building, it is
 * whether the checkout is disposable. Deleting source files from a contributor's
 * working tree is a worse failure than the one this prevents, and that reasoning
 * still holds — so the test is "a pipeline built this checkout", which every CI
 * system on the market declares through `CI`, plus the named hosts, plus an
 * explicit opt-in for a pipeline that declares neither.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function isDisposableCheckout(env = process.env) {
  return (
    env.VERCEL === "1" ||
    env.CI === "true" ||
    env.CI === "1" ||
    env.NETLIFY === "true" ||
    env.RENDER === "true" ||
    Boolean(env.FLY_APP_NAME) ||
    Boolean(env.GITHUB_ACTIONS) ||
    // The escape hatch for a pipeline that declares none of the above — a plain
    // `docker build`, for instance. Named for what it does, so nobody sets it by
    // accident on a machine they care about.
    env.STRIP_TEST_AUTH === "1"
  );
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
  const pipeline = isDisposableCheckout(env);
  if (!production) {
    return { act: false, reason: "not-production", production, vercel, pipeline };
  }
  if (!pipeline) {
    // A production build in somebody's checkout — `next build` sets
    // NODE_ENV=production, so this is the ordinary local case, not a deploy.
    // Nothing is deleted from a working tree; the runtime gates hold here, and
    // since audit E14 they include the deploy-time acknowledgement
    // (INTERNAL_TEST_DEPLOYMENT) rather than a single feature flag.
    return { act: false, reason: "not-a-pipeline", production, vercel, pipeline };
  }
  return { act: true, reason: "production-pipeline-build", production, vercel, pipeline };
}

function main() {
  const plan = planRemoval();

  if (!plan.act) {
    const why =
      plan.reason === "not-production"
        ? `VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"} / NODE_ENV=${process.env.NODE_ENV ?? "(unset)"} — not a production deploy`
        : "not a build pipeline (no CI / VERCEL / GITHUB_ACTIONS / STRIP_TEST_AUTH=1); a local build must not delete files from your checkout";
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
