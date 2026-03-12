import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/assessments/[id]/triggers/[triggerId]/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findTrigger: vi.fn(),
  findChangeRequest: vi.fn(),
  updateTrigger: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    reassessmentTrigger: {
      findFirst: mocks.findTrigger,
      update: mocks.updateTrigger,
    },
    changeRequest: {
      findFirst: mocks.findChangeRequest,
    },
  },
}));

describe("PUT /api/assessments/[id]/triggers/[triggerId]", () => {
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
    mocks.findTrigger.mockResolvedValue({
      id: "trigger-1",
      assessmentId: "assessment-1",
      status: "OPEN",
    });
    mocks.findChangeRequest.mockResolvedValue({ id: "cr-1" });
    mocks.updateTrigger.mockResolvedValue({
      id: "trigger-1",
      status: "RESOLVED",
      resolution: "Handled",
      changeRequestId: "cr-1",
    });
  });

  it("scopes trigger and change request lookups to the assessment id", async () => {
    const response = await PUT(new Request("http://localhost/api/assessments/assessment-1/triggers/trigger-1", {
      method: "PUT",
      body: JSON.stringify({
        status: "RESOLVED",
        resolution: "Handled",
        changeRequestId: "cr-1",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1", triggerId: "trigger-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.findTrigger).toHaveBeenCalledWith({
      where: { id: "trigger-1", assessmentId: "assessment-1" },
    });
    expect(mocks.findChangeRequest).toHaveBeenCalledWith({
      where: { id: "cr-1", assessmentId: "assessment-1" },
      select: { id: true },
    });
  });
});
