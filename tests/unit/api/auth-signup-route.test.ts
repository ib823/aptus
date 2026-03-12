import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/signup/route";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findOrg: vi.fn(),
  transaction: vi.fn(),
  canRegister: vi.fn(),
  createTrial: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
    },
    organization: {
      findUnique: mocks.findOrg,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth/auth-config", () => ({
  canRegister: mocks.canRegister,
}));

vi.mock("@/lib/commercial/trial-manager", () => ({
  createTrial: mocks.createTrial,
}));

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canRegister.mockReturnValue({ allowed: true });
    mocks.findUser.mockResolvedValue(null);
    mocks.findOrg.mockResolvedValue(null);
    mocks.createTrial.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      organization: {
        create: vi.fn().mockResolvedValue({ id: "org-1" }),
      },
      user: {
        create: vi.fn().mockResolvedValue({ id: "user-1" }),
      },
    }));
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost:3003/api/auth/signup", {
      method: "POST",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid request body" },
    });
  });

  it("returns 400 for schema-invalid payloads", async () => {
    const request = new Request("http://localhost:3003/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ orgName: "Acme", fullName: "", email: "not-an-email" }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.findOrg).not.toHaveBeenCalled();
  });
});
