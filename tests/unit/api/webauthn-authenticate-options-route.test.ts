import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  getUserCredentials: vi.fn(),
  generateChallenge: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));

vi.mock("@/lib/auth/webauthn-db", () => ({
  getUserCredentials: mocks.getUserCredentials,
}));

vi.mock("@/lib/auth/webauthn", () => ({
  // Echo the allowCredentials back inside options so the test can inspect what
  // the route decided to expose.
  generateAuthenticationChallenge: (allowCredentials: unknown) => {
    mocks.generateChallenge(allowCredentials);
    return Promise.resolve({ options: { allowCredentials } });
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  getClientIp: () => "1.2.3.4",
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { auth: { limit: 30, windowMs: 60000 } },
}));

import { POST } from "@/app/api/auth/webauthn/authenticate/options/route";

function req(body: unknown) {
  return new Request("http://localhost:3003/api/auth/webauthn/authenticate/options", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

async function allowCredentialsFor(body: unknown) {
  const res = await POST(req(body));
  const json = (await res.json()) as { data: { allowCredentials?: unknown[] } };
  return json.data.allowCredentials;
}

describe("POST /api/auth/webauthn/authenticate/options — enumeration resistance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-32-characters-long-xx");
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetMs: 0 });
    mocks.findUser.mockResolvedValue(null);
    mocks.getUserCredentials.mockResolvedValue([]);
  });

  it("returns a populated allowCredentials for an UNKNOWN email (decoys)", async () => {
    const creds = (await allowCredentialsFor({ email: "nobody@example.com" })) as unknown[];
    expect(creds).toBeDefined();
    expect(creds.length).toBeGreaterThan(0);
  });

  it("is indistinguishable in shape between a known-with-passkey and an unknown email", async () => {
    // Unknown email → decoys.
    const unknown = (await allowCredentialsFor({ email: "nobody@example.com" })) as unknown[];

    // Known active user WITH a passkey → real descriptors.
    mocks.findUser.mockResolvedValueOnce({ id: "u1", isActive: true });
    mocks.getUserCredentials.mockResolvedValueOnce([
      { credentialId: "real-cred-id", transports: ["internal"] },
    ]);
    const known = (await allowCredentialsFor({ email: "real@example.com" })) as Array<{
      credentialId: string;
    }>;

    // Both non-empty and same array length — no populated-vs-empty oracle.
    expect(unknown.length).toBe(known.length);
    expect(known[0]?.credentialId).toBe("real-cred-id");
  });

  it("is deterministic: the same unknown email yields the same decoy", async () => {
    const a = await allowCredentialsFor({ email: "same@example.com" });
    const b = await allowCredentialsFor({ email: "same@example.com" });
    expect(a).toEqual(b);
  });

  it("returns EMPTY allowCredentials for the usernameless flow (no email to enumerate)", async () => {
    const creds = await allowCredentialsFor({});
    // undefined (omitted) — never a populated list.
    expect(creds ?? []).toHaveLength(0);
  });
});
