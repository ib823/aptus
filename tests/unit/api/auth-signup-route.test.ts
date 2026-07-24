import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/signup/route";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findOrg: vi.fn(),
  transaction: vi.fn(),
  canRegister: vi.fn(),
  createTrial: vi.fn(),
  sendMagicLink: vi.fn(),
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

vi.mock("@/lib/auth/send-magic-link", () => ({
  sendMagicLink: mocks.sendMagicLink,
}));

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canRegister.mockReturnValue({ allowed: true });
    mocks.findUser.mockResolvedValue(null);
    mocks.findOrg.mockResolvedValue(null);
    mocks.createTrial.mockResolvedValue(undefined);
    mocks.sendMagicLink.mockResolvedValue({ sent: true });
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

  function validSignup() {
    return new Request("http://localhost:3003/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ orgName: "Acme", fullName: "Ada Lovelace", email: "ada@acme.com" }),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns an identical neutral response for a new email and an existing one (no enumeration)", async () => {
    // New email: nothing exists.
    mocks.findUser.mockResolvedValueOnce(null);
    const newRes = await POST(validSignup() as never);
    const newBody = await newRes.json();

    // Existing email: user already registered.
    mocks.findUser.mockResolvedValueOnce({ id: "existing-user" });
    const existingRes = await POST(validSignup() as never);
    const existingBody = await existingRes.json();

    // Same status and body — a caller cannot tell the two apart.
    expect(newRes.status).toBe(existingRes.status);
    expect(newRes.status).toBe(200);
    expect(existingBody).toEqual(newBody);
    // No 409, no leaked ids.
    expect(JSON.stringify(newBody)).not.toContain("org-1");
    expect(JSON.stringify(newBody)).not.toContain("user-1");
  });

  it("still emails a sign-in link to an existing user, without creating anything", async () => {
    mocks.findUser.mockResolvedValueOnce({ id: "existing-user" });
    const res = await POST(validSignup() as never);
    expect(res.status).toBe(200);
    expect(mocks.sendMagicLink).toHaveBeenCalledWith("ada@acme.com");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createTrial).not.toHaveBeenCalled();
  });

  it("returns the same neutral response when the domain policy blocks registration", async () => {
    mocks.canRegister.mockReturnValueOnce({ allowed: false, reason: "Invitation only" });
    const res = await POST(validSignup() as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      data: {
        message: "If those details are eligible, we've sent a sign-in link to that email address.",
      },
    });
    expect(mocks.sendMagicLink).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
