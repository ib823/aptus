/**
 * POST /api/auth/signup { workspace: "developer" } — the developer workspace
 * sign-up (roadmap P0.13).
 *
 * WHAT IS PINNED:
 *   · off by default: refused, no email, nothing written — the production host
 *     admits exactly who it admitted before;
 *   · open: a sign-in link to Discover and NOTHING written — the workspace is
 *     created when the link is clicked (tests/integration/developer-onboarding);
 *   · the same neutral answer for every address, registered or not;
 *   · limited per email address here (and per caller address at the edge,
 *     tests/unit/security/signup-rate-limit.test.ts), an outage said as one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RateLimitResult } from "@/lib/security/rate-limit";
import type * as RateLimitModule from "@/lib/security/rate-limit";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findOrg: vi.fn(),
  transaction: vi.fn(),
  sendMagicLink: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    organization: { findUnique: mocks.findOrg },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/send-magic-link", () => ({ sendMagicLink: mocks.sendMagicLink }));
vi.mock("@/lib/commercial/trial-manager", () => ({ createTrial: vi.fn() }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimitModule>()),
  checkRateLimit: mocks.limit,
}));

import { POST } from "@/app/api/auth/signup/route";

function developerSignup(email = "dev@example.com") {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ workspace: "developer", email }),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const ALLOWED: RateLimitResult = { allowed: true, remaining: 4, resetMs: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue(null);
  mocks.findOrg.mockResolvedValue(null);
  mocks.sendMagicLink.mockResolvedValue({ sent: true });
  mocks.limit.mockResolvedValue(ALLOWED);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("with COREEDGE_DEVELOPER_SIGNUP unset (the deployed default)", () => {
  it("refuses, sends nothing and writes nothing", async () => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "");

    const res = await POST(developerSignup());

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/not open on this host/);
    expect(mocks.sendMagicLink).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("with COREEDGE_DEVELOPER_SIGNUP=open", () => {
  beforeEach(() => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "open");
  });

  it("sends a sign-in link that lands on Discover, and creates nothing yet", async () => {
    const res = await POST(developerSignup("Dev@Example.com"));

    expect(res.status).toBe(200);
    expect(mocks.sendMagicLink).toHaveBeenCalledWith(
      "dev@example.com",
      "/api/auth/bridge?callbackUrl=/studio/discover",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("answers an existing address and a new one identically", async () => {
    const fresh = await POST(developerSignup());
    mocks.findUser.mockResolvedValue({ id: "u1" });
    const known = await POST(developerSignup());

    expect(known.status).toBe(fresh.status);
    expect(await known.json()).toEqual(await fresh.json());
  });

  it("an address outside the developer domain list gets the same answer and no email", async () => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP_DOMAINS", "example.com");
    vi.stubEnv("AUTH_INVITATION_ONLY", "true");

    const res = await POST(developerSignup("someone@elsewhere.org"));

    expect(res.status).toBe(200);
    expect(mocks.sendMagicLink).not.toHaveBeenCalled();
  });

  it("spends the per-address bucket, keyed by a hash rather than the address", async () => {
    await POST(developerSignup("dev@example.com"));

    const key = mocks.limit.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^signup-email:[0-9a-f]{64}$/);
    expect(key).not.toContain("example.com");
  });

  it("refuses 429 once the address has had its share, and sends nothing", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 120_000, reason: "limited" });

    const res = await POST(developerSignup());

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(mocks.sendMagicLink).not.toHaveBeenCalled();
  });

  it("a limiter outage is 503, never 429", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 30_000, reason: "unavailable" });

    const res = await POST(developerSignup());

    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("LIMITER_UNAVAILABLE");
    expect(mocks.sendMagicLink).not.toHaveBeenCalled();
  });
});

describe("the partner sign-up beside it", () => {
  it("is limited per email address too", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 60_000, reason: "limited" });

    const res = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ orgName: "Acme", fullName: "Ada", email: "ada@acme.com" }),
        headers: { "Content-Type": "application/json" },
      }) as never,
    );

    expect(res.status).toBe(429);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
