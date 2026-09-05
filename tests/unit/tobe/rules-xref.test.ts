/**
 * 2608 WS6 — rules from the BDC ↔ SSCUI cross-reference: one rule per
 * (decision question, scope code) when the sheet carries a numeric SSCUI id.
 */
import { describe, expect, it } from "vitest";

import { XREF_SOURCE, buildXrefRules, questionKey, type XrefSheetQuestion } from "@/lib/tobe/rules-xref";

const sheet: XrefSheetQuestion[] = [
  {
    questionnaireId: "S4H_433",
    row: 12,
    question: "Do you require an approval workflow for sales quotations? ",
    sapId: "102751",
    configRef: "Define Reasons for Approval Requests",
    scopeRefs: ["BDG"],
    level: "L2",
  },
  {
    questionnaireId: "S4H_433",
    row: 13,
    question: "Which output channels do you use?",
    sapId: "n/a",
    configRef: "",
    scopeRefs: ["BD9"],
    level: "L2",
  },
  {
    questionnaireId: "S4H_433",
    row: 14,
    question: "Describe your sales offices.",
    sapId: "101234",
    configRef: "Define Sales Offices",
    scopeRefs: ["BD9"],
    level: "L3",
  },
];

describe("questionKey", () => {
  it("folds case, whitespace and trailing punctuation only", () => {
    expect(questionKey("Do you require an approval  workflow for sales quotations? ")).toBe(
      "do you require an approval workflow for sales quotations",
    );
    expect(questionKey("A?")).not.toBe(questionKey("B?"));
  });
});

describe("buildXrefRules", () => {
  it("emits a deviate → CONFIGURED scope-wide rule per scope code, union of sheet and bank refs", () => {
    const rules = buildXrefRules(
      [
        {
          id: "L2-077",
          sapVerbatim: "Do you require an approval workflow for sales quotations?",
          scopeItemRefs: ["BDG", "1IQ"],
          sscuiRef: "Define Reasons for Approval Requests",
          format: "decision",
        },
      ],
      sheet,
    );
    expect(rules.map((r) => r.id).sort()).toEqual(["xref:L2-077:1IQ", "xref:L2-077:BDG"]);
    expect(rules[0]).toMatchObject({
      trigger: "deviate",
      state: "CONFIGURED",
      sscuiId: "102751",
      sscuiName: "Define Reasons for Approval Requests",
      stepNames: [],
      source: XREF_SOURCE,
      note: "S4H_433 row 12 (L2)",
    });
  });

  it("skips non-numeric SAP ids, information-format questions, and bank questions absent from the sheet", () => {
    const rules = buildXrefRules(
      [
        {
          id: "A",
          sapVerbatim: "Which output channels do you use?",
          scopeItemRefs: ["BD9"],
          sscuiRef: "N/A",
          format: "decision",
        },
        {
          id: "B",
          sapVerbatim: "Describe your sales offices.",
          scopeItemRefs: ["BD9"],
          sscuiRef: "N/A",
          format: "information",
        },
        {
          id: "C",
          sapVerbatim: "A question the sheet never asked?",
          scopeItemRefs: ["BD9"],
          sscuiRef: "N/A",
          format: "decision",
        },
        { id: "D", sapVerbatim: null, scopeItemRefs: ["BD9"], sscuiRef: "N/A", format: "decision" },
      ],
      sheet,
    );
    expect(rules).toEqual([]);
  });

  it("falls back to the sheet's configuration reference when the bank has no SSCUI name; keeps only 3-char scope codes", () => {
    const rules = buildXrefRules(
      [
        {
          id: "L3-001",
          sapVerbatim: "Describe your sales offices.",
          scopeItemRefs: ["BD9", "Sales Offices"],
          sscuiRef: "-",
          format: "decision",
        },
      ],
      sheet,
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]!.sscuiName).toBe("Define Sales Offices");
    expect(rules[0]!.scopeCode).toBe("BD9");
  });
});
