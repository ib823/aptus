/**
 * Phase 0 — golden-file fixture validation for the SAP 2602 classifier.
 *
 * This test does NOT run the classifier (which would require an Anthropic
 * API key in CI). It validates the FIXTURE itself: every case captured from
 * the signed-off Bursa pass is well-formed against the strict 2602 protocol
 * (per AD-1, AD-3, AD-4, AD-6).
 *
 * Phase 3 (when the verdict-writer chokepoint exists) extends this test
 * to actually invoke the classifier against fixture inputs and assert the
 * verdict + cited scope IDs match the captured expectations. That extension
 * runs only when ANTHROPIC_API_KEY is set in env (skipped in CI).
 *
 * Refresh the fixture only on a deliberate, documented update:
 *   $ pnpm fixtures:classifier:refresh
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface FixtureCase {
  bursaRequirementId: string;
  module: string;
  code: string;
  requirementText: string;
  requirementClass: string | null;
  requirementType: string | null;
  expectedVerdict: string;
  expectedSapModule: string | null;
  expectedScopeItemIds: string | null;
  expectedScopeItemNames: string | null;
  bucket: "O" | "C" | "G" | "N/A";
}

interface Fixture {
  producedFromAssessmentId: string;
  sapVersion: string;
  cases: FixtureCase[];
}

const FIXTURE_PATH = join(__dirname, "..", "fixtures", "classification", "sap-2602", "cases.json");
const CATALOG_SNAPSHOT_PATH = join(__dirname, "..", "fixtures", "catalog", "scope-items.snapshot.json");

const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const catalogSnap = JSON.parse(readFileSync(CATALOG_SNAPSHOT_PATH, "utf8")) as {
  versions: Record<string, Array<{ id: string }>>;
};

const CATALOG_IDS = new Set<string>();
for (const items of Object.values(catalogSnap.versions)) {
  for (const it of items) CATALOG_IDS.add(it.id);
}

// Controlled vocabulary per AD-1 / classify-batch.ts protocol.
const VALID_SAP_MODULES = new Set([
  "FI-AR", "FI-AP", "FI-AA", "FI-GL", "CO", "MM", "SD", "PS", "RE-FX", "TR", "TRM",
  "SuccessFactors", "Ariba", "SAC", "BPA", "IS", "EAM",
  "Convergent-Invoicing", "ABAP-Environment", "BTP-Other", "BTP",
  "3rd-party",
  "—",
]);

const VERDICT_PREFIXES = {
  O: /^O\b/,
  C: /^C\b/,
  G: /^G\b/,
  "N/A": /^N\/?A\b/,
};

describe("Classifier fixture (SAP 2602) — well-formedness", () => {
  it("loads a non-empty fixture", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
    expect(fixture.sapVersion).toBe("2602");
  });

  it("covers every verdict bucket", () => {
    const buckets = new Set(fixture.cases.map((c) => c.bucket));
    expect(buckets.has("O"), "fixture missing an O case").toBe(true);
    expect(buckets.has("C"), "fixture missing a C case").toBe(true);
    expect(buckets.has("G"), "fixture missing a G case").toBe(true);
    expect(buckets.has("N/A"), "fixture missing an N/A case").toBe(true);
  });

  it("every case's expectedVerdict matches the declared bucket", () => {
    const mismatches: string[] = [];
    for (const c of fixture.cases) {
      const expected = VERDICT_PREFIXES[c.bucket];
      if (!expected.test(c.expectedVerdict ?? "")) {
        mismatches.push(`${c.code} (bucket=${c.bucket}): "${c.expectedVerdict}"`);
      }
    }
    expect(mismatches, `Verdict prefix mismatches: ${mismatches.join("; ")}`).toEqual([]);
  });

  it("every case's expectedSapModule is in the controlled vocab", () => {
    const invalid: string[] = [];
    for (const c of fixture.cases) {
      const m = c.expectedSapModule ?? "—";
      if (!VALID_SAP_MODULES.has(m)) {
        invalid.push(`${c.code}: "${m}"`);
      }
    }
    expect(invalid, `Out-of-vocab sapModule values: ${invalid.join("; ")}`).toEqual([]);
  });

  it("O and C verdicts cite at least one valid catalog scope-item ID", () => {
    const violations: string[] = [];
    for (const c of fixture.cases) {
      if (c.bucket !== "O" && c.bucket !== "C") continue;
      const ids = (c.expectedScopeItemIds ?? "")
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter((s) => s && s !== "—");
      if (ids.length === 0) {
        violations.push(`${c.code} (${c.bucket}): no scope IDs cited`);
        continue;
      }
      // KUE / ILM / RAL etc. are not catalog IDs but valid extensibility tags
      const KNOWN_EXTENSIBILITY_TAGS = new Set(["KUE", "ILM", "RAL"]);
      const unknown = ids.filter(
        (id) => !CATALOG_IDS.has(id) && !KNOWN_EXTENSIBILITY_TAGS.has(id),
      );
      if (unknown.length > 0) {
        violations.push(`${c.code}: cited IDs not in catalog: ${unknown.join(", ")}`);
      }
    }
    expect(violations, `Catalog citation violations:\n  ${violations.join("\n  ")}`).toEqual([]);
  });

  it("G verdicts have a non-empty product name in expectedScopeItemNames", () => {
    const violations: string[] = [];
    for (const c of fixture.cases) {
      if (c.bucket !== "G") continue;
      const name = (c.expectedScopeItemNames ?? "").trim();
      if (!name || name === "—") {
        violations.push(`${c.code}: G verdict missing product name`);
      }
    }
    expect(violations, `G-verdict product-name violations: ${violations.join("; ")}`).toEqual([]);
  });

  it("N/A verdicts have sapModule = '—'", () => {
    const violations: string[] = [];
    for (const c of fixture.cases) {
      if (c.bucket !== "N/A") continue;
      if (c.expectedSapModule !== "—" && c.expectedSapModule !== null) {
        violations.push(`${c.code}: N/A verdict has sapModule="${c.expectedSapModule}", expected "—"`);
      }
    }
    expect(violations, `N/A sapModule violations: ${violations.join("; ")}`).toEqual([]);
  });

  it("every case has a non-empty requirement text", () => {
    const empty = fixture.cases.filter((c) => !c.requirementText || c.requirementText.trim().length < 5);
    expect(empty.map((c) => c.code), "Cases with too-short requirement text").toEqual([]);
  });
});
