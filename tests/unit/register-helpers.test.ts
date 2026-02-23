import { describe, it, expect } from "vitest";
import {
  getRegisterPermissions,
  assertAssessmentNotLocked,
  assertCanManageRegister,
  parseOptimisticLock,
  RegisterLockedError,
  RegisterPermissionError,
  OptimisticLockError,
  handleRegisterError,
} from "@/lib/register/register-helpers";

describe("getRegisterPermissions", () => {
  it("grants full permissions for platform_admin", () => {
    const perms = getRegisterPermissions("platform_admin");
    expect(perms.canView).toBe(true);
    expect(perms.canCreate).toBe(true);
    expect(perms.canEdit).toBe(true);
    expect(perms.canDelete).toBe(true);
    expect(perms.canApprove).toBe(true);
  });

  it("grants edit permissions for consultant", () => {
    const perms = getRegisterPermissions("consultant");
    expect(perms.canView).toBe(true);
    expect(perms.canCreate).toBe(true);
    expect(perms.canEdit).toBe(true);
    expect(perms.canDelete).toBe(true);
  });

  it("grants edit permissions for it_lead", () => {
    const perms = getRegisterPermissions("it_lead");
    expect(perms.canEdit).toBe(true);
  });

  it("grants edit permissions for data_migration_lead", () => {
    const perms = getRegisterPermissions("data_migration_lead");
    expect(perms.canEdit).toBe(true);
  });

  it("denies edit permissions for viewer", () => {
    const perms = getRegisterPermissions("viewer");
    expect(perms.canView).toBe(true);
    expect(perms.canCreate).toBe(false);
    expect(perms.canEdit).toBe(false);
    expect(perms.canDelete).toBe(false);
    expect(perms.canApprove).toBe(false);
  });

  it("denies edit permissions for project_manager", () => {
    const perms = getRegisterPermissions("project_manager");
    expect(perms.canEdit).toBe(false);
  });

  it("denies edit for partner_lead (oversight role)", () => {
    const perms = getRegisterPermissions("partner_lead");
    expect(perms.canEdit).toBe(false);
  });

  it("grants approve for executive_sponsor (canSignOff)", () => {
    const perms = getRegisterPermissions("executive_sponsor");
    expect(perms.canApprove).toBe(true);
  });
});

describe("assertAssessmentNotLocked", () => {
  it("does not throw for draft status", () => {
    expect(() => assertAssessmentNotLocked({ status: "draft" })).not.toThrow();
  });

  it("does not throw for in_progress status", () => {
    expect(() => assertAssessmentNotLocked({ status: "in_progress" })).not.toThrow();
  });

  it("throws RegisterLockedError for signed_off status", () => {
    expect(() => assertAssessmentNotLocked({ status: "signed_off" })).toThrow(RegisterLockedError);
  });
});

describe("assertCanManageRegister", () => {
  it("does not throw for consultant", () => {
    expect(() => assertCanManageRegister("consultant")).not.toThrow();
  });

  it("throws RegisterPermissionError for viewer", () => {
    expect(() => assertCanManageRegister("viewer")).toThrow(RegisterPermissionError);
  });

  it("does not throw for platform_admin", () => {
    expect(() => assertCanManageRegister("platform_admin")).not.toThrow();
  });
});

describe("parseOptimisticLock", () => {
  it("does not throw when bodyUpdatedAt is undefined", () => {
    expect(() => parseOptimisticLock(undefined, new Date())).not.toThrow();
  });

  it("does not throw when bodyUpdatedAt is null", () => {
    expect(() => parseOptimisticLock(null, new Date())).not.toThrow();
  });

  it("does not throw when timestamps match", () => {
    const ts = new Date("2025-01-15T10:00:00.000Z");
    expect(() => parseOptimisticLock("2025-01-15T10:00:00.000Z", ts)).not.toThrow();
  });

  it("throws OptimisticLockError when timestamps differ", () => {
    const existing = new Date("2025-01-15T10:00:00.000Z");
    expect(() => parseOptimisticLock("2025-01-15T09:00:00.000Z", existing)).toThrow(
      OptimisticLockError,
    );
  });
});

describe("handleRegisterError", () => {
  it("returns 403 for RegisterLockedError", () => {
    const result = handleRegisterError(new RegisterLockedError());
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 for RegisterPermissionError", () => {
    const result = handleRegisterError(new RegisterPermissionError());
    expect(result.status).toBe(403);
  });

  it("returns 409 for OptimisticLockError", () => {
    const result = handleRegisterError(new OptimisticLockError());
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CONFLICT");
  });

  it("re-throws unknown errors", () => {
    expect(() => handleRegisterError(new Error("unknown"))).toThrow("unknown");
  });
});
