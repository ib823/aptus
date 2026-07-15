/**
 * Unit tests for the generic UA fingerprint (src/lib/security/ua-fingerprint).
 */

import { describe, expect, it } from "vitest";
import { hashUserAgent, normalizeUserAgent } from "@/lib/security/ua-fingerprint";

describe("normalizeUserAgent", () => {
  it("strips browser version numbers so auto-updates keep the same device", () => {
    const chrome142 =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
    const chrome143 =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
    expect(normalizeUserAgent(chrome142)).toBe(normalizeUserAgent(chrome143));
  });

  it("maps empty UA to a deterministic sentinel", () => {
    expect(normalizeUserAgent("")).toBe("__missing-ua__");
  });

  it("keeps two different browsers distinct", () => {
    const chrome = "Mozilla/5.0 ... Chrome/142.0.0.0 Safari/537.36";
    const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(hashUserAgent(chrome)).not.toBe(hashUserAgent(firefox));
  });
});

describe("hashUserAgent", () => {
  it("is a deterministic 64-char sha256 hex", () => {
    const h = hashUserAgent("Mozilla/5.0 Chrome/142.0.0.0");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashUserAgent("Mozilla/5.0 Chrome/142.0.0.0")).toBe(h);
  });
});
