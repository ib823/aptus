/**
 * TIME RFT Phase 10 — generate work-package effort estimates for App 3
 * Bill of Quantity. ABeam fills in unit prices; Aptus produces the
 * QTY/Assumption side from the classified requirements.
 *
 * Output is a separate XLSX (not a patch to App 3 template) for ABeam
 * commercial team to copy values into TIME's BoQ template.
 *
 * Strategy:
 *   For each module/work-stream, count requirements by classification:
 *     - O (OOTB) : ~0.5 person-day per req (verification + light testing)
 *     - C (Config): ~2 person-days per req (config + unit test)
 *     - G (Gap)  : ~5 person-days per req (analysis + design + custom dev)
 *     - N/A      : 0
 *   Apply EffortBaseline overrides if present (from existing model).
 *   Total per work-stream = sum.
 *
 * Heuristic, not authoritative — ABeam consultants will adjust.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/generate-app3-boq.ts
 */

import ExcelJS from "exceljs";
import { prisma } from "../../src/lib/db/prisma";

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";

// Person-days per requirement, by classification bucket
const EFFORT_PER_REQ: Record<string, number> = {
  O: 0.5,
  C: 2.0,
  G: 5.0,
  "N/A": 0,
  "": 0, // unverdicted
};

// Module → work-stream label mapping (matches App 3 BoQ Commercial Core sheet)
const WORK_STREAMS: Array<{ module: string; label: string }> = [
  { module: "SOW",         label: "Project Management & SOW Coverage" },
  { module: "Finance",     label: "Finance (FI/CO/Treasury)" },
  { module: "Asset_IMPS",  label: "Asset Accounting + IMPS (Investment Mgmt + Project System)" },
  { module: "Procurement", label: "Procurement (MM-PUR)" },
  { module: "Warehouse",   label: "Warehouse Management (MM-IM)" },
  { module: "Consignment", label: "Consignment Inventory" },
  { module: "HCM",         label: "HCM + Payroll" },
  { module: "Security",    label: "Security & GRC" },
  { module: "IT",          label: "IT / System Architecture / Integration" },
  { module: "TCO",         label: "Total Cost of Ownership Items" },
];

interface WorkStreamRow {
  module: string;
  label: string;
  totalReqs: number;
  oCount: number;
  cCount: number;
  gCount: number;
  naCount: number;
  unverdicted: number;
  estPersonDays: number;
}

async function main(): Promise<void> {
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true, companyName: true },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  console.log(`[time-app3-boq] Assessment: ${assessment.id}`);

  const requirements = await prisma.clientRequirement.findMany({
    where: { assessmentId: assessment.id },
    select: { module: true, solutionProviderResponse: true },
  });
  console.log(`[time-app3-boq] Loaded ${requirements.length} requirements`);

  const rows: WorkStreamRow[] = [];
  let grandTotalDays = 0;
  let grandTotalReqs = 0;
  for (const ws of WORK_STREAMS) {
    const moduleReqs = requirements.filter((r) => r.module === ws.module);
    const oCount = moduleReqs.filter((r) => r.solutionProviderResponse?.startsWith("O")).length;
    const cCount = moduleReqs.filter((r) => r.solutionProviderResponse?.startsWith("C")).length;
    const gCount = moduleReqs.filter((r) => r.solutionProviderResponse?.startsWith("G")).length;
    const naCount = moduleReqs.filter((r) => r.solutionProviderResponse?.startsWith("N")).length;
    const unverdicted = moduleReqs.filter((r) => !r.solutionProviderResponse).length;

    const estPersonDays =
      oCount * EFFORT_PER_REQ.O! +
      cCount * EFFORT_PER_REQ.C! +
      gCount * EFFORT_PER_REQ.G! +
      naCount * EFFORT_PER_REQ["N/A"]! +
      unverdicted * EFFORT_PER_REQ.C!; // assume C for unverdicted (median)

    rows.push({
      module: ws.module,
      label: ws.label,
      totalReqs: moduleReqs.length,
      oCount, cCount, gCount, naCount, unverdicted,
      estPersonDays,
    });
    grandTotalDays += estPersonDays;
    grandTotalReqs += moduleReqs.length;
  }

  // Build the workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aptus / ABeam Consulting (Malaysia)";
  wb.created = new Date();

  // Sheet 1 — Work-stream summary
  const summary = wb.addWorksheet("Work-Stream Summary");
  summary.columns = [
    { header: "Module", key: "module", width: 14 },
    { header: "Work-Stream", key: "label", width: 50 },
    { header: "Total Reqs", key: "totalReqs", width: 12 },
    { header: "OOTB (O)", key: "oCount", width: 10 },
    { header: "Config (C)", key: "cCount", width: 10 },
    { header: "Gap (G)", key: "gCount", width: 10 },
    { header: "N/A", key: "naCount", width: 8 },
    { header: "Unverdicted", key: "unverdicted", width: 12 },
    { header: "Est. Person-Days", key: "estPersonDays", width: 18 },
  ];
  summary.getRow(1).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  summary.getRow(1).alignment = { horizontal: "center", vertical: "middle" };

  for (const r of rows) summary.addRow(r);
  // Totals row
  const totalRow = summary.addRow({
    module: "TOTAL",
    label: "All work-streams",
    totalReqs: grandTotalReqs,
    oCount: rows.reduce((s, r) => s + r.oCount, 0),
    cCount: rows.reduce((s, r) => s + r.cCount, 0),
    gCount: rows.reduce((s, r) => s + r.gCount, 0),
    naCount: rows.reduce((s, r) => s + r.naCount, 0),
    unverdicted: rows.reduce((s, r) => s + r.unverdicted, 0),
    estPersonDays: grandTotalDays,
  });
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };

  summary.views = [{ state: "frozen", ySplit: 1 }];

  // Sheet 2 — Method note
  const method = wb.addWorksheet("Method");
  method.getColumn(1).width = 100;
  method.getCell("A1").value = "TIME RFT 26.069 — Bill of Quantity Effort Estimation Method";
  method.getCell("A1").font = { bold: true, size: 14 };
  method.getCell("A3").value = "Per-requirement effort baselines (best-effort heuristic — adjust per ABeam delivery norms):";
  method.getCell("A4").value = "  • O (Out-of-the-box) : 0.5 person-day per requirement (verification + light testing)";
  method.getCell("A5").value = "  • C (Configuration)  : 2.0 person-days per requirement (SPRO/SSCUI config + unit test)";
  method.getCell("A6").value = "  • G (Gap)            : 5.0 person-days per requirement (analysis + design + custom dev OR gap-product enablement)";
  method.getCell("A7").value = "  • N/A                : 0";
  method.getCell("A8").value = "  • Unverdicted        : assume C-equivalent (2.0 person-days) — flag for ABeam review";
  method.getCell("A10").value = "Add work-stream overheads not in this baseline:";
  method.getCell("A11").value = "  • Project management overhead — typically +15-20% of total";
  method.getCell("A12").value = "  • Integration testing — usually a separate work-package per major integration touchpoint";
  method.getCell("A13").value = "  • Data migration — driven by data volume, not requirement count (use SAP Activate phase 4 deliverables)";
  method.getCell("A14").value = "  • Cutover support — typically 5-15 person-days per region (TIME has 6 countries)";
  method.getCell("A15").value = "  • OCM / training — typically 10-20% of total";
  method.getCell("A17").value = "Source: Aptus EffortBaseline (existing), classified ClientRequirement counts per module";
  method.getCell("A18").value = "Generated by: scripts/time/generate-app3-boq.ts";

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = `/workspaces/aptus/logs/TIME_App3_BoQ_${timestamp}.xlsx`;
  await wb.xlsx.writeFile(outPath);

  console.log(``);
  console.log(`[time-app3-boq] Done.`);
  console.log(`  Output       : ${outPath}`);
  console.log(`  Total reqs   : ${grandTotalReqs}`);
  console.log(`  Total days   : ${grandTotalDays.toFixed(1)} person-days (heuristic)`);
  console.log(``);
  console.log(`Per work-stream:`);
  for (const r of rows) {
    console.log(`  ${r.module.padEnd(15)} reqs=${String(r.totalReqs).padStart(4)}  O=${r.oCount}  C=${r.cCount}  G=${r.gCount}  unv=${r.unverdicted}  → ${r.estPersonDays.toFixed(1)} pd`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-app3-boq] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
