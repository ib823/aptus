/**
 * STATUS: Wired to real production code
 * REAL MODULE: src/lib/assessment/content-parser.ts
 * Tests the parseStepContent() function against SAP HTML fixtures.
 */
import { describe, it, expect } from "vitest";
import { parseStepContent } from "@/lib/assessment/content-parser";

// ---------------------------------------------------------------------------
// Adapter: map flat ParsedStepContent to section array for legacy assertions
// ---------------------------------------------------------------------------

interface ContentSection {
  type: string;
  content: string;
  hasTable: boolean;
}

function toSections(result: ReturnType<typeof parseStepContent>): ContentSection[] {
  const mapping: Array<{ key: keyof typeof result; type: string }> = [
    { key: "purpose", type: "PURPOSE" },
    { key: "prerequisites", type: "PREREQUISITES" },
    { key: "systemAccess", type: "SYSTEM_ACCESS" },
    { key: "roles", type: "ROLES" },
    { key: "masterData", type: "MASTER_DATA" },
    { key: "expectedResult", type: "EXPECTED_RESULT" },
    { key: "procedure", type: "PROCEDURE" },
  ];
  const sections: ContentSection[] = [];
  for (const m of mapping) {
    const val = result[m.key];
    if (typeof val === "string" && val.trim().length > 0) {
      sections.push({
        type: m.type,
        content: val,
        hasTable: /<table[\s>]/i.test(val),
      });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// SAP Cash Journal Fixture
// ---------------------------------------------------------------------------

const SAP_CASH_JOURNAL_FIXTURE = [
  '<p class="heading">Purpose\n</p>',
  "<p>Post petty cash receipts and payments using the Cash Journal.</p>",
  '<p class="heading">Prerequisites\n</p>',
  "<p>A cash journal must be configured for the relevant company code. ",
  "G/L accounts for cash transactions must be set up.</p>",
  '<p class="heading">System Access\n</p>',
  '<table><tr><th>Transaction</th><th>Description</th></tr>',
  "<tr><td>FBCJ</td><td>Cash Journal</td></tr></table>",
  '<p class="heading">Roles\n</p>',
  '<table><tr><th>Role</th><th>Description</th></tr>',
  "<tr><td>SAP_FI_AP_ACCOUNTANT</td><td>Accounts Payable Accountant</td></tr>",
  "<tr><td>SAP_FI_GL_ACCOUNTANT</td><td>General Ledger Accountant</td></tr></table>",
  '<p class="heading">Master Data\n</p>',
  "<p>Vendor 300100 &#8211; Office Supplies Vendor</p>",
  "<p>G/L Account 100000 &#8211; Petty Cash</p>",
].join("");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseStepContent (wired to production)", () => {
  it("T-CSP-001: 'Purpose' marker extracts Purpose section", () => {
    const html = '<p>Purpose</p><p>This step creates a journal entry.</p>';
    const result = parseStepContent(html);

    expect(result.purpose).not.toBeNull();
    expect(result.purpose).toContain("journal entry");
  });

  it("T-CSP-003: 'Prerequisites' marker extracts section", () => {
    const html = '<p>Prerequisites</p><p>Chart of accounts must exist.</p>';
    const result = parseStepContent(html);

    expect(result.prerequisites).not.toBeNull();
    expect(result.prerequisites).toContain("Chart of accounts must exist");
  });

  it("T-CSP-004: 'System Access' + table extracts with table content", () => {
    const html = [
      "<p>System Access</p>",
      '<table><tr><th>Transaction</th><th>Description</th></tr>',
      "<tr><td>FBCJ</td><td>Cash Journal</td></tr></table>",
    ].join("");
    const result = parseStepContent(html);

    expect(result.systemAccess).not.toBeNull();
    expect(result.systemAccess).toContain("FBCJ");
    const sections = toSections(result);
    const sysSection = sections.find((s) => s.type === "SYSTEM_ACCESS");
    expect(sysSection!.hasTable).toBe(true);
  });

  it("T-CSP-005: 'Roles' + role table extracts ROLES section", () => {
    const html = [
      "<p>Roles</p>",
      '<table><tr><th>Role</th><th>Description</th></tr>',
      "<tr><td>SAP_FI_AP_ACCOUNTANT</td><td>AP Accountant</td></tr></table>",
    ].join("");
    const result = parseStepContent(html);

    expect(result.roles).not.toBeNull();
    expect(result.roles).toContain("SAP_FI_AP_ACCOUNTANT");
  });

  it("T-CSP-006: 'Master Data' extracts MASTER_DATA section", () => {
    const html = "<p>Master Data</p><p>Vendor 300100 — Office Supplies</p>";
    const result = parseStepContent(html);

    expect(result.masterData).not.toBeNull();
    expect(result.masterData).toContain("Vendor 300100");
  });

  it("T-CSP-007: NO markers — entire text goes to mainInstructions", () => {
    const html = "<p>Just do the thing step by step.</p>";
    const result = parseStepContent(html);

    const sections = toSections(result);
    expect(sections).toHaveLength(0);
    expect(result.mainInstructions).toContain("Just do the thing");
  });

  it("T-CSP-012: empty string returns safe default", () => {
    const result = parseStepContent("");
    expect(result.purpose).toBeNull();
    expect(result.mainInstructions).toBe("");
    expect(result.hasMeaningfulContent).toBe(false);
  });

  it("T-CSP-014: >50,000 chars completes within 50ms", () => {
    const chunk = "<p>Purpose</p><p>" + "A".repeat(500) + "</p>";
    const largeHtml = chunk.repeat(100);
    expect(largeHtml.length).toBeGreaterThan(50_000);

    const start = performance.now();
    const result = parseStepContent(largeHtml);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result).toBeDefined();
  });

  it("T-CSP-015: real SAP Cash Journal content correctly identifies sections", () => {
    const result = parseStepContent(SAP_CASH_JOURNAL_FIXTURE);
    const sections = toSections(result);
    const types = sections.map((s) => s.type);

    expect(types).toContain("PURPOSE");
    expect(types).toContain("PREREQUISITES");
    expect(types).toContain("SYSTEM_ACCESS");
    expect(types).toContain("ROLES");
    expect(types).toContain("MASTER_DATA");

    const sysAccess = sections.find((s) => s.type === "SYSTEM_ACCESS");
    expect(sysAccess!.hasTable).toBe(true);
    expect(sysAccess!.content).toContain("FBCJ");

    const roles = sections.find((s) => s.type === "ROLES");
    expect(roles!.hasTable).toBe(true);
    expect(roles!.content).toContain("SAP_FI_AP_ACCOUNTANT");

    const masterData = sections.find((s) => s.type === "MASTER_DATA");
    expect(masterData).toBeDefined();
    expect(masterData!.content).toContain("Vendor 300100");

    const prereqs = sections.find((s) => s.type === "PREREQUISITES");
    expect(prereqs!.content).toContain("company code");
  });

  it("T-CSP-016: hasMeaningfulContent is true for substantial content", () => {
    const html = "<p>Purpose</p><p>This is a detailed purpose section with more than fifty characters of meaningful text content.</p>";
    const result = parseStepContent(html);
    expect(result.hasMeaningfulContent).toBe(true);
  });

  it("T-CSP-017: hasMeaningfulContent is false for empty/trivial content", () => {
    const html = "<p>Short</p>";
    const result = parseStepContent(html);
    expect(result.hasMeaningfulContent).toBe(false);
  });

  it("T-CSP-018: Expected Result section is detected", () => {
    const html = "<p>Expected Result</p><p>The invoice should be posted successfully.</p>";
    const result = parseStepContent(html);
    expect(result.expectedResult).not.toBeNull();
    expect(result.expectedResult).toContain("invoice should be posted");
  });

  it("T-CSP-019: Procedure section is detected", () => {
    const html = "<p>Procedure</p><p>1. Open transaction VA01. 2. Enter sales order data.</p>";
    const result = parseStepContent(html);
    expect(result.procedure).not.toBeNull();
    expect(result.procedure).toContain("VA01");
  });

  it("T-CSP-020: test boilerplate is stripped before parsing", () => {
    const html = '<p>Purpose</p><p>Test Case ID: TC-001</p><p>Tester Name: John</p><p>Create a purchase order with the following details.</p>';
    const result = parseStepContent(html);
    // Boilerplate should be stripped; meaningful content should remain
    expect(result.purpose).not.toBeNull();
    expect(result.purpose).not.toContain("Test Case ID");
    expect(result.purpose).not.toContain("Tester Name");
    expect(result.purpose).toContain("purchase order");
  });
});
