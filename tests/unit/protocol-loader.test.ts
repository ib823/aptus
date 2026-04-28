/**
 * Phase 2 — AD-4: ClassificationProtocol loader tests.
 *
 * Validates the protocol-loader's contract independent of DB:
 *   - cache invalidation works
 *   - controlled-vocab invariants on the seeded prompt text
 *
 * The actual DB load is tested separately (integration-tier) since the
 * test runs without TEST_DATABASE_URL. We assert the seed file contains
 * the controlled-vocab + bucket-definition strings the loader is meant
 * to expose.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { clearProtocolCache } from "@/lib/analyzer/protocol-loader";

describe("Phase 2 — protocol-loader contract", () => {
  it("exposes a clearProtocolCache() function", () => {
    expect(typeof clearProtocolCache).toBe("function");
    // Should not throw when called on empty cache
    expect(() => clearProtocolCache()).not.toThrow();
  });
});

describe("Phase 2 — seed-classification-protocol.ts content invariants", () => {
  const seedSrc = readFileSync(
    join(__dirname, "..", "..", "scripts", "seed-classification-protocol.ts"),
    "utf8",
  );

  it("seeds the controlled SAP-module vocabulary", () => {
    // Verdict-writer (Phase 3) will validate sapModule writes against this set.
    // If the seed drifts from the validator, classifications will silently fail.
    const expectedTokens = [
      "FI-AR", "FI-AP", "FI-AA", "FI-GL", "CO", "MM", "SD",
      "SuccessFactors", "Ariba", "SAC", "BPA", "IS", "EAM",
    ];
    for (const tok of expectedTokens) {
      expect(seedSrc.includes(tok), `Seed prompt missing controlled-vocab token "${tok}"`).toBe(true);
    }
  });

  it("seeds all four bucket definitions", () => {
    expect(seedSrc).toMatch(/"O - Out Of The Box"/);
    expect(seedSrc).toMatch(/"C - Configuration"/);
    expect(seedSrc).toMatch(/"G - Gap"/);
    expect(seedSrc).toMatch(/"N\/A - Out of Scope"/);
  });

  it("seeds the grounding rules with brutal-honesty clause", () => {
    expect(seedSrc).toMatch(/brutally honest about Gaps/i);
    expect(seedSrc).toMatch(/do NOT invent OOTB coverage/i);
  });

  it("seeds with a stable name + version (Phase 3 verdicts will FK to this)", () => {
    expect(seedSrc).toMatch(/PROTOCOL_NAME = "SAP 2602 best-practice"/);
    expect(seedSrc).toMatch(/PROTOCOL_VERSION = "1\.\d+\.\d+"/);
  });
});

describe("Phase 2 — classifier.ts no longer hardcodes the protocol", () => {
  const classifierSrc = readFileSync(
    join(__dirname, "..", "..", "src", "lib", "analyzer", "classifier.ts"),
    "utf8",
  );

  it("does not contain the legacy SYSTEM_PROMPT const", () => {
    // The 5-line "const SYSTEM_PROMPT = `..." pattern. If this returns the
    // const is back, drift is happening and the loader isn't being used.
    const constMatch = classifierSrc.match(/const SYSTEM_PROMPT\s*=/);
    expect(constMatch, "classifier.ts should load the prompt via loadActiveProtocol(), not via a hardcoded const").toBeNull();
  });

  it("imports loadActiveProtocol from the loader", () => {
    expect(classifierSrc).toMatch(/loadActiveProtocol.*protocol-loader/s);
  });
});

describe("Phase 2 — classify-batch.ts no longer hardcodes the protocol", () => {
  const batchSrc = readFileSync(
    join(__dirname, "..", "..", "scripts", "classify-batch.ts"),
    "utf8",
  );

  it("does not contain the legacy SAP_2602_PROTOCOL const", () => {
    // Look for the actual `const SAP_2602_PROTOCOL = ...` declaration
    // (mentions in comments are fine).
    const constMatch = batchSrc.match(/^const SAP_2602_PROTOCOL\s*=/m);
    expect(constMatch, "classify-batch.ts should load the prompt via loadProtocolText(), not via a hardcoded const").toBeNull();
  });

  it("loads protocol text from the DB at emit time", () => {
    expect(batchSrc).toMatch(/loadProtocolText/);
    expect(batchSrc).toMatch(/classificationProtocol\.findFirst/);
  });
});
