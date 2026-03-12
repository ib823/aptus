import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assessments/[id]/clone/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findAssessment: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assessment: {
      findUnique: mocks.findAssessment,
    },
  },
}));

describe("POST /api/assessments/[id]/clone", () => {
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
        status: "signed_off",
      },
    });
  });

  it("returns 400 for malformed JSON before loading the source assessment", async () => {
    const response = await POST(new Request("http://localhost/api/assessments/assessment-1/clone", {
      method: "POST",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.findAssessment).not.toHaveBeenCalled();
  });
});
