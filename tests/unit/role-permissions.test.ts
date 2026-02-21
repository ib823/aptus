import { describe, it, expect } from "vitest";
import { ROLE_CAPABILITIES, getCapabilities, canAssignRole, ALL_ROLES } from "@/lib/auth/role-permissions";
import { mapLegacyRole, isLegacyRole } from "@/lib/auth/role-migration";
import type { UserRole } from "@/types/assessment";
import { ROLE_HIERARCHY } from "@/types/assessment";

describe("Role Permissions (Phase 17)", () => {
  describe("ROLE_CAPABILITIES matrix", () => {
    it("should have capabilities for all 11 roles", () => {
      expect(Object.keys(ROLE_CAPABILITIES)).toHaveLength(11);
      for (const role of ALL_ROLES) {
        expect(ROLE_CAPABILITIES[role]).toBeDefined();
      }
    });

    it("platform_admin should have all capabilities", () => {
      const caps = ROLE_CAPABILITIES.platform_admin;
      expect(caps.canCreateAssessment).toBe(true);
      expect(caps.canEditAssessment).toBe(true);
      expect(caps.canDeleteAssessment).toBe(true);
      expect(caps.canManageStakeholders).toBe(true);
      expect(caps.canManageOrganization).toBe(true);
      expect(caps.canInviteUsers).toBe(true);
      expect(caps.canTransitionStatus).toBe(true);
      expect(caps.canEditStepResponses).toBe(true);
      expect(caps.canEditGapResolutions).toBe(true);
      expect(caps.canEditRegisters).toBe(true);
      expect(caps.canApproveGaps).toBe(true);
      expect(caps.canSignOff).toBe(true);
      expect(caps.canViewAllAssessments).toBe(true);
      expect(caps.isAreaLocked).toBe(false);
    });

    it("viewer should have no write capabilities", () => {
      const caps = ROLE_CAPABILITIES.viewer;
      expect(caps.canCreateAssessment).toBe(false);
      expect(caps.canEditAssessment).toBe(false);
      expect(caps.canDeleteAssessment).toBe(false);
      expect(caps.canManageStakeholders).toBe(false);
      expect(caps.canManageOrganization).toBe(false);
      expect(caps.canInviteUsers).toBe(false);
      expect(caps.canTransitionStatus).toBe(false);
      expect(caps.canEditStepResponses).toBe(false);
      expect(caps.canEditGapResolutions).toBe(false);
      expect(caps.canEditRegisters).toBe(false);
      expect(caps.canApproveGaps).toBe(false);
      expect(caps.canSignOff).toBe(false);
      expect(caps.canViewAllAssessments).toBe(false);
      expect(caps.isAreaLocked).toBe(false);
    });

    it("process_owner should be area-locked", () => {
      const caps = ROLE_CAPABILITIES.process_owner;
      expect(caps.isAreaLocked).toBe(true);
      expect(caps.canEditStepResponses).toBe(true);
    });

    it("data_migration_lead should only edit registers", () => {
      const caps = ROLE_CAPABILITIES.data_migration_lead;
      expect(caps.canEditRegisters).toBe(true);
      expect(caps.canEditStepResponses).toBe(false);
      expect(caps.canEditGapResolutions).toBe(false);
    });

    it("executive_sponsor should only sign off and transition", () => {
      const caps = ROLE_CAPABILITIES.executive_sponsor;
      expect(caps.canSignOff).toBe(true);
      expect(caps.canTransitionStatus).toBe(true);
      expect(caps.canEditStepResponses).toBe(false);
      expect(caps.canCreateAssessment).toBe(false);
    });

    it("consultant should create, edit, approve but not delete", () => {
      const caps = ROLE_CAPABILITIES.consultant;
      expect(caps.canCreateAssessment).toBe(true);
      expect(caps.canEditStepResponses).toBe(true);
      expect(caps.canApproveGaps).toBe(true);
      expect(caps.canDeleteAssessment).toBe(false);
    });

    it("client_admin should manage org and invite but not edit assessments", () => {
      const caps = ROLE_CAPABILITIES.client_admin;
      expect(caps.canManageOrganization).toBe(true);
      expect(caps.canInviteUsers).toBe(true);
      expect(caps.canEditStepResponses).toBe(false);
      expect(caps.canCreateAssessment).toBe(false);
    });

    it("project_manager should manage stakeholders but not edit responses", () => {
      const caps = ROLE_CAPABILITIES.project_manager;
      expect(caps.canManageStakeholders).toBe(true);
      expect(caps.canEditStepResponses).toBe(false);
    });
  });

  describe("getCapabilities", () => {
    it("should return capabilities for new role names", () => {
      expect(getCapabilities("platform_admin").canCreateAssessment).toBe(true);
      expect(getCapabilities("viewer").canCreateAssessment).toBe(false);
    });

    it("should map legacy role names", () => {
      expect(getCapabilities("admin").canCreateAssessment).toBe(true);
      expect(getCapabilities("admin").canViewAllAssessments).toBe(true);
      expect(getCapabilities("executive").canSignOff).toBe(true);
    });

    it("should return viewer capabilities for unknown roles", () => {
      expect(getCapabilities("nonexistent").canCreateAssessment).toBe(false);
    });
  });

  describe("mapLegacyRole", () => {
    it("should map admin to platform_admin", () => {
      expect(mapLegacyRole("admin")).toBe("platform_admin");
    });

    it("should map executive to executive_sponsor", () => {
      expect(mapLegacyRole("executive")).toBe("executive_sponsor");
    });

    it("should pass through unchanged roles", () => {
      expect(mapLegacyRole("consultant")).toBe("consultant");
      expect(mapLegacyRole("process_owner")).toBe("process_owner");
      expect(mapLegacyRole("it_lead")).toBe("it_lead");
    });

    it("should pass through new role names", () => {
      expect(mapLegacyRole("platform_admin")).toBe("platform_admin");
      expect(mapLegacyRole("partner_lead")).toBe("partner_lead");
      expect(mapLegacyRole("solution_architect")).toBe("solution_architect");
    });

    it("should pass through unknown roles as-is", () => {
      expect(mapLegacyRole("unknown_role")).toBe("unknown_role");
    });
  });

  describe("isLegacyRole", () => {
    it("should identify admin and executive as legacy", () => {
      expect(isLegacyRole("admin")).toBe(true);
      expect(isLegacyRole("executive")).toBe(true);
    });

    it("should not identify new roles as legacy", () => {
      expect(isLegacyRole("platform_admin")).toBe(false);
      expect(isLegacyRole("consultant")).toBe(false);
    });
  });

  describe("canAssignRole (privilege escalation prevention)", () => {
    it("platform_admin can assign any role", () => {
      for (const target of ALL_ROLES) {
        expect(canAssignRole("platform_admin", target)).toBe(true);
      }
    });

    it("partner_lead can assign roles at or below their level", () => {
      expect(canAssignRole("partner_lead", "consultant")).toBe(true);
      expect(canAssignRole("partner_lead", "viewer")).toBe(true);
      expect(canAssignRole("partner_lead", "partner_lead")).toBe(true);
    });

    it("partner_lead cannot assign platform_admin", () => {
      expect(canAssignRole("partner_lead", "platform_admin")).toBe(false);
    });

    it("client_admin cannot assign consultant or higher", () => {
      expect(canAssignRole("client_admin", "consultant")).toBe(false);
      expect(canAssignRole("client_admin", "partner_lead")).toBe(false);
      expect(canAssignRole("client_admin", "platform_admin")).toBe(false);
    });

    it("client_admin can assign process_owner, it_lead, viewer", () => {
      expect(canAssignRole("client_admin", "process_owner")).toBe(true);
      expect(canAssignRole("client_admin", "it_lead")).toBe(true);
      expect(canAssignRole("client_admin", "viewer")).toBe(true);
      expect(canAssignRole("client_admin", "client_admin")).toBe(true);
    });

    it("viewer cannot assign any role", () => {
      for (const target of ALL_ROLES) {
        if (target === "viewer") continue;
        expect(canAssignRole("viewer", target)).toBe(false);
      }
    });

    it("legacy admin maps to platform_admin for assignment", () => {
      expect(canAssignRole("admin", "platform_admin")).toBe(true);
      expect(canAssignRole("admin", "consultant")).toBe(true);
    });
  });

  describe("ROLE_HIERARCHY", () => {
    it("platform_admin should be highest", () => {
      const values = Object.values(ROLE_HIERARCHY);
      expect(ROLE_HIERARCHY.platform_admin).toBe(Math.max(...values));
    });

    it("viewer should be lowest", () => {
      const values = Object.values(ROLE_HIERARCHY);
      expect(ROLE_HIERARCHY.viewer).toBe(Math.min(...values));
    });

    it("should have distinct levels for each role", () => {
      const levels = Object.values(ROLE_HIERARCHY);
      const unique = new Set(levels);
      expect(unique.size).toBe(levels.length);
    });
  });

  describe("ALL_ROLES", () => {
    it("should contain exactly 11 roles", () => {
      expect(ALL_ROLES).toHaveLength(11);
    });

    it("should contain all expected roles", () => {
      const expected: UserRole[] = [
        "platform_admin", "partner_lead", "consultant", "project_manager",
        "solution_architect", "process_owner", "it_lead", "data_migration_lead",
        "executive_sponsor", "viewer", "client_admin",
      ];
      for (const role of expected) {
        expect(ALL_ROLES).toContain(role);
      }
    });
  });
});
