/**
 * Phase 3 — AD-1, AD-6, AD-7: verdict-writer chokepoint tests.
 *
 * Validates the synchronous validation contract of the writer (input shape,
 * controlled-vocab, bucket detection). The DB-side invariants (FK enforcement,
 * frozen-row guard, transactional append) are tested separately in
 * tests/integration/verdict-writer-db.test.ts (which requires TEST_DATABASE_URL).
 */

import { describe, it, expect } from "vitest";
import { bucketOf, VerdictWriteError } from "@/lib/classification/verdict-writer";

describe("Phase 3 — bucketOf()", () => {
  it("derives O / C / G / N/A from canonical verdict strings", () => {
    expect(bucketOf("O - Out Of The Box")).toBe("O");
    expect(bucketOf("C - Configuration")).toBe("C");
    expect(bucketOf("G - Gap")).toBe("G");
    expect(bucketOf("N/A - Out of Scope")).toBe("N/A");
  });

  it("handles trailing whitespace + lowercase", () => {
    expect(bucketOf("  O - Out Of The Box  ")).toBe("O");
    expect(bucketOf("o - out of the box")).toBe("O");
    expect(bucketOf("g - GAP")).toBe("G");
  });

  it("returns null for unknown prefixes (legacy NM/UD codes)", () => {
    expect(bucketOf("NM - Not Met")).toBe(null);
    expect(bucketOf("UD - Under Development")).toBe(null);
    expect(bucketOf("")).toBe(null);
    expect(bucketOf("   ")).toBe(null);
  });

  it("handles N/A with various separators", () => {
    expect(bucketOf("N/A - Out of Scope")).toBe("N/A");
    expect(bucketOf("NA - Out of Scope")).toBe("N/A");
    expect(bucketOf("n/a")).toBe("N/A");
  });
});

describe("Phase 3 — VerdictWriteError", () => {
  it("preserves the structured error code", () => {
    const e = new VerdictWriteError("test", "TEST_CODE");
    expect(e.code).toBe("TEST_CODE");
    expect(e.name).toBe("VerdictWriteError");
    expect(e instanceof Error).toBe(true);
  });
});

describe("Phase 3 — verdict-writer.ts module shape", () => {
  it("exports the intended public API", async () => {
    const mod = await import("@/lib/classification/verdict-writer");
    expect(typeof mod.writeVerdict).toBe("function");
    expect(typeof mod.getCurrentVerdict).toBe("function");
    expect(typeof mod.bucketOf).toBe("function");
    expect(mod.VerdictWriteError).toBeDefined();
  });
});
