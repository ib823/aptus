/**
 * TIME RFT Phase 2 — ingest Appendix 2 (Technical Compliance S4HANA.xlsx)
 * as 842 ClientRequirement rows under the TIME Aptus Assessment.
 *
 * Source file: /workspaces/aptus/Conversion/RFT/1. RFT Docs/Appendix 2 (26.069) - Technical Compliance S4HANA.xlsx
 * Tender code: 26.069
 *
 * Layout per functional sheet:
 *   - Row 1:  "SAP HANA IMPLEMENTATION" (header)
 *   - Row 2:  "FUNCTIONAL STATEMENT OF COMPLIANCE" (sub-header)
 *   - Row 3:  Column headers ("Section", "Functional Requirement", "FC/PC/NC", ...)
 *   - Row 4+: Section header rows (e.g. "B-1 | Organizational Structure") OR
 *             requirement rows (e.g. "B-1-1 | The solution shall...")
 *
 * Section headers: rows where the section ID matches `^[A-Z]-\d+$` AND col 2
 * has only a section name (no full requirement sentence). We preserve these
 * as ClientRequirement.section context for the next requirement rows.
 *
 * Requirement rows: section ID matches `^[A-Z]-\d+-\d+`. Column shape:
 *   col 1: Section ID (e.g. "B-1-1")
 *   col 2: Requirement text
 *   col 3: FC/PC/NC verdict (BLANK in source — bidder fills)
 *   col 4: Document Reference (often pre-filled with hint, e.g. "Enterprise Structure")
 *   col 5: Solution Options (often pre-filled with hint, e.g. "Core")
 *   col 6: Remarks (BLANK in source — bidder fills)
 *
 * Idempotent — upsert by (assessmentId, module, code).
 *
 * Usage:
 *   $ pnpm tsx scripts/time/ingest-app2-requirements.ts
 *   $ pnpm tsx scripts/time/ingest-app2-requirements.ts --assessment-id <id>
 */

import ExcelJS from "exceljs";
import { prisma } from "../../src/lib/db/prisma";

const SOURCE_PATH =
  "/workspaces/aptus/Conversion/RFT/1. RFT Docs/Appendix 2 (26.069) - Technical Compliance S4HANA.xlsx";
const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";
const TENDER_CODE = "26.069";

// Sheets to ingest as ClientRequirement rows. Each maps to a ClientRequirement.module value.
// Sheet "Macro1", "Summary", "F1.Entities" are skipped (no requirement rows).
// Sheets "K. SLA" + "J. TCO" have a different shape — handled in a follow-up
// step or stored as Assessment.metadata.
const FUNCTIONAL_SHEETS: Array<{ sheetName: string; module: string; sapModuleHint: string | null }> = [
  { sheetName: "A. SOW",                       module: "SOW",          sapModuleHint: null },
  { sheetName: "B. Functional - Finance",      module: "Finance",      sapModuleHint: "FI" },
  { sheetName: "C. Functional - Asset_IMPS",   module: "Asset_IMPS",   sapModuleHint: "FI-AA" },
  { sheetName: "D. Functional - Procurement",  module: "Procurement",  sapModuleHint: "MM" },
  { sheetName: "E. Functional - Warehouse",    module: "Warehouse",    sapModuleHint: "MM-IM" },
  { sheetName: "F. Functional - Consignment",  module: "Consignment",  sapModuleHint: "MM-IM" },
  { sheetName: "G. Functional - HCM",          module: "HCM",          sapModuleHint: "HCM" },
  { sheetName: "H. Functional - Security (GRC)", module: "Security",   sapModuleHint: "GRC" },
  { sheetName: "I. Functional - IT",           module: "IT",           sapModuleHint: "IT" },
  { sheetName: "J. TCO",                       module: "TCO",          sapModuleHint: null },
];

// Column positions (1-indexed, matching ExcelJS)
const COL_SECTION = 1;
const COL_REQUIREMENT = 2;
const COL_VERDICT = 3;
const COL_DOC_REF = 4;
const COL_SOLUTION_OPTS = 5;
const COL_REMARKS = 6;

interface ParsedRow {
  module: string;
  section: string | null;
  code: string;
  requirementText: string;
  requirementType: string;
  sapModuleHint: string | null;
  initialDocRef: string | null;
  initialSolutionOpts: string | null;
  sortOrder: number;
}

function isRequirementId(s: string): boolean {
  return /^[A-Z]-\d+-\d+/.test(s.trim());
}

function isSectionHeaderId(s: string): boolean {
  return /^[A-Z]-\d+$/.test(s.trim());
}

function cellString(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r: { text?: string }) => r.text ?? "").join("");
    }
    if ("result" in value) return cellString(value.result as ExcelJS.CellValue);
  }
  return String(value);
}

async function parseSheet(
  ws: ExcelJS.Worksheet,
  module: string,
  sapModuleHint: string | null,
): Promise<ParsedRow[]> {
  const rows: ParsedRow[] = [];
  let currentSection: string | null = null;
  let sortOrder = 0;

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sectionRaw = cellString(row.getCell(COL_SECTION).value).trim();
    if (!sectionRaw) continue;

    if (isSectionHeaderId(sectionRaw)) {
      // Section header row — capture for downstream requirements
      const sectionName = cellString(row.getCell(COL_REQUIREMENT).value).trim();
      currentSection = sectionName || sectionRaw;
      continue;
    }

    if (!isRequirementId(sectionRaw)) {
      // Skip noise rows (titles, blanks, sub-totals)
      continue;
    }

    const reqText = cellString(row.getCell(COL_REQUIREMENT).value).trim();
    if (reqText.length < 5) continue;

    const initialDocRef = cellString(row.getCell(COL_DOC_REF).value).trim() || null;
    const initialSolutionOpts = cellString(row.getCell(COL_SOLUTION_OPTS).value).trim() || null;

    sortOrder++;
    rows.push({
      module,
      section: currentSection,
      code: sectionRaw,
      requirementText: reqText,
      requirementType: "Mandatory", // RFT does not differentiate; default to Mandatory per partner-bid convention
      sapModuleHint,
      initialDocRef,
      initialSolutionOpts,
      sortOrder,
    });
  }

  return rows;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const assessmentIdx = args.indexOf("--assessment-id");
  let assessmentId = assessmentIdx >= 0 ? args[assessmentIdx + 1] : undefined;

  if (!assessmentId) {
    const assessment = await prisma.assessment.findFirst({
      where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    });
    if (!assessment) {
      throw new Error(
        `No Assessment found for "${ASSESSMENT_COMPANY}". Run Phase 1 first to create the row.`,
      );
    }
    assessmentId = assessment.id;
  }
  console.log(`[time-ingest-app2] Pinning to Assessment ${assessmentId}`);

  // Verify the assessment exists
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, companyName: true, catalogVersionId: true, brownfieldCatalogVersionId: true },
  });
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
  console.log(
    `[time-ingest-app2] Assessment: "${assessment.companyName}" (greenfield catalog: ${assessment.catalogVersionId}, brownfield catalog: ${assessment.brownfieldCatalogVersionId})`,
  );

  console.log(`[time-ingest-app2] Reading ${SOURCE_PATH}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE_PATH);

  let totalParsed = 0;
  let totalUpserted = 0;
  const perModuleCounts: Record<string, number> = {};

  for (const { sheetName, module, sapModuleHint } of FUNCTIONAL_SHEETS) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      console.warn(`[time-ingest-app2] WARN: sheet not found: ${sheetName}`);
      continue;
    }
    const rows = await parseSheet(ws, module, sapModuleHint);
    perModuleCounts[module] = rows.length;
    totalParsed += rows.length;
    console.log(`[time-ingest-app2] Parsed ${sheetName.padEnd(38)} → ${rows.length.toString().padStart(4)} reqs`);

    // Upsert each row
    for (const row of rows) {
      await prisma.clientRequirement.upsert({
        where: {
          assessmentId_module_code: {
            assessmentId: assessment.id,
            module: row.module,
            code: row.code,
          },
        },
        create: {
          assessmentId: assessment.id,
          module: row.module,
          section: row.section,
          code: row.code,
          requirementText: row.requirementText,
          requirementType: row.requirementType,
          erpModuleSupporting: row.initialSolutionOpts ?? null,
          sapModule: row.sapModuleHint ?? null,
          // Preserve original Doc Ref hint (often "Enterprise Structure" / "FI.006") in clientRemarks
          // so it survives until the classifier pass overwrites Document Reference column.
          clientRemarks: row.initialDocRef ?? null,
          sortOrder: row.sortOrder,
        },
        update: {
          section: row.section,
          requirementText: row.requirementText,
          requirementType: row.requirementType,
          // Don't overwrite verdict columns on re-import — those may have been
          // populated by classifier passes between runs. Only update the
          // bidder-facing read-only fields.
          sortOrder: row.sortOrder,
          ...(row.sapModuleHint && { sapModule: row.sapModuleHint }),
        },
      });
      totalUpserted++;
    }
  }

  console.log(``);
  console.log(`[time-ingest-app2] Done.`);
  console.log(`  Total parsed   : ${totalParsed}`);
  console.log(`  Total upserted : ${totalUpserted}`);
  console.log(`  By module:`);
  for (const [m, c] of Object.entries(perModuleCounts)) {
    console.log(`    ${m.padEnd(15)} ${c}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-ingest-app2] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
