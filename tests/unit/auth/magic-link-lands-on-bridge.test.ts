/**
 * Every magic-link sign-in surface routes through /api/auth/bridge.
 *
 * WHY THIS IS A TEST AND NOT A CONVENTION. This app runs two session systems:
 * NextAuth mints a JWT and is used only for the magic-link flow and user
 * creation, while every auth-gated surface reads the custom `abeam-session`
 * cookie. `GET /api/auth/bridge` is the ONLY thing that mints that cookie.
 *
 * The Workbench sign-in form sent `callbackUrl: '/presales'` and so skipped the
 * bridge. The consequence was invisible from the code and brutal in production:
 * the emailed link verified, NextAuth redirected to /presales, nothing held an
 * abeam-session, and the user was bounced back to the sign-in page. A correct
 * sign-in and a rejected one looked identical — no error, no log, no clue.
 *
 * The middleware has a safety net for exactly this (it redirects a request that
 * carries a NextAuth cookie but no custom session to the bridge), and it did not
 * save us. A safety net is not a reason to aim badly.
 *
 * SOURCE-LEVEL on purpose. The failure is a string in a call site, not a
 * behaviour a render test would reach.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Every client entry point that starts an email sign-in. */
const SIGN_IN_SURFACES = [
  "src/app/(workbench-public)/presales/login/WorkbenchLoginForm.tsx",
  "src/app/(auth)/login/page.tsx",
] as const;

const BRIDGE_PATH = "/api/auth/bridge";

function source(file: string): string {
  return readFileSync(path.resolve(ROOT, file), "utf8");
}

/** Strips comments, so prose describing the rule cannot satisfy the rule. */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("every email sign-in call sends the user through the bridge", () => {
  it.each(SIGN_IN_SURFACES)("%s names the bridge in executable code", (file) => {
    expect(
      code(file).includes(BRIDGE_PATH),
      `${file} starts a magic-link sign-in without routing through ${BRIDGE_PATH}. ` +
        `NextAuth's JWT is not a session here — the abeam-session cookie is, and only ` +
        `the bridge mints it. Without it the link verifies and the user is bounced ` +
        `back to the sign-in page with no error and no log.`,
    ).toBe(true);
  });

  it.each(SIGN_IN_SURFACES)("%s never passes a bare app path as callbackUrl", (file) => {
    /*
     * The exact shape of the bug: callbackUrl: '/presales'. Any callbackUrl that
     * is a bare in-app path skips the bridge. A callbackUrl nested INSIDE the
     * bridge query string is the correct form and must not trip this.
     */
    const src = code(file);
    const bare = [...src.matchAll(/callbackUrl:\s*['"`]([^'"`]+)['"`]/g)]
      .map((m) => m[1] ?? "")
      .filter((value) => !value.startsWith(BRIDGE_PATH));

    expect(
      bare,
      `${file} passes a callbackUrl that bypasses the bridge: ${bare.join(", ")}`,
    ).toEqual([]);
  });
});

describe("the bridge is reachable", () => {
  it("exists as a route, so the callbackUrl is not pointing at a 404", () => {
    // The callbackUrl above is a string; nothing type-checks it against the
    // filesystem. If the route is ever moved, this fails instead of production.
    expect(() => source("src/app/api/auth/bridge/route.ts")).not.toThrow();
  });

  it("is exempt from the Workbench-only gate, like every other /api/ path", () => {
    /*
     * WORKBENCH_ONLY redirects page routes outside WORKBENCH_PATHS before auth
     * runs. The gate has silently swallowed four surfaces in this repo's
     * history; the bridge survives it only because middleware exempts /api/.
     */
    expect(code("src/middleware.ts")).toContain("pathname.startsWith('/api/')");
  });
});
