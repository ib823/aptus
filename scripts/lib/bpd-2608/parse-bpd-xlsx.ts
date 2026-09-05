/**
 * 2608 WS5 — parser for the SAP Best Practices BPD test script in its
 * STRUCTURED form: `<CODE>_S4CLD2608_BPD_EN_<CC>.xlsx`, one sheet ("Test
 * Cases"), the SAP Cloud ALM test-case export.
 *
 * Shape of the sheet (header row = the row whose column O reads
 * "Activity Title*"; everything above is SAP's template preamble):
 *
 *   B  Test Case Name*          "Sales Inquiry (1IQ)"            (first data row only)
 *   O  Activity Title*          one run of rows per activity
 *   S  Action Title*            "Information" | "Log On" | "Access the App" | …
 *   T  Action Instructions*     HTML
 *   U  Action Expected Result   HTML
 *
 * Activities come in three bands:
 *   1. before the "Test Procedures" marker: "Additional Information" and
 *      "Additional Information: …" runs — purpose/overview, prerequisites,
 *      preliminary configuration steps (band "preliminary").
 *   2. after the marker: the PROCESS STEPS proper — one activity run per step,
 *      each opening with an "Information" action (the step's Purpose) followed
 *      by the click-level actions (band "step"). A step name may legitimately
 *      recur (BDW runs "Display Pallets Stock" in each variant).
 *   3. after the marker, any "Additional Information…" run — a variant's
 *      section note or the appendix (band "appendix"); never a step.
 *
 * The parser keeps the bands apart. Nothing is invented: a role or app is
 * recorded only when an action's instruction names it; otherwise it is "".
 */
import path from "node:path";

import ExcelJS from "exceljs";

import { cellText } from "../sap-2608/xlsx";

export type BpdAction = {
  title: string;
  /** Raw HTML as SAP exported it. */
  instructionsHtml: string;
  expectedHtml: string;
};

export type BpdActivity = {
  /** Activity Title as exported (groups keep their "Group: Step" form). */
  title: string;
  /** "preliminary" (before the Test Procedures marker) | "step" | "appendix". */
  band: "preliminary" | "step" | "appendix";
  actions: BpdAction[];
  /** First and last 1-based sheet rows of the run. */
  rows: [number, number];
};

export type BpdStep = {
  name: string;
  /** From the step's "Log On" action ("… as an Internal Sales Representative"); "" when the action names none. */
  role: string;
  /** From the step's "Access the App" action ("Open Manage Sales Inquiries (F2370)"); "" when none. */
  app: string;
  /** Plain text of the last non-empty Action Expected Result in the run; "" when none. */
  expected: string;
  /** Plain text of the step's "Information" action (its Purpose), first paragraph. */
  purpose: string;
  actionCount: number;
};

export type BpdXlsxParse = {
  code: string;
  file: string;
  sheet: string;
  headerRow: number;
  /** "Sales Inquiry (1IQ)" → "Sales Inquiry". */
  title: string;
  /** First paragraph under <h2>Overview</h2> of the opening "Additional Information" activity. */
  overview: string;
  activities: BpdActivity[];
  steps: BpdStep[];
  /** Distinct Fiori apps named by the steps, in first-seen order. */
  fioriApps: string[];
  /** Distinct roles named by the steps, in first-seen order (names only — IDs live in the docx Roles table). */
  roles: string[];
  /** Preliminary-band activity titles (the "Additional Information: …" runs), for the delta report. */
  preliminary: string[];
  exportedAt: string | null;
};

/** Strip HTML to readable text: block tags become line breaks, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** First non-empty line of the text form of an HTML fragment. */
export function firstParagraph(html: string): string {
  return (
    htmlToText(html)
      .split("\n")
      .find((l) => l.trim().length > 0) ?? ""
  );
}

/** The paragraph that follows an <h2>Overview</h2> (or <h1>Purpose</h1>) heading, else the first paragraph. */
export function overviewFromHtml(html: string): string {
  const m =
    html.match(/<h[12][^>]*>\s*Overview\s*<\/h[12]>([\s\S]*?)(?=<h[1-6]|$)/i) ??
    html.match(/<h[12][^>]*>\s*Purpose\s*<\/h[12]>([\s\S]*?)(?=<h[1-6]|$)/i);
  return firstParagraph(m?.[1] ?? html);
}

const LOG_ON = /^log\s*on\b/i;
const ACCESS_APP = /^access\s+(the\s+)?(sap\s+fiori\s+)?app\b/i;

/** "Log on to the SAP Fiori launchpad as an Internal Sales Representative." → "Internal Sales Representative". */
export function roleFromLogOn(instructionHtml: string): string {
  const text = htmlToText(instructionHtml).replace(/\n/g, " ");
  const m = text.match(/\bas\s+(?:an?\s+|the\s+)?([A-Z][^.(:;]*?)(?:\s*\(|\.|:|;|\s+and\s+(?:go|open|navigate)|$)/);
  return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/** "Open Manage Sales Inquiries (F2370) app." → "Manage Sales Inquiries (F2370)". */
export function appFromAccess(instructionHtml: string): string {
  const text = htmlToText(instructionHtml).replace(/\n/g, " ");
  const withId = text.match(/\bOpen\s+(?:the\s+)?([^.]*?\((?:F\d{3,5}[A-Z]?|[A-Z0-9_]{2,10})\))/);
  if (withId?.[1]) return withId[1].replace(/\s+/g, " ").trim();
  const bare = text.match(/\bOpen\s+(?:the\s+)?(.+?)(?:\s+app\b|\.|$)/);
  return (bare?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function stepFromActivity(a: BpdActivity): BpdStep {
  const info = a.actions.find((x) => /^information$/i.test(x.title));
  const logOn = a.actions.find((x) => LOG_ON.test(x.title));
  const access = a.actions.find((x) => ACCESS_APP.test(x.title));
  const expectedHtml = [...a.actions].reverse().find((x) => htmlToText(x.expectedHtml).length > 0)?.expectedHtml ?? "";
  return {
    name: a.title,
    role: logOn ? roleFromLogOn(logOn.instructionsHtml) : "",
    app: access ? appFromAccess(access.instructionsHtml) : "",
    expected: firstParagraph(expectedHtml),
    purpose: info ? overviewFromHtml(info.instructionsHtml) : "",
    actionCount: a.actions.filter((x) => !/^information$/i.test(x.title)).length,
  };
}

export async function parseBpdXlsx(file: string, code: string, cwd = process.cwd()): Promise<BpdXlsxParse> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(cwd, file));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`${file}: no worksheet`);

  let headerRow = 0;
  let exportedAt: string | null = null;
  let title = "";
  const activities: BpdActivity[] = [];
  let band: BpdActivity["band"] = "preliminary";
  let current: BpdActivity | null = null;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const text = (col: number) => cellText(row.getCell(col).value);
    if (!headerRow) {
      const b = text(2);
      const stamp = b.match(/\((\d{4}-\d{2}-\d{2}[^)]*)\)/);
      if (stamp?.[1] && /_BPD_/.test(b)) exportedAt = stamp[1];
      if (text(15).startsWith("Activity Title")) headerRow = rowNumber;
      return;
    }
    if (!title && text(2))
      title = text(2)
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim();
    const activity = text(15);
    if (!activity) return;
    if (/^test procedures$/i.test(activity)) {
      band = "step";
      current = null;
      return;
    }
    // After the marker, "Additional Information" runs are section notes or the
    // appendix (BDW opens each variant with one) — never a step, and they do
    // not end the step band: the next named activity is a step again.
    const thisBand: BpdActivity["band"] =
      band === "step" && /^additional information\b/i.test(activity) ? "appendix" : band;
    if (!current || current.title !== activity) {
      current = { title: activity, band: thisBand, actions: [], rows: [rowNumber, rowNumber] };
      activities.push(current);
    }
    current.rows[1] = rowNumber;
    current.actions.push({ title: text(19), instructionsHtml: text(20), expectedHtml: text(21) });
  });

  if (!headerRow) throw new Error(`${file}: no "Activity Title*" header row`);
  const opening = activities.find((a) => a.band === "preliminary" && /^additional information$/i.test(a.title));
  const overview = opening
    ? overviewFromHtml(opening.actions.find((x) => /^information$/i.test(x.title))?.instructionsHtml ?? "")
    : "";
  const steps = activities.filter((a) => a.band === "step").map(stepFromActivity);
  const uniq = (xs: string[]) => Array.from(new Set(xs.filter((x) => x.length > 0)));
  return {
    code,
    file,
    sheet: ws.name,
    headerRow,
    title,
    overview,
    activities,
    steps,
    fioriApps: uniq(steps.map((s) => s.app)),
    roles: uniq(steps.map((s) => s.role)),
    preliminary: activities
      .filter((a) => a.band === "preliminary" && !/^additional information$/i.test(a.title))
      .map((a) => a.title),
    exportedAt,
  };
}
