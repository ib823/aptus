/**
 * Unit tests for the Affirm external guest cookie contract.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AFFIRM_GUEST_COOKIE_NAME,
  AFFIRM_GUEST_COOKIE_PATH,
  buildAffirmGuestCookie,
  clearAffirmGuestCookie,
} from "@/lib/affirm/external/cookies";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("affirm guest cookie", () => {
  it("is scoped to /a, HttpOnly, SameSite=Strict", () => {
    const c = buildAffirmGuestCookie("raw-token");
    expect(c.name).toBe(AFFIRM_GUEST_COOKIE_NAME);
    expect(c.path).toBe(AFFIRM_GUEST_COOKIE_PATH);
    expect(AFFIRM_GUEST_COOKIE_PATH).toBe("/a");
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("strict");
    expect(c.value).toBe("raw-token");
    expect(c.maxAge).toBe(3600);
  });

  it("is Secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(buildAffirmGuestCookie("x").secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(buildAffirmGuestCookie("x").secure).toBe(false);
  });

  it("clear cookie zeroes maxAge and value", () => {
    const c = clearAffirmGuestCookie();
    expect(c.maxAge).toBe(0);
    expect(c.value).toBe("");
    expect(c.path).toBe("/a");
  });
});
