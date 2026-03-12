import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assessments/[id]/scope/pre-select/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  getIndustryPreSelections: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/scope-items", () => ({
  getIndustryPreSelections: mocks.getIndustryPreSelections,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    scopeSelection: {
      updateMany: mocks.updateMany,
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/audit/decision-logger", () => ({
  logDecision: mocks.logDecision,
}));

describe("POST /api/assessments/[id]/scope/pre-select", () => {
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

  it("returns 400 for malformed JSON before loading pre-selections", async () => {
    const response = await POST(new Request("http://localhost/api/assessments/assessment-1/scope/pre-select", {
      method: "POST",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.getIndustryPreSelections).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
