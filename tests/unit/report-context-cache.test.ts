/**
 * Phase 10 — report-context + report-cache module shape tests.
 */

import { describe, it, expect } from "vitest";

describe("Phase 10 — report-context module", () => {
  it("exports buildReportContext + provenanceFooter", async () => {
    const mod = await import("@/lib/report/report-context");
    expect(typeof mod.buildReportContext).toBe("function");
    expect(typeof mod.provenanceFooter).toBe("function");
  });

  it("provenanceFooter formats correctly", async () => {
    const { provenanceFooter } = await import("@/lib/report/report-context");
    const generatedAt = new Date("2026-04-28T00:00:00.000Z");
    const footer = provenanceFooter({
      assessmentId: "a1",
      generatedAt,
      generatedBy: "alice",
      protocolVersionId: "p1",
      protocolVersionName: "SAP 2602 best-practice",
      protocolVersionVersion: "1.0.0",
      catalogVersionId: "c1",
      catalogVersion: "2602",
      catalogEdition: "PUBLIC",
      snapshotId: "s1",
      isFrozen: true,
    });
    expect(footer).toContain("Protocol: SAP 2602 best-practice v1.0.0");
    expect(footer).toContain("Catalog: 2602/PUBLIC");
    expect(footer).toContain("Generated: 2026-04-28T00:00:00.000Z");
    expect(footer).toContain("By: alice");
  });

  it("provenanceFooter handles null protocol/catalog gracefully", async () => {
    const { provenanceFooter } = await import("@/lib/report/report-context");
    const footer = provenanceFooter({
      assessmentId: "a1",
      generatedAt: new Date("2026-04-28T00:00:00.000Z"),
      generatedBy: "alice",
      protocolVersionId: null,
      protocolVersionName: null,
      protocolVersionVersion: null,
      catalogVersionId: null,
      catalogVersion: null,
      catalogEdition: null,
      snapshotId: null,
      isFrozen: false,
    });
    expect(footer).toContain("Generated: 2026-04-28T00:00:00.000Z");
    expect(footer).toContain("By: alice");
    expect(footer).not.toContain("Protocol:");
    expect(footer).not.toContain("Catalog:");
  });
});

describe("Phase 10 — report-cache module", () => {
  it("exports lookupCachedReport + recordGeneratedReport", async () => {
    const mod = await import("@/lib/report/report-cache");
    expect(typeof mod.lookupCachedReport).toBe("function");
    expect(typeof mod.recordGeneratedReport).toBe("function");
  });
});
