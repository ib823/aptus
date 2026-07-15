/**
 * Unit tests for the generic HMAC nonce factory (src/lib/security/hmac-nonce).
 */

import { describe, expect, it } from "vitest";
import { createNonceScheme } from "@/lib/security/hmac-nonce";

const SECRET = "test-secret-at-least-16-chars-long";
const getSecret = () => SECRET;

describe("createNonceScheme", () => {
  it("issues a nonce that verifies against the same subject", () => {
    const scheme = createNonceScheme("purpose-a", getSecret);
    const nonce = scheme.issue("subject-1");
    expect(scheme.verify("subject-1", nonce)).toBe(true);
  });

  it("rejects a nonce for a different subject", () => {
    const scheme = createNonceScheme("purpose-a", getSecret);
    const nonce = scheme.issue("subject-1");
    expect(scheme.verify("subject-2", nonce)).toBe(false);
  });

  it("rejects an empty or malformed nonce", () => {
    const scheme = createNonceScheme("purpose-a", getSecret);
    expect(scheme.verify("subject-1", "")).toBe(false);
    expect(scheme.verify("subject-1", "not-hex-zzzz")).toBe(false);
    expect(scheme.verify("subject-1", "ab")).toBe(false);
  });

  it("does not cross-validate across purpose labels", () => {
    const a = createNonceScheme("purpose-a", getSecret);
    const b = createNonceScheme("purpose-b", getSecret);
    const nonce = a.issue("subject-1");
    expect(b.verify("subject-1", nonce)).toBe(false);
  });

  it("does not validate under a different secret", () => {
    const a = createNonceScheme("purpose-a", () => SECRET);
    const b = createNonceScheme("purpose-a", () => "another-secret-16-chars-xx");
    const nonce = a.issue("subject-1");
    expect(b.verify("subject-1", nonce)).toBe(false);
  });
});
