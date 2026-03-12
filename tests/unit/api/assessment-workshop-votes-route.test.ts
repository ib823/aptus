import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assessments/[id]/workshops/[sessionId]/votes/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findSession: vi.fn(),
  findAttendee: vi.fn(),
  findStep: vi.fn(),
  findScopeSelection: vi.fn(),
  upsertVote: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workshopSession: {
      findFirst: mocks.findSession,
    },
    workshopAttendee: {
      findUnique: mocks.findAttendee,
    },
    processStep: {
      findUnique: mocks.findStep,
    },
    scopeSelection: {
      findFirst: mocks.findScopeSelection,
    },
    workshopVote: {
      upsert: mocks.upsertVote,
    },
  },
}));

describe("POST /api/assessments/[id]/workshops/[sessionId]/votes", () => {
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
    mocks.findSession.mockResolvedValue({ id: "session-1", status: "in_progress" });
    mocks.findAttendee.mockResolvedValue({ id: "attendee-1" });
    mocks.findStep.mockResolvedValue({ scopeItemId: "scope-1" });
    mocks.findScopeSelection.mockResolvedValue({ id: "selection-1" });
    mocks.upsertVote.mockResolvedValue({ id: "vote-1" });
  });

  it("scopes the voted process step to a selected scope item in the assessment", async () => {
    const response = await POST(new Request("http://localhost/api/assessments/assessment-1/workshops/session-1/votes", {
      method: "POST",
      body: JSON.stringify({
        processStepId: "step-1",
        classification: "FIT",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1", sessionId: "session-1" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.findScopeSelection).toHaveBeenCalledWith({
      where: { assessmentId: "assessment-1", scopeItemId: "scope-1", selected: true },
      select: { id: true },
    });
  });
});
