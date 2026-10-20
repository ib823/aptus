/**
 * A sign-in link that is really a sign-up spends the per-caller sign-up
 * bucket, whichever route asked for it (roadmap P0.13, review round 1).
 *
 * With developer sign-up open, a NEW address gets a workspace at its first
 * sign-in — from /signup/developer or from NextAuth's own
 * POST /api/auth/signin/email. Only the first was in the edge's `signup:<ip>`
 * bucket (10 an hour); the second sat in `auth:<ip>` at 30 a minute, so one
 * caller could send about 180 times the intended sign-up emails, and create
 * that many workspaces. The per-email bucket cannot help: every address is new.
 *
 * The link goes through `sendVerificationRequest`, where the address is known,
 * so that is where the caller's bucket is spent: for a new address while
 * sign-up is open. An existing account's sign-in, and every link while the
 * setting is off, keep exactly the limits they had.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimitModule from "@/lib/security/rate-limit";

const mocks = vi.hoisted(() => ({
  ip: "10.20.0.1",
  existing: null as { id: string } | null,
  keys: [] as string[],
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": mocks.ip }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: async () => mocks.existing } },
}));
vi.mock("@/lib/email/brevo", () => ({ sendEmail: vi.fn(async () => ({ messageId: "m" })) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof RateLimitModule>();
  return {
    ...real,
    checkRateLimit: async (key: string, config: { limit: number; windowMs: number }) => {
      mocks.keys.push(key);
      // The real in-memory window, so the eleventh call is genuinely refused.
      return real.checkRateLimit(key, config);
    },
  };
});

import { authOptions } from "@/lib/auth/auth-options";

type Send = (params: { identifier: string; url: string }) => Promise<void>;
const provider = authOptions.providers[0] as unknown as { options: { sendVerificationRequest: Send } };
const send: Send = (params) => provider.options.sendVerificationRequest(params);
const link = "http://localhost/api/auth/callback/email?token=t&callbackUrl=%2Fstudio";
let n = 0;
const fresh = () => `new-${Date.now()}-${n++}@example.test`;

beforeEach(() => {
  mocks.existing = null;
  mocks.keys.length = 0;
  vi.stubEnv("SMTP_USER", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a new address's sign-in link with developer sign-up open", () => {
  beforeEach(() => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "open");
  });

  it("spends the caller's signup bucket, the same one /api/auth/signup spends at the edge", async () => {
    mocks.ip = "10.20.0.2";
    await send({ identifier: fresh(), url: link });
    expect(mocks.keys).toContain("signup:10.20.0.2");
  });

  it("refuses the eleventh new-address link from one caller within the hour, and not its neighbour", async () => {
    mocks.ip = "10.20.0.3";
    for (let i = 0; i < 10; i++) await send({ identifier: fresh(), url: link });
    await expect(send({ identifier: fresh(), url: link })).rejects.toThrow(/sign-up/i);

    mocks.ip = "10.20.0.4";
    await expect(send({ identifier: fresh(), url: link })).resolves.toBeUndefined();
  });

  it("never limits an existing account's sign-in by the caller's sign-ups", async () => {
    mocks.ip = "10.20.0.5";
    for (let i = 0; i < 10; i++) await send({ identifier: fresh(), url: link });
    mocks.existing = { id: "u1" };
    await expect(send({ identifier: "member@example.test", url: link })).resolves.toBeUndefined();
    expect(mocks.keys.filter((k) => k === "signup:10.20.0.5")).toHaveLength(10);
  });
});

describe("with developer sign-up off — the deployed default", () => {
  it("a new address's link spends no caller bucket, exactly as before", async () => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "");
    mocks.ip = "10.20.0.6";
    for (let i = 0; i < 11; i++) await send({ identifier: fresh(), url: link });
    expect(mocks.keys.some((k) => k.startsWith("signup:"))).toBe(false);
  });
});
