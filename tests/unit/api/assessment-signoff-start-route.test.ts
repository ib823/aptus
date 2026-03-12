import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assessments/[id]/sign-off/start/route";

const mocks = vi.hoisted(() => ({
  requireAssessmentAccess: vi.fn(),
  findProcess: vi.fn(),
  findSnapshot: vi.fn(),
  createProcess: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/assessment-guard", () => ({
  requireAssessmentAccess: mocks.requireAssessmentAccess,
  isAssessmentAccessError: (result: unknown) => result instanceof Response,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    signOffProcess: {
      findUnique: mocks.findProcess,
      create: mocks.createProcess,
    },
    assessmentSnapshot: {
      findFirst: mocks.findSnapshot,
    },
  },
}));

vi.mock("@/lib/audit/decision-logger", () => ({
  logDecision: mocks.logDecision,
}));

describe("POST /api/assessments/[id]/sign-off/start", () => {
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
    mocks.findProcess.mockResolvedValue(null);
    mocks.findSnapshot.mockResolvedValue({
      id: "snapshot-1",
      assessmentId: "assessment-1",
    });
    mocks.createProcess.mockResolvedValue({
      id: "signoff-1",
      assessmentId: "assessment-1",
      snapshotId: "snapshot-1",
      status: "AREA_VALIDATION_IN_PROGRESS",
    });
  });

  it("returns 400 for malformed JSON before querying sign-off state", async () => {
    const response = await POST(new Request("http://localhost/api/assessments/assessment-1/sign-off/start", {
      method: "POST",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.findProcess).not.toHaveBeenCalled();
    expect(mocks.findSnapshot).not.toHaveBeenCalled();
  });

  it("scopes the snapshot lookup to the assessment id", async () => {
    const response = await POST(new Request("http://localhost/api/assessments/assessment-1/sign-off/start", {
      method: "POST",
      body: JSON.stringify({ snapshotId: "snapshot-1" }),
      headers: {
        "Content-Type": "application/json",
      },
    }) as never, {
      params: Promise.resolve({ id: "assessment-1" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.findSnapshot).toHaveBeenCalledWith({
      where: { id: "snapshot-1", assessmentId: "assessment-1" },
    });
  });
});
