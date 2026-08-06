/**
 * ONE authorization answer per question.
 *
 * PERMISSION_MATRIX and ROLE_CAPABILITIES grew independently and contradicted
 * each other on most roles — partner_lead held every register and sign-off
 * action in the matrix while the capabilities file (the one most guards
 * enforce) denied all of them. Two live sources that disagree means the answer
 * depends on which door you knock on, and the drift was invisible because each
 * file's own tests pinned its own copy.
 *
 * This test maps the axes both sources speak to and fails the build on the
 * next divergence. Actions with no capability axis (scope, notes, workshops,
 * reports, profile, admin panel) are deliberately outside it — the matrix is
 * finer-grained by design, and forcing a fake equivalence would be a second
 * copy of the same mistake.
 */

import { describe, expect, it } from "vitest";

import { PERMISSION_MATRIX, type PermissionAction } from "@/lib/auth/permission-matrix";
import { ROLE_CAPABILITIES } from "@/lib/auth/role-permissions";

type RoleName = keyof typeof ROLE_CAPABILITIES;
type CapabilityName = keyof (typeof ROLE_CAPABILITIES)["viewer"];

/** Axes where one capability answers exactly one matrix action. */
const ONE_TO_ONE: ReadonlyArray<[CapabilityName, PermissionAction]> = [
  ["canCreateAssessment", "assessment.create"],
  ["canEditAssessment", "assessment.edit"],
  ["canDeleteAssessment", "assessment.delete"],
  ["canTransitionStatus", "assessment.transition"],
  ["canManageOrganization", "org.manage"],
  ["canInviteUsers", "user.invite"],
  ["canEditStepResponses", "step.classify"],
  ["canApproveGaps", "gap.approve"],
  ["canSignOff", "signoff.execute"],
  ["canViewAllAssessments", "org.viewAll"],
];

/** The gap-resolution editing actions the coarse capability governs. */
const GAP_EDIT_ACTIONS: PermissionAction[] = ["gap.create", "gap.edit", "gap.addAlternative"];

/** Every register action the coarse canEditRegisters capability governs. */
const REGISTER_ACTIONS: PermissionAction[] = [
  "integration.create", "integration.edit", "integration.delete", "integration.approve",
  "dataMigration.create", "dataMigration.edit", "dataMigration.delete", "dataMigration.approve",
  "ocm.create", "ocm.edit", "ocm.delete", "ocm.approve",
];

const ROLES = Object.keys(ROLE_CAPABILITIES) as RoleName[];

describe("the two permission sources agree wherever both speak", () => {
  it.each(ROLES.map((r) => [r] as const))("%s — one-to-one axes", (role) => {
    const caps = ROLE_CAPABILITIES[role];
    const matrix = PERMISSION_MATRIX[role];
    for (const [capability, action] of ONE_TO_ONE) {
      expect(
        matrix.has(action),
        `${role}: ${capability}=${String(caps[capability])} but matrix ${matrix.has(action) ? "grants" : "lacks"} ${action}`,
      ).toBe(caps[capability]);
    }
  });

  it.each(ROLES.map((r) => [r] as const))("%s — gap-resolution editing", (role) => {
    const caps = ROLE_CAPABILITIES[role];
    const matrix = PERMISSION_MATRIX[role];
    if (caps.canEditGapResolutions) {
      // The capability is coarse; at minimum, editing must be expressible.
      expect(matrix.has("gap.edit"), `${role} can edit gap resolutions but the matrix lacks gap.edit`).toBe(true);
    } else {
      const held = GAP_EDIT_ACTIONS.filter((a) => matrix.has(a));
      expect(held, `${role} cannot edit gap resolutions but the matrix grants: ${held.join(", ")}`).toEqual([]);
    }
  });

  it.each(ROLES.map((r) => [r] as const))("%s — register editing", (role) => {
    const caps = ROLE_CAPABILITIES[role];
    const matrix = PERMISSION_MATRIX[role];
    if (caps.canEditRegisters) {
      // Coarse capability, finer matrix: the role must hold at least one
      // register edit action — WHICH registers is the matrix's own business.
      const held = REGISTER_ACTIONS.filter((a) => matrix.has(a));
      expect(held.length, `${role} can edit registers but the matrix grants none`).toBeGreaterThan(0);
    } else {
      const held = REGISTER_ACTIONS.filter((a) => matrix.has(a));
      expect(held, `${role} cannot edit registers but the matrix grants: ${held.join(", ")}`).toEqual([]);
    }
  });

  it("covers every role both sources know", () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual(Object.keys(ROLE_CAPABILITIES).sort());
  });
});
