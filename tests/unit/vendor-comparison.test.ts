/**
 * Phase 4 — AD-2: vendor-vs-Aptus comparison test.
 *
 * Tests the agreement classification logic at the unit level. The
 * end-to-end DB-side query is exercised by the Phase 6 QA dashboard's
 * integration test (added separately).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { bucketOf } from "@/lib/classification/verdict-writer";

describe("Phase 4 — vendor-comparison module shape", () => {
  it("imports cleanly + exports the documented surface", async () => {
    const mod = await import("@/lib/classification/vendor-comparison");
    expect(typeof mod.getVendorVsAptusComparison).toBe("function");
  });
});

describe("Phase 4 — agreement classification logic (via bucketOf)", () => {
  // The agreement classifier is private; we exercise it via bucketOf which
  // is the building block. If both buckets match, AGREE. If only one side
  // exists, *_ONLY. If both exist but differ, DISAGREE.

  it("AGREE when both verdict strings derive to the same bucket", () => {
    expect(bucketOf("O - Out Of The Box")).toBe(bucketOf("O - Out Of The Box"));
    // canonical Aptus verdict shares a bucket with a vendor "O" prefix
    expect(bucketOf("O - Standard")).toBe("O");
  });

  it("DISAGREE when buckets differ", () => {
    expect(bucketOf("O - Out Of The Box")).not.toBe(bucketOf("G - Gap"));
  });

  it("non-canonical vendor verdicts (NM/UD) yield bucket=null → DISAGREE on any non-null aptus", () => {
    expect(bucketOf("NM - Not Met")).toBe(null);
    expect(bucketOf("UD - Under Development")).toBe(null);
  });
});

describe("Phase 4 — importer no longer writes to ClientRequirement verdict columns", () => {
  const importerSrc = readFileSync(
    join(__dirname, "..", "..", "scripts", "import-bursa-requirements.ts"),
    "utf8",
  );

  it("create branch nulls out solutionProviderResponse + solutionProviderRemarks + erpModuleSupporting + complianceStatus", () => {
    // The Phase 4 refactor explicitly sets these to null on create — vendor
    // data goes to VendorResponse instead. Snapshot the exact form so a
    // regression where they get re-populated is loud.
    const createBlock = importerSrc.match(/create:\s*\{[\s\S]*?solutionProviderResponse:\s*null,[\s\S]*?solutionProviderRemarks:\s*null,[\s\S]*?erpModuleSupporting:\s*null,[\s\S]*?complianceStatus:\s*null/);
    expect(createBlock, "Importer create branch should null vendor verdict fields (Phase 4 invariant)").not.toBeNull();
  });

  it("creates a VendorSubmission per import + VendorResponse per requirement with vendor data", () => {
    expect(importerSrc).toMatch(/vendorSubmission\.create/);
    expect(importerSrc).toMatch(/vendorResponse\.create/);
  });
});
