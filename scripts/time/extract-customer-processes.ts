/**
 * TIME RFT Phase 3 Stage 2 — extract CustomerProcess rows from the
 * App 2(b) PDF (already ingested as a BrownfieldGuide row in Stage 1).
 *
 * The TIME process-assessment PDF is a 614-page PowerPoint with a
 * remarkably clean structure:
 *   - 429 occurrences of "Process: <name>" headers
 *   - 189 As-Is / 245 To-Be section markers
 *   - Many headers carry an RTM ID (e.g. "MD.001", "FI.006") — a
 *     customer-side canonical reference
 *
 * Strategy (deterministic parse, no LLM):
 *   1. Walk pdftotext output line by line, page-tracked via \f form-feed
 *   2. Detect process headers: lines containing "Process:" with an
 *      optional As-Is/To-Be marker + optional Option variant + optional
 *      RTM ID
 *   3. Group by canonical process name + (RTM ID when present)
 *   4. Each canonical process becomes one CustomerProcess row with:
 *      - processName: cleaned base name (Option suffix stripped)
 *      - parentSection: derived from chapter context (we re-derive from TOC)
 *      - pageRefs: every page where this process appears
 *      - asIsDescription: concatenated As-Is page-text (next ~50 lines per page)
 *      - sourceSystems: heuristic-extracted from text (CBS, zSMART, etc.)
 *      - customApps: same heuristic
 *      - painPoints: extracted from "Pain Points" + "Key improvements" sections
 *      - extractionConfidence: "medium" (heuristic — flag for consultant review)
 *
 * Idempotent — wipes prior CustomerProcess rows for this assessment + reinserts.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/extract-customer-processes.ts
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { prisma } from "../../src/lib/db/prisma";

const pExecFile = promisify(execFile);

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";

// Known systems mentioned in TIME's landscape diagram (page 1-15 area).
// We grep these out of process descriptions to populate sourceSystems[].
const KNOWN_SYSTEMS = [
  "CBS", "zSMART", "VDS", "TRECS", "e-ARIF", "WOC", "COFR", "ESS", "PEOPLE",
  "DWMS", "Ariba", "Icertis", "BPA", "Workzone",
  "SF EC", "SAP HCM", "SuccessFactors",
  "SAP S/4HANA", "S/4HANA", "SAP HANA",
  "SAP ECC", "ECC",
  "HSBC", "UOB", "CIMB",
  "Concur",
];

const PROCESS_HEADER_RX = /Process:\s*(.+?)(?:\s+RTM\s*ID\s*:\s*([A-Z]+\.\d+))?\s*$/i;
const AS_IS_MARKER_RX = /\bAs\s*-\s*Is\b/i;
const TO_BE_MARKER_RX = /\bTo\s*-\s*Be\b/i;
const OPTION_RX = /\(Option\s*\d+\s*[-–]\s*(.+?)\)/i;

interface PageContent {
  pageNumber: number;
  text: string;
}

interface ProcessOccurrence {
  pageNumber: number;
  rawHeader: string;
  direction: "AS_IS" | "TO_BE" | "UNKNOWN";
  rawProcessName: string;       // e.g. "Customer Master – Trade (Option 1 – DWMS with SAP Integration)"
  cleanedProcessName: string;   // e.g. "Customer Master – Trade"
  optionVariant: string | null; // e.g. "DWMS with SAP Integration"
  rtmId: string | null;
}

interface CanonicalProcess {
  key: string;                  // (cleanedName + rtmId) — unique grouping key
  cleanedProcessName: string;
  rtmId: string | null;
  occurrences: ProcessOccurrence[];
  pageRefs: number[];
  variants: Set<string>;        // option variants observed
  asIsPageText: string[];       // concatenated As-Is text
  toBePageText: string[];       // concatenated To-Be text
}

async function extractText(pdfPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "timepdf-"));
  const txtPath = join(dir, "out.txt");
  try {
    await pExecFile("pdftotext", ["-layout", pdfPath, txtPath]);
    return await readFile(txtPath, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Split full pdftotext output into pages by form-feed (\f). */
function splitPages(fullText: string): PageContent[] {
  const pages = fullText.split("\f");
  return pages.map((text, i) => ({ pageNumber: i + 1, text }));
}

/** Heuristic: clean a raw process name string by stripping " (Option N — ...)" suffixes. */
function cleanProcessName(raw: string): { cleaned: string; option: string | null } {
  const m = OPTION_RX.exec(raw);
  if (m) {
    const cleaned = raw.replace(OPTION_RX, "").trim().replace(/\s+/g, " ");
    return { cleaned, option: m[1]!.trim() };
  }
  return { cleaned: raw.trim().replace(/\s+/g, " "), option: null };
}

function detectProcessHeaders(page: PageContent): ProcessOccurrence[] {
  const out: ProcessOccurrence[] = [];
  const lines = page.text.split("\n");
  for (const line of lines) {
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (!/Process:/i.test(trimmed)) continue;
    const m = PROCESS_HEADER_RX.exec(trimmed);
    if (!m) continue;
    let rawProcessName = m[1]!.trim();
    // Strip embedded "RTM ID:" if regex didn't catch it cleanly
    rawProcessName = rawProcessName.replace(/\s*RTM\s*ID\s*:.*$/i, "").trim();
    const rtmId = m[2]?.trim() ?? null;
    if (rawProcessName.length < 4) continue;

    // Direction inference: look at the surrounding line context
    const direction: "AS_IS" | "TO_BE" | "UNKNOWN" = AS_IS_MARKER_RX.test(trimmed)
      ? "AS_IS"
      : TO_BE_MARKER_RX.test(trimmed)
        ? "TO_BE"
        : "UNKNOWN";

    const { cleaned, option } = cleanProcessName(rawProcessName);
    out.push({
      pageNumber: page.pageNumber,
      rawHeader: trimmed,
      direction,
      rawProcessName,
      cleanedProcessName: cleaned,
      optionVariant: option,
      rtmId,
    });
  }
  return out;
}

function extractSystemsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const sys of KNOWN_SYSTEMS) {
    // word-boundary match (simple)
    const rx = new RegExp(`\\b${sys.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (rx.test(text)) found.add(sys);
  }
  return Array.from(found);
}

function extractPainPoints(text: string): string[] {
  const out: string[] = [];
  // Look for numbered lists in "Pain Points" / "Key improvements" sections
  const lines = text.split("\n");
  let inPainSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^Pain\s*Points\b/i.test(line) || /^Key\s+improvements\b/i.test(line)) {
      inPainSection = true;
      continue;
    }
    if (/^(Proposed Solution|Key benefits|Adoption|Process:|To\s*-\s*Be)/i.test(line)) {
      inPainSection = false;
      continue;
    }
    if (inPainSection) {
      const m = /^\s*(\d+)[.)]\s+(.+?)$/.exec(line);
      if (m && m[2]!.length > 10) out.push(m[2]!.trim().slice(0, 300));
    }
  }
  return out.slice(0, 10); // cap
}

async function main(): Promise<void> {
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  console.log(`[time-extract-processes] Assessment: ${assessment.id}`);

  // Resolve the BrownfieldGuide for the App 2(b) PDF (sha256 from our prior ingest)
  const guide = await prisma.brownfieldGuide.findFirst({
    where: { sourceDocument: "TIME_App2b_Process_Assessment.pdf" },
    select: { id: true, sha256: true },
  });
  if (!guide) {
    throw new Error(
      "App 2(b) BrownfieldGuide not found. Run brownfield-pdf-guide-adapter first.",
    );
  }
  console.log(`[time-extract-processes] Source guide: ${guide.id} (sha256 ${guide.sha256.slice(0, 12)}...)`);

  const pdfPath = "/workspaces/aptus/Conversion/TIME_App2b_Process_Assessment.pdf";
  console.log(`[time-extract-processes] Reading ${pdfPath}`);
  const fullText = await extractText(pdfPath);
  const pages = splitPages(fullText);
  console.log(`[time-extract-processes] Got ${pages.length} pages`);

  // Collect all process header occurrences across all pages
  const allOccurrences: ProcessOccurrence[] = [];
  for (const page of pages) {
    allOccurrences.push(...detectProcessHeaders(page));
  }
  console.log(`[time-extract-processes] Detected ${allOccurrences.length} process header occurrences`);

  // Group by canonical key (cleanedName + rtmId)
  const canonicalMap = new Map<string, CanonicalProcess>();
  for (const occ of allOccurrences) {
    const key = occ.rtmId
      ? `${occ.cleanedProcessName}::${occ.rtmId}`
      : occ.cleanedProcessName;
    let canonical = canonicalMap.get(key);
    if (!canonical) {
      canonical = {
        key,
        cleanedProcessName: occ.cleanedProcessName,
        rtmId: occ.rtmId,
        occurrences: [],
        pageRefs: [],
        variants: new Set(),
        asIsPageText: [],
        toBePageText: [],
      };
      canonicalMap.set(key, canonical);
    }
    canonical.occurrences.push(occ);
    if (!canonical.pageRefs.includes(occ.pageNumber)) canonical.pageRefs.push(occ.pageNumber);
    if (occ.optionVariant) canonical.variants.add(occ.optionVariant);
  }
  console.log(`[time-extract-processes] Grouped into ${canonicalMap.size} canonical processes`);

  // For each canonical process, gather the page text from each page reference
  for (const canonical of canonicalMap.values()) {
    for (const occ of canonical.occurrences) {
      const page = pages[occ.pageNumber - 1];
      if (!page) continue;
      const cleanedText = page.text.replace(/\s{2,}/g, " ").trim();
      if (occ.direction === "AS_IS") canonical.asIsPageText.push(cleanedText);
      else if (occ.direction === "TO_BE") canonical.toBePageText.push(cleanedText);
      else canonical.asIsPageText.push(cleanedText); // default to as-is for unknown
    }
  }

  // Wipe prior CustomerProcess rows for idempotency
  const wiped = await prisma.customerProcess.deleteMany({
    where: { assessmentId: assessment.id },
  });
  console.log(`[time-extract-processes] Wiped ${wiped.count} prior CustomerProcess rows`);

  // Insert one CustomerProcess row per canonical process
  let inserted = 0;
  for (const canonical of canonicalMap.values()) {
    const fullDescription = [
      canonical.asIsPageText.length > 0 ? `## As-Is\n\n${canonical.asIsPageText.join("\n\n---\n\n")}` : "",
      canonical.toBePageText.length > 0 ? `## To-Be\n\n${canonical.toBePageText.join("\n\n---\n\n")}` : "",
    ].filter(Boolean).join("\n\n");

    // Truncate to keep DB rows manageable (Postgres TEXT can handle it but no need to bloat)
    const trimmedDesc = fullDescription.slice(0, 50000);

    const sourceSystems = extractSystemsFromText(canonical.asIsPageText.join(" "));
    const painPoints = extractPainPoints(canonical.asIsPageText.join("\n"));

    // Heuristic parentSection from RTM ID prefix (e.g. "MD" → "Master Data", "FI" → "Finance")
    const rtmPrefix = canonical.rtmId?.split(".")[0] ?? null;
    const parentSection = rtmPrefix ? rtmPrefixToSection(rtmPrefix) : null;

    await prisma.customerProcess.create({
      data: {
        assessmentId: assessment.id,
        processName: canonical.rtmId
          ? `${canonical.cleanedProcessName} (${canonical.rtmId})`
          : canonical.cleanedProcessName,
        parentSection,
        pageRefs: canonical.pageRefs.sort((a, b) => a - b),
        asIsDescription: trimmedDesc || null,
        sourceSystems,
        customApps: sourceSystems.filter((s) =>
          ["CBS", "zSMART", "VDS", "TRECS", "e-ARIF", "WOC", "COFR", "ESS", "PEOPLE", "DWMS", "Icertis"].includes(s)
        ),
        painPoints,
        modules: [], // populated by Phase 5 evidence linker
        extractedFromGuideId: guide.id,
        extractionConfidence: "medium",
      },
    });
    inserted++;
  }

  console.log(``);
  console.log(`[time-extract-processes] Done.`);
  console.log(`  Process header occurrences : ${allOccurrences.length}`);
  console.log(`  Canonical processes        : ${canonicalMap.size}`);
  console.log(`  CustomerProcess rows       : ${inserted}`);

  // Sample 5 for sanity
  const samples = await prisma.customerProcess.findMany({
    where: { assessmentId: assessment.id },
    take: 5,
    orderBy: { processName: "asc" },
  });
  console.log(``);
  console.log(`Sample 5 processes:`);
  for (const s of samples) {
    console.log(`  - ${s.processName.padEnd(60)} pages=${s.pageRefs.length}  systems=${s.sourceSystems.length}  painPoints=${s.painPoints.length}`);
  }
}

function rtmPrefixToSection(prefix: string): string {
  const map: Record<string, string> = {
    "MD": "Master Data",
    "FI": "Finance",
    "CO": "Controlling",
    "MM": "Procurement / Materials Management",
    "SD": "Sales & Distribution",
    "WM": "Warehouse Management",
    "PM": "Plant Maintenance",
    "PS": "Project System",
    "HR": "Human Capital Management",
    "HCM": "Human Capital Management",
    "TR": "Treasury",
    "IM": "Investment Management",
    "AA": "Asset Accounting",
    "BL": "Billing",
    "PR": "Procurement",
    "AP": "Accounts Payable",
    "AR": "Accounts Receivable",
    "GL": "General Ledger",
  };
  return map[prefix] ?? `Section ${prefix}`;
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-extract-processes] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
