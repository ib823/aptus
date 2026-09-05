/**
 * 2608 WS5 — parser for the SAP Business-Driven Configuration (BDC)
 * questionnaires, one workbook per S4H_ id (`sap-references/2608/`).
 *
 * The 14 workbooks in the drop share one idea — one row per question with a
 * Level (L2 = workbench affirm, L3 = workshop) — but five column layouts:
 *
 *   "Accelerator"          Process · Project Relevant? · Scope Ref · SAP ID · SSCUI Reference · Area · Topic · Topic Definition · Question · Level · Solution
 *   "Accelerator 2608"     Industry · … · Process Area · Topic · … (Retail)
 *   "Content Details"      Solution Processes · … · Business Process Configuration Group / Sub Group / ID · Go-Live Relevance · Topic · … (Asset Management)
 *   "Accelerator" (Treasury) … · Customers' Response
 *   "Questionnaire"        Process · LOB/ID · Scope Items · Topic Definition · Level · Attended / Unattended · Questions (S4H_706, no Level values)
 *
 * The parser finds the header row by content (a "Question"/"Questions" cell
 * plus a "Level" cell), maps columns by header text, forward-fills the
 * merged "Process" cell, and keeps only rows with a question. Nothing is
 * classified: a row with no Level stays `level: null`.
 */
import path from "node:path";

import ExcelJS from "exceljs";

import { cellText } from "../sap-2608/xlsx";

export type BdcQuestion = {
  row: number;
  process: string;
  relevant: string;
  scopeRefs: string[];
  /** "SAP ID" / "Business Process Configuration ID" — an SSCUI id when numeric, else "N/A"/"NA"/"none"/"". */
  sapId: string;
  configRef: string;
  area: string;
  subarea: string;
  topic: string;
  topicDefinition: string;
  question: string;
  level: "L1" | "L2" | "L3" | null;
  attended: string;
};

export type BdcQuestionnaire = {
  id: string;
  name: string;
  file: string;
  sheet: string;
  headerRow: number;
  lastUpdated: string | null;
  questions: BdcQuestion[];
  counts: { questions: number; byLevel: Record<string, number>; withSscui: number; scopeRefs: number };
};

type ColumnMap = Partial<Record<keyof Omit<BdcQuestion, "row" | "scopeRefs"> | "scopeRef", number>>;

function norm(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();
}

/** Header text → field. Order matters: the first matching rule wins. */
function fieldFor(header: string): keyof ColumnMap | null {
  const h = norm(header);
  if (!h) return null;
  if (/^questions?$/.test(h)) return "question";
  if (h === "level") return "level";
  if (/^topic definition/.test(h)) return "topicDefinition";
  if (h === "topic") return "topic";
  if (/^scope (ref|items)/.test(h)) return "scopeRef";
  if (/^sap id$/.test(h) || /configuration id$/.test(h)) return "sapId";
  if (/sscui reference|configuration reference|go live relevance/.test(h)) return "configRef";
  if (/^(area|process area)$/.test(h) || /configuration group$/.test(h)) return "area";
  if (/sub ?group$/.test(h) || h === "lob/ id" || h === "lob/id") return "subarea";
  if (/relevant|in scope/.test(h)) return "relevant";
  if (/attended/.test(h)) return "attended";
  if (/^(process|industry|solution processes)$/.test(h)) return "process";
  return null;
}

export function normaliseLevel(raw: string): BdcQuestion["level"] {
  const m = raw
    .trim()
    .toUpperCase()
    .match(/^L\s*([123])\b/);
  return m ? (`L${m[1]}` as BdcQuestion["level"]) : null;
}

export function splitScopeRefs(raw: string): string[] {
  return raw
    .split(/[,;/\n]+/)
    .map((s) => s.trim())
    .filter((s) => /^[0-9A-Z]{3}$/.test(s));
}

/** The question text as compared across releases: case-folded, whitespace-collapsed, no trailing punctuation. */
export function questionKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s?.:;,]+$/g, "")
    .trim();
}

export async function parseBdcWorkbook(
  file: string,
  id: string,
  name: string,
  cwd = process.cwd(),
): Promise<BdcQuestionnaire> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(cwd, file));
  let lastUpdated: string | null = null;
  for (const ws of wb.worksheets) {
    if (!/overview/i.test(ws.name)) continue;
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell((c) => {
        const t = cellText(c.value);
        const m = t.match(/last updated:?\s*(.+)$/i);
        if (m?.[1] && !lastUpdated) lastUpdated = m[1].trim();
      });
    });
  }

  for (const ws of wb.worksheets) {
    if (/overview|glossary|change history|status/i.test(ws.name)) continue;
    let headerRow = 0;
    let cols: ColumnMap = {};
    const questions: BdcQuestion[] = [];
    let lastProcess = "";
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (!headerRow) {
        const map: ColumnMap = {};
        row.eachCell({ includeEmpty: false }, (c, colNumber) => {
          const f = fieldFor(cellText(c.value));
          if (f && map[f] === undefined) map[f] = colNumber;
        });
        if (map.question !== undefined && map.level !== undefined) {
          headerRow = rowNumber;
          cols = map;
        }
        return;
      }
      const get = (f: keyof ColumnMap) => (cols[f] !== undefined ? cellText(row.getCell(cols[f]!).value) : "");
      const question = get("question");
      const process = get("process");
      if (process) lastProcess = process;
      if (!question) return;
      questions.push({
        row: rowNumber,
        process: lastProcess,
        relevant: get("relevant"),
        scopeRefs: splitScopeRefs(get("scopeRef")),
        sapId: get("sapId"),
        configRef: get("configRef"),
        area: get("area"),
        subarea: get("subarea"),
        topic: get("topic"),
        topicDefinition: get("topicDefinition"),
        question,
        level: normaliseLevel(get("level")),
        attended: get("attended"),
      });
    });
    if (!headerRow) continue;
    const byLevel: Record<string, number> = {};
    for (const q of questions) byLevel[q.level ?? "none"] = (byLevel[q.level ?? "none"] ?? 0) + 1;
    return {
      id,
      name,
      file,
      sheet: ws.name,
      headerRow,
      lastUpdated,
      questions,
      counts: {
        questions: questions.length,
        byLevel,
        withSscui: questions.filter((q) => /^\d{5,6}$/.test(q.sapId)).length,
        scopeRefs: new Set(questions.flatMap((q) => q.scopeRefs)).size,
      },
    };
  }
  throw new Error(`${file}: no sheet with a Question + Level header row`);
}
