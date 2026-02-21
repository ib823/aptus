/**
 * SAP Best Practices ZIP Ingestion Script
 *
 * Parses the entire SAP ZIP file into the fit_portal database.
 * Must produce exactly:
 *   - 550 scope items
 *   - 102,261 process steps
 *   - 4,703 config activities
 *   - 4,451 IMG activities
 *   - 230 setup guides
 *   - 162 general files
 *   - 195 solution links (32 scenario + 163 process)
 *   - 13 expert configs
 *   - 4 other files
 *   - 1 readme file
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import path from "path";

const prisma = new PrismaClient();

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

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

async function uploadToBlob(
  blobPath: string,
  data: Buffer,
  filename: string,
): Promise<string | null> {
  if (!USE_BLOB) return null;
  const { url } = await put(blobPath, data, {
    access: "private",
    contentType: contentTypeForFilename(filename),
  });
  return url;
}

// ---------------------------------------------------------------------------
// Step type normalization (DATA-CONTRACT.md Section 12)
// ---------------------------------------------------------------------------
function normalizeStepType(actionTitle: string): string {
  const lower = actionTitle.toLowerCase();
  if (lower.includes("log on") || lower.includes("logon") || lower.includes("log onto")) {
    return "LOGON";
  }
  if (
    (lower.includes("access") && (lower.includes("app") || lower.includes("fiori"))) ||
    (lower.includes("open") && (lower.includes("app") || lower.includes("fiori") || lower.includes("solution") || lower.includes("configure")))
  ) {
    return "ACCESS_APP";
  }
  if (lower === "information" || lower.startsWith("information")) {
    return "INFORMATION";
  }
  if (lower.includes("enter") || lower.includes("input")) {
    return "DATA_ENTRY";
  }
  if (lower.includes("save") || lower.includes("post") || lower.includes("execute") || lower.includes("run")) {
    return "ACTION";
  }
  if (lower.includes("verify") || lower.includes("check") || lower.includes("confirm") || lower.includes("review")) {
    return "VERIFICATION";
  }
  if (lower.includes("back") || lower.includes("return") || lower.includes("navigate")) {
    return "NAVIGATION";
  }
  return "PROCESS_STEP";
}

// ---------------------------------------------------------------------------
// Extract scope item ID from filename
// ---------------------------------------------------------------------------
function parseScopeIdFromFilename(filename: string): { scopeId: string; country: string } | null {
  // Pattern: {SCOPE_ID}_S4CLD2508_BPD_EN_{COUNTRY}.xlsx
  const match = filename.match(/^([A-Z0-9]+)_S4CLD2508_BPD_EN_([A-Z]+)\./i);
  if (!match?.[1] || !match[2]) return null;
  return { scopeId: match[1], country: match[2] };
}

// ---------------------------------------------------------------------------
// Extract first valid scope item ID from a config's Main Scope Item ID field
// ---------------------------------------------------------------------------
function parseConfigScopeItemId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "All") return "All";
  // Split by comma or semicolon
  const parts = trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return parts[0] ?? trimmed;
}

// ---------------------------------------------------------------------------
// Clean scope item name: remove parenthetical code
// ---------------------------------------------------------------------------
function cleanScopeItemName(name: string): string {
  // "Accounts Payable   (J60)" → "Accounts Payable"
  return name.replace(/\s*\([A-Z0-9]+\)\s*$/, "").trim();
}

// ---------------------------------------------------------------------------
// Safe cell value extraction
// ---------------------------------------------------------------------------
function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

function cellStrOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val);
  return s === "" ? null : s;
}

// ---------------------------------------------------------------------------
// Main ingestion
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const zipPath = process.argv[2] ?? process.env.SAP_ZIP_PATH;
  if (!zipPath) {
    console.error("Usage: tsx scripts/ingest-sap-zip.ts <path-to-zip>");
    process.exit(1);
  }

  console.log(`Blob storage: ${USE_BLOB ? "Vercel Blob (BLOB_READ_WRITE_TOKEN set)" : "PostgreSQL (no BLOB_READ_WRITE_TOKEN)"}`);
  console.log(`Loading ZIP: ${zipPath}`);
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  console.log(`ZIP entries: ${entries.length}`);

  // Categorize entries
  const testScriptXlsx: AdmZip.IZipEntry[] = [];
  const testScriptDocx: AdmZip.IZipEntry[] = [];
  const setupPdfs: AdmZip.IZipEntry[] = [];
  const setupOther: AdmZip.IZipEntry[] = [];
  const generalFiles: AdmZip.IZipEntry[] = [];
  const otherFiles: AdmZip.IZipEntry[] = [];
  let configXlsm: AdmZip.IZipEntry | null = null;
  let linksXlsx: AdmZip.IZipEntry | null = null;
  let readmeRtf: AdmZip.IZipEntry | null = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;

    if (name.startsWith("S4C/Library/TestScripts/")) {
      if (name.endsWith(".xlsx")) testScriptXlsx.push(entry);
      else if (name.endsWith(".docx")) testScriptDocx.push(entry);
    } else if (name.startsWith("S4C/Library/Configuration/") && name.endsWith(".xlsm")) {
      configXlsm = entry;
    } else if (name.startsWith("S4C/Library/Setup/")) {
      if (name.endsWith(".pdf")) setupPdfs.push(entry);
      else setupOther.push(entry);
    } else if (name.startsWith("S4C/Library/General/")) {
      generalFiles.push(entry);
    } else if (name.startsWith("S4C/Library/Others/")) {
      otherFiles.push(entry);
    } else if (name.startsWith("packExcel/") && name.endsWith(".xlsx")) {
      linksXlsx = entry;
    } else if (name === "README.rtf") {
      readmeRtf = entry;
    }
  }

  console.log(`TestScript XLSX: ${testScriptXlsx.length}`);
  console.log(`TestScript DOCX: ${testScriptDocx.length}`);
  console.log(`Setup PDFs: ${setupPdfs.length}`);
  console.log(`General files: ${generalFiles.length}`);
  console.log(`Other files: ${otherFiles.length}`);
  console.log(`Config XLSM: ${configXlsm ? "found" : "NOT FOUND"}`);
  console.log(`Links XLSX: ${linksXlsx ? "found" : "NOT FOUND"}`);
  console.log(`README.rtf: ${readmeRtf ? "found" : "NOT FOUND"}`);

  // =========================================================================
  // STEP 1: Parse BPD XLSX files → ScopeItem + ProcessStep (Tasks 1.2, 1.12, 1.13)
  // =========================================================================
  console.log("\n--- Step 1: Parsing BPD XLSX files ---");

  let totalStepsInserted = 0;

  for (let i = 0; i < testScriptXlsx.length; i++) {
    const entry = testScriptXlsx[i]!;
    const filename = path.basename(entry.entryName);
    const parsed = parseScopeIdFromFilename(filename);
    if (!parsed) {
      console.warn(`  Skipping unparseable filename: ${filename}`);
      continue;
    }

    const buffer = entry.getData();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets["Test Cases"];
    if (!sheet) {
      console.warn(`  No 'Test Cases' sheet in ${filename}`);
      continue;
    }

    // Read all rows as array of arrays
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: null,
    });

    // Header is at row index 4, data starts at row 5
    const dataRows = rows.slice(5);

    // Extract scope item name from first data row, column 1
    const firstDataRow = dataRows[0];
    const scopeItemName = firstDataRow ? cellStr(firstDataRow[1]) : parsed.scopeId;
    const nameClean = cleanScopeItemName(scopeItemName || parsed.scopeId);

    // Count steps (rows where column 18 / Action Title is non-null)
    // Note: The spec counts rows where col 18 is non-null, including whitespace-only values
    const steps: Array<{
      sequence: number;
      data: unknown[];
    }> = [];

    let seq = 0;
    for (const row of dataRows) {
      const rawVal = row[18];
      if (rawVal !== null && rawVal !== undefined) {
        steps.push({ sequence: seq, data: row });
        seq++;
      }
    }

    // Create ScopeItem (without DOCX content yet — that's Step 2)
    await prisma.scopeItem.upsert({
      where: { id: parsed.scopeId },
      update: {
        totalSteps: steps.length,
        xlsxStored: true,
      },
      create: {
        id: parsed.scopeId,
        name: scopeItemName || parsed.scopeId,
        nameClean,
        purposeHtml: "",
        overviewHtml: "",
        prerequisitesHtml: "",
        country: parsed.country,
        totalSteps: steps.length,
        functionalArea: "Uncategorized",
        subArea: "Uncategorized",
        xlsxStored: true,
      },
    });

    // Batch insert process steps
    if (steps.length > 0) {
      const stepData = steps.map((s) => {
        const row = s.data;
        const actionTitle = cellStr(row[18]);
        return {
          scopeItemId: parsed.scopeId,
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

      // Insert in batches of 500 to avoid memory issues
      const batchSize = 500;
      for (let b = 0; b < stepData.length; b += batchSize) {
        const batch = stepData.slice(b, b + batchSize);
        await prisma.processStep.createMany({ data: batch });
      }

      totalStepsInserted += steps.length;
    }

    if ((i + 1) % 50 === 0 || i === testScriptXlsx.length - 1) {
      console.log(`  Processed ${i + 1}/${testScriptXlsx.length} XLSX files (${totalStepsInserted} steps so far)`);
    }
  }

  console.log(`  Total scope items: ${testScriptXlsx.length}`);
  console.log(`  Total process steps: ${totalStepsInserted}`);

  // =========================================================================
  // STEP 2: Parse BPD DOCX files → Update ScopeItem HTML fields (Task 1.3)
  // =========================================================================
  console.log("\n--- Step 2: Parsing BPD DOCX files ---");

  let docxProcessed = 0;
  for (const entry of testScriptDocx) {
    const filename = path.basename(entry.entryName);
    const parsed = parseScopeIdFromFilename(filename);
    if (!parsed) continue;

    // Check if scope item exists
    const existing = await prisma.scopeItem.findUnique({
      where: { id: parsed.scopeId },
      select: { id: true, docxStored: true },
    });

    if (!existing) {
      // Supplementary DOCX without matching XLSX — skip
      continue;
    }

    if (existing.docxStored) {
      // Already processed (some scope items have multiple DOCX files — use first)
      continue;
    }

    try {
      const buffer = entry.getData();
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value;

      // Extract sections from HTML
      let purposeHtml = "";
      let overviewHtml = "";
      let prerequisitesHtml = "";

      // Simple section extraction: find h1/h2 headers and capture content
      const sections = html.split(/<h[12][^>]*>/i);
      for (let s = 0; s < sections.length; s++) {
        const section = sections[s] ?? "";
        const lowerSection = section.toLowerCase();
        if (lowerSection.startsWith("purpose") || lowerSection.includes(">purpose<")) {
          // Content is everything after the closing tag
          const closingIdx = section.indexOf(">");
          purposeHtml = closingIdx >= 0 ? section.substring(closingIdx + 1) : section;
          // Clean up: remove closing h tags
          purposeHtml = purposeHtml.replace(/<\/h[12]>/gi, "").trim();
        } else if (lowerSection.startsWith("overview") || lowerSection.includes(">overview<")) {
          const closingIdx = section.indexOf(">");
          overviewHtml = closingIdx >= 0 ? section.substring(closingIdx + 1) : section;
          overviewHtml = overviewHtml.replace(/<\/h[12]>/gi, "").trim();
        } else if (lowerSection.startsWith("prerequisite") || lowerSection.includes(">prerequisite")) {
          const closingIdx = section.indexOf(">");
          prerequisitesHtml = closingIdx >= 0 ? section.substring(closingIdx + 1) : section;
          prerequisitesHtml = prerequisitesHtml.replace(/<\/h[12]>/gi, "").trim();
        }
      }

      // Fallback: if no sections found, store entire HTML as overview
      if (!purposeHtml && !overviewHtml && !prerequisitesHtml) {
        overviewHtml = html;
      }

      await prisma.scopeItem.update({
        where: { id: parsed.scopeId },
        data: {
          purposeHtml,
          overviewHtml,
          prerequisitesHtml,
          docxStored: true,
        },
      });

      docxProcessed++;
    } catch (err) {
      console.warn(`  Error processing DOCX ${filename}: ${err}`);
    }

    if (docxProcessed % 100 === 0 && docxProcessed > 0) {
      console.log(`  Processed ${docxProcessed} DOCX files`);
    }
  }
  console.log(`  Total DOCX processed: ${docxProcessed}`);

  // =========================================================================
  // STEP 3: Parse Config XLSM → ConfigActivity + ImgActivity + ExpertConfig (Task 1.4)
  // =========================================================================
  console.log("\n--- Step 3: Parsing Config XLSM ---");

  if (configXlsm) {
    const buffer = configXlsm.getData();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // --- Main config sheet ---
    const mainSheet = workbook.Sheets["2508 S4H Cloud"];
    if (mainSheet) {
      const rows: unknown[][] = XLSX.utils.sheet_to_json(mainSheet, {
        header: 1,
        raw: false,
        defval: null,
      });

      // Header at row 3, data rows 4+
      const dataRows = rows.slice(4);
      console.log(`  Main config sheet: ${dataRows.length} data rows`);

      const configBatch = [];
      for (const row of dataRows) {
        const rawScopeId = cellStr(row[9]);
        const scopeItemId = parseConfigScopeItemId(rawScopeId);
        const selfServiceRaw = cellStr(row[5]);
        const categoryRaw = cellStrOrNull(row[7]);

        configBatch.push({
          scopeItemId,
          scopeItemDescription: cellStrOrNull(row[10]),
          applicationArea: cellStr(row[0]),
          applicationSubarea: cellStr(row[1]),
          configItemName: cellStr(row[2]),
          configItemId: cellStr(row[3]),
          activityDescription: cellStr(row[4]),
          selfService: selfServiceRaw === "Yes",
          configApproach: cellStrOrNull(row[6]),
          category: categoryRaw ?? "",
          activityId: cellStr(row[8]),
          localizationScope: cellStrOrNull(row[11]),
          countrySpecific: cellStrOrNull(row[12]),
          alternateActivityId: cellStrOrNull(row[13]),
          componentId: cellStrOrNull(row[14]),
          redoInProduction: cellStrOrNull(row[15]),
          deleteCustomerRecords: cellStrOrNull(row[16]),
          additionalInfo: cellStrOrNull(row[17]),
          fileUploadEnabled: cellStrOrNull(row[18]),
        });
      }

      // Insert in batches
      const batchSize = 500;
      for (let b = 0; b < configBatch.length; b += batchSize) {
        const batch = configBatch.slice(b, b + batchSize);
        await prisma.configActivity.createMany({ data: batch });
      }
      console.log(`  Config activities inserted: ${configBatch.length}`);
    }

    // --- IMG Activity sheet ---
    const imgSheet = workbook.Sheets["IMG Activity TRAN in BC"];
    if (imgSheet) {
      const rows: unknown[][] = XLSX.utils.sheet_to_json(imgSheet, {
        header: 1,
        raw: false,
        defval: null,
      });

      // Header at row 0, data starts at row 1
      const dataRows = rows.slice(1);
      console.log(`  IMG activity sheet: ${dataRows.length} data rows`);

      const imgBatch = dataRows.map((row) => ({
        businessCatalogId: cellStr(row[0]),
        description: cellStr(row[1]),
        transactionCode: cellStrOrNull(row[2]),
        iamAppId: cellStrOrNull(row[3]),
        imgActivity: cellStrOrNull(row[4]),
        explanatoryText: cellStrOrNull(row[5]),
        sscuiId: cellStrOrNull(row[6]),
        businessCatalogComponentId: cellStrOrNull(row[7]),
        imgActivityAch: cellStrOrNull(row[8]),
      }));

      const batchSize = 500;
      for (let b = 0; b < imgBatch.length; b += batchSize) {
        const batch = imgBatch.slice(b, b + batchSize);
        await prisma.imgActivity.createMany({ data: batch });
      }
      console.log(`  IMG activities inserted: ${imgBatch.length}`);
    }

    // --- Expert config sheets (Tasks 3-15 in the XLSM, excluding Doc. Info) ---
    const expertSheetNames = workbook.SheetNames.filter(
      (name: string) => name !== "2508 S4H Cloud" && name !== "IMG Activity TRAN in BC" && name !== "Doc. Info"
    );
    console.log(`  Expert config sheets: ${expertSheetNames.length}`);

    for (const sheetName of expertSheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: null,
      });

      // Find scope item ID for this expert config
      // Sheet name is often the scope item ID or config activity ID
      const scopeItemId = sheetName;

      await prisma.expertConfig.create({
        data: {
          scopeItemId,
          sheetName,
          rowCount: rows.length,
          content: JSON.parse(JSON.stringify(rows)) as string[][],
        },
      });
    }
    console.log(`  Expert configs inserted: ${expertSheetNames.length}`);
  }

  // =========================================================================
  // STEP 4: Parse Links XLSX → SolutionLink (Task 1.5)
  // =========================================================================
  console.log("\n--- Step 4: Parsing Links XLSX ---");

  if (linksXlsx) {
    const buffer = linksXlsx.getData();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: null,
      });

      // Header at row 0, data starts at row 1
      const dataRows = rows.slice(1);
      if (dataRows.length === 0) continue;

      let linkType: string;
      if (sheetName === "SolutionScenario") {
        linkType = "scenario";
      } else if (sheetName === "SolutionProcess") {
        linkType = "process";
      } else {
        linkType = "processflow";
      }

      const linkBatch = dataRows.map((row) => ({
        bomId: cellStr(row[0]),
        title: cellStr(row[1]),
        entityId: cellStr(row[2]),
        country: cellStr(row[3]),
        language: cellStr(row[4]),
        url: cellStr(row[5]),
        type: linkType,
      }));

      await prisma.solutionLink.createMany({ data: linkBatch });
      console.log(`  ${sheetName}: ${linkBatch.length} links inserted`);
    }
  }

  // =========================================================================
  // STEP 5: Store Setup PDFs (Task 1.6)
  // =========================================================================
  console.log("\n--- Step 5: Storing Setup PDFs ---");

  let setupCount = 0;
  for (const entry of setupPdfs) {
    const filename = path.basename(entry.entryName);
    // Pattern: {SCOPE_ID}_Set-Up_EN_{COUNTRY}.pdf
    const match = filename.match(/^([A-Z0-9]+)_Set-Up_EN_/i);
    if (!match?.[1]) {
      // Try alternate patterns
      const altMatch = filename.match(/^([A-Z0-9]+)_/i);
      if (!altMatch?.[1]) {
        console.warn(`  Cannot parse scope ID from setup PDF: ${filename}`);
        continue;
      }
    }

    const scopeId = (match?.[1] ?? filename.split("_")[0]) as string;
    const buffer = entry.getData();

    // Check if scope item exists
    const scopeItem = await prisma.scopeItem.findUnique({
      where: { id: scopeId },
      select: { id: true },
    });

    if (!scopeItem) {
      // Create a minimal scope item for setup PDFs without matching XLSX
      // These are scope items that exist in the SAP package but only have setup guides
      const pdfCountry = filename.match(/_EN_([A-Z]+)\.pdf$/i)?.[1] ?? "XX";
      await prisma.scopeItem.create({
        data: {
          id: scopeId,
          name: scopeId,
          nameClean: scopeId,
          purposeHtml: "",
          overviewHtml: "",
          prerequisitesHtml: "",
          country: pdfCountry,
          totalSteps: 0,
          functionalArea: "Uncategorized",
          subArea: "Uncategorized",
          setupPdfStored: true,
        },
      });
    }

    // Extract page count using a simple approach (avoid pdf-parse issues)
    let pageCount: number | null = null;
    try {
      // Simple page count extraction from PDF binary
      const pdfStr = buffer.toString("latin1");
      const pageMatches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
      pageCount = pageMatches ? pageMatches.length : null;
    } catch {
      // Silently continue without page count
    }

    try {
      const blobUrl = await uploadToBlob(
        `sap-catalog/setup-guide/${scopeId}/${filename}`,
        buffer,
        filename,
      );

      await prisma.setupGuide.create({
        data: {
          scopeItemId: scopeId,
          filename,
          fileSize: buffer.length,
          pdfBlob: blobUrl ? null : new Uint8Array(buffer),
          blobUrl,
          pageCount,
        },
      });

      await prisma.scopeItem.update({
        where: { id: scopeId },
        data: { setupPdfStored: true },
      });

      setupCount++;
    } catch (err) {
      // Skip duplicates
      const errMsg = String(err);
      if (!errMsg.includes("Unique constraint")) {
        console.warn(`  Error storing setup PDF ${filename}: ${err}`);
      }
    }

    if (setupCount % 50 === 0 && setupCount > 0) {
      console.log(`  Stored ${setupCount} setup PDFs`);
    }
  }
  console.log(`  Total setup PDFs stored: ${setupCount}`);

  // =========================================================================
  // STEP 6: Store General files (Task 1.7)
  // =========================================================================
  console.log("\n--- Step 6: Storing General files ---");

  for (const entry of generalFiles) {
    const filename = path.basename(entry.entryName);
    const buffer = entry.getData();

    let fileType = "other";
    const lowerName = filename.toLowerCase();
    if (lowerName.includes("upload") || lowerName.includes("template")) {
      fileType = "upload_template";
    } else if (lowerName.includes("brd")) {
      fileType = "brd";
    } else if (lowerName.includes("_template") || lowerName.includes("_tmpl")) {
      fileType = "template";
    }
    // Check extension for more accurate classification
    if (fileType === "other") {
      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".csv")) {
        fileType = "upload_template";
      } else if (lowerName.endsWith(".zip")) {
        fileType = "template";
      } else if (lowerName.endsWith(".pdf") || lowerName.endsWith(".docx")) {
        fileType = "other";
      }
    }

    const blobUrl = await uploadToBlob(
      `sap-catalog/general/${filename}`,
      buffer,
      filename,
    );

    await prisma.generalFile.create({
      data: {
        filename,
        fileType,
        fileSize: buffer.length,
        blob: blobUrl ? null : new Uint8Array(buffer),
        blobUrl,
        relatedScopeIds: [],
      },
    });
  }
  console.log(`  Total general files stored: ${generalFiles.length}`);

  // =========================================================================
  // STEP 7: Store Others files (Task 1.8)
  // =========================================================================
  console.log("\n--- Step 7: Storing Others files ---");

  for (const entry of otherFiles) {
    const filename = path.basename(entry.entryName);
    const buffer = entry.getData();

    const blobUrl = await uploadToBlob(
      `sap-catalog/other/${filename}`,
      buffer,
      filename,
    );

    await prisma.otherFile.create({
      data: {
        filename,
        path: entry.entryName,
        fileSize: buffer.length,
        blob: blobUrl ? null : new Uint8Array(buffer),
        blobUrl,
      },
    });
  }
  console.log(`  Total other files stored: ${otherFiles.length}`);

  // =========================================================================
  // STEP 8: Store README.rtf (Task 1.9)
  // =========================================================================
  console.log("\n--- Step 8: Storing README.rtf ---");

  if (readmeRtf) {
    const buffer = readmeRtf.getData();
    // Extract plain text from RTF (simple approach)
    let textContent = buffer.toString("utf8");
    // Strip RTF control codes (basic approach)
    textContent = textContent
      .replace(/\{\\rtf[^}]*\}/g, "")
      .replace(/\\[a-z]+\d*\s?/g, "")
      .replace(/[{}]/g, "")
      .trim();

    const blobUrl = await uploadToBlob(
      `sap-catalog/readme/README.rtf`,
      buffer,
      "README.rtf",
    );

    await prisma.readmeFile.create({
      data: {
        filename: "README.rtf",
        content: textContent || "SAP Best Practices README",
        blob: blobUrl ? null : new Uint8Array(buffer),
        blobUrl,
      },
    });
    console.log("  README.rtf stored");
  }

  // =========================================================================
  // STEP 9: Cross-reference functional areas (Task 1.10)
  // =========================================================================
  console.log("\n--- Step 9: Cross-referencing functional areas ---");

  // Build a lookup from scope item ID → (application area, application subarea)
  // from ConfigActivity records. Must also handle multi-ID entries like "J14, J13, 22Z"
  const allConfigs = await prisma.configActivity.findMany({
    select: {
      scopeItemId: true,
      applicationArea: true,
      applicationSubarea: true,
    },
  });

  const areaMap = new Map<string, { area: string; subArea: string }>();

  // First pass: direct single-ID matches
  for (const ca of allConfigs) {
    if (ca.scopeItemId !== "All" && !areaMap.has(ca.scopeItemId)) {
      areaMap.set(ca.scopeItemId, {
        area: ca.applicationArea,
        subArea: ca.applicationSubarea,
      });
    }
  }

  // Second pass: re-read the raw config data to extract ALL scope IDs from multi-ID entries
  // We need to go back to the raw XLSM data for this
  if (configXlsm) {
    const cfgBuffer = configXlsm.getData();
    const cfgWorkbook = XLSX.read(cfgBuffer, { type: "buffer" });
    const cfgSheet = cfgWorkbook.Sheets["2508 S4H Cloud"];
    if (cfgSheet) {
      const cfgRows: unknown[][] = XLSX.utils.sheet_to_json(cfgSheet, {
        header: 1,
        raw: false,
        defval: null,
      });
      for (const row of cfgRows.slice(4)) {
        const rawScopeId = cellStr(row[9]).trim();
        if (rawScopeId === "All" || rawScopeId === "") continue;
        const area = cellStr(row[0]);
        const subArea = cellStr(row[1]);
        // Split multi-IDs
        const ids = rawScopeId.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        for (const id of ids) {
          if (!areaMap.has(id)) {
            areaMap.set(id, { area, subArea });
          }
        }
      }
    }
  }

  console.log(`  Area mappings found: ${areaMap.size}`);

  // Update scope items with functional areas
  let areaUpdated = 0;
  const allScopeItems = await prisma.scopeItem.findMany({ select: { id: true } });
  for (const si of allScopeItems) {
    const mapping = areaMap.get(si.id);
    if (mapping) {
      await prisma.scopeItem.update({
        where: { id: si.id },
        data: {
          functionalArea: mapping.area,
          subArea: mapping.subArea,
        },
      });
      areaUpdated++;
    }
  }
  console.log(`  Scope items with functional area: ${areaUpdated}`);
  console.log(`  Scope items uncategorized: ${allScopeItems.length - areaUpdated}`);

  // =========================================================================
  // STEP 10: Cross-reference tutorial URLs (Task 1.11)
  // =========================================================================
  console.log("\n--- Step 10: Cross-referencing tutorial URLs ---");

  const processLinks = await prisma.solutionLink.findMany({
    where: { type: "process" },
    select: { entityId: true, url: true },
  });

  let urlUpdated = 0;
  for (const link of processLinks) {
    try {
      await prisma.scopeItem.update({
        where: { id: link.entityId },
        data: { tutorialUrl: link.url },
      });
      urlUpdated++;
    } catch {
      // Scope item not found — skip
    }
  }
  console.log(`  Tutorial URLs linked: ${urlUpdated}`);

  // =========================================================================
  // DONE
  // =========================================================================
  console.log("\n=== Ingestion complete ===");

  // Quick verification
  const scopeCount = await prisma.scopeItem.count();
  const stepCount = await prisma.processStep.count();
  const configCount = await prisma.configActivity.count();
  const imgCount = await prisma.imgActivity.count();
  const setupGuidesCount = await prisma.setupGuide.count();
  const generalCount = await prisma.generalFile.count();
  const otherCount = await prisma.otherFile.count();
  const linkCount = await prisma.solutionLink.count();
  const expertCount = await prisma.expertConfig.count();

  console.log(`Scope items: ${scopeCount}`);
  console.log(`Process steps: ${stepCount}`);
  console.log(`Config activities: ${configCount}`);
  console.log(`IMG activities: ${imgCount}`);
  console.log(`Setup guides: ${setupGuidesCount}`);
  console.log(`General files: ${generalCount}`);
  console.log(`Other files: ${otherCount}`);
  console.log(`Solution links: ${linkCount}`);
  console.log(`Expert configs: ${expertCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
