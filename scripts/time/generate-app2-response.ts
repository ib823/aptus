/**
 * TIME RFT Phase 9 — generate the App 2 response Excel by reading
 * TIME's exact RFT template, walking every requirement row, and writing
 * the classifier's verdict + grounded Remarks back into TIME's columns.
 *
 * Strategy: open the original RFT template via ExcelJS (preserves
 * dropdowns, validations, frozen panes, styling), find each requirement
 * row by its section ID (e.g. "B-1-1" in column 1), and patch:
 *   col 3 (FC/PC/NC verdict)  ← maps Aptus O/C/G/N-A to TIME's vocabulary
 *   col 4 (Document Reference) ← scope code(s) cited by classifier
 *   col 5 (Solution Options)   ← Core / Option 1 / 2 / 3
 *   col 6 (Remarks)            ← classifier remarksMd (cleaned for Excel)
 *
 * Saves to /workspaces/aptus/logs/TIME_App2_Response_<timestamp>.xlsx.
 *
 * Idempotent — every run produces a fresh timestamped output (does not
 * mutate the source template).
 *
 * Usage:
 *   $ pnpm tsx scripts/time/generate-app2-response.ts
 *   $ pnpm tsx scripts/time/generate-app2-response.ts --pass-id <passId>
 */

import ExcelJS from "exceljs";
import { prisma } from "../../src/lib/db/prisma";

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";
const TEMPLATE_PATH =
  "/workspaces/aptus/Conversion/RFT/1. RFT Docs/Appendix 2 (26.069) - Technical Compliance S4HANA.xlsx";

const FUNCTIONAL_SHEETS = [
  "A. SOW",
  "B. Functional - Finance",
  "C. Functional - Asset_IMPS",
  "D. Functional - Procurement",
  "E. Functional - Warehouse",
  "F. Functional - Consignment",
  "G. Functional - HCM",
  "H. Functional - Security (GRC)",
  "I. Functional - IT",
  "J. TCO",
];

const COL_SECTION = 1;
const COL_VERDICT = 3;
const COL_DOC_REF = 4;
const COL_SOLUTION_OPTS = 5;
const COL_REMARKS = 6;

function aptusToTimeVerdict(aptus: string): string {
  // Per AD-6 mapping
  if (aptus.startsWith("O") || aptus.startsWith("C")) return "FC";
  if (aptus.startsWith("G")) return "PC";
  if (aptus.startsWith("N")) return "N/A";
  return "";
}

function buildDocReference(scopeItemIds: string | null): string {
  if (!scopeItemIds) return "";
  const codes = scopeItemIds.split(",").map((c) => c.trim()).filter(Boolean);
  return codes.slice(0, 5).join(", ");
}

function buildSolutionOptions(verdict: string, scopeItemIds: string | null, sapModule: string | null): string {
  // If matched to a greenfield ScopeItem → Core
  if (scopeItemIds && scopeItemIds.length > 0) return "Core";
  // Heuristic gap-product mapping
  if (verdict.startsWith("G") && sapModule) {
    if (sapModule === "SuccessFactors") return "Option 3 - Vendor Solution (SAP SuccessFactors)";
    if (sapModule === "Ariba") return "Option 3 - Vendor Solution (SAP Ariba)";
    if (sapModule === "BPA" || sapModule === "Workzone") return "Option 2 - SAP BPA / Workzone";
    if (sapModule === "Concur") return "Option 3 - Vendor Solution (SAP Concur)";
    if (sapModule === "Signavio") return "Option 3 - Vendor Solution (SAP Signavio)";
  }
  return "Core";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const passIdx = args.indexOf("--pass-id");
  const passIdArg = passIdx >= 0 ? args[passIdx + 1] : undefined;

  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true, companyName: true },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  console.log(`[time-app2-response] Assessment: ${assessment.id}`);

  // Pull all requirements + their current verdicts (via read-cache columns)
  const where: { assessmentId: string } = { assessmentId: assessment.id };
  const requirements = await prisma.clientRequirement.findMany({
    where,
    select: {
      id: true, code: true, module: true,
      solutionProviderResponse: true, solutionProviderRemarks: true,
      sapModule: true, scopeItemIds: true, scopeItemNames: true,
      currentVerdictId: true,
    },
  });
  const verdictedCount = requirements.filter((r) => r.solutionProviderResponse).length;
  console.log(`[time-app2-response] Requirements: ${requirements.length} (${verdictedCount} verdicted)`);

  // Index by code for fast lookup during Excel walk
  const reqByCode = new Map<string, typeof requirements[number]>();
  for (const r of requirements) reqByCode.set(r.code, r);

  console.log(`[time-app2-response] Reading template: ${TEMPLATE_PATH}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  let cellsWritten = 0;
  let perSheetWrites: Record<string, number> = {};

  for (const sheetName of FUNCTIONAL_SHEETS) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      console.warn(`[time-app2-response] WARN: sheet not found: ${sheetName}`);
      continue;
    }
    let writes = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const sectionRaw = row.getCell(COL_SECTION).value;
      const sectionStr = typeof sectionRaw === "string" ? sectionRaw.trim() : null;
      if (!sectionStr || !/^[A-Z]-\d+-\d+/.test(sectionStr)) continue;

      const req = reqByCode.get(sectionStr);
      if (!req || !req.solutionProviderResponse) continue;

      const verdict = aptusToTimeVerdict(req.solutionProviderResponse);
      const docRef = buildDocReference(req.scopeItemIds);
      const solnOpts = buildSolutionOptions(req.solutionProviderResponse, req.scopeItemIds, req.sapModule);
      const remarks = (req.solutionProviderRemarks ?? "").slice(0, 2000); // cap at 2000 chars

      // Write only into empty cells OR into the target cells (we own col 3-6)
      row.getCell(COL_VERDICT).value = verdict;
      row.getCell(COL_DOC_REF).value = docRef || row.getCell(COL_DOC_REF).value; // preserve original hint if no scope match
      row.getCell(COL_SOLUTION_OPTS).value = solnOpts;
      row.getCell(COL_REMARKS).value = remarks;

      // Light cell formatting (preserve original styling otherwise)
      row.getCell(COL_VERDICT).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(COL_REMARKS).alignment = { wrapText: true, vertical: "top" };

      writes++;
      cellsWritten++;
    }
    perSheetWrites[sheetName] = writes;
    console.log(`[time-app2-response]   ${sheetName.padEnd(38)} → wrote ${writes} response rows`);
  }

  // Save with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = `/workspaces/aptus/logs/TIME_App2_Response_${timestamp}.xlsx`;
  await wb.xlsx.writeFile(outPath);

  console.log(``);
  console.log(`[time-app2-response] Done.`);
  console.log(`  Cells written : ${cellsWritten}`);
  console.log(`  Output        : ${outPath}`);
  console.log(`  By sheet      :`);
  for (const [s, c] of Object.entries(perSheetWrites)) {
    console.log(`    ${s.padEnd(38)} ${c}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-app2-response] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
