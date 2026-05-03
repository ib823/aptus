/**
 * TIME RFT — ABeam consultant reviewer workbook.
 *
 * Generates a single Excel that lets ABeam SI lead + commercial team
 * review every one of the 830 v2 verdicts in priority order, override
 * any cell, and feed corrections back into the v3 pass.
 *
 * Sheets:
 *   0. README                     — what's in this workbook + how to use
 *   1. Summary                    — per-module distribution + counts
 *   2. Priority Review (82 rows)  — low + medium confidence first
 *   3..12. Per-module sheets      — every req for that module
 *
 * Per-row columns:
 *   A  Priority      (HIGH / MED / LOW / OK)
 *   B  Code          (TIME RFT row code, e.g. B-1-10)
 *   C  Module
 *   D  CrossCuttingTag
 *   E  RequirementText
 *   F  AptusVerdict  (O / C / G / N/A)
 *   G  TIME FC/PC/NC (auto-mapped)
 *   H  Confidence
 *   I  CitedScopeCodes
 *   J  CustomerProcess (App 2(b) link)
 *   K  PainPoints     (top 1)
 *   L  AutoRemarks    (the v2 Remarks)
 *   M  RVW Verdict    (blank — reviewer override)
 *   N  RVW Cite       (blank — reviewer override)
 *   O  RVW Remarks    (blank — reviewer override)
 *   P  Decision       (Approve / Edit / Reject — dropdown)
 *   Q  Reviewer Notes (free text)
 *
 * Color coding:
 *   HIGH (low conf)   — red fill on Priority + soft red row
 *   MED  (med conf)   — amber fill
 *   LOW              (none — high conf, no PROCESS_ANCHORED) green
 *   OK               (high conf + PROCESS_ANCHORED)         no fill
 *
 * Output: logs/TIME_Reviewer_Workbook_<timestamp>.xlsx
 */

import ExcelJS from "exceljs";
import { prisma } from "../../src/lib/db/prisma";

const TIME_ASSESSMENT_ID = "cmopnc80z000263fq9zd4cmlw";

const MODULES = [
  "SOW",
  "Finance",
  "Asset_IMPS",
  "Procurement",
  "Warehouse",
  "Consignment",
  "HCM",
  "Security",
  "IT",
  "TCO",
];

interface Row {
  priority: "HIGH" | "MED" | "LOW" | "OK";
  code: string;
  module: string;
  crossCuttingTag: string | null;
  requirementText: string;
  aptusVerdict: string | null;
  timeMapping: string;
  confidence: string | null;
  citedScopeCodes: string;
  customerProcess: string;
  painPoints: string;
  autoRemarks: string;
}

function aptusToTime(aptus: string | null): string {
  if (!aptus) return "";
  if (aptus.startsWith("O") || aptus.startsWith("C")) return "FC";
  if (aptus.startsWith("G")) return "PC";
  if (aptus.startsWith("N")) return "N/A";
  return "";
}

function classifyPriority(conf: string | null, tag: string | null): Row["priority"] {
  if (conf === "low") return "HIGH";
  if (conf === "medium") return "MED";
  if (tag && tag !== "PROCESS_ANCHORED" && tag !== "SECTION_HEADER" && tag !== "COMMERCIAL_TCO") return "LOW";
  return "OK";
}

const FILL_HIGH = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFCCCC" } };
const FILL_MED = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFE9B0" } };
const FILL_LOW = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD7F0D2" } };
const FILL_HEADER = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1F4E78" } };

const COLS: Array<{ key: keyof Row | "rvwVerdict" | "rvwCite" | "rvwRemarks" | "decision" | "reviewerNotes"; header: string; width: number }> = [
  { key: "priority", header: "Priority", width: 9 },
  { key: "code", header: "Code", width: 11 },
  { key: "module", header: "Module", width: 13 },
  { key: "crossCuttingTag", header: "Cross-Cutting Tag", width: 22 },
  { key: "requirementText", header: "Requirement Text", width: 60 },
  { key: "aptusVerdict", header: "Aptus Verdict", width: 14 },
  { key: "timeMapping", header: "TIME FC/PC/NC", width: 13 },
  { key: "confidence", header: "Confidence", width: 11 },
  { key: "citedScopeCodes", header: "Cited Scope Codes", width: 22 },
  { key: "customerProcess", header: "App 2(b) Process", width: 32 },
  { key: "painPoints", header: "Pain Point", width: 38 },
  { key: "autoRemarks", header: "Auto Remarks (v2)", width: 70 },
  { key: "rvwVerdict", header: "RVW Verdict", width: 13 },
  { key: "rvwCite", header: "RVW Cite", width: 16 },
  { key: "rvwRemarks", header: "RVW Remarks (override)", width: 50 },
  { key: "decision", header: "Decision", width: 12 },
  { key: "reviewerNotes", header: "Reviewer Notes", width: 35 },
];

function applyHeaderStyle(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.fill = FILL_HEADER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
  });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
}

function applyRowFill(ws: ExcelJS.Worksheet, rowIdx: number, priority: Row["priority"]) {
  const fill =
    priority === "HIGH" ? FILL_HIGH :
    priority === "MED" ? FILL_MED :
    priority === "LOW" ? FILL_LOW :
    null;
  if (!fill) return;
  const row = ws.getRow(rowIdx);
  // Only fill the Priority cell (col A) — keep row readable
  row.getCell(1).fill = fill;
  row.getCell(1).font = { bold: true };
}

function writeRows(ws: ExcelJS.Worksheet, rows: Row[]) {
  // Header
  ws.columns = COLS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
  applyHeaderStyle(ws);

  for (const r of rows) {
    const newRow = ws.addRow({
      priority: r.priority,
      code: r.code,
      module: r.module,
      crossCuttingTag: r.crossCuttingTag ?? "",
      requirementText: r.requirementText,
      aptusVerdict: r.aptusVerdict ?? "",
      timeMapping: r.timeMapping,
      confidence: r.confidence ?? "",
      citedScopeCodes: r.citedScopeCodes,
      customerProcess: r.customerProcess,
      painPoints: r.painPoints,
      autoRemarks: r.autoRemarks,
      rvwVerdict: "",
      rvwCite: "",
      rvwRemarks: "",
      decision: "",
      reviewerNotes: "",
    });
    newRow.alignment = { vertical: "top", wrapText: true };
    newRow.height = Math.min(80, 18 + Math.floor(r.requirementText.length / 50) * 14);
    applyRowFill(ws, newRow.number, r.priority);

    // Decision column dropdown
    const decisionCell = newRow.getCell(16);
    decisionCell.dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Approve,Edit,Reject,Hold"'],
      showInputMessage: true,
      promptTitle: "Reviewer decision",
      prompt: "Approve = ship as-is. Edit = use RVW Verdict/Cite/Remarks columns. Reject = needs full rewrite. Hold = needs more info.",
    };
  }

  // Auto-filter
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: COLS.length } };
}

async function main() {
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId: TIME_ASSESSMENT_ID },
    select: {
      code: true,
      module: true,
      sapModule: true,
      requirementText: true,
      crossCuttingTag: true,
      solutionProviderResponse: true,
      solutionProviderRemarks: true,
      scopeItemIds: true,
      currentVerdictId: true,
      verdicts: {
        where: { isCurrent: true },
        select: { confidence: true, verdict: true },
        take: 1,
      },
      customerProcessLinks: {
        select: {
          customerProcess: { select: { processName: true, painPoints: true, pageRefs: true } },
        },
        take: 1,
      },
    },
    orderBy: [{ module: "asc" }, { code: "asc" }],
  });
  console.log(`[reviewer-wb] Loaded ${reqs.length} requirements`);

  const allRows: Row[] = reqs.map((r) => {
    const verdict = r.verdicts[0]?.verdict ?? r.solutionProviderResponse ?? null;
    const conf = r.verdicts[0]?.confidence ?? null;
    const tag = r.crossCuttingTag;
    const proc = r.customerProcessLinks[0]?.customerProcess;
    return {
      priority: classifyPriority(conf, tag),
      code: r.code,
      module: r.module,
      crossCuttingTag: tag,
      requirementText: r.requirementText.replace(/\s+/g, " ").trim(),
      aptusVerdict: verdict,
      timeMapping: aptusToTime(verdict),
      confidence: conf,
      citedScopeCodes: r.scopeItemIds ?? "",
      customerProcess: proc ? `${proc.processName}${proc.pageRefs?.length ? ` (p.${proc.pageRefs.slice(0, 2).join(",")})` : ""}` : "",
      painPoints: proc?.painPoints?.[0]?.slice(0, 200) ?? "",
      autoRemarks: r.solutionProviderRemarks ?? "",
    };
  });

  // Counts for summary
  const priorityCount: Record<Row["priority"], number> = { HIGH: 0, MED: 0, LOW: 0, OK: 0 };
  const moduleCounts: Record<string, { total: number; HIGH: number; MED: number; LOW: number; OK: number; O: number; C: number; G: number; "N/A": number }> = {};
  for (const r of allRows) {
    priorityCount[r.priority]++;
    const m = r.module;
    if (!moduleCounts[m]) moduleCounts[m] = { total: 0, HIGH: 0, MED: 0, LOW: 0, OK: 0, O: 0, C: 0, G: 0, "N/A": 0 };
    moduleCounts[m].total++;
    moduleCounts[m][r.priority]++;
    const v = r.aptusVerdict?.startsWith("O") ? "O" : r.aptusVerdict?.startsWith("C") ? "C" : r.aptusVerdict?.startsWith("G") ? "G" : "N/A";
    moduleCounts[m][v]++;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Aptus — TIME RFT v2 reviewer pipeline";
  wb.created = new Date();

  // Sheet 0: README
  const readme = wb.addWorksheet("0. README", { properties: { tabColor: { argb: "FF1F4E78" } } });
  readme.columns = [{ width: 100 }];
  const readmeLines = [
    "TIME RFT 26.069 — ABeam Consultant Review Workbook",
    "",
    "Purpose: review every one of the 830 v2-classified requirements before bid submission.",
    "",
    "── Workflow ──",
    "1. Open Sheet 1 (Summary) to see per-module distribution + priority counts.",
    "2. Open Sheet 2 (Priority Review) — work the HIGH-priority + MED-priority rows first (low/medium confidence verdicts).",
    "3. Open the per-module sheets (Sheets 3-12) to review every row module-by-module.",
    "4. For each row:",
    "      Approve  — verdict + remarks ship as-is in the App 2 response.",
    "      Edit     — fill RVW Verdict / RVW Cite / RVW Remarks columns; these override Aptus' auto-generated values.",
    "      Reject   — verdict is wrong and needs a full re-think (note in Reviewer Notes).",
    "      Hold     — needs more information from TIME or internal SI lead.",
    "5. Once all rows have a Decision, run the v3 apply script (TBD) to propagate edits into the App 2 response Excel.",
    "",
    "── Color coding ──",
    "Priority HIGH (red)   — low confidence; must review (16 rows)",
    "Priority MED  (amber) — medium confidence; should review (66 rows)",
    "Priority LOW  (green) — high confidence + cross-cutting template; quick scan (~250 rows)",
    "Priority OK   (none)  — high confidence + process-anchored; spot-check only (~498 rows)",
    "",
    "── Honest constraints ──",
    "1. Verdicts are heuristic (module-strict keyword overlap), not LLM-semantic. Some may pick second-best citation.",
    "2. Cross-cutting templates (PROJECT_MGMT / METHODOLOGY / SECURITY / IT_ARCH / etc.) are hand-authored boilerplate;",
    "   they are accurate at template level but should be tailored for tone if TIME's evaluation rubric weighs voice.",
    "3. To-Be Option scoring (Adoption/Priority/Effort/Org) is NULL — the original PDF uses visual checkmarks which",
    "   pdftotext does not preserve. Recovering requires OCR on slide images.",
    "4. Pain points captured for 11 of 227 processes; the rest are inside SmartArt diagrams (also OCR-only).",
    "5. TIME's actual FC/PC/NC evaluation rubric is not visible to bidders — the auto-mapping uses conservative AD-6.",
    "",
    "── Reproducibility ──",
    "All v2 verdicts in DB; classifier in scripts/time/classify-v2-module-strict.ts; coverage proof in",
    "logs/time-app2b-100pct-coverage.md.",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Source: TIME assessment ${TIME_ASSESSMENT_ID}`,
  ];
  for (const line of readmeLines) {
    const row = readme.addRow([line]);
    if (line.startsWith("──")) {
      row.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1F4E78" } };
    } else if (line === readmeLines[0]) {
      row.getCell(1).font = { bold: true, size: 14 };
    } else if (/^Priority (HIGH|MED|LOW|OK)/.test(line)) {
      row.getCell(1).font = { bold: true };
    }
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  }

  // Sheet 1: Summary
  const summary = wb.addWorksheet("1. Summary", { properties: { tabColor: { argb: "FF1F4E78" } } });
  summary.columns = [
    { header: "Module", key: "module", width: 18 },
    { header: "Total Reqs", key: "total", width: 12 },
    { header: "O", key: "O", width: 8 },
    { header: "C", key: "C", width: 8 },
    { header: "G", key: "G", width: 8 },
    { header: "N/A", key: "NA", width: 8 },
    { header: "HIGH priority", key: "HIGH", width: 14 },
    { header: "MED priority", key: "MED", width: 14 },
    { header: "LOW priority", key: "LOW", width: 14 },
    { header: "OK", key: "OK", width: 10 },
    { header: "Review effort (hrs estimate)", key: "effort", width: 28 },
  ];
  applyHeaderStyle(summary);
  for (const m of MODULES) {
    const c = moduleCounts[m] ?? { total: 0, HIGH: 0, MED: 0, LOW: 0, OK: 0, O: 0, C: 0, G: 0, "N/A": 0 };
    // Effort estimate: HIGH × 0.25h + MED × 0.1h + LOW × 0.05h + OK × 0.02h
    const effort = c.HIGH * 0.25 + c.MED * 0.1 + c.LOW * 0.05 + c.OK * 0.02;
    summary.addRow({
      module: m,
      total: c.total,
      O: c.O, C: c.C, G: c.G, NA: c["N/A"],
      HIGH: c.HIGH, MED: c.MED, LOW: c.LOW, OK: c.OK,
      effort: `~${effort.toFixed(1)} hrs`,
    });
  }
  // Total row
  const totalEffort = priorityCount.HIGH * 0.25 + priorityCount.MED * 0.1 + priorityCount.LOW * 0.05 + priorityCount.OK * 0.02;
  const totalO = allRows.filter((r) => r.aptusVerdict?.startsWith("O")).length;
  const totalC = allRows.filter((r) => r.aptusVerdict?.startsWith("C")).length;
  const totalG = allRows.filter((r) => r.aptusVerdict?.startsWith("G")).length;
  const totalNA = allRows.filter((r) => r.aptusVerdict?.startsWith("N")).length;
  const trow = summary.addRow({
    module: "TOTAL",
    total: allRows.length,
    O: totalO, C: totalC, G: totalG, NA: totalNA,
    HIGH: priorityCount.HIGH, MED: priorityCount.MED, LOW: priorityCount.LOW, OK: priorityCount.OK,
    effort: `~${totalEffort.toFixed(1)} hrs`,
  });
  trow.font = { bold: true };
  trow.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } }; });

  summary.autoFilter = { from: { row: 1, column: 1 }, to: { row: summary.rowCount, column: 11 } };

  // Sheet 2: Priority Review (HIGH + MED only)
  const priorityRows = allRows
    .filter((r) => r.priority === "HIGH" || r.priority === "MED")
    .sort((a, b) => {
      const order = { HIGH: 0, MED: 1, LOW: 2, OK: 3 };
      return order[a.priority] - order[b.priority] || a.code.localeCompare(b.code);
    });
  const priority = wb.addWorksheet(`2. Priority Review (${priorityRows.length})`, {
    properties: { tabColor: { argb: "FFCC0000" } },
  });
  writeRows(priority, priorityRows);
  console.log(`[reviewer-wb] Priority Review sheet: ${priorityRows.length} rows`);

  // Sheets 3-12: per-module
  let sheetIdx = 3;
  for (const m of MODULES) {
    const moduleRows = allRows.filter((r) => r.module === m);
    if (moduleRows.length === 0) continue;
    const ws = wb.addWorksheet(`${sheetIdx}. ${m} (${moduleRows.length})`, {
      properties: { tabColor: { argb: "FF666666" } },
    });
    writeRows(ws, moduleRows);
    sheetIdx++;
    console.log(`[reviewer-wb] ${m} sheet: ${moduleRows.length} rows`);
  }

  // Save
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = `/workspaces/aptus/logs/TIME_Reviewer_Workbook_${ts}.xlsx`;
  await wb.xlsx.writeFile(outPath);
  console.log(``);
  console.log(`[reviewer-wb] Done.`);
  console.log(`  Total rows  : ${allRows.length}`);
  console.log(`  Priority    : HIGH=${priorityCount.HIGH}  MED=${priorityCount.MED}  LOW=${priorityCount.LOW}  OK=${priorityCount.OK}`);
  console.log(`  Effort est. : ~${totalEffort.toFixed(1)} hrs senior SI time`);
  console.log(`  Output      : ${outPath}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
