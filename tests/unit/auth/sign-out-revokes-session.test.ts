/**
 * EVERY sign-out control must revoke the session, not merely clear a cookie.
 *
 * WHAT WAS WRONG. Four components render a "Sign out". Three linked to the GET
 * route `/api/auth/logout`; the fourth — the Workbench user menu, the one on
 * /workbench, /sap-explorer, /presales, /affirm and /discovery — called
 * next-auth's `signOut()`.
 *
 * `signOut()` clears the NextAuth cookies and NOTHING ELSE. It never touches the
 * custom session cookie and never revokes the session row. The middleware
 * authenticates on `request.cookies.has(SESSION_COOKIE)`, so that surviving
 * cookie kept the user signed in — with a live server-side session — while the
 * UI said they had left. Pressing Sign out did not sign anyone out.
 *
 * StudioTopBar carried a comment explaining exactly why `signOut()` must not be
 * used. The reasoning was written down and the fix was applied in three places
 * out of four: the same "one fact in N places" shape this codebase keeps
 * finding, and the reason this check is mechanical rather than a comment.
 *
 * HOW IT WAS FOUND: a browser agent auditing the deployment reported that it
 * could not clear its own session to test the signed-out perimeter. Its
 * explanation of the evidence was wrong; the symptom was real.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

/**
 * Strip comments before scanning for code.
 *
 * WITHOUT THIS THE CHECK IS SELF-DEFEATING. Both StudioTopBar and the Workbench
 * menu explain in a comment that they must NOT call `signOut()` — and a raw
 * search for `signOut(` matches that explanation. The honest documentation of
 * the rule would fail the test enforcing it, and the only way to go green would
 * be to delete the reasoning. Scan code, not prose.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The one route that revokes the session row AND expires every cookie variant. */
const LOGOUT_ROUTE = "/api/auth/logout";

/**
 * Every tracked component that offers a sign-out, found by searching for the
 * user-visible label rather than by listing paths — a hardcoded list would go
 * stale the moment a fifth menu is added, which is the failure being prevented.
 */
function signOutComponents(): string[] {
  const out = execFileSync(
    "git",
    ["grep", "-l", "-E", "Sign out|signOut", "--", "src/components", "src/app"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => {
      const src = code(readFileSync(resolve(ROOT, f), "utf8"));
      // Only files that actually render a sign-out affordance, not ones that
      // merely mention the words in prose or a constant.
      return /Sign out|signOut\(/.test(src) && /<(a|button)\b/.test(src);
    });
}

describe("every sign-out control revokes the session", () => {
  it("finds the components that offer a sign-out", () => {
    const files = signOutComponents();
    // A guard on the guard: if the search silently matched nothing, every
    // assertion below would vacuously pass and the check would be worthless.
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it("NO component calls next-auth signOut() — it does not revoke the session row", () => {
    const offenders = signOutComponents().filter((f) => {
      const src = code(readFileSync(resolve(ROOT, f), "utf8"));
      return /\bsignOut\s*\(/.test(src) || /from ['"]next-auth\/react['"]/.test(src);
    });
    expect(
      offenders,
      `These call next-auth signOut(), which clears NextAuth cookies but leaves the ` +
        `custom session cookie and its server-side row intact — the user stays signed ` +
        `in. Link to ${LOGOUT_ROUTE} instead, as StudioTopBar does.`,
    ).toEqual([]);
  });

  it("every sign-out control points at the logout route", () => {
    for (const f of signOutComponents()) {
      // code(), not the raw file: a comment MENTIONING the route satisfied this
      // assertion while the component still called signOut(). Verified by
      // reintroducing the bug — this was the one check that stayed green.
      const src = code(readFileSync(resolve(ROOT, f), "utf8"));
      expect(src, `${f} offers a sign-out but never references ${LOGOUT_ROUTE}`).toContain(LOGOUT_ROUTE);
    }
  });

  it("the Workbench menu specifically — the one that was wrong", () => {
    const src = code(readFileSync(resolve(ROOT, "src/components/workbench/WorkbenchUserMenu.tsx"), "utf8"));
    expect(src).toContain(LOGOUT_ROUTE);
    expect(src).not.toMatch(/\bsignOut\s*\(/);
  });
});

describe("the logout route still does both halves of the job", () => {
  const src = code(readFileSync(resolve(ROOT, "src/app/api/auth/logout/route.ts"), "utf8"));

  it("revokes the server-side session row", () => {
    // Clearing cookies alone would leave a live session that any recovered
    // cookie could resume.
    expect(src).toMatch(/revokeSession\s*\(/);
  });

  it("clears the custom session cookie, not only the NextAuth ones", () => {
    expect(src).toMatch(/SESSION_COOKIE_NAME/);
    expect(src).toMatch(/maxAge:\s*0/);
  });
});
