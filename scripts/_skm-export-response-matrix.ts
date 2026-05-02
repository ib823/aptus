/**
 * SKM Response Matrix export.
 *
 * Generates an XLSX that mirrors the SKM RFP requirement matrix structure,
 * populated with our verdicts + justifications. Two sheets:
 *
 *   1. "Ringkasan"  — distribution counts + per-module breakdown (BM headers).
 *   2. "Matriks Keperluan"  — one row per requirement with all 1,564 reqs.
 *
 * Columns in "Matriks Keperluan":
 *   Bil. | Modul | Bahagian | Kod | Keperluan | Jenis | Klasifikasi SAP
 *   | Modul SAP | Rujukan SAP Best Practice | Justifikasi (BM) | Justification (EN)
 *
 * "Justifikasi (BM)" reads from solutionProviderRemarksBm if present, otherwise
 * empty. "Justification (EN)" always shows the original AI narrative for reviewer
 * context. Once translated remarks are applied (via the translation harness),
 * regenerating produces a BM-only-justification deliverable.
 *
 * Output: /workspaces/aptus/logs/SKM_Response_Matrix_<timestamp>.xlsx
 */

import { prisma } from "../src/lib/db/prisma";
import ExcelJS from "exceljs";
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";

const BM_SIDECAR = "/workspaces/aptus/data/skm-bm-remarks.json";

async function loadBmSidecar(): Promise<Record<string, string>> {
  try {
    await stat(BM_SIDECAR);
    const text = await readFile(BM_SIDECAR, "utf8");
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return {};
  }
}

const ASSESSMENT_ID = "cmol80gpu000163u2p9sachff";

function classificationLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "Belum Diklasifikasi";
  // Already in canonical form like "O - Out Of The Box" — keep verbatim
  return s;
}

function classificationBucket(raw: string | null | undefined): "O" | "C" | "G" | "NA" | "Pending" {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return "Pending";
  if (s.startsWith("O")) return "O";
  if (s.startsWith("C")) return "C";
  if (s.startsWith("G")) return "G";
  if (s.startsWith("N/A") || s.startsWith("NA") || s.startsWith("N -")) return "NA";
  return "Pending";
}

function bucketColor(b: ReturnType<typeof classificationBucket>): string {
  switch (b) {
    case "O": return "FF22C55E"; // green
    case "C": return "FFFACC15"; // amber
    case "G": return "FFEF4444"; // red
    case "NA": return "FF94A3B8"; // slate
    case "Pending": return "FFE5E7EB"; // gray
  }
}

interface Row {
  bil: number;
  modul: string;
  bahagian: string;
  kod: string;
  keperluan: string;
  jenis: string;
  klasifikasi: string;
  bucket: ReturnType<typeof classificationBucket>;
  modulSap: string;
  rujukan: string;
  justifikasiBm: string;
  justificationEn: string;
}

async function buildRows(): Promise<Row[]> {
  // 1. Pull all requirements
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId: ASSESSMENT_ID },
    select: {
      id: true,
      module: true,
      section: true,
      code: true,
      requirementText: true,
      requirementType: true,
      solutionProviderResponse: true,
      solutionProviderRemarks: true,
      sapModule: true,
      scopeItemIds: true,
      sortOrder: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  // 2. Resolve scopeItemIds → "scopeCode - nameClean" lookup
  const allCuids = new Set<string>();
  for (const r of reqs) {
    if (!r.scopeItemIds) continue;
    for (const id of r.scopeItemIds.split(",").map((s) => s.trim()).filter(Boolean)) {
      allCuids.add(id);
    }
  }
  const items = await prisma.scopeItem.findMany({
    where: { id: { in: [...allCuids] } },
    select: { id: true, scopeCode: true, nameClean: true },
  });
  const itemMap = new Map(items.map((i) => [i.id, `${i.scopeCode} — ${i.nameClean}`]));

  // 3. BM translations (optional). _skm-translate-apply.ts writes a sidecar
  // file at /workspaces/aptus/data/skm-bm-remarks.json with {requirementId:
  // remarksBm} pairs. Absent file = empty BM column (English narratives only).
  const bmObj = await loadBmSidecar();
  const bmRemarksMap = new Map<string, string>(Object.entries(bmObj));
  console.log(`  BM sidecar: ${bmRemarksMap.size} translations loaded`);

  return reqs.map((r, i) => {
    const cuids = (r.scopeItemIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const refs = cuids.map((id) => itemMap.get(id) ?? id).filter((s) => !s.match(/^c[a-z0-9]{24}$/i));
    return {
      bil: i + 1,
      modul: r.module,
      bahagian: r.section ?? "",
      kod: r.code,
      keperluan: r.requirementText,
      jenis: r.requirementType ?? "",
      klasifikasi: classificationLabel(r.solutionProviderResponse),
      bucket: classificationBucket(r.solutionProviderResponse),
      modulSap: r.sapModule ?? "",
      rujukan: refs.join("; ") || "—",
      justifikasiBm: bmRemarksMap.get(r.id) ?? "",
      justificationEn: r.solutionProviderRemarks ?? "",
    };
  });
}

function applyMatrixSheet(ws: ExcelJS.Worksheet, rows: Row[]) {
  ws.columns = [
    { header: "Bil.", key: "bil", width: 6 },
    { header: "Modul", key: "modul", width: 30 },
    { header: "Bahagian", key: "bahagian", width: 22 },
    { header: "Kod", key: "kod", width: 14 },
    { header: "Keperluan", key: "keperluan", width: 70 },
    { header: "Jenis", key: "jenis", width: 16 },
    { header: "Klasifikasi SAP", key: "klasifikasi", width: 22 },
    { header: "Modul SAP", key: "modulSap", width: 18 },
    { header: "Rujukan SAP Best Practice", key: "rujukan", width: 50 },
    { header: "Justifikasi (BM)", key: "justifikasiBm", width: 60 },
    { header: "Justification (EN)", key: "justificationEn", width: 80 },
  ];

  // Header style
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 32;

  for (const r of rows) {
    const row = ws.addRow(r);
    // Wrap long text columns
    row.getCell("keperluan").alignment = { wrapText: true, vertical: "top" };
    row.getCell("rujukan").alignment = { wrapText: true, vertical: "top" };
    row.getCell("justifikasiBm").alignment = { wrapText: true, vertical: "top" };
    row.getCell("justificationEn").alignment = { wrapText: true, vertical: "top" };
    // Color the Klasifikasi cell
    const klas = row.getCell("klasifikasi");
    klas.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bucketColor(r.bucket) } };
    klas.alignment = { horizontal: "center", vertical: "middle" };
    klas.font = { bold: true, color: { argb: r.bucket === "C" ? "FF000000" : "FFFFFFFF" } };
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 4 }];
  ws.autoFilter = { from: "A1", to: { row: 1, column: 11 } };
}

function applySummarySheet(ws: ExcelJS.Worksheet, rows: Row[], catalogRef: string, generatedAt: Date) {
  ws.columns = [
    { header: "", key: "label", width: 36 },
    { header: "", key: "value", width: 40 },
  ];

  ws.addRow({ label: "Ringkasan Penilaian SKM", value: "" });
  ws.addRow({});
  ws.addRow({ label: "Klien", value: "Suruhanjaya Koperasi Malaysia (SKM)" });
  ws.addRow({ label: "Katalog SAP", value: catalogRef });
  ws.addRow({ label: "Tarikh Jana", value: generatedAt.toISOString().slice(0, 10) });
  ws.addRow({ label: "Jumlah Keperluan", value: rows.length });
  ws.addRow({});

  ws.addRow({ label: "Taburan Klasifikasi", value: "" });
  const dist: Record<string, number> = { O: 0, C: 0, G: 0, NA: 0, Pending: 0 };
  for (const r of rows) dist[r.bucket]!++;
  ws.addRow({ label: "  O — Out Of The Box (sokongan langsung)", value: dist.O });
  ws.addRow({ label: "  C — Configuration (perlu konfigurasi)", value: dist.C });
  ws.addRow({ label: "  G — Gap (perlu penyelesaian luar)", value: dist.G });
  ws.addRow({ label: "  N/A — Out of Scope", value: dist.NA });
  if (dist.Pending! > 0) ws.addRow({ label: "  Belum Diklasifikasi", value: dist.Pending });
  ws.addRow({});

  // Per-module breakdown
  ws.addRow({ label: "Pecahan Mengikut Modul", value: "" });
  const perModule = new Map<string, { O: number; C: number; G: number; NA: number; total: number }>();
  for (const r of rows) {
    const m = perModule.get(r.modul) ?? { O: 0, C: 0, G: 0, NA: 0, total: 0 };
    m.total++;
    if (r.bucket === "O") m.O++;
    else if (r.bucket === "C") m.C++;
    else if (r.bucket === "G") m.G++;
    else if (r.bucket === "NA") m.NA++;
    perModule.set(r.modul, m);
  }
  // Re-header for per-module
  ws.addRow({ label: "Modul", value: "Jumlah | O | C | G | N/A" });
  for (const [name, m] of [...perModule.entries()].sort((a, b) => b[1].total - a[1].total)) {
    ws.addRow({ label: `  ${name}`, value: `${m.total} | ${m.O} | ${m.C} | ${m.G} | ${m.NA}` });
  }
  ws.addRow({});
  ws.addRow({ label: "Petunjuk", value: "" });
  ws.addRow({ label: "  Klasifikasi SAP — kategori penyelesaian:", value: "" });
  ws.addRow({ label: "    O", value: "Disokong terus oleh SAP S/4HANA Cloud Private Edition tanpa konfigurasi tambahan." });
  ws.addRow({ label: "    C", value: "Disokong dengan konfigurasi standard (SSCUI, classic SPRO, Manage Workflows, Adapt UI, dsb.)." });
  ws.addRow({ label: "    G", value: "Memerlukan produk SAP berasingan (SuccessFactors, Ariba, SAC) atau alat 3rd-party." });
  ws.addRow({ label: "    N/A", value: "Bukan keperluan keupayaan sistem (mis. obligasi vendor, polisi am)." });
  ws.addRow({ label: "  Rujukan SAP Best Practice", value: "Kod scope item dari katalog SAP Best Practices yang menyokong keperluan." });

  // Style the title rows
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(8).font = { bold: true, size: 12 };
  ws.getRow(15).font = { bold: true, size: 12 };
  // Indentation alignment
  for (let i = 1; i <= ws.rowCount; i++) {
    ws.getRow(i).alignment = { vertical: "top", wrapText: true };
  }
  ws.getColumn("value").alignment = { wrapText: true, vertical: "top" };
}

async function main() {
  const a = await prisma.assessment.findUniqueOrThrow({
    where: { id: ASSESSMENT_ID },
    select: {
      id: true, companyName: true, status: true,
      catalogVersion: { select: { edition: true, version: true } },
    },
  });
  const catalogRef = a.catalogVersion
    ? `${a.catalogVersion.edition} ${a.catalogVersion.version}`
    : "PUBLIC 2602";
  console.log(`Generating response matrix for ${a.companyName} (${catalogRef})`);

  const rows = await buildRows();
  console.log(`  Built ${rows.length} rows`);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Aptus";
  wb.created = new Date();

  const summary = wb.addWorksheet("Ringkasan");
  applySummarySheet(summary, rows, catalogRef, new Date());

  const matrix = wb.addWorksheet("Matriks Keperluan");
  applyMatrixSheet(matrix, rows);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = "/workspaces/aptus/logs";
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `SKM_Response_Matrix_${stamp}.xlsx`);
  const buf = await wb.xlsx.writeBuffer();
  await writeFile(outPath, Buffer.from(buf));
  console.log(`  Wrote ${outPath} (${(buf.byteLength / 1024).toFixed(1)} KB)`);

  // Print summary to stdout for the reviewer
  const dist: Record<string, number> = { O: 0, C: 0, G: 0, NA: 0, Pending: 0 };
  for (const r of rows) dist[r.bucket]!++;
  console.log(`Distribution: O=${dist.O} C=${dist.C} G=${dist.G} N/A=${dist.NA} Pending=${dist.Pending}`);
  const bmCount = rows.filter((r) => r.justifikasiBm.trim().length > 0).length;
  console.log(`Justifikasi (BM): ${bmCount}/${rows.length} populated`);
  console.log(`Justification (EN): ${rows.filter((r) => r.justificationEn.trim().length > 0).length}/${rows.length} populated`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
