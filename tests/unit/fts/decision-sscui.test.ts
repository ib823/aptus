import { describe, it, expect } from "vitest";
import { scopeItems } from "@/lib/fts/data";
import { formatSscuiIdCell } from "@/lib/fts/excel-export";

/**
 * Content-integrity guard for the Fit-to-Standard decision data (D1).
 *
 * Every Tier-1 decision must cite either a real catalogue SSCUI (a numeric
 * ID) or a labelled configuration framework (empty `sscui_id`, framework in
 * `sscui_name`). The non-catalogue placeholders that the audit flagged
 * (OM / FW / ATP / CM / PR / DS / OVAG / QV / PC / SR) must never appear as a
 * `sscui_id`.
 */

// The non-catalogue placeholder tokens flagged by the D1 audit.
const FORBIDDEN_PLACEHOLDERS = new Set([
  "OM",
  "FW",
  "ATP",
  "CM",
  "PR",
  "DS",
  "OVAG",
  "QV",
  "PC",
  "SR",
]);

/** Every decision across every registered scope item / value stream. */
const allDecisions = Object.values(scopeItems).flatMap((scope) =>
  scope.decisions.map((d) => ({ code: scope.code, ...d })),
);

describe("FTS decision SSCUI grounding (D1)", () => {
  it("registers decisions to test", () => {
    expect(allDecisions.length).toBeGreaterThan(0);
  });

  it("every decision sscui_id is empty or numeric", () => {
    const offenders = allDecisions
      .filter((d) => !/^\d*$/.test(d.sscui_id))
      .map((d) => `${d.code}/${d.id} → "${d.sscui_id}"`);
    expect(offenders).toEqual([]);
  });

  it("no decision sscui_id is a non-catalogue placeholder", () => {
    const offenders = allDecisions
      .filter((d) => FORBIDDEN_PLACEHOLDERS.has(d.sscui_id))
      .map((d) => `${d.code}/${d.id} → "${d.sscui_id}"`);
    expect(offenders).toEqual([]);
  });

  it("every framework decision (empty sscui_id) names the framework in sscui_name", () => {
    const offenders = allDecisions
      .filter((d) => d.sscui_id.trim() === "" && d.sscui_name.trim() === "")
      // Narrative value-stream questions legitimately carry no SSCUI name.
      .filter((d) => d.answer_kind !== "narrative")
      .map((d) => `${d.code}/${d.id}`);
    expect(offenders).toEqual([]);
  });
});

describe("formatSscuiIdCell (Excel export)", () => {
  it("returns the numeric id when present", () => {
    expect(
      formatSscuiIdCell({ sscui_id: "101117", sscui_name: "Set Pricing Procedures" }),
    ).toBe("101117");
  });

  it("renders a no-direct-SSCUI framework label when the id is blank", () => {
    expect(
      formatSscuiIdCell({
        sscui_id: "",
        sscui_name: "Flexible Workflow for Sales Documents",
      }),
    ).toBe("(no direct SSCUI — Flexible Workflow for Sales Documents)");
  });

  it("never surfaces a bare placeholder for any real decision", () => {
    for (const d of allDecisions) {
      const cell = formatSscuiIdCell(d);
      expect(FORBIDDEN_PLACEHOLDERS.has(cell)).toBe(false);
      expect(cell).not.toBe("");
    }
  });
});
