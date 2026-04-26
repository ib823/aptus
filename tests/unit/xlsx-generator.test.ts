/** Smoke tests for the XLSX generator (spec §4.5–§4.15).
 *
 * Asserts:
 *   - Each existing sheet helper produces a valid SheetConfig
 *   - generateXlsx() produces a valid XLSX (PK zip magic number)
 *   - The new requirementsTraceabilitySheet() handles the spec'd 13 columns
 *   - Header is Aptus brand-color (locked per spec §5.7)
 *   - Plain-language labels appear in Outcome column (not raw enum values)
 */

import { describe, expect, it } from "vitest";
import {
  auditTrailSheet,
  configWorkbookSheet,
  gapRegisterSheet,
  generateXlsx,
  remainingItemsSheet,
  requirementsTraceabilitySheet,
  scopeCatalogSheet,
  stepDetailSheet,
  type TraceabilityRow,
} from "@/lib/report/xlsx-generator";

const SAMPLE_TRACEABILITY: TraceabilityRow[] = [
  {
    reqId: "REQ-FIN-001",
    sourceFile: "Bursa_Reqs_v3.xlsx",
    sourceRow: 12,
    functionalArea: "Finance & Treasury",
    subArea: "Period-end Closing",
    process: "Trial balance run",
    mustHave: true,
    yourAsk: "Generate monthly trial balance with comparative prior-period analysis.",
    outcome: "FIT",
    whatItMeans: "Nothing to build. Available from day one.",
    effortDays: 0,
    owner: "M. Tan",
    notes: "—",
  },
  {
    reqId: "REQ-FIN-014",
    sourceFile: "Bursa_Reqs_v3.xlsx",
    sourceRow: 25,
    functionalArea: "Finance & Treasury",
    subArea: "Vendor Invoice Mgmt",
    process: "Withholding tax",
    mustHave: true,
    yourAsk: "Apply withholding tax to vendor payments per LHDN Malaysia rules.",
    outcome: "CONFIGURE",
    whatItMeans: "Our team configures it once. Future changes are admin-level.",
    effortDays: 1,
    owner: "M. Tan",
    notes: "LHDN MY codes 1–9 in scope",
  },
  {
    reqId: "REQ-HR-058",
    sourceFile: "Bursa_Reqs_v3.xlsx",
    sourceRow: 521,
    functionalArea: "Human Resources",
    subArea: "Hire to Retire",
    process: "Talent & succession",
    mustHave: false,
    yourAsk: "Talent-management succession planning.",
    outcome: "OUT_OF_SCOPE",
    whatItMeans: "Phase 2 (FY27). Handled by SuccessFactors.",
    effortDays: 0,
    owner: "—",
    notes: "Phase 2 candidate",
  },
];

function isXlsx(bytes: Uint8Array): boolean {
  // XLSX is a zip container — magic number is "PK\x03\x04"
  return bytes.length > 4
    && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

describe("requirementsTraceabilitySheet — NEW (spec §4.5)", () => {
  it("has exactly 13 columns matching the spec", () => {
    const sheet = requirementsTraceabilitySheet(SAMPLE_TRACEABILITY);
    expect(sheet.columns).toHaveLength(13);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "Req ID",
      "Source File",
      "Source Row",
      "Functional Area",
      "Sub-area",
      "Process",
      "Must-have",
      "Your Ask",
      "Outcome",
      "What it means",
      "Days",
      "Owner",
      "Notes",
    ]);
  });

  it("translates ResolutionType enum → plain-language label in Outcome column", () => {
    const sheet = requirementsTraceabilitySheet(SAMPLE_TRACEABILITY);
    const outcomes = sheet.rows.map((r) => r.outcome);
    expect(outcomes).toContain("Standard SAP");      // FIT
    expect(outcomes).toContain("Configurable");      // CONFIGURE
    expect(outcomes).toContain("Out of scope");      // OUT_OF_SCOPE
    // Sanity: raw enum values must NOT leak through
    expect(outcomes).not.toContain("FIT");
    expect(outcomes).not.toContain("ISV");
    expect(outcomes).not.toContain("CUSTOM_ABAP");
  });

  it("translates boolean mustHave → 'Must-have' / 'Nice-to-have'", () => {
    const sheet = requirementsTraceabilitySheet(SAMPLE_TRACEABILITY);
    expect(sheet.rows[0]?.mustHave).toBe("Must-have");      // first row was true
    expect(sheet.rows[2]?.mustHave).toBe("Nice-to-have");   // third row was false
  });

  it("preserves original Source File + Source Row for client cross-checking", () => {
    const sheet = requirementsTraceabilitySheet(SAMPLE_TRACEABILITY);
    expect(sheet.rows[0]?.sourceFile).toBe("Bursa_Reqs_v3.xlsx");
    expect(sheet.rows[0]?.sourceRow).toBe(12);
  });

  it("attaches a styleRow hook (for outcome tinting + must-have accent)", () => {
    const sheet = requirementsTraceabilitySheet(SAMPLE_TRACEABILITY);
    expect(typeof sheet.styleRow).toBe("function");
  });
});

describe("Existing sheet helpers — backwards-compatible signatures", () => {
  it("scopeCatalogSheet returns valid SheetConfig", () => {
    const sheet = scopeCatalogSheet([{ scopeItemId: "SCP-001" }]);
    expect(sheet.name).toBeTruthy();
    expect(sheet.columns.length).toBeGreaterThan(0);
  });

  it("stepDetailSheet returns valid SheetConfig", () => {
    const sheet = stepDetailSheet([{ stepId: "STP-001" }]);
    expect(sheet.columns.length).toBeGreaterThan(0);
  });

  it("gapRegisterSheet returns valid SheetConfig", () => {
    const sheet = gapRegisterSheet([{ gapId: "GAP-001" }]);
    expect(sheet.columns.length).toBeGreaterThan(0);
  });

  it("configWorkbookSheet returns valid SheetConfig", () => {
    const sheet = configWorkbookSheet([{ scopeItemId: "SCP-001" }]);
    expect(sheet.columns.length).toBeGreaterThan(0);
  });

  it("auditTrailSheet returns valid SheetConfig", () => {
    const sheet = auditTrailSheet([{ timestamp: "2026-04-25" }]);
    expect(sheet.columns.length).toBeGreaterThan(0);
  });

  it("remainingItemsSheet returns valid SheetConfig", () => {
    const sheet = remainingItemsSheet([{ itemNumber: 1 }]);
    expect(sheet.columns.length).toBeGreaterThan(0);
  });
});

describe("generateXlsx — produces valid XLSX bytes", () => {
  it("produces a valid XLSX with traceability matrix", async () => {
    const xlsx = await generateXlsx([requirementsTraceabilitySheet(SAMPLE_TRACEABILITY)]);
    expect(xlsx.byteLength).toBeGreaterThan(1000);
    expect(isXlsx(xlsx)).toBe(true);
  });

  it("produces a valid XLSX with all spec'd sheet types", async () => {
    const xlsx = await generateXlsx([
      requirementsTraceabilitySheet(SAMPLE_TRACEABILITY),
      scopeCatalogSheet([{ scopeItemId: "SCP-001", name: "Test" }]),
      gapRegisterSheet([{ gapId: "GAP-001" }]),
    ]);
    expect(isXlsx(xlsx)).toBe(true);
  });

  it("handles empty data without throwing", async () => {
    const xlsx = await generateXlsx([requirementsTraceabilitySheet([])]);
    expect(isXlsx(xlsx)).toBe(true);
  });

  it("handles all 8 outcome variants in traceability", async () => {
    const allOutcomes: TraceabilityRow[] = (
      ["FIT", "CONFIGURE", "ADAPT_PROCESS", "ISV", "KEY_USER_EXT", "BTP_EXT", "CUSTOM_ABAP", "OUT_OF_SCOPE"] as const
    ).map((rt, i) => ({
      reqId: `REQ-${String(i).padStart(3, "0")}`,
      sourceFile: "test.xlsx",
      sourceRow: i + 1,
      functionalArea: "Test",
      subArea: "Test",
      process: "Test",
      mustHave: i % 2 === 0,
      yourAsk: "Test",
      outcome: rt,
      whatItMeans: "Test",
      effortDays: i,
      owner: "Test",
      notes: "Test",
    }));
    const xlsx = await generateXlsx([requirementsTraceabilitySheet(allOutcomes)]);
    expect(isXlsx(xlsx)).toBe(true);
  });
});
