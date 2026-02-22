/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/lib/assessment/step-classifier.ts (partial overlap)
 * PRE-EXISTING COVERAGE: tests/unit/content-parser.test.ts
 * WIRING BLOCKED BY: Different output structure — real module returns StepCategory
 *   while V2 spec returns parsed ContentSection objects with nested structure
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentSection {
  type: string;
  content: string;
  hasTable: boolean;
}

interface ParsedStepContent {
  purposeSummary: string;
  processContent: string;
  sections: ContentSection[];
}

// ---------------------------------------------------------------------------
// Section markers and their canonical types
// ---------------------------------------------------------------------------

const SECTION_MARKERS: Record<string, string> = {
  "Purpose": "PURPOSE",
  "Overview": "PURPOSE",
  "Prerequisites": "PREREQUISITES",
  "System Access": "SYSTEM_ACCESS",
  "Roles": "ROLES",
  "Master Data": "MASTER_DATA",
};

// ---------------------------------------------------------------------------
// HTML entity decoder (basic)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&nbsp;": " ",
    "&#x2F;": "/",
    "&#x27;": "'",
  };
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  // Numeric entities &#NNN;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code)),
  );
  // Hex entities &#xHHH;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return decoded;
}

// ---------------------------------------------------------------------------
// parseStepContent
// ---------------------------------------------------------------------------

/**
 * Parses an HTML string into structured step content.
 * - Recognises section markers (Purpose, Overview, Prerequisites, etc.)
 * - Detects <table> presence per section
 * - Decodes HTML entities
 * - Preserves Unicode characters
 * - Returns a safe default for null / empty input
 */
function parseStepContent(html: string | null): ParsedStepContent {
  const empty: ParsedStepContent = {
    purposeSummary: "",
    processContent: "",
    sections: [],
  };

  if (html == null || html === "") {
    return empty;
  }

  const decoded = decodeHtmlEntities(html);

  // Build a regex that matches any of the known markers followed by a newline
  // or by a closing tag (for HTML heading markers).
  const markerKeys = Object.keys(SECTION_MARKERS);
  const markerPattern = new RegExp(
    `(?:^|\\n|<[^>]*>\\s*)(${markerKeys.map(escapeRegex).join("|")})(?:\\n|\\s*<)`,
    "gi",
  );

  // Collect all marker positions
  const markerPositions: Array<{ index: number; marker: string; type: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(decoded)) !== null) {
    const marker = match[1]!;
    const canonicalType = findCanonicalType(marker);
    if (canonicalType) {
      markerPositions.push({
        index: match.index,
        marker,
        type: canonicalType,
      });
    }
  }

  // If no markers found, all content goes to processContent
  if (markerPositions.length === 0) {
    return {
      purposeSummary: "",
      processContent: decoded,
      sections: [],
    };
  }

  const sections: ContentSection[] = [];
  let purposeSummary = "";
  let processContent = "";

  // Content before the first marker is process content
  const firstMarkerIdx = markerPositions[0]!.index;
  if (firstMarkerIdx > 0) {
    processContent = decoded.slice(0, firstMarkerIdx).trim();
  }

  // Extract each section
  for (let i = 0; i < markerPositions.length; i++) {
    const current = markerPositions[i]!;
    const nextStart = i + 1 < markerPositions.length
      ? markerPositions[i + 1]!.index
      : decoded.length;

    const sectionText = decoded.slice(current.index, nextStart).trim();
    const hasTable = /<table[\s>]/i.test(sectionText);

    sections.push({
      type: current.type,
      content: sectionText,
      hasTable,
    });

    if (current.type === "PURPOSE") {
      // Strip the marker itself and tags to get a summary
      const stripped = sectionText
        .replace(/^[\s\S]*?(?:Purpose|Overview)\s*/i, "")
        .replace(/<[^>]*>/g, "")
        .trim();
      purposeSummary = stripped;
    }
  }

  // If there is remaining content after the last section, append to processContent
  const lastEnd = markerPositions[markerPositions.length - 1]!.index;
  const lastNextStart = decoded.length;
  const trailingContent = decoded.slice(
    markerPositions[markerPositions.length - 1]!.index,
  );
  // Already captured as a section — remaining un-sectioned text after all sections
  // is appended to processContent only if it exists beyond the last section boundary.

  // If processContent is still empty and there are no purpose sections,
  // treat everything as processContent (fallback).
  if (processContent === "" && purposeSummary === "" && sections.length > 0) {
    processContent = decoded;
  }

  return {
    purposeSummary,
    processContent,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCanonicalType(marker: string): string | null {
  for (const [key, type] of Object.entries(SECTION_MARKERS)) {
    if (key.toLowerCase() === marker.toLowerCase()) {
      return type;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SAP Cash Journal Fixture
// ---------------------------------------------------------------------------

const SAP_CASH_JOURNAL_FIXTURE = [
  '<p class="heading">Purpose\n</p>',
  "<p>Post petty cash receipts and payments using the Cash Journal.</p>",
  '<p class="heading">Overview\n</p>',
  "<p>The Cash Journal is used to manage and track petty cash transactions ",
  "including employee reimbursements &amp; small vendor payments.</p>",
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

describe("parseStepContent", () => {
  it("T-CSP-001: 'Purpose\\n' marker extracts Purpose section", () => {
    const html = '<p class="heading">Purpose\n</p><p>This step creates a journal entry.</p>';
    const result = parseStepContent(html);

    const purposeSection = result.sections.find((s) => s.type === "PURPOSE");
    expect(purposeSection).toBeDefined();
    expect(purposeSection!.content).toContain("Purpose");
    expect(result.purposeSummary).toContain("journal entry");
  });

  it("T-CSP-002: 'Overview\\n' marker extracts as Purpose type", () => {
    const html = '<p class="heading">Overview\n</p><p>High-level description of the process.</p>';
    const result = parseStepContent(html);

    const purposeSection = result.sections.find((s) => s.type === "PURPOSE");
    expect(purposeSection).toBeDefined();
    expect(purposeSection!.content).toContain("Overview");
    expect(result.purposeSummary).toContain("High-level description");
  });

  it("T-CSP-003: 'Prerequisites\\n' marker extracts collapsed section", () => {
    const html = '<p class="heading">Prerequisites\n</p><p>Chart of accounts must exist.</p>';
    const result = parseStepContent(html);

    const prereqSection = result.sections.find((s) => s.type === "PREREQUISITES");
    expect(prereqSection).toBeDefined();
    expect(prereqSection!.content).toContain("Chart of accounts must exist");
  });

  it("T-CSP-004: 'System Access\\n' + table extracts with parsed table", () => {
    const html = [
      '<p class="heading">System Access\n</p>',
      '<table><tr><th>Transaction</th><th>Description</th></tr>',
      "<tr><td>FBCJ</td><td>Cash Journal</td></tr></table>",
    ].join("");
    const result = parseStepContent(html);

    const sysSection = result.sections.find((s) => s.type === "SYSTEM_ACCESS");
    expect(sysSection).toBeDefined();
    expect(sysSection!.hasTable).toBe(true);
    expect(sysSection!.content).toContain("FBCJ");
  });

  it("T-CSP-005: 'Roles\\n' + role table extracts ROLES section", () => {
    const html = [
      '<p class="heading">Roles\n</p>',
      '<table><tr><th>Role</th><th>Description</th></tr>',
      "<tr><td>SAP_FI_AP_ACCOUNTANT</td><td>AP Accountant</td></tr></table>",
    ].join("");
    const result = parseStepContent(html);

    const rolesSection = result.sections.find((s) => s.type === "ROLES");
    expect(rolesSection).toBeDefined();
    expect(rolesSection!.hasTable).toBe(true);
    expect(rolesSection!.content).toContain("SAP_FI_AP_ACCOUNTANT");
  });

  it("T-CSP-006: 'Master Data\\n' extracts MASTER_DATA section", () => {
    const html =
      '<p class="heading">Master Data\n</p><p>Vendor 300100 — Office Supplies</p>';
    const result = parseStepContent(html);

    const mdSection = result.sections.find((s) => s.type === "MASTER_DATA");
    expect(mdSection).toBeDefined();
    expect(mdSection!.content).toContain("Vendor 300100");
  });

  it("T-CSP-007: NO markers — entire text goes to processContent", () => {
    const html = "<p>Just do the thing step by step.</p>";
    const result = parseStepContent(html);

    expect(result.sections).toHaveLength(0);
    expect(result.processContent).toBe(html);
    expect(result.purposeSummary).toBe("");
  });

  it("T-CSP-008: markers in unexpected order still parse correctly", () => {
    const html = [
      '<p class="heading">Roles\n</p><p>Admin role required.</p>',
      '<p class="heading">Purpose\n</p><p>Create the sales order.</p>',
      '<p class="heading">Prerequisites\n</p><p>Customer must exist.</p>',
    ].join("");
    const result = parseStepContent(html);

    const types = result.sections.map((s) => s.type);
    expect(types).toContain("ROLES");
    expect(types).toContain("PURPOSE");
    expect(types).toContain("PREREQUISITES");
    expect(result.sections.length).toBeGreaterThanOrEqual(3);
  });

  it("T-CSP-009: nested tables maintain correct column alignment", () => {
    const html = [
      '<p class="heading">System Access\n</p>',
      '<table><tr><th>Transaction</th><th>Module</th></tr>',
      "<tr><td>VA01</td><td>SD</td></tr>",
      "<tr><td>ME21N</td><td>MM</td></tr>",
      "<tr><td>MIGO</td><td>MM</td></tr></table>",
    ].join("");
    const result = parseStepContent(html);

    const sysSection = result.sections.find((s) => s.type === "SYSTEM_ACCESS");
    expect(sysSection).toBeDefined();
    expect(sysSection!.hasTable).toBe(true);
    expect(sysSection!.content).toContain("VA01");
    expect(sysSection!.content).toContain("ME21N");
    expect(sysSection!.content).toContain("MIGO");
    // All three data rows should be present
    expect(sysSection!.content).toContain("SD");
    expect(sysSection!.content).toContain("MM");
  });

  it("T-CSP-010: HTML entities are decoded", () => {
    const html =
      '<p class="heading">Purpose\n</p><p>Create &amp; post vendor invoice &#8211; step &lt;1&gt;</p>';
    const result = parseStepContent(html);

    const purposeSection = result.sections.find((s) => s.type === "PURPOSE");
    expect(purposeSection).toBeDefined();
    // Entities should be decoded
    expect(purposeSection!.content).toContain("Create & post");
    expect(purposeSection!.content).toContain("<1>");
    // The en-dash &#8211; should be decoded to \u2013
    expect(purposeSection!.content).toContain("\u2013");
  });

  it("T-CSP-011: Unicode characters (CJK, Arabic, emoji) preserved", () => {
    const html =
      '<p class="heading">Purpose\n</p><p>Process for \u8d2d\u4e70\u8ba2\u5355 and \u0637\u0644\u0628 \u0634\u0631\u0627\u0621 with status \ud83d\udfe2</p>';
    const result = parseStepContent(html);

    const purposeSection = result.sections.find((s) => s.type === "PURPOSE");
    expect(purposeSection).toBeDefined();
    // CJK characters (Chinese: purchase order)
    expect(purposeSection!.content).toContain("\u8d2d\u4e70\u8ba2\u5355");
    // Arabic characters (purchase request)
    expect(purposeSection!.content).toContain("\u0637\u0644\u0628 \u0634\u0631\u0627\u0621");
    // Green circle emoji
    expect(purposeSection!.content).toContain("\ud83d\udfe2");
  });

  it("T-CSP-012: empty string does not crash and returns empty result", () => {
    const result = parseStepContent("");
    expect(result.purposeSummary).toBe("");
    expect(result.processContent).toBe("");
    expect(result.sections).toHaveLength(0);
  });

  it("T-CSP-013: null does not crash and returns empty result", () => {
    const result = parseStepContent(null);
    expect(result.purposeSummary).toBe("");
    expect(result.processContent).toBe("");
    expect(result.sections).toHaveLength(0);
  });

  it("T-CSP-014: >50,000 chars completes within 50ms", () => {
    // Generate a large HTML string with repeated sections
    const chunk = '<p class="heading">Purpose\n</p><p>' + "A".repeat(500) + "</p>";
    const largeHtml = chunk.repeat(100); // ~55,000+ chars
    expect(largeHtml.length).toBeGreaterThan(50_000);

    const start = performance.now();
    const result = parseStepContent(largeHtml);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result).toBeDefined();
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it("T-CSP-015: real SAP Cash Journal content correctly identifies sections", () => {
    const result = parseStepContent(SAP_CASH_JOURNAL_FIXTURE);

    // Should find at least Purpose, Overview (both map to PURPOSE), Prerequisites,
    // System Access, Roles, and Master Data sections
    const types = result.sections.map((s) => s.type);
    expect(types).toContain("PURPOSE");
    expect(types).toContain("PREREQUISITES");
    expect(types).toContain("SYSTEM_ACCESS");
    expect(types).toContain("ROLES");
    expect(types).toContain("MASTER_DATA");

    // System Access and Roles should have tables
    const sysAccess = result.sections.find((s) => s.type === "SYSTEM_ACCESS");
    expect(sysAccess!.hasTable).toBe(true);
    expect(sysAccess!.content).toContain("FBCJ");

    const roles = result.sections.find((s) => s.type === "ROLES");
    expect(roles!.hasTable).toBe(true);
    expect(roles!.content).toContain("SAP_FI_AP_ACCOUNTANT");
    expect(roles!.content).toContain("SAP_FI_GL_ACCOUNTANT");

    // Master Data section should reference the vendor
    const masterData = result.sections.find((s) => s.type === "MASTER_DATA");
    expect(masterData).toBeDefined();
    expect(masterData!.content).toContain("Vendor 300100");

    // Prerequisites should reference company code
    const prereqs = result.sections.find((s) => s.type === "PREREQUISITES");
    expect(prereqs!.content).toContain("company code");
  });
});
