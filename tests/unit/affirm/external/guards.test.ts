/**
 * Unit tests for the Affirm external guest guards.
 *
 * The per-reason session rejection matrix (revoked / superseded / ended /
 * expired / wrong bundle state) is exercised against readGuestSession in
 * session.test.ts. Here we test the guard's own responsibilities: the
 * fail-closed feature flag, cookie plumbing, and uaHash attach.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SessionModule from "@/lib/affirm/external/session";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
  readGuestSession: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies, headers: mocks.headers }));
vi.mock("@/lib/affirm/external/session", async () => {
  const actual = await vi.importActual<typeof SessionModule>("@/lib/affirm/external/session");
  return { ...actual, readGuestSession: mocks.readGuestSession };
});

import { isAffirmExternalEnabled, isDeviceVerified, requireGuestSession } from "@/lib/affirm/external/guards";

function cookieJar(value: string | undefined) {
  return { get: (_name: string) => (value === undefined ? undefined : { value }) };
}
function headerBag(ua: string) {
  return { get: (name: string) => (name === "user-agent" ? ua : null) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue(cookieJar("raw-token"));
  mocks.headers.mockResolvedValue(headerBag("Mozilla/5.0 Chrome/142"));
});
afterEach(() => vi.unstubAllEnvs());

describe("isAffirmExternalEnabled", () => {
  it("only true for the exact string 'true'", () => {
    vi.stubEnv("AFFIRM_EXTERNAL_ENABLED", "true");
    expect(isAffirmExternalEnabled()).toBe(true);
    vi.stubEnv("AFFIRM_EXTERNAL_ENABLED", "1");
    expect(isAffirmExternalEnabled()).toBe(false);
    vi.stubEnv("AFFIRM_EXTERNAL_ENABLED", "");
    expect(isAffirmExternalEnabled()).toBe(false);
  });
});

describe("requireGuestSession", () => {
  it("fail-closed: null when the flag is off (session never consulted)", async () => {
    vi.stubEnv("AFFIRM_EXTERNAL_ENABLED", "");
    const r = await requireGuestSession();
    expect(r).toBeNull();
    expect(mocks.readGuestSession).not.toHaveBeenCalled();
  });

  it("null when the session does not resolve", async () => {
    vi.stubEnv("AFFIRM_EXTERNAL_ENABLED", "true");
    mocks.readGuestSession.mockResolvedValue(null);
    expect(await requireGuestSession()).toBeNull();
  });

  it("returns the chain + uaHash for a valid session", async () => {
    vi.stubEnv("AFFIRM_EXTERNAL_ENABLED", "true");
    mocks.readGuestSession.mockResolvedValue({
      session: { id: "s1" },
      grant: { id: "g1", otpVerifiedUaHashes: [] },
      bundle: { id: "b1", state: "issued" },
    });
    const r = await requireGuestSession();
    expect(r).not.toBeNull();
    expect(r!.grant.id).toBe("g1");
    expect(r!.uaHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isDeviceVerified", () => {
  it("true only when the uaHash is recorded on the grant", () => {
    expect(isDeviceVerified({ otpVerifiedUaHashes: ["ua1", "ua2"] }, "ua2")).toBe(true);
    expect(isDeviceVerified({ otpVerifiedUaHashes: ["ua1"] }, "ua2")).toBe(false);
    expect(isDeviceVerified({ otpVerifiedUaHashes: [] }, "ua2")).toBe(false);
  });
});
