/**
 * No role edits assessment content unless it is explicitly allowed to.
 *
 * WHY THIS EXISTS. `canEditStepResponse` and `canEditScopeSelection` decide by
 * consulting `readOnlyRoles` / `noScopeEdit` — arrays typed `UserRole[]`. That
 * type looks like a guarantee and is not: an array is not exhaustive, so adding
 * a role to the union never forces it into either list. `support` was added and
 * neither list was updated.
 *
 * WHAT THESE TESTS DO AND DO NOT COVER — stated precisely, because an earlier
 * draft of this file claimed more than it delivered:
 *
 *   - They DO pin that every role outside the explicit editor sets is denied.
 *     Moving a role onto an allow path fails them, which is the regression worth
 *     catching.
 *   - They do NOT defend the functions' terminal `{ allowed: false, "Unknown
 *     role" }`. That branch is UNREACHABLE: `normalizeRole` maps any
 *     unrecognised string to `viewer`, which is deny-listed, and every real role
 *     is handled by an earlier branch. Flipping the terminal to `allowed: true`
 *     leaves this whole file green — verified, not assumed. Treat that branch as
 *     dead code, not as the safety net it looks like.
 *
 * The lists are therefore the real control, and they are not type-enforced. That
 * is why `support` is now named in both rather than left to a fallthrough.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    // No stakeholder record for anyone — so a role that reaches the
    // stakeholder-gated branches is denied there, and a role that is denied
    // earlier never gets this far. Either way the answer must be "no".
    assessmentStakeholder: { findFirst: vi.fn().mockResolvedValue(null) },
    assessment: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { canEditScopeSelection, canEditStepResponse } from "@/lib/auth/permissions";
import { ALL_ROLES } from "@/lib/auth/role-permissions";
import type { UserRole } from "@/types/assessment";

function user(role: UserRole) {
  return {
    id: "u1",
    email: `${role}@abeam.test`,
    name: role,
    role,
    organizationId: "org_a",
    organizationMfaPolicy: null,
    mfaEnabled: true,
    mfaVerified: true,
    totpVerified: true,
    hasWebAuthn: false,
  };
}

/** The only roles that may edit assessment content without a stakeholder record. */
const CONTENT_EDITORS: ReadonlySet<string> = new Set([
  "platform_admin",
  "solution_architect",
  "it_lead",
]);

describe("editing assessment content is deny-by-default", () => {
  it("refuses every role that is not an explicit content editor", async () => {
    for (const role of ALL_ROLES) {
      if (CONTENT_EDITORS.has(role)) continue;
      const r = await canEditStepResponse(user(role), "a1", "Finance");
      expect(r.allowed, `${role} must not edit step responses`).toBe(false);
    }
  });

  it("refuses the operations persona specifically", async () => {
    // Named as well as covered by the loop: `support` watches the running
    // system and has no business editing an assessment.
    const r = await canEditStepResponse(user("support" as UserRole), "a1", "Finance");
    expect(r.allowed).toBe(false);
  });

});

describe("editing scope is deny-by-default", () => {
  const SCOPE_EDITORS: ReadonlySet<string> = new Set(["platform_admin", "consultant"]);

  it("refuses every role that is not an explicit scope editor", async () => {
    for (const role of ALL_ROLES) {
      if (SCOPE_EDITORS.has(role)) continue;
      const r = await canEditScopeSelection(user(role), "a1", "Finance");
      expect(r.allowed, `${role} must not edit scope`).toBe(false);
    }
  });

  it("refuses the operations persona specifically", async () => {
    const r = await canEditScopeSelection(user("support" as UserRole), "a1", "Finance");
    expect(r.allowed).toBe(false);
  });

});
