/**
 * Unit tests for the Affirm external CSRF nonces (redeem + session families).
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  issueRedeemNonce,
  issueSessionNonce,
  verifyRedeemNonce,
  verifySessionNonce,
} from "@/lib/affirm/external/csrf";

beforeAll(() => {
  // The CSRF helper reads PRESALES_CSRF_SECRET (dev fallback NEXTAUTH_SECRET).
  process.env.PRESALES_CSRF_SECRET = "affirm-test-csrf-secret-32-characters-long";
});

describe("affirm redeem nonce", () => {
  it("round-trips for the same token", () => {
    const n = issueRedeemNonce("tok-123");
    expect(verifyRedeemNonce("tok-123", n)).toBe(true);
  });
  it("fails for a different token", () => {
    const n = issueRedeemNonce("tok-123");
    expect(verifyRedeemNonce("tok-999", n)).toBe(false);
  });
});

describe("affirm session nonce", () => {
  it("round-trips for the same session id", () => {
    const n = issueSessionNonce("sess-1");
    expect(verifySessionNonce("sess-1", n)).toBe(true);
  });
  it("fails for a different session id", () => {
    const n = issueSessionNonce("sess-1");
    expect(verifySessionNonce("sess-2", n)).toBe(false);
  });
});

describe("cross-family isolation", () => {
  it("a redeem nonce does not validate as a session nonce", () => {
    const n = issueRedeemNonce("same-subject");
    expect(verifySessionNonce("same-subject", n)).toBe(false);
  });
});
