import { describe, it, expect } from "vitest";
import { computeCanonicalHash, verifyHash } from "@/lib/signoff/hash-engine";

describe("Hash Engine (Phase 30)", () => {
  describe("computeCanonicalHash", () => {
    it("should produce a 64-character hex string (SHA-256)", () => {
      const hash = computeCanonicalHash({ foo: "bar" });
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it("should produce deterministic output for the same data", () => {
      const data = { name: "test", value: 42 };
      const hash1 = computeCanonicalHash(data);
      const hash2 = computeCanonicalHash(data);
      expect(hash1).toBe(hash2);
    });

    it("should produce same hash regardless of key order", () => {
      const data1 = { a: 1, b: 2, c: 3 };
      const data2 = { c: 3, a: 1, b: 2 };
      expect(computeCanonicalHash(data1)).toBe(computeCanonicalHash(data2));
    });

    it("should handle nested objects with different key orders", () => {
      const data1 = { outer: { z: 1, a: 2 }, name: "test" };
      const data2 = { name: "test", outer: { a: 2, z: 1 } };
      expect(computeCanonicalHash(data1)).toBe(computeCanonicalHash(data2));
    });

    it("should produce different hashes for different data", () => {
      const hash1 = computeCanonicalHash({ a: 1 });
      const hash2 = computeCanonicalHash({ a: 2 });
      expect(hash1).not.toBe(hash2);
    });

    it("should handle arrays", () => {
      const hash = computeCanonicalHash([1, 2, 3]);
      expect(hash).toHaveLength(64);
    });

    it("should handle strings", () => {
      const hash = computeCanonicalHash("hello world");
      expect(hash).toHaveLength(64);
    });

    it("should handle numbers", () => {
      const hash = computeCanonicalHash(42);
      expect(hash).toHaveLength(64);
    });

    it("should handle null and undefined", () => {
      const hashNull = computeCanonicalHash(null);
      const hashUndefined = computeCanonicalHash(undefined);
      expect(hashNull).toHaveLength(64);
      expect(hashUndefined).toHaveLength(64);
    });

    it("should handle deeply nested objects", () => {
      const data = {
        level1: {
          level2: {
            level3: {
              value: "deep",
            },
          },
        },
      };
      const hash = computeCanonicalHash(data);
      expect(hash).toHaveLength(64);
    });
  });

  describe("verifyHash", () => {
    it("should return true for data matching its hash", () => {
      const data = { assessment: "test", version: 1 };
      const hash = computeCanonicalHash(data);
      expect(verifyHash(data, hash)).toBe(true);
    });

    it("should return false for data not matching the hash", () => {
      const data = { assessment: "test", version: 1 };
      const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";
      expect(verifyHash(data, wrongHash)).toBe(false);
    });

    it("should return true even with different key order", () => {
      const data1 = { b: 2, a: 1 };
      const hash = computeCanonicalHash({ a: 1, b: 2 });
      expect(verifyHash(data1, hash)).toBe(true);
    });

    it("should return false when data is modified", () => {
      const originalData = { name: "original", count: 5 };
      const hash = computeCanonicalHash(originalData);
      const modifiedData = { name: "modified", count: 5 };
      expect(verifyHash(modifiedData, hash)).toBe(false);
    });
  });
});
