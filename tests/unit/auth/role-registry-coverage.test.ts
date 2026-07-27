/**
 * A role added to the union must reach every registry that enumerates roles.
 *
 * THE DEFECT CLASS. `UserRole` has been extended twice, and both times some
 * registries were updated and some were not. `Record<UserRole, …>` maps fail the
 * compiler loudly. Everything else — a `Set<string>`, a `UserRole[]` literal, a
 * `switch` with a `default`, an inline `.includes([...])` — compiles perfectly
 * while quietly excluding the new role. `support` was missing from fourteen
 * such places at once, with consequences ranging from a badge with no colour to
 * `mapLegacyRole` silently resolving the role to `viewer`, which is the input to
 * `isAdminRole`, `getCapabilities`, `hasPermission` and `canAssignRole`.
 *
 * WHY THE EXISTING GUARD DID NOT CATCH IT. `role-permissions.test.ts` iterates
 * `ALL_ROLES` — which was itself one of the hand-written copies. A role missing
 * from both `ALL_ROLES` and `VALID_ROLES` left the guard iterating eleven names
 * and passing. A guard whose input is the thing that goes stale is not a guard.
 *
 * WHAT CHANGED. `ALL_USER_ROLES` is now `Object.keys(ROLE_LABELS)`, and
 * `ROLE_LABELS` is `Record<UserRole, string>` — so the compiler refuses a new
 * role until it is declared, and every derived list inherits that. This file
 * asserts the derivation actually holds, in both directions: nothing missing,
 * and nothing present that is not a role.
 */

import { describe, expect, it } from "vitest";

import { ALL_ROLES, ROLE_CAPABILITIES } from "@/lib/auth/role-permissions";
import { ROLE_METADATA } from "@/lib/auth/role-metadata";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { getOnboardingFlow, getPostOnboardingRedirect } from "@/lib/onboarding/flow-engine";
import { ONBOARDING_FLOWS } from "@/types/onboarding";
import { ALL_USER_ROLES, ROLE_HIERARCHY, ROLE_LABELS, type UserRole } from "@/types/assessment";

const EXPECTED = [...ALL_USER_ROLES].sort();

describe("the role list is one list", () => {
  it("has more than the eleven it stopped at", () => {
    // A blunt pin. If this number falls, a role was deleted from the union and
    // that should be a decision someone made on purpose.
    expect(ALL_USER_ROLES.length).toBeGreaterThanOrEqual(12);
    expect(ALL_USER_ROLES).toContain("support");
  });

  it("ALL_ROLES is the same list, not a second copy of it", () => {
    expect([...ALL_ROLES].sort()).toEqual(EXPECTED);
  });

  it("contains no duplicates", () => {
    expect(new Set(ALL_USER_ROLES).size).toBe(ALL_USER_ROLES.length);
  });
});

describe("every runtime registry covers exactly the roles that exist", () => {
  // Both directions on purpose. Missing keys were the `support` defect;
  // EXTRA keys were a separate one — `partner_manager`, `client_lead`,
  // `partner_admin`, `client_sponsor`, `functional_head` and `change_manager`
  // all appeared in registries and none of them is a role. A filter naming a
  // role that cannot exist matches nobody and reads as though it does.
  it.each([
    ["ROLE_LABELS", ROLE_LABELS],
    ["ROLE_HIERARCHY", ROLE_HIERARCHY],
    ["ROLE_METADATA", ROLE_METADATA],
    ["ROLE_CAPABILITIES", ROLE_CAPABILITIES],
    ["ONBOARDING_FLOWS", ONBOARDING_FLOWS],
  ])("%s", (_name, registry) => {
    expect(Object.keys(registry).sort()).toEqual(EXPECTED);
  });
});

describe("no role silently becomes viewer", () => {
  it("round-trips every role through mapLegacyRole", () => {
    for (const role of ALL_USER_ROLES) {
      expect(mapLegacyRole(role), `${role} must not be downgraded`).toBe(role);
    }
  });

  it("still downgrades genuine garbage", () => {
    expect(mapLegacyRole("not_a_role")).toBe("viewer");
    expect(mapLegacyRole("")).toBe("viewer");
  });

  it("still maps the legacy names it exists for", () => {
    expect(mapLegacyRole("admin")).toBe("platform_admin");
    expect(mapLegacyRole("executive")).toBe("executive_sponsor");
  });
});

describe("onboarding sends a role where onboarding said it would", () => {
  /** The last `navigate` action in a flow — where onboarding leaves you. */
  function flowDestination(role: UserRole): string | null {
    const actions = getOnboardingFlow(role)
      .steps.map((s) => s.action)
      .filter((a): a is { type: "navigate"; url: string } => a?.type === "navigate");
    return actions[0]?.url ?? null;
  }

  it("routes the operations persona to its own workspace, not the dashboard", () => {
    // The specific bug: `getPostOnboardingRedirect` was a switch whose
    // `default` arm swallowed `support` and returned "/dashboard", while this
    // persona's onboarding flow pointed at "/operations". Onboarding told a
    // support user where to go and then took them somewhere else.
    expect(flowDestination("support")).toBe("/operations");
    expect(getPostOnboardingRedirect("support")).toBe("/operations");
  });

  it("gives every role a destination inside the app", () => {
    for (const role of ALL_USER_ROLES) {
      const destination = getPostOnboardingRedirect(role);
      expect(destination, `${role} must land somewhere`).toMatch(/^\//);
    }
  });

  it("still honours an assessment context for the roles that work inside one", () => {
    expect(getPostOnboardingRedirect("consultant", { assessmentId: "a1" })).toBe("/assessments/a1");
    // …and not for the ones that do not. Support has no seat on an assessment,
    // so an assessment id in the context must not divert it.
    expect(getPostOnboardingRedirect("support", { assessmentId: "a1" })).toBe("/operations");
    expect(getPostOnboardingRedirect("platform_admin", { assessmentId: "a1" })).toBe("/admin");
  });
});
