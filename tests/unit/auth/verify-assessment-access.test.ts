import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirstStakeholder: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assessment: { findUnique: mocks.findUnique },
    assessmentStakeholder: { findFirst: mocks.findFirstStakeholder },
  },
}));

import { verifyAssessmentAccess } from "@/lib/auth/verify-assessment-access";

const ASSESSMENT_ID = "assessment-1";
const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({ organizationId: ORG_A });
  mocks.findFirstStakeholder.mockResolvedValue(null);
});

describe("verifyAssessmentAccess — cross-org gate", () => {
  it("grants platform_admin access to any org", async () => {
    const user = { id: "u", role: "platform_admin", organizationId: ORG_B };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID)).resolves.toBe(true);
  });

  it("grants partner_lead access to any org", async () => {
    const user = { id: "u", role: "partner_lead", organizationId: ORG_B };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID)).resolves.toBe(true);
  });

  // Regression: prior gate placed `consultant` in CROSS_ORG_ROLES, contradicting
  // the role matrix's canViewAllAssessments=false. Tenant isolation breach.
  it("denies consultant from a different org without stakeholder membership", async () => {
    const user = { id: "u", role: "consultant", organizationId: ORG_B };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID)).resolves.toBe(false);
  });

  it("grants consultant in the same org", async () => {
    const user = { id: "u", role: "consultant", organizationId: ORG_A };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID)).resolves.toBe(true);
  });

  it("grants consultant from another org when they are a stakeholder", async () => {
    mocks.findFirstStakeholder.mockResolvedValue({ id: "stk-1" });
    const user = { id: "u", role: "consultant", organizationId: ORG_B };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID)).resolves.toBe(true);
  });

  it("denies process_owner from another org without stakeholder membership", async () => {
    const user = { id: "u", role: "process_owner", organizationId: ORG_B };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID)).resolves.toBe(false);
  });

  it("denies viewer from another org without stakeholder membership", async () => {
    const user = { id: "u", role: "viewer", organizationId: ORG_B };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID)).resolves.toBe(false);
  });

  it("returns false when the assessment does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const user = { id: "u", role: "consultant", organizationId: ORG_A };
    await expect(verifyAssessmentAccess(user, "missing")).resolves.toBe(false);
  });

  it("uses the supplied organizationId without an extra DB lookup", async () => {
    const user = { id: "u", role: "consultant", organizationId: ORG_A };
    await expect(verifyAssessmentAccess(user, ASSESSMENT_ID, ORG_A)).resolves.toBe(true);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
