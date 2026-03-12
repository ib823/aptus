import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/assessments/[id]/integrations/[integrationId]/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    integrationPoint: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}));

vi.mock("@/lib/db/decision-log", () => ({
  logDecision: mocks.logDecision,
}));

describe("PUT /api/assessments/[id]/integrations/[integrationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAssessmentAccess.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        role: "consultant",
      },
      assessment: {
        id: "assessment-1",
        companyName: "Acme",
        organizationId: "org-1",
        status: "draft",
      },
    });
    mocks.findFirst.mockResolvedValue({
      id: "integration-1",
      assessmentId: "assessment-1",
      name: "SAP CPI",
    });
    mocks.update.mockResolvedValue({
      id: "integration-1",
      assessmentId: "assessment-1",
      name: "Updated",
    });
  });

  it("scopes the integration lookup to the assessment id", async () => {
    const response = await PUT(new Request("http://localhost/api/assessments/assessment-1/integrations/integration-1", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated" }),
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1", integrationId: "integration-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "integration-1", assessmentId: "assessment-1" },
    });
  });
});
