/**
 * The pages the Workbench surfaces SEND PEOPLE TO must themselves be reachable.
 *
 * The allow-list test pins the surfaces. It did not pin their prerequisites,
 * and three of them were stranded on a Workbench host: the Console layouts
 * redirect an MFA-required user to /verify-mfa and a passkey-less user to
 * /settings/security, invitation emails link to /invitations/<token>, and the
 * presales sign-off links to /verify/<token>. Each was redirected to /workbench
 * before it rendered, so an organization with mfaPolicy=required could not
 * enter the Console at all.
 *
 * This reads the redirect targets OUT OF THE LAYOUTS rather than listing them
 * by hand, so the next layout that redirects somewhere new fails here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isWorkbenchPath } from "@/lib/routing/workbench-paths";
import { stripSource } from "../../helpers/source";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => stripSource(readFileSync(resolve(ROOT, p), "utf8"), "comments");

const CONSOLE_LAYOUTS = [
  "src/app/(studio)/layout.tsx",
  "src/app/(operations)/layout.tsx",
  "src/app/(control-tower)/layout.tsx",
];

describe("Workbench prerequisite pages are reachable on a Workbench host", () => {
  it.each(["/verify-mfa", "/settings/security", "/invitations/abc", "/verify/abc"])(
    "%s is allow-listed",
    (p) => {
      expect(isWorkbenchPath(p), `${p} must be reachable`).toBe(true);
    },
  );

  it.each(CONSOLE_LAYOUTS)("every redirect target in %s is allow-listed", (file) => {
    const src = read(file);
    const targets = [...src.matchAll(/redirect\(\s*[`"']([^`"'?]+)/g)].map((m) => m[1]!);
    expect(targets.length, "the layout should redirect somewhere").toBeGreaterThan(0);
    for (const t of targets) {
      // Template literals may embed a callback — the leading path is what the
      // gate sees.
      const pathOnly = t.replace(/\$\{.*$/, "");
      if (!pathOnly.startsWith("/")) continue;
      expect(isWorkbenchPath(pathOnly), `${file} redirects to ${pathOnly}, which the gate would bounce`).toBe(true);
    }
  });

  it("still excludes the rest of the portal settings", () => {
    // Adding /settings/security must not open the whole settings tree.
    expect(isWorkbenchPath("/settings")).toBe(false);
    expect(isWorkbenchPath("/settings/profile")).toBe(false);
  });
});
