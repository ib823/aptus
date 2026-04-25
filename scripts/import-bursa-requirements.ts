/**
 * Import Bursa Malaysia functional requirements into Aptus.
 *
 * Idempotent — re-runnable. Uses (assessmentId, module, code) as the upsert
 * key. Duplicate codes within a sheet (e.g. Procurement.B3.a appears twice in
 * the source) are disambiguated with a "(N)" suffix so they stay distinct.
 *
 * Usage:  npx tsx scripts/import-bursa-requirements.ts
 *
 * Reads both:
 *   /workspaces/aptus/A6-Functional Requirements Phase 1 (2).xlsx
 *   /workspaces/aptus/A7-Functional Requirements Phase 2.xlsx
 *
 * Tied to the existing e2e-test-org tenant + the platform-admin@abeam.test
 * user (both auto-provisioned by /api/auth/test-login).
 */

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import path from "path";

const prisma = new PrismaClient();

const PHASE_1_PATH = "/workspaces/aptus/A6-Functional Requirements Phase 1 (2).xlsx";
const PHASE_2_PATH = "/workspaces/aptus/A7-Functional Requirements Phase 2.xlsx";

const TEST_ORG_SLUG = "e2e-test-org";
const ADMIN_EMAIL = "platform-admin@abeam.test";

const ASSESSMENT_KEY = {
  companyName: "Bursa Malaysia Berhad",
  organizationSlug: TEST_ORG_SLUG,
};

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  // ExcelJS richText object
  if (typeof value === "object" && value !== null && "richText" in value) {
    const rt = (value as { richText: Array<{ text?: string }> }).richText;
    return rt.map((r) => r.text ?? "").join("").trim();
  }
  // ExcelJS hyperlink object
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  // Formula result
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellToString((value as { result: unknown }).result);
  }
  try {
    return String(value).trim();
  } catch {
    return "";
  }
}

interface ParsedRow {
  module: string;
  section: string | null;
  code: string;
  requirementText: string;
  requirementType: string | null;
  clientRemarks: string | null;
  solutionProviderResponse: string | null;
  solutionProviderRemarks: string | null;
  erpModuleSupporting: string | null;
  sortOrder: number;
}

const CODE_PATTERN = /^[A-Z]+\d+(\.\w+)?(\s*\(\d+\))?$/;
const SECTION_PATTERN = /^[A-Z]+\.\s+\S/; // e.g. "A. General Requirements"

function isLikelyDataRow(col1: string): boolean {
  return CODE_PATTERN.test(col1.trim());
}

function isLikelySectionHeader(col1: string): boolean {
  return SECTION_PATTERN.test(col1.trim());
}

async function parseFile(filePath: string): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const out: ParsedRow[] = [];
  const codeCounters = new Map<string, number>(); // module|baseCode -> count

  for (const ws of wb.worksheets) {
    const module = ws.name;
    let section: string | null = null;
    let sortOrder = 0;

    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const col1 = cellToString(row.getCell(1).value);
      if (!col1) continue;

      if (isLikelySectionHeader(col1)) {
        section = col1;
        continue;
      }

      if (!isLikelyDataRow(col1)) continue;

      const baseCode = col1;
      const counterKey = `${module}|${baseCode}`;
      const count = (codeCounters.get(counterKey) ?? 0) + 1;
      codeCounters.set(counterKey, count);
      const code = count === 1 ? baseCode : `${baseCode} (${count})`;

      const requirementText = cellToString(row.getCell(3).value);
      if (!requirementText) continue; // skip rows with no actual requirement text

      sortOrder += 10; // 10-spacing leaves room for manual reordering

      out.push({
        module,
        section,
        code,
        requirementText,
        requirementType: cellToString(row.getCell(4).value) || null,
        clientRemarks: cellToString(row.getCell(5).value) || null,
        solutionProviderResponse: cellToString(row.getCell(6).value) || null,
        solutionProviderRemarks: cellToString(row.getCell(7).value) || null,
        erpModuleSupporting: cellToString(row.getCell(8).value) || null,
        sortOrder,
      });
    }
  }

  return out;
}

async function main(): Promise<void> {
  console.log("=== Importing Bursa Malaysia functional requirements ===\n");

  // Resolve org + admin user
  const org = await prisma.organization.findFirst({
    where: { slug: TEST_ORG_SLUG },
    select: { id: true },
  });
  if (!org) {
    console.error(`Org with slug "${TEST_ORG_SLUG}" not found. Run /dev-login once first.`);
    process.exit(1);
  }

  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  if (!admin) {
    console.error(`User ${ADMIN_EMAIL} not found. Run /dev-login once first.`);
    process.exit(1);
  }

  // Find or create the Bursa Malaysia assessment
  let assessment = await prisma.assessment.findFirst({
    where: {
      organizationId: org.id,
      companyName: ASSESSMENT_KEY.companyName,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        companyName: ASSESSMENT_KEY.companyName,
        industry: "Financial Services",
        country: "MY",
        operatingCountries: ["MY"],
        companySize: "LARGE",
        currentErp: "SAP ECC 6.0",
        currentErpVersion: "EHP 8",
        sapVersion: "2602",
        deploymentModel: "public_cloud",
        migrationApproach: "greenfield",
        sapModules: ["FI", "CO", "MM", "SD", "HR"],
        keyProcesses: [
          "Procure-to-Pay",
          "Order-to-Cash",
          "Record-to-Report",
          "Hire-to-Retire",
        ],
        languageRequirements: ["EN", "MS"],
        regulatoryFrameworks: ["MFRS", "Bursa Listing Requirements"],
        status: "in_progress",
        createdBy: admin.id,
        organizationId: org.id,
      },
      select: { id: true },
    });
    console.log(`Created assessment: ${assessment.id}`);
  } else {
    console.log(`Reusing assessment: ${assessment.id}`);
  }

  // Parse both files
  console.log(`\nParsing ${path.basename(PHASE_1_PATH)} ...`);
  const phase1 = await parseFile(PHASE_1_PATH);
  console.log(`  ${phase1.length} requirements parsed`);

  console.log(`Parsing ${path.basename(PHASE_2_PATH)} ...`);
  const phase2 = await parseFile(PHASE_2_PATH);
  console.log(`  ${phase2.length} requirements parsed`);

  const all = [...phase1, ...phase2];

  // Per-module summary
  const byModule: Record<string, number> = {};
  for (const r of all) byModule[r.module] = (byModule[r.module] ?? 0) + 1;
  console.log(`\nTotal: ${all.length} requirements across ${Object.keys(byModule).length} modules`);
  for (const [m, n] of Object.entries(byModule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(28)} ${n}`);
  }

  // Upsert all rows
  console.log(`\nUpserting into ClientRequirement ...`);
  let inserted = 0;
  let updated = 0;
  for (const r of all) {
    const result = await prisma.clientRequirement.upsert({
      where: {
        assessmentId_module_code: {
          assessmentId: assessment.id,
          module: r.module,
          code: r.code,
        },
      },
      create: {
        assessmentId: assessment.id,
        module: r.module,
        section: r.section,
        code: r.code,
        requirementText: r.requirementText,
        requirementType: r.requirementType,
        clientRemarks: r.clientRemarks,
        solutionProviderResponse: r.solutionProviderResponse,
        solutionProviderRemarks: r.solutionProviderRemarks,
        erpModuleSupporting: r.erpModuleSupporting,
        sortOrder: r.sortOrder,
      },
      update: {
        section: r.section,
        requirementText: r.requirementText,
        requirementType: r.requirementType,
        clientRemarks: r.clientRemarks,
        // NOTE: we do NOT overwrite solutionProviderResponse / Remarks /
        // erpModuleSupporting on re-import, since the user may have edited
        // those in-app. Source-of-truth for those columns is Aptus, not
        // the spreadsheet, after the first import.
        sortOrder: r.sortOrder,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(`\nDone. Inserted ${inserted}, updated ${updated}.`);

  const total = await prisma.clientRequirement.count({ where: { assessmentId: assessment.id } });
  console.log(`Total ClientRequirement rows for this assessment: ${total}`);
  console.log(`\nView at: /assessment/${assessment.id}/requirements`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
