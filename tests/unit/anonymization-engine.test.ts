import { describe, it, expect } from "vitest";
import {
  redactPII,
  anonymizeScopeSelections,
  anonymizeGapPatterns,
} from "@/lib/analytics/anonymization-engine";

describe("redactPII", () => {
  it("should redact email addresses", () => {
    const result = redactPII("Contact john.doe@example.com for details");
    expect(result).toBe("Contact [REDACTED_EMAIL] for details");
  });

  it("should redact multiple email addresses", () => {
    const result = redactPII("CC: a@b.com and c@d.org");
    expect(result).toBe("CC: [REDACTED_EMAIL] and [REDACTED_EMAIL]");
  });

  it("should redact phone numbers", () => {
    const result = redactPII("Call +1-555-123-4567 for help");
    expect(result).toBe("Call [REDACTED_PHONE] for help");
  });

  it("should redact phone numbers with parentheses", () => {
    const result = redactPII("Call (555) 123-4567 for help");
    expect(result).toBe("Call [REDACTED_PHONE] for help");
  });

  it("should redact proper names (capitalized multi-word sequences)", () => {
    const result = redactPII("Reported by John Smith at the meeting");
    expect(result).toBe("Reported by [REDACTED_NAME] at the meeting");
  });

  it("should redact multiple proper names", () => {
    const result = redactPII("Alice Johnson and Bob Williams discussed the gap");
    expect(result).toBe("[REDACTED_NAME] and [REDACTED_NAME] discussed the gap");
  });

  it("should not alter text without PII", () => {
    const clean = "The system lacks batch processing capability";
    expect(redactPII(clean)).toBe(clean);
  });

  it("should handle empty string", () => {
    expect(redactPII("")).toBe("");
  });

  it("should handle text with only single capitalized words (no proper names)", () => {
    const text = "SAP ERP does not support this feature";
    // "SAP" and "ERP" are all-caps, not matching our proper name pattern
    expect(redactPII(text)).toBe(text);
  });

  it("should handle combined PII types", () => {
    const text = "Contact Jane Doe at jane.doe@corp.com or 555-123-4567";
    const result = redactPII(text);
    expect(result).toContain("[REDACTED_EMAIL]");
    expect(result).toContain("[REDACTED_PHONE]");
    expect(result).toContain("[REDACTED_NAME]");
    expect(result).not.toContain("jane.doe@corp.com");
    expect(result).not.toContain("555-123-4567");
  });

  it("should handle international phone format", () => {
    const result = redactPII("Reach out at +44 20 7946 0958");
    expect(result).toContain("[REDACTED_PHONE]");
  });

  it("should handle email with subdomains", () => {
    const result = redactPII("Send to admin@sub.domain.co.uk");
    expect(result).toBe("Send to [REDACTED_EMAIL]");
  });
});

describe("anonymizeScopeSelections", () => {
  it("should strip extra fields and keep only scopeItemId, relevance, selected", () => {
    const input = [
      {
        scopeItemId: "J60",
        relevance: "YES",
        selected: true,
        assessmentId: "abc",
        notes: "should be removed",
        respondent: "user1",
      },
    ];
    const result = anonymizeScopeSelections(input);
    expect(result).toEqual([
      { scopeItemId: "J60", relevance: "YES", selected: true },
    ]);
  });

  it("should handle multiple entries", () => {
    const input = [
      { scopeItemId: "J60", relevance: "YES", selected: true, extra: "x" },
      { scopeItemId: "J61", relevance: "NO", selected: false, extra: "y" },
    ];
    const result = anonymizeScopeSelections(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ scopeItemId: "J60", relevance: "YES", selected: true });
    expect(result[1]).toEqual({ scopeItemId: "J61", relevance: "NO", selected: false });
  });

  it("should handle empty array", () => {
    expect(anonymizeScopeSelections([])).toEqual([]);
  });

  it("should not include any key other than the allowed three", () => {
    const input = [
      { scopeItemId: "A", relevance: "MAYBE", selected: true, foo: 1, bar: "2" },
    ];
    const result = anonymizeScopeSelections(input);
    expect(Object.keys(result[0] ?? {})).toEqual(["scopeItemId", "relevance", "selected"]);
  });
});

describe("anonymizeGapPatterns", () => {
  it("should aggregate duplicate gap descriptions by resolution type", () => {
    const input = [
      { gapDescription: "Missing batch processing", resolutionType: "BTP_EXT" },
      { gapDescription: "Missing batch processing", resolutionType: "BTP_EXT" },
    ];
    const result = anonymizeGapPatterns(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.frequency).toBe(2);
  });

  it("should redact PII in gap descriptions", () => {
    const input = [
      {
        gapDescription: "John Smith reported that the AP module is missing",
        resolutionType: "CONFIGURE",
      },
    ];
    const result = anonymizeGapPatterns(input);
    expect(result[0]?.description).toContain("[REDACTED_NAME]");
    expect(result[0]?.description).not.toContain("John Smith");
  });

  it("should handle empty input", () => {
    expect(anonymizeGapPatterns([])).toEqual([]);
  });

  it("should truncate long descriptions to 100 chars", () => {
    const longDesc = "A".repeat(200);
    const input = [{ gapDescription: longDesc, resolutionType: "FIT" }];
    const result = anonymizeGapPatterns(input);
    expect(result[0]?.description.length).toBeLessThanOrEqual(100);
  });

  it("should sort by frequency descending", () => {
    const input = [
      { gapDescription: "Gap A", resolutionType: "FIT" },
      { gapDescription: "Gap B", resolutionType: "GAP" },
      { gapDescription: "Gap B", resolutionType: "GAP" },
      { gapDescription: "Gap B", resolutionType: "GAP" },
    ];
    const result = anonymizeGapPatterns(input);
    expect(result[0]?.description).toBe("Gap B");
    expect(result[0]?.frequency).toBe(3);
    expect(result[1]?.description).toBe("Gap A");
    expect(result[1]?.frequency).toBe(1);
  });

  it("should separate same description with different resolution types", () => {
    const input = [
      { gapDescription: "Same gap", resolutionType: "FIT" },
      { gapDescription: "Same gap", resolutionType: "BTP_EXT" },
    ];
    const result = anonymizeGapPatterns(input);
    expect(result).toHaveLength(2);
  });

  it("should redact emails in gap descriptions", () => {
    const input = [
      {
        gapDescription: "Contact support@company.com about this gap",
        resolutionType: "FIT",
      },
    ];
    const result = anonymizeGapPatterns(input);
    expect(result[0]?.description).toContain("[REDACTED_EMAIL]");
  });

  it("should handle single entry", () => {
    const input = [{ gapDescription: "Single gap", resolutionType: "CONFIGURE" }];
    const result = anonymizeGapPatterns(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.frequency).toBe(1);
    expect(result[0]?.resolutionType).toBe("CONFIGURE");
  });
});
