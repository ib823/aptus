/**
 * SKM (Suruhanjaya Koperasi Malaysia) tender requirements importer.
 *
 * Source file: 8.LAMPIRANAJADUALPEMATUHANSPESIFIKASILATEST (2).xlsm
 *   - Tender code: SKM/01/2026
 *   - 17 functional modules (M1 General Ledger ... M17 M.I.S. Dashboard)
 *   - 9 LAMPIRAN A appendices (general / technical / SLA / etc.)
 *   - 4-tier compliance taxonomy: Mandatori / Pilihan tinggi / sederhana / rendah
 *
 * Layout per sheet:
 *   - Column C: BIL. (item number, e.g. "1", "1.1", "1.2.3")
 *   - Column D: SPESIFIKASI (requirement text in Malay)
 *   - Column E: PEMATUHAN (compliance tier)
 *   - Column I: MAKLUM BALAS (vendor response — empty in source)
 *   - Column J: CADANGAN/CATATAN (vendor remarks — empty in source)
 *
 * Section headers: rows where C is non-numeric (e.g. "A", "B", "1.0", "C.1")
 * AND E is empty. These break the requirement list into sub-sections; we
 * preserve them as ClientRequirement.section.
 *
 * Idempotent — uses (assessmentId, module, code) as the natural key for
 * upsert. Re-runs update existing rows in-place.
 */

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import path from "node:path";

const prisma = new PrismaClient();

const SOURCE_PATH = "/workspaces/aptus/8.LAMPIRANAJADUALPEMATUHANSPESIFIKASILATEST (2).xlsm";
const ASSESSMENT_COMPANY = "Suruhanjaya Koperasi Malaysia";
const TENDER_CODE = "SKM/01/2026";

// ── Tier mapping (case-insensitive, tolerates whitespace + typos seen in source) ──
function normalizePriorityTier(raw: string): { tier: string | null; requirementType: string } {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("mandatori") || lower.includes("wajib")) {
    return { tier: "MANDATORI", requirementType: "Mandatory" };
  }
  if (lower.includes("piihan tinggi") || lower.includes("pilihan tinggi")) {
    return { tier: "PILIHAN_TINGGI", requirementType: "Non-Mandatory" };
  }
  if (lower.includes("pilihan sederhana") || lower.includes("pilihan sed")) {
    return { tier: "PILIHAN_SEDERHANA", requirementType: "Non-Mandatory" };
  }
  if (lower.includes("pilihan rendah")) {
    return { tier: "PILIHAN_RENDAH", requirementType: "Non-Mandatory" };
  }
  return { tier: null, requirementType: "Non-Mandatory" };
}

interface ParsedRow {
  module: string;
  section: string | null;
  code: string;
  requirementText: string;
  priorityTier: string | null;
  requirementType: string;
}

function looksLikeRequirementCode(c: string): boolean {
  // "1.1", "1.10", "2.5.3", "1.1000000000000001" (Excel float artifact), "1", "1.0"
  return /^\d+(\.\d+)*$/.test(c.trim());
}

function looksLikeSectionHeader(c: string): boolean {
  // "A", "B", "C.1", "I", "II"
  return /^[A-Z]+(\.\d+)?$/.test(c.trim()) || /^\d+[A-Z]$/.test(c.trim());
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // ExcelJS rich-text shape: { richText: [{ text: "...", font: {...} }, ...] }
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>)
        .map((r) => r.text ?? "")
        .join("");
    }
    // Hyperlink / formula cells
    if (typeof o.text === "string") return o.text;
    if (typeof o.result === "string") return o.result;
    if (typeof o.formula === "string" && typeof o.result === "string") return o.result;
  }
  return String(v);
}

async function parseSheet(workbook: ExcelJS.Workbook, sheetName: string, moduleLabel: string): Promise<ParsedRow[]> {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    console.warn(`  ⚠️  Sheet not found: ${sheetName}`);
    return [];
  }

  const rows: ParsedRow[] = [];
  let currentSection: string | null = null;
  let currentSectionPrefix: string | null = null; // e.g. "A", "B", "1" — used to disambiguate codes
  let sortIdx = 0;

  sheet.eachRow((row) => {
    sortIdx++;
    // exceljs row.values is 1-indexed and starts with empty[0]
    const values = (row.values as unknown[]) ?? [];
    const c = cellToString(values[3]).trim();
    const d = cellToString(values[4]).trim();
    const e = cellToString(values[5]).trim();

    if (!d || !c) return;

    // Section header: C is non-numeric AND E is empty
    if (looksLikeSectionHeader(c) && !e) {
      currentSection = `${c}. ${d}`.slice(0, 200);
      currentSectionPrefix = c;
      return;
    }

    // Requirement: C looks like 1.1 / 1.10 / 2.3.4 etc. AND E has a recognized tier.
    // Rows with numeric C but empty E are sub-section descriptors (e.g.
    // "1. Carta Akaun dan Data Induk") — treat them as section breaks rather
    // than standalone requirements. This matches the Python probe's count.
    if (looksLikeRequirementCode(c)) {
      const tier = normalizePriorityTier(e);
      if (!tier.tier) {
        // Empty/unrecognized tier → treat as section descriptor; promote to currentSection
        currentSection = `${c}. ${d}`.slice(0, 200);
        currentSectionPrefix = c;
        return;
      }
      // Excel can serialize "1.1" as "1.1000000000000001" — normalize
      const normalizedCode = normalizeExcelDecimal(c);
      // Prefix with current section letter to disambiguate duplicates across
      // sections within the same sheet (e.g. section A's "1.1" vs section B's "1.1")
      const fullCode = currentSectionPrefix
        ? `${currentSectionPrefix}.${normalizedCode}`
        : normalizedCode;
      rows.push({
        module: moduleLabel,
        section: currentSection,
        code: fullCode,
        requirementText: d,
        priorityTier: tier.tier,
        requirementType: tier.requirementType,
      });
    }
  });

  return rows;
}

function normalizeExcelDecimal(c: string): string {
  // "1.1000000000000001" → "1.1"; "2.5000000000000001" → "2.5"
  if (/\.\d+(0{8,}|9{8,})\d*$/.test(c)) {
    const num = parseFloat(c);
    if (!isNaN(num)) {
      return num.toFixed(Math.min(2, c.split(".")[1]?.length ?? 0)).replace(/\.?0+$/, "");
    }
  }
  return c;
}

// Module label mapping — the workbook sheet names map to canonical module labels
const MODULE_MAP: Array<{ sheet: string; label: string; group: "M" | "LAMPIRAN" }> = [
  { sheet: "LAMPIRAN A (I) UMUM", label: "Lampiran A.I — Umum", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (II) TEKNIKAL", label: "Lampiran A.II — Teknikal", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (III) DEMO SISTEM", label: "Lampiran A.III — Demo Sistem", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (IV) PELAN LATIHAN", label: "Lampiran A.IV — Pelan Latihan", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (V) NILAI TAMBAH", label: "Lampiran A.V — Nilai Tambah", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (VI) SLA PELAKSANAAN", label: "Lampiran A.VI — SLA Pelaksanaan", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (VII) SLA LANGGANAN", label: "Lampiran A.VII — SLA Langganan", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (VIII) TEKNIKAL", label: "Lampiran A.VIII — Teknikal", group: "LAMPIRAN" },
  { sheet: "LAMPIRAN A (IX) TEKNIKAL ICT", label: "Lampiran A.IX — Teknikal ICT", group: "LAMPIRAN" },
  { sheet: "M1 GENERAL LEDGER", label: "M1 General Ledger", group: "M" },
  { sheet: "M2 CASH MANAGEMENT", label: "M2 Cash Management", group: "M" },
  { sheet: "M2 CASH BOOK", label: "M2 Cash Book", group: "M" },
  { sheet: "M3 ACCOUNT RECEIVABLE", label: "M3 Account Receivable", group: "M" },
  { sheet: "M3 CUSTOMER PORTAL", label: "M3 Customer Portal", group: "M" },
  { sheet: "M4 FIXED ASSET", label: "M4 Fixed Asset", group: "M" },
  { sheet: "M5 INVESTMENT", label: "M5 Investment", group: "M" },
  { sheet: "M6 INVENTORY MANAGEMENT", label: "M6 Inventory Management", group: "M" },
  { sheet: "M7 ACCOUNT PAYABLE", label: "M7 Account Payable", group: "M" },
  { sheet: "M7 VENDOR PORTAL", label: "M7 Vendor Portal", group: "M" },
  { sheet: "M8 LOAN & LEASES", label: "M8 Loan & Leases", group: "M" },
  { sheet: "M9 PROJECT ACCOUNTING", label: "M9 Project Accounting", group: "M" },
  { sheet: "M10 BUDGETARY CONTROL", label: "M10 Budgetary Control", group: "M" },
  { sheet: "M10 BUDGET ONLINE", label: "M10 Budget Online", group: "M" },
  { sheet: "M11 TREASURY (DEPOSIT & TRUST)", label: "M11 Treasury (Deposit & Trust)", group: "M" },
  { sheet: "M12 CONTRACT MANAGEMENT", label: "M12 Contract Management", group: "M" },
  { sheet: "M13 STAFF ADVANCE & CLAIM", label: "M13 Staff Advance & Claim", group: "M" },
  { sheet: "M13 PAYROLL", label: "M13 Payroll", group: "M" },
  { sheet: "M13 STAFF PORTAL", label: "M13 Staff Portal", group: "M" },
  { sheet: "M14 REVENUE", label: "M14 Revenue", group: "M" },
  { sheet: "M15 EXPENDITURE", label: "M15 Expenditure", group: "M" },
  { sheet: "M16 PROCUREMENT", label: "M16 Procurement", group: "M" },
  { sheet: "M16 PROCUREMENT ONLINE", label: "M16 Procurement Online", group: "M" },
  { sheet: "M17 M.I.S. DASHBOARD", label: "M17 M.I.S. Dashboard", group: "M" },
];

async function main(): Promise<void> {
  const dryRun = process.env.SKM_DRY_RUN === "1";
  console.log(`[SKM importer] dry_run=${dryRun}`);
  console.log(`[SKM importer] Loading: ${SOURCE_PATH}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_PATH);
  console.log(`[SKM importer] Sheets in source: ${workbook.worksheets.length}`);

  // Parse all rows from all module sheets
  const allRows: ParsedRow[] = [];
  for (const def of MODULE_MAP) {
    const rows = await parseSheet(workbook, def.sheet, def.label);
    console.log(`  ${def.sheet.padEnd(35)} → ${rows.length} reqs`);
    allRows.push(...rows);
  }
  console.log(`\nTotal parsed rows: ${allRows.length}`);

  // Deduplicate by (module, code): when the same (module, code) tuple appears
  // multiple times (which happens when a sheet has repeated parent-letter
  // sections each containing a sub-section "1."), append a suffix to the code
  // so the natural key is unique. Preserves all 1,564 rows in the DB.
  {
    const seen = new Map<string, number>(); // key → next-seq
    let collisions = 0;
    for (const r of allRows) {
      const key = `${r.module}::${r.code}`;
      const seq = seen.get(key) ?? 0;
      if (seq > 0) {
        r.code = `${r.code}#${seq + 1}`;
        collisions++;
      }
      seen.set(key, seq + 1);
    }
    if (collisions > 0) console.log(`Disambiguated ${collisions} collisions via #N suffix`);
  }

  // Tier breakdown
  const tierCounts = new Map<string, number>();
  for (const r of allRows) {
    const k = r.priorityTier ?? "(null)";
    tierCounts.set(k, (tierCounts.get(k) ?? 0) + 1);
  }
  console.log("\nTier breakdown:");
  for (const [t, n] of tierCounts) console.log(`  ${t.padEnd(20)} ${n}`);

  if (dryRun) {
    console.log("\nDry-run — no DB writes. Sample 5 rows:");
    for (const r of allRows.slice(0, 5)) {
      console.log(`  [${r.module}] ${r.code}  tier=${r.priorityTier}  text="${r.requirementText.slice(0, 80)}…"`);
    }
    await prisma.$disconnect();
    return;
  }

  // Resolve / create the SKM Assessment
  const priv = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2025-FPS1", edition: "PRIVATE" } },
    select: { id: true },
  });
  if (!priv) throw new Error("Private 2025-FPS1 catalog missing — Phase 13.2 must run first");

  // Find an organization to scope this under (use first available, or create a stub)
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error("No organization found in DB; create one before running this import");
  console.log(`\nUsing organization: ${org.name} (${org.id})`);

  // Resolve a created-by user
  const user = await prisma.user.findFirst({ select: { id: true, email: true } });
  if (!user) throw new Error("No user found in DB; create one before running this import");
  console.log(`Using created-by user: ${user.email}`);

  let assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true, _count: { select: { clientRequirements: true } } },
  });

  if (assessment) {
    console.log(`\nFound existing SKM assessment ${assessment.id} (${assessment._count.clientRequirements} existing reqs)`);
  } else {
    console.log(`\nCreating new SKM assessment (Private 2025-FPS1)…`);
    assessment = await prisma.assessment.create({
      data: {
        companyName: ASSESSMENT_COMPANY,
        industry: "Public Sector",
        country: "MY",
        operatingCountries: ["MY"],
        companySize: "large",
        catalogVersionId: priv.id,
        createdBy: user.id,
        organizationId: org.id,
        status: "draft",
      },
      select: { id: true, _count: { select: { clientRequirements: true } } },
    });
    console.log(`  Created: ${assessment.id}`);
  }

  // Upsert rows
  console.log(`\nUpserting ${allRows.length} requirements...`);
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i]!;
    const existing = await prisma.clientRequirement.findFirst({
      where: { assessmentId: assessment.id, module: r.module, code: r.code },
      select: { id: true },
    });
    if (existing) {
      await prisma.clientRequirement.update({
        where: { id: existing.id },
        data: {
          requirementText: r.requirementText,
          requirementType: r.requirementType,
          priorityTier: r.priorityTier,
          section: r.section,
          sortOrder: i,
        },
      });
      updated++;
    } else {
      await prisma.clientRequirement.create({
        data: {
          assessmentId: assessment.id,
          module: r.module,
          section: r.section,
          code: r.code,
          requirementText: r.requirementText,
          requirementType: r.requirementType,
          priorityTier: r.priorityTier,
          sortOrder: i,
        },
      });
      inserted++;
    }
    if ((i + 1) % 200 === 0) console.log(`  ... ${i + 1}/${allRows.length}`);
  }

  // Final count (totalRequirements rollup field doesn't exist on Assessment;
  // count via _count relation as the platform standard)
  const total = await prisma.clientRequirement.count({ where: { assessmentId: assessment.id } });

  console.log(`\n[SKM importer] === Complete ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Assessment id: ${assessment.id}`);
  console.log(`  Total requirements in DB: ${total}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
