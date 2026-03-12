import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "@/app/api/assessments/[id]/comments/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    comment: {
      findMany: mocks.findMany,
      create: mocks.create,
    },
    assessmentStakeholder: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/collaboration/mention-parser", () => ({
  parseMentions: vi.fn(() => ({ userIds: [], contentHtml: "<p>ok</p>" })),
}));

vi.mock("@/lib/notifications/dispatcher", () => ({
  dispatchNotification: vi.fn(),
}));

vi.mock("@/lib/collaboration/activity-logger", () => ({
  logActivity: vi.fn(),
}));

describe("/api/assessments/[id]/comments", () => {
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

  it("short-circuits GET when assessment access is denied", async () => {
    mocks.requireAssessmentAccess.mockResolvedValue(
      NextResponse.json({ error: { code: "FORBIDDEN", message: "Denied" } }, { status: 403 }),
    );

    const response = await GET(new Request("http://localhost/api/assessments/assessment-1/comments") as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed POST bodies", async () => {
    const response = await POST(new Request("http://localhost/api/assessments/assessment-1/comments", {
      method: "POST",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
