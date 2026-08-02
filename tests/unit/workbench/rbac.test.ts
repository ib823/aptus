/**
 * Affirm and Discovery have an entry gate and an action matrix.
 *
 * Neither had one. The (workbench) layout checks for a session, so every role in
 * the platform could open both — including `viewer`, which holds no privilege
 * anywhere else in the product.
 *
 * Ownership scoping landed first and was the larger half: a consultant sees only
 * their own bundles and engagements, so an unauthorised reader no longer reads
 * somebody else's client data. What scoping could never address is CREATION — a
 * viewer could still start a bundle and email an external executive a link to a
 * client's unreleased Fit-to-Standard decisions, because nothing asked whether
 * creating was theirs to do.
 *
 * So the tests come in two halves, and the second is the one that matters. A
 * matrix is a claim until something calls it, and the failure this codebase has
 * hit before is a rule that exists only in the UI — `lib/studio/solutions.ts`
 * says it outright: "the gate is a server rule, not a form hint". The routes
 * that create, issue, invite and release are checked for the call by name.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertAdminHasFullReach,
  canAccessAffirm,
  canAccessDiscovery,
  canPerformAffirmAction,
  canPerformDiscoveryAction,
  isWorkbenchReadOnlyRole,
} from "@/lib/workbench/rbac";
import { canAccessPresales } from "@/lib/presales/rbac";
import { ALL_USER_ROLES } from "@/types/assessment";

const FULL_ROLES = ["consultant", "partner_lead", "platform_admin"] as const;
const READ_ROLES = ["executive_sponsor", "project_manager"] as const;

describe("who may open the workspace", () => {
  it.each(FULL_ROLES.map((r) => [r] as const))("%s may enter both", (role) => {
    expect(canAccessAffirm(role)).toBe(true);
    expect(canAccessDiscovery(role)).toBe(true);
  });

  it.each(READ_ROLES.map((r) => [r] as const))("%s may enter both, read-only", (role) => {
    expect(canAccessAffirm(role)).toBe(true);
    expect(isWorkbenchReadOnlyRole(role)).toBe(true);
  });

  it("refuses every other role, including viewer", () => {
    const excluded = ALL_USER_ROLES.filter(
      (r) => !([...FULL_ROLES, ...READ_ROLES] as readonly string[]).includes(r),
    );
    // If this list ever empties, the gate has quietly become "everyone" again.
    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded).toContain("viewer");
    for (const role of excluded) {
      expect(canAccessAffirm(role), `${role} must not reach Affirm`).toBe(false);
      expect(canAccessDiscovery(role), `${role} must not reach Discovery`).toBe(false);
    }
  });

  it("refuses an absent or unknown role rather than defaulting open", () => {
    for (const bad of [null, undefined, "", "administrator"]) {
      expect(canAccessAffirm(bad)).toBe(false);
      expect(canAccessDiscovery(bad)).toBe(false);
    }
  });

  it("matches the split Presales already uses", () => {
    /*
     * Not a coincidence worth losing: a role's reach should be the same story
     * across the Workbench. If these diverge, one of the two moved and somebody
     * should decide whether that was intended.
     */
    for (const role of ALL_USER_ROLES) {
      expect(canAccessAffirm(role), `${role} differs from Presales`).toBe(canAccessPresales(role));
    }
  });
});

describe("what a read-only role may do", () => {
  it.each(READ_ROLES.map((r) => [r] as const))("%s may view and nothing else", (role) => {
    expect(canPerformAffirmAction(role, "view")).toBe(true);
    expect(canPerformDiscoveryAction(role, "view")).toBe(true);

    // The four that mint external access or change a client-facing record.
    expect(canPerformAffirmAction(role, "create_bundle")).toBe(false);
    expect(canPerformAffirmAction(role, "issue_bundle")).toBe(false);
    expect(canPerformAffirmAction(role, "invite_executive")).toBe(false);
    expect(canPerformAffirmAction(role, "release_bundle")).toBe(false);
    expect(canPerformDiscoveryAction(role, "create_engagement")).toBe(false);
    expect(canPerformDiscoveryAction(role, "capture")).toBe(false);
  });

  it("gives the working roles the whole matrix", () => {
    for (const role of FULL_ROLES) {
      expect(canPerformAffirmAction(role, "invite_executive")).toBe(true);
      expect(canPerformDiscoveryAction(role, "capture")).toBe(true);
    }
  });

  it("keeps a platform admin at full reach", () => {
    expect(assertAdminHasFullReach()).toBe(true);
  });
});

/* ------------------------------------------------------------------------- */

/**
 * The routes that must ENFORCE the matrix, and the action each one is.
 *
 * Listed rather than inferred: the point is that a specific act — creating,
 * issuing, inviting, releasing, capturing — is refused server-side. A glob
 * would pass the day someone adds a seventh route and forgets.
 */
const ENFORCING_ROUTES: Array<[file: string, fn: string, action: string]> = [
  ["src/app/api/affirm/bundles/route.ts", "canPerformAffirmAction", "create_bundle"],
  ["src/app/api/affirm/bundles/[id]/issue/route.ts", "canPerformAffirmAction", "issue_bundle"],
  ["src/app/api/affirm/bundles/[id]/grants/route.ts", "canPerformAffirmAction", "invite_executive"],
  ["src/app/api/affirm/bundles/[id]/release/route.ts", "canPerformAffirmAction", "release_bundle"],
  ["src/app/api/discovery/sessions/route.ts", "canPerformDiscoveryAction", "create_engagement"],
  ["src/app/api/discovery/captures/route.ts", "canPerformDiscoveryAction", "capture"],
];

describe("the matrix is enforced on the server, not only in the UI", () => {
  it.each(ENFORCING_ROUTES)("%s refuses %s without %s", (file, fn, action) => {
    const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(
      source.includes(`${fn}(user.role, "${action}")`),
      `${file} does not call ${fn} for "${action}".\n` +
        "A gate that only exists in the UI is a form hint — see lib/studio/solutions.ts.",
    ).toBe(true);
    expect(
      /status:\s*403/.test(source),
      `${file} must refuse with 403 — the caller is authenticated and simply not entitled`,
    ).toBe(true);
  });
});

describe("the entry gate is on the layouts, where every page inherits it", () => {
  it.each([
    ["src/app/(workbench)/affirm/layout.tsx", "canAccessAffirm"],
    ["src/app/(workbench)/discovery/layout.tsx", "canAccessDiscovery"],
  ])("%s", (file, fn) => {
    const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(
      source.includes(`${fn}(user.role)`),
      `${file} must gate entry — a per-page check would be one forgotten page away from open`,
    ).toBe(true);
    // notFound, not a redirect to an explainer: a role that may not be here does
    // not need to learn the shape of what it is missing.
    expect(/notFound\(\)/.test(source)).toBe(true);
  });
});
