import { describe, it, expect } from "vitest";
import { hasRole, canManageStakeholders, canTransitionStatus, isMfaRequired, isAdminRole } from "@/lib/auth/permissions";
import type { SessionUser, UserRole } from "@/types/assessment";

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    role: "consultant",
    organizationId: "test-org",
    mfaEnabled: true,
    mfaVerified: true,
    totpVerified: true,
    ...overrides,
  };
}

describe("Permission Utilities", () => {
  describe("hasRole", () => {
    it("should return true for matching role", () => {
      const user = makeUser({ role: "platform_admin" as UserRole });
      expect(hasRole(user, ["platform_admin"])).toBe(true);
    });

    it("should return false for non-matching role", () => {
      const user = makeUser({ role: "process_owner" });
      expect(hasRole(user, ["platform_admin", "consultant"])).toBe(false);
    });

    it("should map legacy admin to platform_admin", () => {
      // "admin" is a legacy role that maps to "platform_admin"
      const user = makeUser({ role: "admin" as UserRole });
      expect(hasRole(user, ["platform_admin"])).toBe(true);
    });

    it("should map legacy executive to executive_sponsor", () => {
      const user = makeUser({ role: "executive" as UserRole });
      expect(hasRole(user, ["executive_sponsor"])).toBe(true);
    });

    it("should pass through new role names unchanged", () => {
      const user = makeUser({ role: "partner_lead" as UserRole });
      expect(hasRole(user, ["partner_lead"])).toBe(true);
    });
  });

  describe("canManageStakeholders", () => {
    it("should allow consultants", () => {
      const result = canManageStakeholders(makeUser({ role: "consultant" }));
      expect(result.allowed).toBe(true);
    });

    it("should allow platform_admin", () => {
      const result = canManageStakeholders(makeUser({ role: "platform_admin" as UserRole }));
      expect(result.allowed).toBe(true);
    });

    it("should allow legacy admin (maps to platform_admin)", () => {
      const result = canManageStakeholders(makeUser({ role: "admin" as UserRole }));
      expect(result.allowed).toBe(true);
    });

    it("should allow partner_lead", () => {
      const result = canManageStakeholders(makeUser({ role: "partner_lead" as UserRole }));
      expect(result.allowed).toBe(true);
    });

    it("should allow project_manager", () => {
      const result = canManageStakeholders(makeUser({ role: "project_manager" as UserRole }));
      expect(result.allowed).toBe(true);
    });

    it("should deny process owners", () => {
      const result = canManageStakeholders(makeUser({ role: "process_owner" }));
      expect(result.allowed).toBe(false);
    });

    it("should deny executive_sponsor", () => {
      const result = canManageStakeholders(makeUser({ role: "executive_sponsor" as UserRole }));
      expect(result.allowed).toBe(false);
    });

    it("should deny legacy executive (maps to executive_sponsor)", () => {
      const result = canManageStakeholders(makeUser({ role: "executive" as UserRole }));
      expect(result.allowed).toBe(false);
    });

    it("should deny IT leads", () => {
      const result = canManageStakeholders(makeUser({ role: "it_lead" }));
      expect(result.allowed).toBe(false);
    });

    it("should deny viewer", () => {
      const result = canManageStakeholders(makeUser({ role: "viewer" as UserRole }));
      expect(result.allowed).toBe(false);
    });

    it("should deny client_admin", () => {
      const result = canManageStakeholders(makeUser({ role: "client_admin" as UserRole }));
      expect(result.allowed).toBe(false);
    });
  });

  describe("canTransitionStatus", () => {
    // V1 transitions (backward compatibility)
    it("should allow consultant to transition draft -> in_progress (V1)", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "consultant" }),
        "draft",
        "in_progress",
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow legacy executive to transition reviewed -> signed_off (V1)", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "executive" as UserRole }),
        "reviewed",
        "signed_off",
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow legacy admin to transition draft -> in_progress (V1)", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "admin" as UserRole }),
        "draft",
        "in_progress",
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny process_owner from any V1 transition", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "process_owner" }),
        "draft",
        "in_progress",
      );
      expect(result.allowed).toBe(false);
    });

    it("should deny invalid V1 transitions", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "platform_admin" as UserRole }),
        "draft",
        "completed",
      );
      expect(result.allowed).toBe(false);
    });

    it("should deny backward V1 transitions", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "platform_admin" as UserRole }),
        "completed",
        "in_progress",
      );
      expect(result.allowed).toBe(false);
    });

    // V2 transitions (Phase 18)
    it("should allow consultant to transition draft -> scoping (V2)", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "consultant" }),
        "draft",
        "scoping",
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow platform_admin to transition in_progress -> workshop_active (V2)", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "platform_admin" as UserRole }),
        "in_progress",
        "workshop_active",
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow executive_sponsor to sign off (V2)", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "executive_sponsor" as UserRole }),
        "pending_sign_off",
        "signed_off",
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny viewer from all V2 transitions", async () => {
      const result = await canTransitionStatus(
        makeUser({ role: "viewer" as UserRole }),
        "draft",
        "scoping",
      );
      expect(result.allowed).toBe(false);
    });
  });

  describe("isMfaRequired", () => {
    it("should require MFA for external/client roles without verification", () => {
      expect(isMfaRequired(makeUser({ role: "process_owner", mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "it_lead", mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "executive_sponsor" as UserRole, mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "data_migration_lead" as UserRole, mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "project_manager" as UserRole, mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "viewer" as UserRole, mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "client_admin" as UserRole, mfaVerified: false }))).toBe(true);
    });

    it("should require MFA for legacy executive (maps to executive_sponsor)", () => {
      expect(isMfaRequired(makeUser({ role: "executive" as UserRole, mfaVerified: false }))).toBe(true);
    });

    it("should not require MFA for external users with verification", () => {
      expect(isMfaRequired(makeUser({ role: "process_owner", mfaVerified: true }))).toBe(false);
    });

    it("should require MFA for internal users only if enabled and not verified", () => {
      expect(isMfaRequired(makeUser({ role: "consultant", mfaEnabled: true, mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "consultant", mfaEnabled: false, mfaVerified: false }))).toBe(false);
      expect(isMfaRequired(makeUser({ role: "consultant", mfaEnabled: true, mfaVerified: true }))).toBe(false);
    });

    it("should treat platform_admin as internal role", () => {
      expect(isMfaRequired(makeUser({ role: "platform_admin" as UserRole, mfaEnabled: false, mfaVerified: false }))).toBe(false);
      expect(isMfaRequired(makeUser({ role: "platform_admin" as UserRole, mfaEnabled: true, mfaVerified: false }))).toBe(true);
    });

    it("should treat partner_lead as internal role", () => {
      expect(isMfaRequired(makeUser({ role: "partner_lead" as UserRole, mfaEnabled: false, mfaVerified: false }))).toBe(false);
    });
  });

  describe("isAdminRole", () => {
    it("should return true for platform_admin", () => {
      expect(isAdminRole("platform_admin")).toBe(true);
    });

    it("should return true for legacy admin", () => {
      expect(isAdminRole("admin")).toBe(true);
    });

    it("should return false for non-admin roles", () => {
      expect(isAdminRole("consultant")).toBe(false);
      expect(isAdminRole("partner_lead")).toBe(false);
      expect(isAdminRole("viewer")).toBe(false);
      expect(isAdminRole("client_admin")).toBe(false);
    });
  });
});
