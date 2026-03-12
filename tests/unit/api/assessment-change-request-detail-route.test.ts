import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/assessments/[id]/change-requests/[crId]/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    changeRequest: {
      findFirst: mocks.findFirst,
    },
  },
}));

describe("GET /api/assessments/[id]/change-requests/[crId]", () => {
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
      id: "cr-1",
      assessmentId: "assessment-1",
      status: "REQUESTED",
    });
  });

  it("scopes the change request lookup to the assessment id", async () => {
    const response = await GET(new Request("http://localhost/api/assessments/assessment-1/change-requests/cr-1") as never, {
      params: Promise.resolve({ id: "assessment-1", crId: "cr-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "cr-1", assessmentId: "assessment-1" },
    });
  });
});
