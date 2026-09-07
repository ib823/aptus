/**
 * Minimal, header-addressed reading of the SAP 2608 workbooks (WS0/WS1).
 *
 * Columns are resolved BY HEADER NAME, never by position: SAP has re-cut these
 * sheets between releases (the 2602 config sheet was `<release> S4H Cloud`; 2608
 * is `2608`), and a positional map silently loads the wrong column.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

import ExcelJS from "exceljs";
import JSZip from "jszip";

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


/**
 * Open an SAP workbook, working around an ExcelJS defect on one of them.
 *
 * BP_CLD_ENTPR_2608_Forms_List_EN_MY.xlsx ships its single sheet as a declared
 * Excel TABLE (xl/tables/table1.xml, named "FormList") with no <tableStyleInfo>.
 * ExcelJS 4.4 builds its table model by reducing over the parsed table parts and
 * throws "Cannot read properties of undefined (reading 'name')" before any cell
 * is reachable. Six of the seven WS11 workbooks open normally; this one cannot
 * be read at all.
 *
 * So: try the normal path, and only on failure re-open the bytes through JSZip
 * with the table parts removed — the table declaration is presentation metadata,
 * and the cells it decorates are ordinary sheet XML that survives untouched.
 *
 * THE FILE ON DISK IS NEVER MODIFIED. It is manifest-hashed by recon-2608 and
 * rewriting it would break that check for a reason that has nothing to do with
 * SAP's content. The strip happens in memory, per read.
 */
async function openWorkbook(file: string): Promise<ExcelJS.Workbook> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    return wb;
  } catch (firstError) {
    const zip = await JSZip.loadAsync(await readFile(file));
    const tableParts = Object.keys(zip.files).filter((n) => /^xl\/tables\//.test(n));
    if (tableParts.length === 0) throw firstError;
    for (const name of tableParts) zip.remove(name);
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
        const xml = await zip.file(name)!.async("string");
        zip.file(name, xml.replace(/<tableParts[\s\S]*?<\/tableParts>/g, "").replace(/<tableParts[^>]*\/>/g, ""));
      } else if (/^xl\/worksheets\/_rels\//.test(name)) {
        const xml = await zip.file(name)!.async("string");
        zip.file(name, xml.replace(/<Relationship\b[^>]*\/tables\/[^>]*\/>/g, ""));
      } else if (name === "[Content_Types].xml") {
        const xml = await zip.file(name)!.async("string");
        zip.file(name, xml.replace(/<Override\b[^>]*\/xl\/tables\/[^>]*\/>/g, ""));
      }
    }
    const buf = await zip.generateAsync({ type: "uint8array" });
    const wb = new ExcelJS.Workbook();
    // exceljs types the parameter as the Buffer of its own @types/node range;
    // Buffer<ArrayBufferLike> from this repo’s newer @types/node is the same
    // value at runtime and the cast is the whole of the difference.
    await wb.xlsx.load(Buffer.from(buf) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
    return wb;
  }
}

export async function readSheet(src: SheetSource, cwd = process.cwd()): Promise<SheetReader> {
  const wb = await openWorkbook(path.resolve(cwd, src.file));
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
