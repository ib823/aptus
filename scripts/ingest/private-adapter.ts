/**
 * SAP S/4HANA Cloud Private Edition ingest adapter.
 *
 * Parses archives shaped like:
 *   S4O/Library/TestScripts/{ID}_S4HANA{YEAR}-FPS{N}_BPD_EN_{COUNTRY}.{xlsx|docx}
 *   S4O/Library/Setup/{ID}_S4HANA{YEAR}-FPS{N}_Set-Up_EN_{COUNTRY}.pdf
 *   S4O/Library/General/...
 *   S4O/Library/Others/...
 *   packExcel/SolS-XXX/{YEAR}-FPS{N}/...
 *
 * Behaviour vs Public adapter:
 *   - Folder prefix is `S4O/Library/` (not `S4C/Library/`)
 *   - Filename release token is `S4HANA{YEAR}-FPS{N}` (not `S4CLD{YEAR}`)
 *   - No Configuration XLSM, no structured Links XLSX (Private archives ship
 *     only an outbound-links workbook, no scope/process/flow URL manifest)
 *   - functionalArea defaults to "Uncategorized"; curation drives the real
 *     area assignment in Phase 13.5
 *
 * Idempotent — re-running with the same archive hash skips work.
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import path from "node:path";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

const BPD_FILENAME_RX =
  /^([A-Z0-9]+)_S4HANA(\d{4})-FPS(\d+)_BPD_EN_([A-Z]+)\.(docx|xlsx)$/i;
const SETUP_FILENAME_RX =
  /^([A-Z0-9]+)_S4HANA(\d{4})-FPS(\d+)_Set-Up_EN_([A-Z]+)\.pdf$/i;

interface ParsedBpd {
  scopeId: string;
  releaseYear: string; // "2025"
  fpsNumber: string;   // "1"
  country: string;     // "MY" | "XX"
}

function parseBpdFilename(filename: string): ParsedBpd | null {
  const m = filename.match(BPD_FILENAME_RX);
  if (!m?.[1] || !m[2] || !m[3] || !m[4]) return null;
  return {
    scopeId: m[1],
    releaseYear: m[2],
    fpsNumber: m[3],
    country: m[4],
  };
}

function parseSetupFilename(filename: string): { scopeId: string; country: string } | null {
  const m = filename.match(SETUP_FILENAME_RX);
  if (!m?.[1] || !m[4]) return null;
  return { scopeId: m[1], country: m[4] };
}

function contentTypeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xlsm")) return "application/vnd.ms-excel.sheet.macroEnabled.12";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".rtf")) return "application/rtf";
  return "application/octet-stream";
}

async function uploadToBlob(blobPath: string, data: Buffer, filename: string): Promise<string | null> {
  if (!USE_BLOB) return null;
  const { url } = await put(blobPath, data, {
    access: "private",
    contentType: contentTypeForFilename(filename),
    allowOverwrite: true,
  });
  return url;
}

function normalizeStepType(actionTitle: string): string {
  const lower = actionTitle.toLowerCase();
  if (lower.includes("log on") || lower.includes("logon") || lower.includes("log onto")) return "LOGON";
  if ((lower.includes("access") && (lower.includes("app") || lower.includes("fiori"))) ||
      (lower.includes("open") && (lower.includes("app") || lower.includes("fiori") || lower.includes("solution") || lower.includes("configure")))) {
    return "ACCESS_APP";
  }
  if (lower === "information" || lower.startsWith("information")) return "INFORMATION";
  if (lower.includes("enter") || lower.includes("input")) return "DATA_ENTRY";
  if (lower.includes("save") || lower.includes("post") || lower.includes("execute") || lower.includes("run")) return "ACTION";
  if (lower.includes("verify") || lower.includes("check") || lower.includes("confirm") || lower.includes("review")) return "VERIFICATION";
  if (lower.includes("back") || lower.includes("return") || lower.includes("navigate")) return "NAVIGATION";
  return "PROCESS_STEP";
}

function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

function cellStrOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val);
  return s === "" ? null : s;
}

function cleanScopeItemName(name: string): string {
  return name.replace(/\s*\([A-Z0-9]+\)\s*$/, "").trim();
}

async function resolveCatalogVersion(version: string, archiveHash: string): Promise<{ id: string; alreadyIngested: boolean }> {
  const existing = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version, edition: "PRIVATE" } },
  });
  if (existing) {
    const scopeCount = await prisma.scopeItem.count({ where: { catalogVersionId: existing.id } });
    // Same archive hash AND already populated → nothing to do
    if (existing.sourceArchiveHash === archiveHash && scopeCount > 0) {
      return { id: existing.id, alreadyIngested: true };
    }
    // Hash mismatch with populated catalog → refuse rather than silently corrupt
    if (existing.sourceArchiveHash && existing.sourceArchiveHash !== archiveHash && scopeCount > 0) {
      throw new Error(
        `Catalog ${version}/PRIVATE already populated with a different archive hash. ` +
        `Refusing to mix sources. Drop the existing catalog version + its scope items first if you intend to re-ingest.`,
      );
    }
    // Hash match but empty catalog → resume the previous partial run
    return { id: existing.id, alreadyIngested: false };
  }
  // First-time ingest — create the row WITHOUT setting sourceArchiveHash; we'll
  // set it at the end of the run so that a mid-run crash leaves the row
  // resumable rather than locked-in as "complete".
  const row = await prisma.scopeCatalogVersion.create({
    data: {
      version,
      edition: "PRIVATE",
      ingestedAt: new Date(),
      isActive: true,
    },
  });
  return { id: row.id, alreadyIngested: false };
}

async function markCatalogIngestComplete(catalogVersionId: string, archiveHash: string): Promise<void> {
  await prisma.scopeCatalogVersion.update({
    where: { id: catalogVersionId },
    data: { sourceArchiveHash: archiveHash, ingestedAt: new Date() },
  });
}

export async function runPrivateIngest(zipPath: string): Promise<void> {
  console.log(`[Private adapter] Loading: ${zipPath}`);
  console.log(`[Private adapter] Blob: ${USE_BLOB ? "Vercel Blob" : "PostgreSQL inline"}`);

  const zipBuffer = await import("node:fs/promises").then((fs) => fs.readFile(zipPath));
  const archiveHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");
  console.log(`[Private adapter] Archive sha256: ${archiveHash.slice(0, 16)}…`);

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  console.log(`[Private adapter] ZIP entries: ${entries.length}`);

  // Categorize
  const testScriptXlsx: AdmZip.IZipEntry[] = [];
  const testScriptDocx: AdmZip.IZipEntry[] = [];
  const setupPdfs: AdmZip.IZipEntry[] = [];
  const generalFiles: AdmZip.IZipEntry[] = [];
  const otherFiles: AdmZip.IZipEntry[] = [];
  let readmeRtf: AdmZip.IZipEntry | null = null;

  for (const e of entries) {
    if (e.isDirectory) continue;
    const name = e.entryName;
    if (name.startsWith("S4O/Library/TestScripts/")) {
      if (name.endsWith(".xlsx")) testScriptXlsx.push(e);
      else if (name.endsWith(".docx")) testScriptDocx.push(e);
    } else if (name.startsWith("S4O/Library/Setup/") && name.endsWith(".pdf")) {
      setupPdfs.push(e);
    } else if (name.startsWith("S4O/Library/General/")) {
      generalFiles.push(e);
    } else if (name.startsWith("S4O/Library/Others/")) {
      otherFiles.push(e);
    } else if (name === "README.rtf") {
      readmeRtf = e;
    }
  }

  // Detect version from BPD filenames
  let releaseYear: string | null = null;
  let fpsNumber: string | null = null;
  for (const e of testScriptXlsx) {
    const parsed = parseBpdFilename(path.basename(e.entryName));
    if (parsed) {
      releaseYear = parsed.releaseYear;
      fpsNumber = parsed.fpsNumber;
      break;
    }
  }
  if (!releaseYear || !fpsNumber) {
    console.error("[Private adapter] Could not detect release/FPS from BPD filenames.");
    process.exit(1);
  }
  const versionString = `${releaseYear}-FPS${fpsNumber}`;
  console.log(`[Private adapter] Detected version: ${versionString}`);
  console.log(`[Private adapter] BPD xlsx: ${testScriptXlsx.length}, docx: ${testScriptDocx.length}, Setup PDFs: ${setupPdfs.length}, General: ${generalFiles.length}, Others: ${otherFiles.length}`);

  // Resolve / create catalog version
  const { id: catalogVersionId, alreadyIngested } = await resolveCatalogVersion(versionString, archiveHash);
  if (alreadyIngested) {
    console.log(`[Private adapter] ${versionString}/PRIVATE already ingested with this archive hash — no-op.`);
    await prisma.$disconnect();
    return;
  }
  console.log(`[Private adapter] Catalog version row id: ${catalogVersionId} (edition=PRIVATE, version=${versionString})`);

  // ---- Step 1: Parse BPD XLSX → ScopeItem + ProcessStep ----
  console.log("\n[Private adapter] Step 1: Parsing BPD XLSX files");
  let totalSteps = 0;
  for (let i = 0; i < testScriptXlsx.length; i++) {
    const entry = testScriptXlsx[i]!;
    const filename = path.basename(entry.entryName);
    const parsed = parseBpdFilename(filename);
    if (!parsed) {
      console.warn(`  Skip unparseable: ${filename}`);
      continue;
    }

    const buffer = entry.getData();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    );
    const sheet = workbook.getWorksheet("Test Cases");
    if (!sheet) {
      console.warn(`  No 'Test Cases' sheet in ${filename}`);
      continue;
    }

    const rows: unknown[][] = [];
    sheet.eachRow((row) => {
      rows.push((row.values as unknown[]).slice(1).map((v) => (v === undefined ? null : v)));
    });
    const dataRows = rows.slice(5);

    const firstDataRow = dataRows[0];
    const scopeItemName = firstDataRow ? cellStr(firstDataRow[1]) : parsed.scopeId;
    const nameClean = cleanScopeItemName(scopeItemName || parsed.scopeId);

    const steps: Array<{ sequence: number; data: unknown[] }> = [];
    let seq = 0;
    for (const row of dataRows) {
      const rawVal = row[18];
      if (rawVal !== null && rawVal !== undefined) {
        steps.push({ sequence: seq, data: row });
        seq++;
      }
    }

    // Upsert ScopeItem keyed by (scopeCode, catalogVersionId)
    // Phase 13.1: id is a cuid; scopeCode is the SAP token
    const existing = await prisma.scopeItem.findUnique({
      where: { scopeCode_catalogVersionId: { scopeCode: parsed.scopeId, catalogVersionId } },
      select: { id: true },
    });
    let scopeItemId: string;
    if (existing) {
      await prisma.scopeItem.update({
        where: { id: existing.id },
        data: { totalSteps: steps.length, xlsxStored: true },
      });
      scopeItemId = existing.id;
    } else {
      const created = await prisma.scopeItem.create({
        data: {
          scopeCode: parsed.scopeId,
          name: scopeItemName || parsed.scopeId,
          nameClean,
          purposeHtml: "",
          overviewHtml: "",
          prerequisitesHtml: "",
          country: parsed.country,
          version: versionString,
          catalogVersionId,
          totalSteps: steps.length,
          functionalArea: "Uncategorized",
          subArea: "Uncategorized",
          xlsxStored: true,
        },
        select: { id: true },
      });
      scopeItemId = created.id;
    }

    // Clear any pre-existing ProcessStep rows for this scope item (resume-safe)
    await prisma.processStep.deleteMany({ where: { scopeItemId } });

    if (steps.length > 0) {
      const stepData = steps.map((s) => {
        const row = s.data;
        const actionTitle = cellStr(row[18]);
        return {
          scopeItemId,
          sequence: s.sequence,
          testCaseGuid: cellStrOrNull(row[0]),
          testCaseName: cellStrOrNull(row[1]),
          scopeGuid: cellStrOrNull(row[2]),
          scopeName: cellStrOrNull(row[3]),
          solutionProcessGuid: cellStrOrNull(row[4]),
          solutionProcessName: cellStrOrNull(row[5]),
          solutionProcessFlowGuid: cellStrOrNull(row[6]),
          solutionProcessFlowName: cellStrOrNull(row[7]),
          flowDiagramGuid: cellStrOrNull(row[8]),
          flowDiagramName: cellStrOrNull(row[9]),
          testCasePriority: cellStrOrNull(row[10]),
          testCaseOwner: cellStrOrNull(row[11]),
          testCaseStatus: cellStrOrNull(row[12]),
          activityGuid: cellStrOrNull(row[13]),
          activityTitle: cellStrOrNull(row[14]),
          activityTargetName: cellStrOrNull(row[15]),
          activityTargetUrl: cellStrOrNull(row[16]),
          actionGuid: cellStrOrNull(row[17]),
          actionTitle,
          actionInstructionsHtml: cellStr(row[19]),
          actionExpectedResult: cellStrOrNull(row[20]),
          stepType: normalizeStepType(actionTitle),
          processFlowGroup: cellStrOrNull(row[7]),
        };
      });
      const batchSize = 500;
      for (let b = 0; b < stepData.length; b += batchSize) {
        await prisma.processStep.createMany({ data: stepData.slice(b, b + batchSize) });
      }
      totalSteps += steps.length;
    }

    if ((i + 1) % 50 === 0 || i === testScriptXlsx.length - 1) {
      console.log(`  ${i + 1}/${testScriptXlsx.length} BPDs (${totalSteps} steps so far)`);
    }
  }
  console.log(`  Total ScopeItem rows for ${versionString}: ${testScriptXlsx.length}`);
  console.log(`  Total ProcessStep rows: ${totalSteps}`);

  // ---- Step 2: BPD DOCX → ScopeItem HTML sections ----
  console.log("\n[Private adapter] Step 2: Parsing BPD DOCX (Purpose/Overview/Prerequisites)");
  let docxProcessed = 0;
  for (const entry of testScriptDocx) {
    const filename = path.basename(entry.entryName);
    const parsed = parseBpdFilename(filename);
    if (!parsed) continue;

    const scopeRow = await prisma.scopeItem.findUnique({
      where: { scopeCode_catalogVersionId: { scopeCode: parsed.scopeId, catalogVersionId } },
      select: { id: true, docxStored: true },
    });
    if (!scopeRow || scopeRow.docxStored) continue;

    try {
      const buffer = entry.getData();
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value;

      let purposeHtml = "";
      let overviewHtml = "";
      let prerequisitesHtml = "";
      const sections = html.split(/<h[12][^>]*>/i);
      for (const section of sections) {
        const lower = section.toLowerCase();
        if (lower.startsWith("purpose") || lower.includes(">purpose<")) {
          const cIdx = section.indexOf(">");
          purposeHtml = (cIdx >= 0 ? section.substring(cIdx + 1) : section).replace(/<\/h[12]>/gi, "").trim();
        } else if (lower.startsWith("overview") || lower.includes(">overview<")) {
          const cIdx = section.indexOf(">");
          overviewHtml = (cIdx >= 0 ? section.substring(cIdx + 1) : section).replace(/<\/h[12]>/gi, "").trim();
        } else if (lower.startsWith("prerequisite") || lower.includes(">prerequisite")) {
          const cIdx = section.indexOf(">");
          prerequisitesHtml = (cIdx >= 0 ? section.substring(cIdx + 1) : section).replace(/<\/h[12]>/gi, "").trim();
        }
      }
      if (!purposeHtml && !overviewHtml && !prerequisitesHtml) {
        overviewHtml = html;
      }

      await prisma.scopeItem.update({
        where: { id: scopeRow.id },
        data: { purposeHtml, overviewHtml, prerequisitesHtml, docxStored: true },
      });
      docxProcessed++;
    } catch (err) {
      console.warn(`  DOCX error ${filename}: ${err}`);
    }
    if (docxProcessed % 50 === 0 && docxProcessed > 0) {
      console.log(`  Processed ${docxProcessed}/${testScriptDocx.length} DOCX`);
    }
  }
  console.log(`  Total DOCX merged: ${docxProcessed}`);

  // ---- Step 3: Setup PDFs ----
  console.log("\n[Private adapter] Step 3: Storing Setup PDFs");
  let setupCount = 0;
  for (const entry of setupPdfs) {
    const filename = path.basename(entry.entryName);
    const parsed = parseSetupFilename(filename);
    if (!parsed) {
      console.warn(`  Skip unparseable Setup PDF: ${filename}`);
      continue;
    }
    let scopeRow = await prisma.scopeItem.findUnique({
      where: { scopeCode_catalogVersionId: { scopeCode: parsed.scopeId, catalogVersionId } },
      select: { id: true },
    });
    if (!scopeRow) {
      // Create a stub ScopeItem for Setup-only entries
      const created = await prisma.scopeItem.create({
        data: {
          scopeCode: parsed.scopeId,
          name: parsed.scopeId,
          nameClean: parsed.scopeId,
          purposeHtml: "",
          overviewHtml: "",
          prerequisitesHtml: "",
          country: parsed.country,
          version: versionString,
          catalogVersionId,
          totalSteps: 0,
          functionalArea: "Uncategorized",
          subArea: "Uncategorized",
          setupPdfStored: true,
        },
        select: { id: true },
      });
      scopeRow = created;
    }

    const buffer = entry.getData();
    let pageCount: number | null = null;
    try {
      const pdfStr = buffer.toString("latin1");
      const pageMatches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
      pageCount = pageMatches ? pageMatches.length : null;
    } catch {
      // ignore
    }
    try {
      const blobUrl = await uploadToBlob(`sap-catalog/setup-guide/${catalogVersionId}/${parsed.scopeId}/${filename}`, buffer, filename);
      await prisma.setupGuide.create({
        data: {
          scopeItemId: scopeRow.id,
          filename,
          fileSize: buffer.length,
          pdfBlob: blobUrl ? null : new Uint8Array(buffer),
          blobUrl,
          pageCount,
        },
      });
      await prisma.scopeItem.update({ where: { id: scopeRow.id }, data: { setupPdfStored: true } });
      setupCount++;
    } catch (err) {
      const msg = String(err);
      if (!msg.includes("Unique constraint")) {
        console.warn(`  Setup PDF error ${filename}: ${err}`);
      }
    }
  }
  console.log(`  Total Setup PDFs stored: ${setupCount}`);

  // ---- Step 4: General + Others files (blob-only, not parsed) ----
  console.log("\n[Private adapter] Step 4: Storing General + Others files");
  for (const entry of generalFiles) {
    const filename = path.basename(entry.entryName);
    const buffer = entry.getData();
    const blobUrl = await uploadToBlob(`sap-catalog/general/${catalogVersionId}/${filename}`, buffer, filename);
    await prisma.generalFile.create({
      data: {
        filename,
        fileType: "other",
        fileSize: buffer.length,
        blob: blobUrl ? null : new Uint8Array(buffer),
        blobUrl,
        relatedScopeIds: [],
      },
    });
  }
  for (const entry of otherFiles) {
    const filename = path.basename(entry.entryName);
    const buffer = entry.getData();
    const blobUrl = await uploadToBlob(`sap-catalog/other/${catalogVersionId}/${filename}`, buffer, filename);
    await prisma.otherFile.create({
      data: { filename, path: entry.entryName, fileSize: buffer.length, blob: blobUrl ? null : new Uint8Array(buffer), blobUrl },
    });
  }
  console.log(`  General: ${generalFiles.length}, Others: ${otherFiles.length}`);

  // ---- Step 5: README ----
  if (readmeRtf) {
    const buffer = readmeRtf.getData();
    let textContent = buffer.toString("utf8");
    textContent = textContent.replace(/\{\\rtf[^}]*\}/g, "").replace(/\\[a-z]+\d*\s?/g, "").replace(/[{}]/g, "").trim();
    const blobUrl = await uploadToBlob(`sap-catalog/readme-private-${catalogVersionId}/README.rtf`, buffer, "README.rtf");
    await prisma.readmeFile.create({
      data: {
        filename: `README-${versionString}.rtf`,
        content: textContent || "SAP Best Practices Private Edition README",
        blob: blobUrl ? null : new Uint8Array(buffer),
        blobUrl,
      },
    });
  }

  // ---- Done — mark complete by setting sourceArchiveHash atomically ----
  await markCatalogIngestComplete(catalogVersionId, archiveHash);

  console.log("\n[Private adapter] === Ingest complete ===");
  const ingestedCount = await prisma.scopeItem.count({ where: { catalogVersionId } });
  const stepCount = await prisma.processStep.count({ where: { scopeItem: { catalogVersionId } } });
  const setupGuides = await prisma.setupGuide.count({ where: { scopeItem: { catalogVersionId } } });
  console.log(`  ScopeItem rows for ${versionString}: ${ingestedCount}`);
  console.log(`  ProcessStep rows: ${stepCount}`);
  console.log(`  SetupGuide rows: ${setupGuides}`);

  await prisma.$disconnect();
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith("private-adapter.ts")) {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("Usage: tsx scripts/ingest/private-adapter.ts <path-to-zip>");
    process.exit(1);
  }
  runPrivateIngest(zipPath).catch((err) => {
    console.error("[Private adapter] Failed:", err);
    process.exit(1);
  });
}
