import { afterEach, describe, expect, it, vi } from "vitest";

// The cookies() helper is async in Next 15 — return a stub store.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("WebAuthn HMAC fail-closed", () => {
  it("throws when NEXTAUTH_SECRET is missing in non-test envs", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const mod = await import("@/lib/auth/webauthn");
    await expect(mod.setChallengeInCookie("abc")).rejects.toThrow(/NEXTAUTH_SECRET/);
  });

  it("throws when NEXTAUTH_SECRET is too short in non-test envs", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "short");
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();

    const mod = await import("@/lib/auth/webauthn");
    await expect(mod.setChallengeInCookie("abc")).rejects.toThrow(/NEXTAUTH_SECRET/);
  });

  it("accepts a sufficiently-long NEXTAUTH_SECRET", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "a".repeat(32));
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const mod = await import("@/lib/auth/webauthn");
    await expect(mod.setChallengeInCookie("abc")).resolves.toBeUndefined();
  });

  it("falls back to a fixed test secret only when NODE_ENV=test", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();

    const mod = await import("@/lib/auth/webauthn");
    await expect(mod.setChallengeInCookie("abc")).resolves.toBeUndefined();
  });
});
