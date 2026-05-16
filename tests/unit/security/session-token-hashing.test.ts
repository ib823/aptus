import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/auth/session";

describe("generateSessionToken", () => {
  it("produces a 64-character hex string (32 bytes)", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different value on every call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("hashSessionToken", () => {
  it("produces a 64-character SHA-256 hex digest", () => {
    expect(hashSessionToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"));
  });

  it("produces different digests for different inputs", () => {
    expect(hashSessionToken("abc")).not.toBe(hashSessionToken("abd"));
  });

  it("matches the published SHA-256 of a known string", () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hashSessionToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("does not reveal the input length under SHA-256 fixed output", () => {
    expect(hashSessionToken("a".repeat(10))).toHaveLength(64);
    expect(hashSessionToken("a".repeat(1000))).toHaveLength(64);
  });
});
