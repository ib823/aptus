// @vitest-environment node
/**
 * SEC-02 — the internal-testing sign-in surfaces are ABSENT from a production
 * build, not disabled inside one.
 *
 * /api/auth/test-login and /dev-login mint a real session for a test user.
 * They are protected by four runtime environment gates, a secret, a minimum
 * secret length and an optional IP allow-list — a good set of gates, and still
 * the wrong shape: every one of them is a condition evaluated by code that is
 * present and reachable in the production bundle. The whole backdoor therefore
 * rests on four environment variables staying unset, and one of them set by
 * mistake — or set deliberately for an internal test deploy and never unset —
 * leaves E2E_TEST_SECRET as the only thing between the internet and a
 * platform_admin session.
 *
 * THE MECHANISM, AND THE ONE THAT DID NOT WORK. The first attempt renamed the
 * files to `route.e2e.ts` / `page.e2e.tsx` and listed the `e2e.*` extensions in
 * next.config only for non-production builds. `next build` accepted that
 * happily, at both VERCEL_ENV values, on a machine and in CI — and Vercel
 * rejected it: a route reached through a dotted page extension is emitted
 * WITHOUT its `route_client-reference-manifest.js`, and Vercel's post-build
 * tracing step (which runs AFTER `next build`, so no local build exercises it)
 * died with ENOENT on that file. The giveaway in the build log was both routes
 * listed at 0 B.
 *
 * So the exclusion happens one step earlier instead: the files keep ordinary
 * names, and scripts/strip-test-auth-for-production.mjs deletes their
 * directories from the build workspace before `next build` runs. Next never
 * discovers them, nothing unusual reaches the bundler, and nothing unusual
 * reaches Vercel's tracer.
 *
 * These tests pin the DECISION and the WIRING rather than the intention,
 * because both are exactly the kind of thing a later refactor undoes without
 * noticing — and every runtime gate would still pass its own tests afterwards.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isProductionDeploy,
  isVercelBuild,
  planRemoval,
  TEST_AUTH_DIRS,
} from "../../../scripts/strip-test-auth-for-production.mjs";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("the surfaces it covers", () => {
  it("names every session-minting directory, and they exist", () => {
    /*
     * verify-izzat was missing from this list and therefore from the exact-match
     * assertion that would have caught it: the test asserted the list was
     * exactly the two surfaces the list happened to contain, so it agreed with
     * the omission. Any surface that can mint a session belongs here.
     */
    expect([...TEST_AUTH_DIRS].sort()).toEqual([
      "src/app/(auth)/dev-login",
      "src/app/api/auth/test-login",
      "src/app/api/auth/verify-izzat",
    ]);
    for (const dir of TEST_AUTH_DIRS) {
      expect(existsSync(join(ROOT, dir)), dir).toBe(true);
    }
  });

  it("keeps ORDINARY file names — a dotted page extension is what broke Vercel", () => {
    expect(existsSync(join(ROOT, "src/app/api/auth/test-login/route.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/(auth)/dev-login/page.tsx"))).toBe(true);
    for (const f of [
      "src/app/api/auth/test-login/route.e2e.ts",
      "src/app/(auth)/dev-login/page.e2e.tsx",
    ]) {
      expect(existsSync(join(ROOT, f)), f).toBe(false);
    }
    // And next.config must not carry the extension list that caused the ENOENT.
    expect(read("next.config.ts")).not.toContain("pageExtensions");
  });
});

describe("when the deletion happens", () => {
  it("acts on a Vercel PRODUCTION deploy — the case this exists for", () => {
    const plan = planRemoval({ VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" });
    expect(plan.act).toBe(true);
    // Renamed from "production-vercel-build" when the rule widened past Vercel
    // (audit E14): every production PIPELINE strips these now, not only this one.
    // See backdoor-audit-and-production.test.ts for the pipelines it recognises.
    expect(plan.reason).toBe("production-pipeline-build");
  });

  it("leaves a Preview deploy alone — that is what the E2E suite runs against", () => {
    const plan = planRemoval({ VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(plan.act).toBe(false);
    expect(plan.reason).toBe("not-production");
  });

  /*
   * `next build` sets NODE_ENV=production itself, so an ordinary local build
   * looks like production. Deleting a contributor's source files would be a
   * worse failure than the one this prevents, so it reports instead.
   */
  it("never deletes from a checkout, even when NODE_ENV says production", () => {
    const plan = planRemoval({ VERCEL_ENV: undefined, NODE_ENV: "production" });
    expect(plan.act).toBe(false);
    // "not-vercel" became "not-a-pipeline": the distinction that matters was
    // never which host is building, it is whether the checkout is disposable.
    expect(plan.reason).toBe("not-a-pipeline");
  });

  it("leaves development alone", () => {
    expect(planRemoval({ NODE_ENV: "development" }).act).toBe(false);
  });

  it("reads the two environment signals the way the rest of the build does", () => {
    expect(isProductionDeploy({ VERCEL_ENV: "production" })).toBe(true);
    // VERCEL_ENV wins when present — a Preview deploy is not production even
    // though its NODE_ENV is.
    expect(isProductionDeploy({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(isProductionDeploy({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionDeploy({ NODE_ENV: "development" })).toBe(false);
    expect(isVercelBuild({ VERCEL: "1" })).toBe(true);
    expect(isVercelBuild({})).toBe(false);
  });

  it("decides 'production' the same way the env checker does", () => {
    // Two different answers to that question is how a surface ends up excluded
    // from a build whose env check permitted it, or the reverse.
    const script = read("scripts/strip-test-auth-for-production.mjs");
    const check = read("scripts/check-production-env.js");
    for (const src of [script, check]) {
      expect(src).toContain('VERCEL_ENV === "production"');
      expect(src).toContain('NODE_ENV === "production"');
    }
  });
});

describe("the build actually runs it", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

  it("vercel-build strips BEFORE next build — after is too late", () => {
    const cmd = pkg.scripts["vercel-build"]!;
    expect(cmd).toContain("scripts/strip-test-auth-for-production.mjs");
    expect(cmd.indexOf("strip-test-auth-for-production")).toBeLessThan(cmd.indexOf("next build"));
  });

  it("and fails the build if a deletion does not take", () => {
    const script = read("scripts/strip-test-auth-for-production.mjs");
    expect(script).toContain("Refusing to continue");
    expect(script).toContain("process.exit(1)");
  });
});

describe("the runtime gates stay — they are what protects a Preview deployment", () => {
  const route = read("src/app/api/auth/test-login/route.ts");

  it("still requires the flag, the non-production check, the secret and its length", () => {
    expect(route).toContain('process.env.ENABLE_TEST_LOGIN_ENDPOINT !== "true"');
    expect(route).toContain('process.env.ALLOW_TEST_LOGIN_IN_PROD !== "true"');
    expect(route).toContain("const secret = process.env.E2E_TEST_SECRET");
    expect(route).toContain("secret.length < 24");
    expect(route).toContain("timingSafeEqual");
  });

  /*
   * The role went into User.role unvalidated, so the secret holder could write
   * any string at all. A role nobody's permission table knows is not a harmless
   * typo — every role comparison in the product fails against it and the
   * resulting session is one no screen can reason about.
   */
  it("validates the requested role against the real vocabulary", () => {
    expect(route).toContain("ALL_USER_ROLES");
    expect(route).toContain("includes(requestedRole)");
    expect(route).not.toContain("const role = body.role ?? TEST_USER_ROLE;");
  });
});
