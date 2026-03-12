import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/assessments/[id]/transitions/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  updateAssessment: vi.fn(),
  createTransitionLog: vi.fn(),
  aggregateGaps: vi.fn(),
  countGaps: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assessment: {
      update: mocks.updateAssessment,
    },
    statusTransitionLog: {
      create: mocks.createTransitionLog,
    },
    gapResolution: {
      aggregate: mocks.aggregateGaps,
      count: mocks.countGaps,
    },
  },
}));

describe("Assessment transitions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits GET when assessment access is denied", async () => {
    mocks.requireAssessmentAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Denied" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET(new Request("http://localhost/api/assessments/assessment-1/transitions") as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.updateAssessment).not.toHaveBeenCalled();
    expect(mocks.createTransitionLog).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON before mutating transition state", async () => {
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

    const response = await POST(new Request("http://localhost/api/assessments/assessment-1/transitions", {
      method: "POST",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.updateAssessment).not.toHaveBeenCalled();
    expect(mocks.createTransitionLog).not.toHaveBeenCalled();
    expect(mocks.aggregateGaps).not.toHaveBeenCalled();
    expect(mocks.countGaps).not.toHaveBeenCalled();
  });
});
