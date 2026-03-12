import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/assessments/[id]/workshops/[sessionId]/attendees/follow/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findSession: vi.fn(),
  findAttendee: vi.fn(),
  updateAttendee: vi.fn(),
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
      update: mocks.updateAttendee,
    },
  },
}));

describe("PUT /api/assessments/[id]/workshops/[sessionId]/attendees/follow", () => {
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
    mocks.findSession.mockResolvedValue({ id: "session-1" });
    mocks.findAttendee.mockResolvedValue({ id: "attendee-1" });
    mocks.updateAttendee.mockResolvedValue({ id: "attendee-1", isFollowing: true });
  });

  it("rejects malformed JSON before attendee lookup", async () => {
    const response = await PUT(new Request("http://localhost/api/assessments/assessment-1/workshops/session-1/attendees/follow", {
      method: "PUT",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1", sessionId: "session-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.findAttendee).not.toHaveBeenCalled();
  });

  it("scopes the workshop session lookup to the assessment id", async () => {
    const response = await PUT(new Request("http://localhost/api/assessments/assessment-1/workshops/session-1/attendees/follow", {
      method: "PUT",
      body: JSON.stringify({ isFollowing: true }),
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1", sessionId: "session-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.findSession).toHaveBeenCalledWith({
      where: { id: "session-1", assessmentId: "assessment-1" },
      select: { id: true },
    });
  });
});
