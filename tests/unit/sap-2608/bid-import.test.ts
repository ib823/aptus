// @vitest-environment node
/**
 * WS12 — the bid-response importer's reader.
 *
 * The fixture is BUILT IN MEMORY, not committed. Client requirement text does
 * not belong in this repository (`*.xlsx` is gitignored for the same reason),
 * and a synthetic sheet proves the reader without shipping anyone's tender.
 */
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { readWorkbookRows, scopeCodesFrom } from "../../../scripts/import-bid-requirements";

const HEADERS = [
  "Req ID",
  "Requirement (verbatim)",
  "Priority",
  "Classification",
  "Scope code(s)",
  "Scope item name(s)",
  "Configuration activity / Fiori app / process step",
  "How it is met",
  "Prerequisites",
  "Integration",
  "Confidence",
  "Notes",
];

function workbook(sheets: { name: string; headers?: string[]; rows: string[][] }[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(s.headers ?? HEADERS);
    for (const r of s.rows) ws.addRow(r);
  }
  return wb;
}

describe("scopeCodesFrom", () => {
  it("splits on commas and semicolons, upper-cases and de-duplicates", () => {
    expect(scopeCodesFrom("j58, 1GA; j58")).toEqual(["J58", "1GA"]);
  });

  it("treats an em dash and a hyphen as no citation at all", () => {
    // The mapping workbook writes "—" where a row cites nothing. Storing that
    // as a code would produce a citation the catalogue can never resolve.
    expect(scopeCodesFrom("—")).toEqual([]);
    expect(scopeCodesFrom("-")).toEqual([]);
    expect(scopeCodesFrom("")).toEqual([]);
  });
});

describe("readWorkbookRows", () => {
  it("reads a requirement sheet and keeps source order", () => {
    const { rows, skipped } = readWorkbookRows(
      workbook([
        {
          name: "M1 - General Ledger",
          rows: [
            ["1.1", "The system shall post journals.", "Must Have", "O", "J58", "Accounting", "Fiori: F0718", "Delivered.", "J58: J45", "—", "High", ""],
            ["1.2", "The system shall do the other thing.", "Must Have", "C", "J58, 1GA", "…", "", "Configured.", "", "", "Med", "note"],
          ],
        },
      ]),
    );
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.reqId).toBe("1.1");
    expect(rows[0]?.scopeCodes).toEqual(["J58"]);
    expect(rows[1]?.scopeCodes).toEqual(["J58", "1GA"]);
    expect(rows[0]?.sortOrder).toBe(0);
    expect(rows[1]?.sortOrder).toBe(1);
    expect(rows[0]?.module).toBe("M1 - General Ledger");
  });

  it("skips a sheet whose headers are not a requirement layout, and names it", () => {
    // A method or index tab must not become sixty empty requirements.
    const { rows, skipped } = readWorkbookRows(
      workbook([
        { name: "Method and caveats", headers: ["Topic", "Detail"], rows: [["scope source", "the catalogue"]] },
        { name: "M2 - Accounts Receivable", rows: [["1.1", "A requirement.", "Must Have", "C", "J59", "", "", "", "", "", "", ""]] },
      ]),
    );
    expect(skipped).toEqual(["Method and caveats"]);
    expect(rows).toHaveLength(1);
  });

  it("ignores a row with no id or no requirement text", () => {
    const { rows } = readWorkbookRows(
      workbook([
        {
          name: "M3 - Billing",
          rows: [
            ["", "orphan text with no id", "", "", "", "", "", "", "", "", "", ""],
            ["2.1", "", "", "", "", "", "", "", "", "", "", ""],
            ["2.2", "A real one.", "Must Have", "G", "", "", "", "", "", "", "", ""],
          ],
        },
      ]),
    );
    expect(rows.map((r) => r.reqId)).toEqual(["2.2"]);
    // A gap row cites nothing, and that is stored as nothing.
    expect(rows[0]?.scopeCodes).toEqual([]);
  });

  it("keeps a verdict the four documented buckets do not cover", () => {
    // "NEEDS REVIEW" is the state of not having an answer. Folding it into
    // O/C/G/N-A would report an answer that was never given.
    const { rows } = readWorkbookRows(
      workbook([
        {
          name: "M4 - Accounts Payable",
          rows: [["3.24", "Cheque control.", "Must Have", "NEEDS REVIEW", "J60", "", "", "", "", "", "Low", ""]],
        },
      ]),
    );
    expect(rows[0]?.classification).toBe("NEEDS REVIEW");
  });
});
