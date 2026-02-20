import { describe, it, expect } from "vitest";
import { hasRole, canManageStakeholders, canTransitionStatus, isMfaRequired } from "@/lib/auth/permissions";
import type { SessionUser } from "@/types/assessment";

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
      const user = makeUser({ role: "admin" });
      expect(hasRole(user, ["admin"])).toBe(true);
    });

    it("should return false for non-matching role", () => {
      const user = makeUser({ role: "process_owner" });
      expect(hasRole(user, ["admin", "consultant"])).toBe(false);
    });
  });

  describe("canManageStakeholders", () => {
    it("should allow consultants", () => {
      const result = canManageStakeholders(makeUser({ role: "consultant" }));
      expect(result.allowed).toBe(true);
    });

    it("should allow admins", () => {
      const result = canManageStakeholders(makeUser({ role: "admin" }));
      expect(result.allowed).toBe(true);
    });

    it("should deny process owners", () => {
      const result = canManageStakeholders(makeUser({ role: "process_owner" }));
      expect(result.allowed).toBe(false);
    });

    it("should deny executives", () => {
      const result = canManageStakeholders(makeUser({ role: "executive" }));
      expect(result.allowed).toBe(false);
    });

    it("should deny IT leads", () => {
      const result = canManageStakeholders(makeUser({ role: "it_lead" }));
      expect(result.allowed).toBe(false);
    });
  });

  describe("canTransitionStatus", () => {
    it("should allow consultant to transition draft -> in_progress", () => {
      const result = canTransitionStatus(
        makeUser({ role: "consultant" }),
        "draft",
        "in_progress",
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow executive to transition reviewed -> signed_off", () => {
      const result = canTransitionStatus(
        makeUser({ role: "executive" }),
        "reviewed",
        "signed_off",
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny process_owner from any transition", () => {
      const result = canTransitionStatus(
        makeUser({ role: "process_owner" }),
        "draft",
        "in_progress",
      );
      expect(result.allowed).toBe(false);
    });

    it("should deny invalid transitions", () => {
      const result = canTransitionStatus(
        makeUser({ role: "admin" }),
        "draft",
        "completed",
      );
      expect(result.allowed).toBe(false);
    });

    it("should deny backward transitions", () => {
      const result = canTransitionStatus(
        makeUser({ role: "admin" }),
        "completed",
        "in_progress",
      );
      expect(result.allowed).toBe(false);
    });
  });

  describe("isMfaRequired", () => {
    it("should require MFA for external users without verification", () => {
      expect(isMfaRequired(makeUser({ role: "process_owner", mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "it_lead", mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "executive", mfaVerified: false }))).toBe(true);
    });

    it("should not require MFA for external users with verification", () => {
      expect(isMfaRequired(makeUser({ role: "process_owner", mfaVerified: true }))).toBe(false);
    });

    it("should require MFA for internal users only if enabled and not verified", () => {
      expect(isMfaRequired(makeUser({ role: "consultant", mfaEnabled: true, mfaVerified: false }))).toBe(true);
      expect(isMfaRequired(makeUser({ role: "consultant", mfaEnabled: false, mfaVerified: false }))).toBe(false);
      expect(isMfaRequired(makeUser({ role: "consultant", mfaEnabled: true, mfaVerified: true }))).toBe(false);
    });
  });
});
