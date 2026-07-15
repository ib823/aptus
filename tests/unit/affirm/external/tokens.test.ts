/**
 * Unit tests for Affirm external token helpers.
 */

import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { hashToken, mintRawToken, mintToken } from "@/lib/affirm/external/tokens";

describe("affirm external tokens", () => {
  it("mints high-entropy base64url raw tokens", () => {
    const a = mintRawToken();
    const b = mintRawToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes → 43 chars
  });

  it("hashToken is a deterministic sha256 hex of the raw token", () => {
    const raw = "example-raw-token";
    const expected = createHash("sha256").update(raw).digest("hex");
    expect(hashToken(raw)).toBe(expected);
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("mintToken returns raw + its hash consistently", () => {
    const { raw, tokenHash } = mintToken();
    expect(tokenHash).toBe(hashToken(raw));
  });
});
