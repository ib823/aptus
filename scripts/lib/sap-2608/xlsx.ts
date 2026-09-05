/**
 * Minimal, header-addressed reading of the SAP 2608 workbooks (WS0/WS1).
 *
 * Columns are resolved BY HEADER NAME, never by position: SAP has re-cut these
 * sheets between releases (the 2602 config sheet was `<release> S4H Cloud`; 2608
 * is `2608`), and a positional map silently loads the wrong column.
 */

import * as path from "node:path";

import ExcelJS from "exceljs";

import type { SheetSource } from "../sap-content-sources";

/** Coerce an ExcelJS cell value to trimmed text ("" for empty). */
export function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v)
      return v.richText
        .map((t) => t.text)
        .join("")
        .trim();
    if ("text" in v) return String(v.text ?? "").trim();
    if ("result" in v) return String(v.result ?? "").trim();
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v).trim();
}

export type SheetReader = {
  ws: ExcelJS.Worksheet;
  headers: string[];
  /** 1-based column number for a header; throws when absent. */
  col: (header: string) => number;
  /** 1-based column number or -1. */
  colOrNone: (header: string) => number;
  /** Iterate data rows (after headerRow) as header→text records; skips fully empty rows. */
  rows: () => Generator<{ rowNumber: number; get: (header: string) => string; cells: string[] }>;
};

export async function readSheet(src: SheetSource, cwd = process.cwd()): Promise<SheetReader> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(cwd, src.file));
  const found = wb.getWorksheet(src.sheet);
  if (!found) throw new Error(`${src.file}: worksheet "${src.sheet}" not found`);
  const ws: ExcelJS.Worksheet = found;
  // values[] is sparse — Array.from fills holes so index == column number.
  const headers = Array.from(ws.getRow(src.headerRow).values as ExcelJS.CellValue[], (v) => cellText(v ?? null));
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h && !index.has(h)) index.set(h, i);
  });
  const colOrNone = (header: string) => index.get(header) ?? -1;
  const col = (header: string) => {
    const i = colOrNone(header);
    if (i < 0)
      throw new Error(
        `${src.file}/${src.sheet}: column "${header}" not found (have: ${headers.filter(Boolean).slice(0, 12).join(", ")}…)`,
      );
    return i;
  };
  function* rows() {
    for (let r = src.headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells = Array.from(row.values as ExcelJS.CellValue[], (v) => cellText(v ?? null));
      if (!cells.some((c) => c !== "")) continue;
      yield { rowNumber: r, get: (header: string) => cells[col(header)] ?? "", cells };
    }
  }
  return { ws, headers, col, colOrNone, rows };
}

/** ISO-3166 alpha-2 country columns present on the A&D and Process-Steps sheets. */
export function countryColumns(headers: string[]): string[] {
  return headers.filter((h) => /^[A-Z]{2}$/.test(h));
}
