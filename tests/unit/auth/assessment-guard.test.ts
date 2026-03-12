import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isMfaRequired: vi.fn(),
  verifyAssessmentAccess: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/auth/permissions", () => ({
  isMfaRequired: mocks.isMfaRequired,
}));

vi.mock("@/lib/auth/verify-assessment-access", () => ({
  verifyAssessmentAccess: mocks.verifyAssessmentAccess,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assessment: {
      findUnique: mocks.findUnique,
    },
  },
}));

function expectAccessError(result: Awaited<ReturnType<typeof requireAssessmentAccess>>) {
  expect(isAssessmentAccessError(result)).toBe(true);
  if (!isAssessmentAccessError(result)) {
    throw new Error("Expected assessment access error response");
  }
  return result;
}

describe("requireAssessmentAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMfaRequired.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      image: null,
      role: "consultant",
      organizationId: "org-1",
      mfaEnabled: false,
      mfaVerified: true,
      totpVerified: false,
      hasWebAuthn: false,
    });
    mocks.findUnique.mockResolvedValue({
      id: "assessment-1",
      companyName: "Acme",
      organizationId: "org-1",
      status: "draft",
    });
    mocks.verifyAssessmentAccess.mockResolvedValue(true);
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const result = expectAccessError(await requireAssessmentAccess("assessment-1"));

    expect(result.status).toBe(401);
    await expect(result.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: "Not authenticated" },
    });
  });

  it("returns 403 when MFA is required", async () => {
    mocks.isMfaRequired.mockReturnValue(true);

    const result = expectAccessError(await requireAssessmentAccess("assessment-1"));

    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({
      error: { code: "MFA_REQUIRED", message: "MFA verification required" },
    });
  });

  it("returns 404 when the assessment does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const result = expectAccessError(await requireAssessmentAccess("missing-assessment"));

    expect(result.status).toBe(404);
    expect(mocks.verifyAssessmentAccess).not.toHaveBeenCalled();
  });

  it("returns 403 when the user does not have access", async () => {
    mocks.verifyAssessmentAccess.mockResolvedValue(false);

    const result = expectAccessError(await requireAssessmentAccess("assessment-1"));

    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You do not have access to this assessment",
      },
    });
  });

  it("returns the user and assessment when access is granted", async () => {
    const result = await requireAssessmentAccess("assessment-1");

    expect(isAssessmentAccessError(result)).toBe(false);
    if (isAssessmentAccessError(result)) {
      throw new Error("Expected access result");
    }

    expect(result.user.id).toBe("user-1");
    expect(result.assessment).toEqual({
      id: "assessment-1",
      companyName: "Acme",
      organizationId: "org-1",
      status: "draft",
    });
    expect(mocks.verifyAssessmentAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      "assessment-1",
      "org-1",
    );
  });
});
