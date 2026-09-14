import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DISABLED_REASONS, EMPTY_STATES, SCREEN_NOTES, CONFIRMATIONS } from "@/lib/coreedge/copy";

const ROOT = path.resolve(__dirname, "../../..");

function source(rel: string): string {
  return readFileSync(path.resolve(ROOT, rel), "utf8");
}

/** Comments describe intent; assertions about code must not match them. */
function code(rel: string): string {
  return source(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const SCREENS = {
  catalogue: "src/app/(coreedge)/coreedge/catalogue/page.tsx",
  passport: "src/app/(coreedge)/coreedge/passport/page.tsx",
  sapSystems: "src/app/(coreedge)/coreedge/sap-systems/page.tsx",
  sapSystemDetail: "src/app/(coreedge)/coreedge/sap-systems/[id]/page.tsx",
  keys: "src/app/(coreedge)/coreedge/operations/keys/page.tsx",
  addFeed: "src/app/(coreedge)/coreedge/apps/[app]/add-feed/page.tsx",
  appSettings: "src/app/(coreedge)/coreedge/apps/[app]/settings/page.tsx",
} as const;

describe("PR-6 · the seven remaining screens exist", () => {
  it("every route in the handoff's screen list is now a page", () => {
    for (const [name, rel] of Object.entries(SCREENS)) {
      expect(source(rel), `${name} should be a real page`).toContain("export default");
    }
  });

  it("none of them is still the not-built-yet stub", () => {
    for (const [name, rel] of Object.entries(SCREENS)) {
      expect(source(rel), `${name} still reads as a stub`).not.toContain("is not built yet");
    }
  });
});

describe("PR-6 · role gating never redirects", () => {
  /**
   * The contract is that every /coreedge route renders for every signed-in
   * user, and only the actions change. A redirect on role would teach the wrong
   * mental model; the only redirect allowed is the session gate.
   */
  it("redirects only anonymous callers, never on a role", () => {
    for (const [name, rel] of Object.entries(SCREENS)) {
      const body = code(rel);
      const redirects = [...body.matchAll(/redirect\((.*?)\)/g)].map((m) => m[1]);
      for (const target of redirects) {
        expect(target, `${name} redirects somewhere other than the login gate`).toContain(
          "/presales/login",
        );
      }
      // The only guard before that redirect is the absence of a user.
      expect(body, `${name} should gate on session, not role`).toContain("if (!user) redirect");
      expect(body, `${name} must not branch on a role name`).not.toMatch(
        /user\.role\s*===|isPlatformAdmin|isOperator\b/,
      );
    }
  });
});

describe("PR-6 · D4 — operators flag, they never revoke", () => {
  const body = code(SCREENS.keys);
  const control = code("src/components/coreedge/actions/RevokeKey.tsx");

  /*
   * THIS BLOCK USED TO ASSERT THE OPPOSITE, and the change is deliberate rather
   * than a test bent to fit code. It required the revoke control to render for
   * an operator, disabled, carrying `DISABLED_REASONS.revokeNotOperator` —
   * which is the console's general rule for a refused control and the wrong
   * rule for this one. That rule exists so a reader can tell "you may not do
   * this" from "this product cannot do this", and it applies to actions that
   * are theirs under SOME condition. Revocation is never an operator's under
   * any condition; a greyed destructive button invites them to go and ask.
   *
   * What the tests below keep is the part that was always load-bearing: the
   * ROUTE refuses them, in those words. A screen that hides a button is not a
   * gate, so hiding one is only acceptable while the door still says no —
   * asserted in tests/unit/api/coreedge-verbs-routes.test.ts.
   */
  it("does not render the destructive control for an operator at all", () => {
    expect(control).toContain("if (!mayRevoke) return null");
  });

  it("decides that from the same function the route runs", () => {
    expect(body).toContain("refuseRevokeKey(user.role)");
    expect(body).toContain("mayRevoke={mayRevoke}");
  });

  it("keeps the reason and the tab stop for a key that is merely already done", () => {
    // The opposite case and the opposite rule: the action IS this person's, it
    // has simply already happened — so the control stays, disabled, with its
    // reason as a sibling string.
    expect(control).toContain("DISABLED_REASONS.alreadyRevoked");
    expect(control).toContain('aria-disabled="true"');
    expect(control).toContain("aria-describedby");
    // Never a `title` attribute ON A DOM ELEMENT: a reason only a mouse can
    // discover is a broken control. Scoped to lowercase tags on purpose —
    // CoreEdgeShell takes a `title` prop that is the page heading, and an
    // assertion that cannot tell those apart would fail on correct code.
    expect(body).not.toMatch(/<[a-z][^>]*\stitle=/);
    expect(control).not.toMatch(/<[a-z][^>]*\stitle=/);
  });

  it("the reason names both roles that may revoke", () => {
    expect(DISABLED_REASONS.revokeNotOperator).toMatch(/platform admin/i);
    expect(DISABLED_REASONS.revokeNotOperator).toMatch(/reviewer/i);
  });

  it("asks before it destroys, through the dialog that states the impact", () => {
    // ConfirmDialog has had no real caller since PR-2. This is it.
    expect(control).toContain("ConfirmDialog");
    expect(control).toContain("CONFIRMATIONS.revokeKey");
    expect(CONFIRMATIONS.revokeKey.reasonRequired).toBe(true);
  });
});

describe("PR-6 · a key is never rendered in full", () => {
  it("the keys screen shows a masked key and never selects the hash", () => {
    const body = code(SCREENS.keys);
    expect(body).toContain("MaskedKey");
    expect(body).not.toContain("tokenHash");
  });

  it("listKeys does not select tokenHash", () => {
    const queries = code("src/lib/coreedge/queries.ts");
    const listKeys = queries.slice(queries.indexOf("export async function listKeys"));
    const body = listKeys.slice(0, listKeys.indexOf("export async function", 10));
    expect(body).not.toContain("tokenHash");
  });
});

describe("PR-6 · the passport tells the truth about fields", () => {
  it("never prints a fields ratio it cannot support", () => {
    const body = code(SCREENS.passport);
    expect(body).not.toMatch(/\d+ of \d+/);
    expect(body).toContain("Not recorded");
  });

  it("says why the column is blank", () => {
    expect(SCREEN_NOTES.passportFieldsUnknown).toMatch(/does not yet record/i);
  });

  it("has no revoke path, by construction", () => {
    const body = code(SCREENS.passport);
    expect(body).not.toMatch(/revoke/i);
    expect(SCREEN_NOTES.passportReadOnly).toMatch(/no revoke button/i);
  });
});

describe("PR-6 · the service matrix keeps two facts apart", () => {
  const body = code(SCREENS.sapSystemDetail);

  it("renders metadata and data read as separate columns", () => {
    expect(body).toContain('header: "Metadata"');
    expect(body).toContain('header: "Data read"');
  });

  it("never merges them into one reachability flag", () => {
    expect(body).not.toMatch(/"Reachable"/);
    expect(SCREEN_NOTES.twoFactsNeverMerged).toMatch(/separately/i);
  });
});

describe("PR-6 · copy lives in the copy deck", () => {
  it("the new empty states and reasons are defined", () => {
    expect(EMPTY_STATES.catalogueNone.message).toBeTruthy();
    expect(EMPTY_STATES.keysNone.message).toBeTruthy();
    expect(EMPTY_STATES.passportNone.message).toBeTruthy();
    expect(EMPTY_STATES.servicesNoneProbed.message).toBeTruthy();
    expect(DISABLED_REASONS.noFieldSelectionStore).toBeTruthy();
    expect(DISABLED_REASONS.platformAdminOnly).toBeTruthy();
  });

  it("retiring an app is confirmed by address and marked permanent", () => {
    expect(CONFIRMATIONS.retireApp.body).toMatch(/permanent/i);
    expect(CONFIRMATIONS.retireApp.reasonRequired).toBe(true);
    expect(SCREEN_NOTES.retireTypeAddress).toMatch(/address, not the name/i);
  });

  it("deactivating a system is reversible and says nothing is destroyed", () => {
    expect(CONFIRMATIONS.deactivateSystem.body).toMatch(/nothing is destroyed/i);
    expect(CONFIRMATIONS.deactivateSystem.reasonRequired).toBe(true);
  });
});

describe("PR-6 · every new route is reachable", () => {
  /**
   * A page nobody can navigate to is indistinguishable from a page that does
   * not exist. /coreedge/design-system nearly shipped that way in PR-3 — it was
   * built, tested and absent from WORKBENCH_PATHS — so these assert the link,
   * not just the file.
   */
  it("the app page links to add-feed and settings", () => {
    const body = code("src/app/(coreedge)/coreedge/apps/[app]/page.tsx");
    expect(body).toContain("/add-feed");
    expect(body).toContain("/settings");
  });

  it("the operations page links to keys", () => {
    expect(code("src/app/(coreedge)/coreedge/operations/page.tsx")).toContain(
      "/coreedge/operations/keys",
    );
  });

  it("the SAP systems list links to each system", () => {
    expect(code(SCREENS.sapSystems)).toContain("/coreedge/sap-systems/");
  });

  it("the whole namespace is still declared reachable", () => {
    expect(code("src/lib/routing/workbench-paths.ts")).toContain("'/coreedge'");
  });
});
