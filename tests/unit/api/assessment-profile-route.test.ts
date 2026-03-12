import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/assessments/[id]/profile/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assessment: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

vi.mock("@/lib/audit/decision-logger", () => ({
  logDecision: mocks.logDecision,
}));

describe("PUT /api/assessments/[id]/profile", () => {
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
  });

  it("returns 400 for malformed JSON before touching the database", async () => {
    const response = await PUT(new Request("http://localhost/api/assessments/assessment-1/profile", {
      method: "PUT",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
