/**
 * A gated page must not be readable as an RSC flight request.
 *
 * THE DEFECT. `(help)/layout.tsx` calls getCurrentUser() and redirect(), and a
 * document request to /help answers 307 — which is what was verified, by curl,
 * and declared closed. An RSC FLIGHT REQUEST answers 200, with a payload that
 * contains both a NEXT_REDIRECT instruction and THE FULLY RENDERED PAGE:
 *
 *     curl -H 'RSC: 1' https://…/help/control-tower/grants
 *     -> 200, text/x-component, 14869 bytes containing
 *        "What this screen will not tell you",
 *        "Platform Admin, Partner Lead",
 *        "no revocation in this release"
 *
 * A browser follows the redirect and shows nothing. Anything that reads the body
 * gets the manual — including the authorization roster, the missing revocation
 * capability, and a named unfixed defect.
 *
 * WHY THIS PAGE AND NOT THE CONSOLE SCREENS, which use the same layout pattern
 * and do NOT leak: their content requires a database round trip that never
 * happens once the layout redirects, so their flight payload is a ~9KB shell.
 * The manual renders from CONSTANTS WITH NO I/O, so it finishes rendering before
 * the redirect can matter. The property that made it cheap to serve is exactly
 * what exposed it — and "costs nothing: the pages render from constants with no
 * I/O" was written as a VIRTUE in the commit that introduced the gate.
 *
 * HOW IT WAS FOUND. A test agent was handed a baseline asserting "/help -> 307,
 * ANY 200 is a BLOCKER", observed a 200, and reported it as UNVERIFIED rather
 * than assuming the baseline was right or that its own observation was wrong.
 * The baseline was mine and it was wrong. That is §2.11 of the test protocol —
 * treat the document you were given as claims to test — working on the document
 * itself.
 *
 * So the gate belongs in middleware, the only place that runs before anything is
 * rendered or serialised. The layout keeps its own check: middleware can detect
 * a session cookie but not verify it, and defence in depth is the point.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { stripSource } from "../../helpers/source";

const MIDDLEWARE = stripSource(
  readFileSync(resolve(__dirname, "../../../src/middleware.ts"), "utf8"),
  "comments",
);

describe("/help is refused before it can be rendered", () => {
  it("middleware, not only the layout, gates it", () => {
    expect(
      MIDDLEWARE.includes("'/help'") || MIDDLEWARE.includes('"/help"'),
      "middleware must handle /help itself — a layout redirect still emits the " +
        "rendered page into the RSC flight payload, which anything reading the " +
        "body can keep",
    ).toBe(true);
  });

  it("covers the sub-pages, not just the index", () => {
    // /help/control-tower/grants is where the roster and the known defects are.
    expect(MIDDLEWARE).toMatch(/startsWith\(\s*['"]\/help\//);
  });

  it("redirects rather than rendering — a 200 with a redirect inside is a leak", () => {
    const near = MIDDLEWARE.slice(
      Math.max(0, MIDDLEWARE.indexOf("/help") - 200),
      MIDDLEWARE.indexOf("/help") + 800,
    );
    expect(near).toContain("NextResponse.redirect");
    expect(near).toContain("presales/login");
  });

  it("decides on a session, not on a role — the manual is deliberately not role-gated", () => {
    const near = MIDDLEWARE.slice(
      MIDDLEWARE.indexOf("/help") - 200,
      MIDDLEWARE.indexOf("/help") + 800,
    );
    expect(near).toContain("SESSION_COOKIE");
    // Someone refused a workspace must still be able to read what it is for.
    expect(near).not.toMatch(/canAccess|role ===|isAdminRole/);
  });
});

describe("the layout keeps its own check", () => {
  it("still resolves a user and redirects", () => {
    // Defence in depth: middleware can DETECT a session cookie but cannot verify
    // it. A forged or expired cookie passes middleware and must still be refused
    // by the layout, which does the real lookup.
    const layout = readFileSync(
      resolve(__dirname, "../../../src/app/(help)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("getCurrentUser");
    expect(layout).toContain("redirect(");
  });
});
