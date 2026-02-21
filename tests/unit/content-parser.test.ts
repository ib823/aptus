import { describe, it, expect } from "vitest";
import { parseStepContent } from "@/lib/assessment/content-parser";

describe("parseStepContent", () => {
  it("returns empty result for empty HTML", () => {
    const result = parseStepContent("");
    expect(result.mainInstructions).toBe("");
    expect(result.purpose).toBeNull();
    expect(result.prerequisites).toBeNull();
  });

  it("returns everything as mainInstructions when no sections detected", () => {
    const html = "<p>Just do the thing step by step.</p>";
    const result = parseStepContent(html);
    expect(result.mainInstructions).toBe(html);
    expect(result.purpose).toBeNull();
    expect(result.rawHtml).toBe(html);
  });

  it("extracts Purpose section", () => {
    const html = '<p class="heading">Purpose</p><p>This step creates a vendor master.</p>';
    const result = parseStepContent(html);
    expect(result.purpose).toContain("This step creates a vendor master.");
  });

  it("extracts Prerequisites section", () => {
    const html = '<p class="heading">Prerequisites</p><p>Chart of accounts must exist.</p>';
    const result = parseStepContent(html);
    expect(result.prerequisites).toContain("Chart of accounts must exist.");
  });

  it("extracts System Access section", () => {
    const html = '<p class="heading">System Access</p><p>Log on to SAP GUI.</p>';
    const result = parseStepContent(html);
    expect(result.systemAccess).toContain("Log on to SAP GUI.");
  });

  it("extracts Roles section", () => {
    const html = '<p class="heading">Roles</p><p>AP Accountant (SAP_FI_AP_ACCOUNTANT)</p>';
    const result = parseStepContent(html);
    expect(result.roles).toContain("AP Accountant");
  });

  it("extracts Master Data section", () => {
    const html = '<p class="heading">Master Data</p><p>Vendor 300100</p>';
    const result = parseStepContent(html);
    expect(result.masterData).toContain("Vendor 300100");
  });

  it("handles multiple sections in one HTML block", () => {
    const html = [
      '<p class="heading">Purpose</p><p>Create a PO.</p>',
      '<p class="heading">Prerequisites</p><p>Vendor exists.</p>',
      '<p>Step 1: Enter T-code ME21N.</p>',
    ].join("");
    const result = parseStepContent(html);
    expect(result.purpose).toContain("Create a PO.");
    expect(result.prerequisites).toContain("Vendor exists.");
  });

  it("handles null HTML", () => {
    const result = parseStepContent(null as unknown as string);
    expect(result.mainInstructions).toBe("");
    expect(result.rawHtml).toBe("");
  });

  it("preserves rawHtml", () => {
    const html = '<p class="heading">Purpose</p><p>Test</p><p>More content</p>';
    const result = parseStepContent(html);
    expect(result.rawHtml).toBe(html);
  });

  it("falls back gracefully when section tags are malformed", () => {
    const html = "<p>Purpose: do something</p><p>Details here</p>";
    const result = parseStepContent(html);
    // Should not crash, just put everything in mainInstructions
    expect(result.mainInstructions).toBe(html);
    expect(result.purpose).toBeNull();
  });
});
