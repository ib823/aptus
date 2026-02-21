import { describe, it, expect } from "vitest";
import { generateSessionCode } from "@/lib/assessment/session-code";

describe("Session Code Generator (Phase 18)", () => {
  it("should generate a 6-character code", () => {
    const code = generateSessionCode();
    expect(code).toHaveLength(6);
  });

  it("should generate uppercase alphanumeric characters only", () => {
    const code = generateSessionCode();
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it("should not contain ambiguous characters O, I, L, 0, 1", () => {
    // Generate many codes to statistically ensure excluded chars are not used
    const excludedChars = ["O", "I", "L", "0", "1"];
    for (let i = 0; i < 100; i++) {
      const code = generateSessionCode();
      for (const char of excludedChars) {
        expect(code).not.toContain(char);
      }
    }
  });

  it("should only use allowed characters", () => {
    const allowedChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 100; i++) {
      const code = generateSessionCode();
      for (const char of code) {
        expect(allowedChars).toContain(char);
      }
    }
  });

  it("should generate different codes on successive calls", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateSessionCode());
    }
    // With 29^6 = ~594 million possibilities and only 50 codes,
    // collision probability is negligible
    expect(codes.size).toBe(50);
  });

  it("should return a string", () => {
    const code = generateSessionCode();
    expect(typeof code).toBe("string");
  });
});
