/**
 * Import Bursa Malaysia RFP requirements into Aptus.
 *
 * Idempotent — re-runnable. Uses (assessmentId, module, code) as the upsert
 * key. Re-import preserves vendor edits to solutionProviderResponse,
 * solutionProviderRemarks, erpModuleSupporting, complianceStatus.
 *
 * Sources (in /workspaces/aptus/bursa/):
 *   A2 Mandatory Requirements   (.docx, 7 items) → module "Mandatory Requirements"
 *   A3 Checklist                (.xlsx, ~40 items grouped) → module "Cybersecurity Checklist"
 *   A4 Business Requirements    (.xlsx, 21 items) → module "Business Requirements"
 *   A5 Technical Requirements   (.xlsx, 151 items, 8 sheets) → 8 modules "Technical — {Area}"
 *   A6 Functional Phase 1       (.xlsx, 613 items, 11 sheets) → module per sheet
 *   A7 Functional Phase 2       (.xlsx, 165 items, 1 sheet) → module "HumanResources"
 *
 * Deferred (NOT imported here):
 *   B1 Schedule of Prices       (.xlsx, vendor-fill quote template — not requirements)
 *   Bursa RFP_2026_02 .docx     (1.35 MB narrative source-of-truth doc)
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/import-bursa-requirements.ts   # parse + counts only
 *   npx tsx scripts/import-bursa-requirements.ts             # write to DB
 *
 * Tied to the existing e2e-test-org tenant + the platform-admin@abeam.test
 * user (both auto-provisioned by /api/auth/test-login).
 */

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const BURSA_DIR = "/workspaces/aptus/bursa";
const PATHS = {
  A2: path.join(BURSA_DIR, "A2-Mandatory Requirements (1).docx"),
  A3: path.join(BURSA_DIR, "A3-Checklist (1).xlsx"),
  A4: path.join(BURSA_DIR, "A4-Business Requirements.xlsx"),
  A5: path.join(BURSA_DIR, "A5-Technical Requirements (1).xlsx"),
  A6: path.join(BURSA_DIR, "A6-Functional Requirements Phase 1 (2).xlsx"),
  A7: path.join(BURSA_DIR, "A7-Functional Requirements Phase 2.xlsx"),
};

const TEST_ORG_SLUG = "e2e-test-org";
const ADMIN_EMAIL = "platform-admin@abeam.test";
const ASSESSMENT_COMPANY = "Bursa Malaysia Berhad";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "richText" in value) {
    const rt = (value as { richText: Array<{ text?: string }> }).richText;
    return rt.map((r) => r.text ?? "").join("").trim();
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellToString((value as { result: unknown }).result);
  }
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: unknown }).text ?? "").trim();
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
  requirementClass: string; // mandatory | checklist | business | technical | functional
  subCriteria: string | null;
  requiredDocs: string | null;
  complianceStatus: string | null;
  submissionFolder: string | null;
}

// ---------------------------------------------------------------------------
// A2 — Mandatory Requirements (.docx)
// 4 tables in the source; only Table #1 (6 mandatory rows) and Table #3
// (1 presentation/clarification row) carry requirement data.
// ---------------------------------------------------------------------------

async function parseA2(): Promise<ParsedRow[]> {
  const buf = fs.readFileSync(PATHS.A2);
  const zip = await JSZip.loadAsync(buf);
  const docXmlEntry = zip.file("word/document.xml");
  if (!docXmlEntry) throw new Error("A2 docx missing word/document.xml");
  const xml = await docXmlEntry.async("string");

  const tableRe = /<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g;
  const trRe = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
  const tcRe = /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g;
  const textRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

  function cellText(cell: string): string {
    const body = cell.replace(/<w:tcPr>[\s\S]*?<\/w:tcPr>/g, "");
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(textRe.source, "g");
    while ((m = re.exec(body)) !== null) out.push(m[1] ?? "");
    return out.join("").replace(/\s+/g, " ").replace(/&amp;/g, "&").trim();
  }

  const tables = xml.match(tableRe) || [];
  const rows: ParsedRow[] = [];
  let sortOrder = 0;
  const module = "Mandatory Requirements";

  // Table 1 — main mandatory rows. Header row is R1; data starts R2.
  // Cols: NO | REQUIREMENTS | M/P | COMPLIED | SUPPORTING DOCS | FOLDER | REMARKS
  const t1 = tables[0];
  const t1Trs = t1 ? t1.match(trRe) || [] : [];
  for (let i = 1; i < t1Trs.length; i++) {
    const tr = t1Trs[i]!;
    const cells = (tr.match(tcRe) || []).map(cellText);
    if (cells.length < 6) continue;
    const no = cells[0] ?? "";
    if (!/^\d+$/.test(no)) continue;
    sortOrder += 10;
    rows.push({
      module,
      section: "Pre-Qualification",
      code: `M${no}`,
      requirementText: cells[1] ?? "",
      requirementType: cells[2] === "M" ? "Mandatory" : (cells[2] === "P" ? "Preferred" : null),
      clientRemarks: cells[6] || null,
      solutionProviderResponse: null,
      solutionProviderRemarks: null,
      erpModuleSupporting: null,
      sortOrder,
      requirementClass: "mandatory",
      subCriteria: null,
      requiredDocs: cells[4] || null,
      complianceStatus: null, // vendor will tick Yes/No in cells[3] later
      submissionFolder: cells[5] || null,
    });
  }

  // Table 3 — presentation & clarification (single row).
  // Cols: NO | REQUIREMENTS | M/P | Vendor Acknowledgement | SUPPORTING DOCS
  const t3 = tables[2];
  const t3Trs = t3 ? t3.match(trRe) || [] : [];
  for (let i = 1; i < t3Trs.length; i++) {
    const tr = t3Trs[i]!;
    const cells = (tr.match(tcRe) || []).map(cellText);
    if (cells.length < 4) continue;
    const no = cells[0] ?? "";
    if (!/^\d+$/.test(no)) continue;
    sortOrder += 10;
    rows.push({
      module,
      section: "Presentation & Clarification",
      code: `PC${no}`,
      requirementText: cells[1] ?? "",
      requirementType: cells[2] === "M" ? "Mandatory" : null,
      clientRemarks: null,
      solutionProviderResponse: null,
      solutionProviderRemarks: null,
      erpModuleSupporting: null,
      sortOrder,
      requirementClass: "mandatory",
      subCriteria: null,
      requiredDocs: cells[4] || null,
      complianceStatus: null,
      submissionFolder: null,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// A3 — Cybersecurity Checklist (.xlsx)
// Single sheet with sections (denoted by rows where col1 empty + col2 carries
// section title + col8 = "Justification"). Inside each section, col1 is a
// running 1..N. Each (section, col1) group is one checklist item; first
// non-empty col2 is the title, subsequent col2s are descriptive bullets.
// ---------------------------------------------------------------------------

async function parseA3(): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PATHS.A3);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("A3 xlsx has no sheets");
  const out: ParsedRow[] = [];
  const module = "Cybersecurity Checklist";

  let section: string | null = null;
  let currentNo = ""; // string form of col1 to distinguish "1" from "1." within differing sections
  let currentTitle = "";
  let currentLines: string[] = [];
  let sectionItemSeq = 0; // unique seq within a section, to disambiguate same-c1 bursts
  const seenInSection = new Set<string>();
  let sortOrder = 0;

  function flush() {
    if (!section || !currentNo) return;
    if (!currentTitle && currentLines.length === 0) return;
    sortOrder += 10;
    const code = makeCode(section, currentNo);
    if (seenInSection.has(code)) return; // safety
    seenInSection.add(code);
    const text = [currentTitle, ...currentLines.filter((l) => l && l !== currentTitle)]
      .filter(Boolean)
      .join("\n");
    out.push({
      module,
      section,
      code,
      requirementText: text || currentTitle || currentLines.join("\n"),
      requirementType: null,
      clientRemarks: null,
      solutionProviderResponse: null,
      solutionProviderRemarks: null,
      erpModuleSupporting: null,
      sortOrder,
      requirementClass: "checklist",
      subCriteria: null,
      requiredDocs: null,
      complianceStatus: null,
      submissionFolder: null,
    });
  }

  function makeCode(sec: string, no: string): string {
    const abbr = sec
      .replace(/[^A-Za-z]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 3)
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("");
    const cleanNo = no.replace(/[^\w]/g, "");
    return `${abbr || "S"}.${cleanNo}`;
  }

  function isSectionHeader(c1: string, c2: string, c8: string): boolean {
    if (c1 || !c2) return false;
    // Markers: col8 contains "Justification" or "Outsource/Cloud"; col2 is short-ish title-case text
    if (/Justification/i.test(c8) || /Outsource|Cloud Services/i.test(c8)) return true;
    return false;
  }

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const c1 = cellToString(row.getCell(1).value);
    const c2 = cellToString(row.getCell(2).value);
    const c8 = cellToString(row.getCell(8).value);

    // Skip the very first banner rows (R1-R3)
    if (r <= 3) continue;

    if (isSectionHeader(c1, c2, c8)) {
      flush();
      currentNo = "";
      currentTitle = "";
      currentLines = [];
      seenInSection.clear();
      section = c2;
      sectionItemSeq = 0;
      continue;
    }

    // Edge case: row with text in col1 but no number (e.g. "PII data Classification") — treat as section
    if (c1 && !c2 && !/^\d+\.?$/.test(c1)) {
      flush();
      currentNo = "";
      currentTitle = "";
      currentLines = [];
      seenInSection.clear();
      section = c1;
      sectionItemSeq = 0;
      continue;
    }

    if (!section) continue; // before any section detected, ignore
    if (!c1 && !c2) continue;

    // Within section. Determine if this row starts a new question (new c1 number).
    const c1Norm = c1.replace(/\.$/, "");
    if (c1Norm && c1Norm !== currentNo) {
      flush();
      currentNo = c1Norm;
      currentTitle = c2 || "";
      currentLines = [];
      sectionItemSeq++;
    } else if (c2) {
      // Continuation
      if (!currentTitle) currentTitle = c2;
      else currentLines.push(c2);
    }
  }
  flush();

  return out;
}

// ---------------------------------------------------------------------------
// A4 — Business Requirements (.xlsx)
// Single sheet. R2 = header. R3+ = data with code A.BR.{n}.
// Cols: Reference Code | Requirements (always "Business") | Criteria |
//       Sub-Criteria | Description | Required Docs
// ---------------------------------------------------------------------------

async function parseA4(): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PATHS.A4);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("A4 xlsx has no sheets");
  const module = "Business Requirements";
  const out: ParsedRow[] = [];
  let sortOrder = 0;

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = cellToString(row.getCell(1).value);
    if (!/^A\.BR\.\d+$/.test(code)) continue;
    const criteria = cellToString(row.getCell(3).value) || null;
    const subCriteria = cellToString(row.getCell(4).value) || null;
    const description = cellToString(row.getCell(5).value);
    if (!description) continue;
    const requiredDocs = cellToString(row.getCell(6).value) || null;
    sortOrder += 10;
    out.push({
      module,
      section: criteria,
      code,
      requirementText: description,
      requirementType: null,
      clientRemarks: null,
      solutionProviderResponse: null,
      solutionProviderRemarks: null,
      erpModuleSupporting: null,
      sortOrder,
      requirementClass: "business",
      subCriteria,
      requiredDocs,
      complianceStatus: null,
      submissionFolder: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A5 — Technical Requirements (.xlsx)
// 11 sheets, only 8 contain data ("0. Essential" .. "7. Monitoring"). The
// other 3 ("Summary", "PRM", "Support Hours") are reference content.
// Per data sheet: col1=ref (B.XXX##), col2=area, col3=requirement text,
// col4=compliance (NM/PM/FM/Exceed or Yes/No, may be pre-filled),
// col5=remark (may be pre-filled).
// ---------------------------------------------------------------------------

const A5_SHEET_LABELS: Record<string, string> = {
  "0. Essential Requirement": "Essential Requirement",
  "1. Technical": "Technical",
  "2. Implementation": "Implementation",
  "3. SDLC & Design": "SDLC & Design",
  "4. Security": "Security",
  "5. Support and Maintenance": "Support and Maintenance",
  "6. Backup and Retention": "Backup and Retention",
  "7. Monitoring": "Monitoring",
};
const A5_REFERENCE_SHEETS = new Set(["Summary", "PRM", "Support Hours"]);

async function parseA5(): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PATHS.A5);
  const out: ParsedRow[] = [];
  for (const ws of wb.worksheets) {
    if (A5_REFERENCE_SHEETS.has(ws.name)) continue;
    const label = A5_SHEET_LABELS[ws.name] ?? ws.name;
    const module = `Technical — ${label}`;
    let sortOrder = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const code = cellToString(row.getCell(1).value);
      if (!/^B\.[A-Z]+\d+$/.test(code)) continue;
      const area = cellToString(row.getCell(2).value) || null;
      const text = cellToString(row.getCell(3).value);
      if (!text) continue;
      const compliance = cellToString(row.getCell(4).value) || null;
      const remark = cellToString(row.getCell(5).value) || null;
      sortOrder += 10;
      out.push({
        module,
        section: area,
        code,
        requirementText: text,
        requirementType: null,
        clientRemarks: null,
        solutionProviderResponse: remark, // pre-filled vendor response, when present
        solutionProviderRemarks: null,
        erpModuleSupporting: null,
        sortOrder,
        requirementClass: "technical",
        subCriteria: null,
        requiredDocs: null,
        complianceStatus: compliance,
        submissionFolder: null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A6/A7 — Functional Requirements (.xlsx)
// Existing format (unchanged from the previous importer). Each sheet is one
// module. Section rows like "H. Bank Reconciliation" set the running section.
// Data rows have col1 = short code (e.g. "I16"), col2 = formal code, col3 =
// requirement text, col4 = type, col5..8 = remarks/response/erp.
// ---------------------------------------------------------------------------

const FUNCTIONAL_CODE_PATTERN = /^[A-Z]+\d+(\.\w+)?(\s*\(\d+\))?$/;
const FUNCTIONAL_SECTION_PATTERN = /^[A-Z]+\.\s+\S/; // "A. General Requirements"

async function parseFunctional(filePath: string): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const out: ParsedRow[] = [];
  const codeCounters = new Map<string, number>();

  for (const ws of wb.worksheets) {
    const module = ws.name;
    let section: string | null = null;
    let sortOrder = 0;

    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const col1 = cellToString(row.getCell(1).value);
      if (!col1) continue;

      if (FUNCTIONAL_SECTION_PATTERN.test(col1)) {
        section = col1;
        continue;
      }
      if (!FUNCTIONAL_CODE_PATTERN.test(col1)) continue;

      const baseCode = col1;
      const counterKey = `${module}|${baseCode}`;
      const count = (codeCounters.get(counterKey) ?? 0) + 1;
      codeCounters.set(counterKey, count);
      const code = count === 1 ? baseCode : `${baseCode} (${count})`;

      const requirementText = cellToString(row.getCell(3).value);
      if (!requirementText) continue;

      sortOrder += 10;

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
        requirementClass: "functional",
        subCriteria: null,
        requiredDocs: null,
        complianceStatus: null,
        submissionFolder: null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = !!process.env.DRY_RUN;
  console.log(`=== Bursa Malaysia import ${dryRun ? "(DRY RUN — no DB writes)" : ""} ===\n`);

  console.log("Parsing source files…");
  const a2 = await parseA2();
  console.log(`  A2 Mandatory:           ${a2.length}`);
  const a3 = await parseA3();
  console.log(`  A3 Checklist:           ${a3.length}`);
  const a4 = await parseA4();
  console.log(`  A4 Business:            ${a4.length}`);
  const a5 = await parseA5();
  console.log(`  A5 Technical:           ${a5.length}`);
  const a6 = await parseFunctional(PATHS.A6);
  console.log(`  A6 Functional Phase 1:  ${a6.length}`);
  const a7 = await parseFunctional(PATHS.A7);
  console.log(`  A7 Functional Phase 2:  ${a7.length}`);

  const all = [...a2, ...a3, ...a4, ...a5, ...a6, ...a7];
  console.log(`\nGRAND TOTAL: ${all.length} requirement rows`);

  // Per-module summary
  const byModule: Record<string, number> = {};
  for (const r of all) byModule[r.module] = (byModule[r.module] ?? 0) + 1;
  console.log(`\nPer-module breakdown (${Object.keys(byModule).length} modules):`);
  for (const [m, n] of Object.entries(byModule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(40)} ${n}`);
  }

  // Per-class summary
  const byClass: Record<string, number> = {};
  for (const r of all) byClass[r.requirementClass] = (byClass[r.requirementClass] ?? 0) + 1;
  console.log(`\nPer-class breakdown:`);
  for (const [c, n] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(20)} ${n}`);
  }

  // Validate code uniqueness within (module, code) before DB write
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const r of all) {
    const key = `${r.module}|${r.code}`;
    if (seen.has(key)) dupes.push(key);
    seen.add(key);
  }
  if (dupes.length) {
    console.error(`\n✗ DUPLICATE (module, code) keys detected: ${dupes.length}`);
    dupes.slice(0, 20).forEach((k) => console.error(`  - ${k}`));
    process.exit(1);
  }

  if (dryRun) {
    console.log(`\n✓ Dry run complete. Re-run without DRY_RUN=1 to write to DB.`);
    return;
  }

  // Resolve org + admin
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
      companyName: ASSESSMENT_COMPANY,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        companyName: ASSESSMENT_COMPANY,
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
    console.log(`\nCreated assessment: ${assessment.id}`);
  } else {
    console.log(`\nReusing assessment: ${assessment.id}`);
  }

  console.log(`Upserting ${all.length} ClientRequirement rows…`);
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
        requirementClass: r.requirementClass,
        subCriteria: r.subCriteria,
        requiredDocs: r.requiredDocs,
        complianceStatus: r.complianceStatus,
        submissionFolder: r.submissionFolder,
      },
      update: {
        // Fields safe to refresh from source
        section: r.section,
        requirementText: r.requirementText,
        requirementType: r.requirementType,
        clientRemarks: r.clientRemarks,
        sortOrder: r.sortOrder,
        requirementClass: r.requirementClass,
        subCriteria: r.subCriteria,
        requiredDocs: r.requiredDocs,
        submissionFolder: r.submissionFolder,
        // Do NOT overwrite fields that may have been edited in-app:
        // solutionProviderResponse, solutionProviderRemarks, erpModuleSupporting,
        // complianceStatus.
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted++;
    else updated++;
  }

  console.log(`\nDone. Inserted ${inserted}, updated ${updated}.`);
  const total = await prisma.clientRequirement.count({
    where: { assessmentId: assessment.id },
  });
  console.log(`Total ClientRequirement rows for this assessment: ${total}`);
  console.log(`\nView at: /assessment/${assessment.id}/requirements`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
