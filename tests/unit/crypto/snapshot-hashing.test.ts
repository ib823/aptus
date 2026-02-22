import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Canonical hashing utility
// ---------------------------------------------------------------------------

/**
 * Recursively sorts object keys so that key order does not affect the hash.
 * Arrays are preserved in order; primitives pass through unchanged.
 */
function canonicalize(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(canonicalize);
  if (typeof data === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(data as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((data as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return data;
}

/**
 * Computes a deterministic SHA-256 hex digest for any JSON-serialisable value.
 * - Object keys are sorted (canonical form) so key order is irrelevant.
 * - Whitespace differences in the serialised form are eliminated.
 */
function computeSnapshotHash(data: unknown): string {
  const canonical = canonicalize(data);
  const json = JSON.stringify(canonical);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

/**
 * Verifies that a previously recorded hash still matches the data.
 */
function verifySnapshotHash(data: unknown, expectedHash: string): boolean {
  return computeSnapshotHash(data) === expectedHash;
}

// ---------------------------------------------------------------------------
// SignatureRecord helper
// ---------------------------------------------------------------------------

interface SignatureRecord {
  snapshotData: unknown;
  snapshotHash: string;
  signedBy: string;
  signedAt: string;
}

function createSignatureRecord(data: unknown, signedBy: string): SignatureRecord {
  return {
    snapshotData: data,
    snapshotHash: computeSnapshotHash(data),
    signedBy,
    signedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Snapshot Hashing", () => {
  it("T-HASH-001: same data produces the same hash (deterministic)", () => {
    const data = {
      assessmentId: "assess-001",
      steps: [
        { id: "s1", response: "FIT" },
        { id: "s2", response: "GAP" },
      ],
      completedAt: "2025-06-15T10:00:00Z",
    };

    const hash1 = computeSnapshotHash(data);
    const hash2 = computeSnapshotHash(data);
    const hash3 = computeSnapshotHash(data);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
    // SHA-256 produces a 64-character hex string
    expect(hash1).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
  });

  it("T-HASH-002: one field changed produces a different hash", () => {
    const base = {
      assessmentId: "assess-001",
      score: 85,
      notes: "All steps reviewed.",
    };

    const modified = {
      assessmentId: "assess-001",
      score: 86, // changed
      notes: "All steps reviewed.",
    };

    const hashBase = computeSnapshotHash(base);
    const hashModified = computeSnapshotHash(modified);

    expect(hashBase).not.toBe(hashModified);
  });

  it("T-HASH-003: field order changed in JSON produces SAME hash (canonical form)", () => {
    const data1 = { a: 1, b: 2, c: 3, nested: { z: 10, y: 20 } };
    const data2 = { c: 3, nested: { y: 20, z: 10 }, a: 1, b: 2 };

    expect(computeSnapshotHash(data1)).toBe(computeSnapshotHash(data2));
  });

  it("T-HASH-004: whitespace differences produce SAME hash (canonical form)", () => {
    // Construct two objects from JSON strings with different whitespace
    const json1 = '{"name":"test","value":42}';
    const json2 = '{ "name" : "test" , "value" : 42 }';

    const obj1 = JSON.parse(json1);
    const obj2 = JSON.parse(json2);

    expect(computeSnapshotHash(obj1)).toBe(computeSnapshotHash(obj2));
  });

  it("T-HASH-005: Unicode normalization produces consistent hashing", () => {
    // NFC vs NFD representation of "cafe\u0301" (e with combining accent)
    const nfc = "caf\u00e9"; // precomposed
    const nfd = "cafe\u0301"; // decomposed

    const data1 = { name: nfc };
    const data2 = { name: nfd };

    // These are different Unicode strings, so they MAY produce different hashes.
    // The key property is that the same normalised input always gives the same hash.
    const hashNfc1 = computeSnapshotHash(data1);
    const hashNfc2 = computeSnapshotHash(data1);
    expect(hashNfc1).toBe(hashNfc2);

    const hashNfd1 = computeSnapshotHash(data2);
    const hashNfd2 = computeSnapshotHash(data2);
    expect(hashNfd1).toBe(hashNfd2);

    // If we normalise both to NFC before hashing they should match
    const normData1 = { name: nfc.normalize("NFC") };
    const normData2 = { name: nfd.normalize("NFC") };
    expect(computeSnapshotHash(normData1)).toBe(computeSnapshotHash(normData2));
  });

  it("T-HASH-006: large assessment (10,000 steps) hashes in <1 second", () => {
    const steps = Array.from({ length: 10_000 }, (_, i) => ({
      id: `step-${i}`,
      sequence: i + 1,
      tag: i % 3 === 0 ? "BusinessProcess" : i % 3 === 1 ? "Configuration" : "Reporting",
      response: i % 2 === 0 ? "FIT" : "GAP",
      notes: `Notes for step ${i}`,
    }));

    const data = {
      assessmentId: "perf-test-001",
      projectId: "proj-999",
      steps,
      metadata: { createdAt: "2025-01-01T00:00:00Z", version: 1 },
    };

    const start = performance.now();
    const hash = computeSnapshotHash(data);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it("T-HASH-007: hash of snapshot matches hash stored in SignatureRecord", () => {
    const assessmentData = {
      assessmentId: "assess-sig-001",
      steps: [
        { id: "s1", response: "FIT", notes: "" },
        { id: "s2", response: "CONFIGURE", notes: "Needs pricing config" },
      ],
      completedAt: "2025-07-01T12:00:00Z",
    };

    const record = createSignatureRecord(assessmentData, "john.doe@example.com");

    // The hash stored in the record must match a fresh computation of the same data
    const freshHash = computeSnapshotHash(record.snapshotData);
    expect(freshHash).toBe(record.snapshotHash);

    // Verification helper also confirms
    expect(verifySnapshotHash(record.snapshotData, record.snapshotHash)).toBe(true);
  });

  it("T-HASH-008: after sign-off, data modified produces a mismatch", () => {
    const originalData = {
      assessmentId: "assess-tamper-001",
      steps: [
        { id: "s1", response: "GAP", notes: "Missing feature" },
        { id: "s2", response: "FIT", notes: "" },
      ],
      approvedBy: "manager@example.com",
    };

    // Create sign-off record
    const record = createSignatureRecord(originalData, "approver@example.com");

    // Simulate tampering: modify the signed data after sign-off
    const tamperedData = {
      ...originalData,
      steps: [
        { id: "s1", response: "FIT", notes: "Changed to FIT after sign-off" }, // tampered
        { id: "s2", response: "FIT", notes: "" },
      ],
    };

    // The stored hash should NOT match the tampered data
    expect(verifySnapshotHash(tamperedData, record.snapshotHash)).toBe(false);

    // But original data still matches
    expect(verifySnapshotHash(originalData, record.snapshotHash)).toBe(true);
  });
});
