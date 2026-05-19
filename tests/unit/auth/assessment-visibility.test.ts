import { describe, expect, it } from "vitest";
import { canViewAllAssessments, getVisibleAssessmentWhere } from "@/lib/auth/assessment-visibility";

describe("assessment visibility", () => {
  it("allows platform admins to see all non-deleted assessments", () => {
    const user = { id: "u1", role: "platform_admin", organizationId: "org-a" };

    expect(canViewAllAssessments(user)).toBe(true);
    expect(getVisibleAssessmentWhere(user)).toEqual({ deletedAt: null });
  });

  it("scopes organization users to their organization", () => {
    const user = { id: "u1", role: "partner_lead", organizationId: "org-a" };

    expect(canViewAllAssessments(user)).toBe(false);
    expect(getVisibleAssessmentWhere(user)).toEqual({
      deletedAt: null,
      organizationId: "org-a",
    });
  });

  it("scopes org-less users to explicit stakeholder membership", () => {
    const user = { id: "u1", role: "consultant", organizationId: null };

    expect(getVisibleAssessmentWhere(user)).toEqual({
      deletedAt: null,
      stakeholders: { some: { userId: "u1" } },
    });
  });
});
