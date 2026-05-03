/**
 * TIME RFT — DEEP extraction of App 2(b) at 100% page coverage.
 *
 * Single pass over the 614-page PDF that extracts:
 *   1. Per-page classification (every page 1..N → App2bPageClassification row)
 *   2. To-Be Options + scoring per CustomerProcess (Adoption complexity /
 *      Priority to implement / Implementation Effort / Organization changes
 *      → Poor / Fair / Good)
 *   3. Pain points from BOTH numbered lists AND prose patterns
 *   4. Transaction codes (MB52, ME5A, MIRO, etc.) extracted via regex
 *      against known SAP transaction prefixes
 *   5. SAP Note references (Note 2502552 pattern)
 *   6. Table names (MARC, BSEG, EKPO, etc. — uppercase short identifiers)
 *   7. Report IDs (RFITEMxxx pattern)
 *
 * Idempotent — wipes prior App2bPageClassification + CustomerProcessOption
 * + CustomerProcessReference + the App 2(b)-specific CustomerProcess rows
 * and reinserts them with the deeper data.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/deep-extract-app2b.ts
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { prisma } from "../../src/lib/db/prisma";

const pExecFile = promisify(execFile);

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";
const PDF_PATH = "/workspaces/aptus/Conversion/TIME_App2b_Process_Assessment.pdf";

// Known SAP transaction code prefixes (we only count uppercase + digit
// patterns prefixed by these to avoid false positives like "FE" = First Notice)
const SAP_TCODE_PREFIXES = new Set([
  "ME", "MB", "MM", "MIRO", "MIGO", "FB", "FBL", "FBS", "FS", "F-", "FK",
  "OB", "OK", "VK", "VL", "VA", "VF", "VK", "SE", "SA", "SU", "SCI", "SCMON",
  "SUSG", "SPRO", "SNRO", "SBWP", "STMS", "ST", "SM", "SQ", "OB", "OS",
  "PA", "PT", "PE", "PB", "PC", "OOSP", "PPOM", "PPOSE", "WE", "WTAD",
  "FBM", "OBYC", "OXK", "AS", "AB", "AR", "AP", "RE", "FCH", "FBRA",
]);

const KNOWN_SAP_TABLES = new Set([
  "MARA", "MARC", "MARD", "MAKT", "MBEW", "MBEWH", "MCH1", "MCHA", "MCHB",
  "EKPO", "EKKO", "EKBE", "EKES", "EKEH", "EKKN", "EBAN", "EBKN",
  "BSEG", "BKPF", "BSAS", "BSID", "BSAD", "BSIK", "BSAK", "BSIS",
  "T001", "T024", "T030", "TVKO", "TVAK",
  "USR02", "USR21", "USR40",
  "SKAT", "SKB1", "SKAS", "T012", "T012K",
  "VBAK", "VBAP", "VBRK", "VBRP", "VBKD", "VBPA",
  "LIKP", "LIPS",
  "MSEG", "MKPF", "MB52", // MB52 also a t-code, context distinguishes
  "TADIR", "WBCROSSGT", "DD06L", "DD06T", "DD16S", "DD06V",
]);

interface PageContent {
  pageNumber: number;
  text: string;
  rawText: string;
}

interface PageClassification {
  pageNumber: number;
  pageTypes: string[];
  pageTitle: string | null;
  textExcerpt: string;
  detectedProcessNames: string[];
  classificationConfidence: string;
}

interface ProcessOccurrence {
  pageNumber: number;
  rawHeader: string;
  direction: "AS_IS" | "TO_BE" | "UNKNOWN";
  rawProcessName: string;
  cleanedProcessName: string;
  optionVariant: string | null;
  optionNumber: number | null;
  rtmId: string | null;
}

interface CanonicalProcess {
  key: string;
  cleanedProcessName: string;
  rtmId: string | null;
  occurrences: ProcessOccurrence[];
  pageRefs: Set<number>;
  asIsPages: number[];
  toBePages: number[];
  pageTexts: Map<number, string>;
}

const PROCESS_HEADER_RX = /Process:\s*(.+?)(?:\s+RTM\s*ID\s*:\s*([A-Z]+\.\d+))?\s*$/i;
const AS_IS_MARKER_RX = /\bAs\s*-\s*Is\b/i;
const TO_BE_MARKER_RX = /\bTo\s*-\s*Be\b/i;
const OPTION_RX = /\(\s*Option\s*(\d+)\s*[-–]\s*(.+?)\s*\)/i;
const NOTE_RX = /\bNote\s+(\d{6,10})\b/gi;
const TCODE_FREE_RX = /\b([A-Z]{1,4}\d{1,4}[A-Z]?)\b/g; // candidate, filter by KNOWN prefix
const REPORT_RX = /\b(RF[A-Z0-9_]{4,15})\b/g;
const FIORI_RX = /\b(F\d{4,5})\b/g;
const BADI_RX = /\b(BADI_[A-Z_0-9]+)\b/g;
const FUNCTION_RX = /\b(BAPI_[A-Z_0-9]+|RFC_[A-Z_0-9]+|[A-Z]+_GET_[A-Z_]+|[A-Z]+_CHANGE_[A-Z_]+|[A-Z]+_CREATE_[A-Z_]+)\b/g;

const PAIN_PATTERNS = [
  /^\s*\d+[.)]\s+(.+)$/,   // numbered list
];
const PAIN_PROSE_TRIGGERS = [
  /^(Issue|Challenge|Limitation|Pain\s*Point|Lack\s+of|Inability\s+to|Manual|Inefficient|Inaccurate|Limited|Cannot|Unable\s+to|Lengthy|Outdated|Time-?consuming|Difficult|No\s+(?:standardi[sz]ed|automated|integrated|real-?time))/i,
];

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4),
  );
}

async function extractText(pdfPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "deepextract-"));
  const txtPath = join(dir, "out.txt");
  try {
    await pExecFile("pdftotext", ["-layout", pdfPath, txtPath]);
    return await readFile(txtPath, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function splitPages(fullText: string): PageContent[] {
  const pages = fullText.split("\f");
  return pages.map((rawText, i) => ({
    pageNumber: i + 1,
    rawText,
    text: rawText.replace(/\s{2,}/g, " ").trim(),
  }));
}

// -------------------------------------------------------------
// Page classification — single page → multi-tag
// -------------------------------------------------------------

function classifyPage(page: PageContent): PageClassification {
  const lines = page.rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const text = page.text;
  const textLower = text.toLowerCase();
  const types: string[] = [];
  const detectedNames: string[] = [];

  // 1. Cover / TOC / Landscape
  if (page.pageNumber === 1 && /upgrade\s*assessment/i.test(text)) {
    types.push("COVER");
  }
  if (/table\s*of\s*contents/i.test(text) || /^What\s+we’ll/i.test(lines[0] ?? "")) {
    types.push("TOC");
  }
  if (/landscape\s*summary|as\s*-\s*is\s*landscape/i.test(text) && /system landscape|integrated with|not integrated/i.test(text)) {
    types.push("LANDSCAPE_SUMMARY");
  }

  // 2. Process header detection (As-Is / To-Be)
  const processHeaders = lines.filter((l) => /Process:/i.test(l));
  let isAsIs = false;
  let isToBe = false;
  for (const h of processHeaders) {
    const m = PROCESS_HEADER_RX.exec(h);
    if (!m) continue;
    let name = m[1]!.trim().replace(/\s*RTM\s*ID\s*:.*$/i, "").trim();
    if (name.length < 4) continue;
    if (AS_IS_MARKER_RX.test(h)) isAsIs = true;
    if (TO_BE_MARKER_RX.test(h)) isToBe = true;
    if (!detectedNames.includes(name)) detectedNames.push(name);
  }
  if (isAsIs) types.push("AS_IS_PROCESS");
  if (isToBe) types.push("TO_BE_PROCESS");

  // 3. Pain Points slide
  if (/^Pain\s*Points\b/im.test(page.rawText) || (/\bFinding\b/i.test(text) && /\bBusiness\s*Impact\b/i.test(text))) {
    types.push("PAIN_POINTS");
  }

  // 4. Option Analysis (To-Be solution scoring)
  if (
    /Proposed\s*Solution/i.test(text) &&
    /Adoption\s*complexity/i.test(text) &&
    (/Priority\s*to\s*implement/i.test(text) || /Implementation\s*Effort/i.test(text))
  ) {
    types.push("OPTION_ANALYSIS");
  }

  // 5. To-Be Benefits (no scoring table but proposed-solution + benefits)
  if (
    isToBe &&
    !types.includes("OPTION_ANALYSIS") &&
    /Proposed\s*Solution/i.test(text) &&
    /Key\s*benefits/i.test(text)
  ) {
    types.push("TO_BE_BENEFITS");
  }

  // 6. Chapter intro: short pages with a single section heading
  if (types.length === 0 && lines.length < 8 && lines.some((l) => /^[A-Z][A-Za-z &-]{8,60}$/.test(l))) {
    types.push("CHAPTER_INTRO");
  }

  // 7. Summary table (lots of data, no process header)
  if (types.length === 0 && lines.length > 15 && /(SST|Tax|Treatment|Summary|Matrix)/i.test(text)) {
    types.push("SUMMARY_TABLE");
  }

  // 8. Appendix marker
  if (/^Appendix/im.test(page.rawText)) {
    types.push("APPENDIX");
  }

  // 9. Catch-all
  if (types.length === 0) {
    types.push("OTHER");
  }

  // Page title extraction
  let pageTitle: string | null = null;
  for (const line of lines.slice(0, 5)) {
    if (line.length > 5 && line.length < 150 && !/^Time$/i.test(line) && !/^\d+$/.test(line)) {
      pageTitle = line;
      break;
    }
  }

  return {
    pageNumber: page.pageNumber,
    pageTypes: Array.from(new Set(types)),
    pageTitle,
    textExcerpt: text.slice(0, 1800),
    detectedProcessNames: detectedNames,
    classificationConfidence: types.includes("AS_IS_PROCESS") || types.includes("TO_BE_PROCESS") ? "high"
      : types.includes("OPTION_ANALYSIS") || types.includes("PAIN_POINTS") ? "high"
      : types[0] === "OTHER" ? "low" : "medium",
  };
}

// -------------------------------------------------------------
// Process header parsing → CanonicalProcess grouping
// -------------------------------------------------------------

function detectHeaders(page: PageContent): ProcessOccurrence[] {
  const out: ProcessOccurrence[] = [];
  const lines = page.rawText.split("\n");
  for (const raw of lines) {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!/Process:/i.test(trimmed)) continue;
    const m = PROCESS_HEADER_RX.exec(trimmed);
    if (!m) continue;
    let rawProcessName = m[1]!.trim().replace(/\s*RTM\s*ID\s*:.*$/i, "").trim();
    if (rawProcessName.length < 4) continue;
    const direction: "AS_IS" | "TO_BE" | "UNKNOWN" = AS_IS_MARKER_RX.test(trimmed) ? "AS_IS"
      : TO_BE_MARKER_RX.test(trimmed) ? "TO_BE" : "UNKNOWN";
    const opt = OPTION_RX.exec(rawProcessName);
    let cleanedName = rawProcessName;
    let optionVariant: string | null = null;
    let optionNumber: number | null = null;
    if (opt) {
      optionNumber = Number(opt[1]);
      optionVariant = opt[2]!.trim();
      cleanedName = rawProcessName.replace(OPTION_RX, "").trim();
    }
    out.push({
      pageNumber: page.pageNumber,
      rawHeader: trimmed,
      direction,
      rawProcessName,
      cleanedProcessName: cleanedName,
      optionVariant,
      optionNumber,
      rtmId: m[2]?.trim() ?? null,
    });
  }
  return out;
}

function groupCanonical(occs: ProcessOccurrence[], pages: PageContent[]): Map<string, CanonicalProcess> {
  const map = new Map<string, CanonicalProcess>();
  for (const occ of occs) {
    const key = occ.rtmId ? `${occ.cleanedProcessName}::${occ.rtmId}` : occ.cleanedProcessName;
    let c = map.get(key);
    if (!c) {
      c = {
        key,
        cleanedProcessName: occ.cleanedProcessName,
        rtmId: occ.rtmId,
        occurrences: [],
        pageRefs: new Set(),
        asIsPages: [],
        toBePages: [],
        pageTexts: new Map(),
      };
      map.set(key, c);
    }
    c.occurrences.push(occ);
    c.pageRefs.add(occ.pageNumber);
    if (occ.direction === "AS_IS") c.asIsPages.push(occ.pageNumber);
    else if (occ.direction === "TO_BE") c.toBePages.push(occ.pageNumber);
    if (!c.pageTexts.has(occ.pageNumber)) {
      const page = pages[occ.pageNumber - 1];
      if (page) c.pageTexts.set(occ.pageNumber, page.text);
    }
  }
  // Extend page span via last-seen attribution: each page between two header pages
  // is attributed to the prior header's canonical (so trailing detail pages with Pain
  // Points / Findings / Business Impact accrue to the right process).
  const sortedOccs = [...occs].sort((a, b) => a.pageNumber - b.pageNumber);
  for (let i = 0; i < sortedOccs.length; i++) {
    const occ = sortedOccs[i]!;
    const next = sortedOccs[i + 1];
    const startPage = occ.pageNumber + 1;
    const endPage = next ? next.pageNumber - 1 : Math.min(occ.pageNumber + 6, pages.length);
    if (endPage < startPage) continue;
    const key = occ.rtmId ? `${occ.cleanedProcessName}::${occ.rtmId}` : occ.cleanedProcessName;
    const c = map.get(key);
    if (!c) continue;
    for (let p = startPage; p <= endPage; p++) {
      if (c.pageTexts.has(p)) continue;
      const page = pages[p - 1];
      if (!page) continue;
      // Stop attributing once we hit the next process header (defensive)
      if (/Process:/i.test(page.rawText) && PROCESS_HEADER_RX.test(page.rawText.replace(/\s+/g, " "))) break;
      c.pageTexts.set(p, page.text);
      c.pageRefs.add(p);
    }
  }
  return map;
}

// -------------------------------------------------------------
// To-Be Option extraction (scoring + benefits)
// -------------------------------------------------------------

interface ExtractedOption {
  optionLabel: string;
  optionNumber: number | null;
  optionType: string;
  variantLabel: string | null;
  adoptionComplexity: string | null;
  priorityToImplement: string | null;
  implementationEffort: string | null;
  organizationChanges: string | null;
  scoringComments: Record<string, string>;
  proposedSolutionBullets: string[];
  keyBenefitsBullets: string[];
  sourcePage: number;
}

function categorizeOptionType(variant: string | null): string {
  if (!variant) return "OTHER";
  const v = variant.toLowerCase();
  if (/dwms/.test(v)) return "DWMS";
  if (/bpa|workzone/.test(v)) return "BPA";
  if (/successfactors|sf\s*ec|ecp\b/.test(v)) return "SUCCESSFACTORS";
  if (/ariba/.test(v)) return "ARIBA";
  if (/concur/.test(v)) return "CONCUR";
  if (/vendor|3rd\s*party|third[- ]party/.test(v)) return "VENDOR";
  if (/custom\s*program|abap|enhancement/.test(v)) return "CUSTOM";
  if (/^all\b|core\s*sap/.test(v)) return "CORE";
  return "OTHER";
}

function extractOptionFromPage(occ: ProcessOccurrence, pageText: string): ExtractedOption | null {
  if (occ.direction !== "TO_BE") return null;
  const optLabel = occ.optionVariant
    ? `Option ${occ.optionNumber} - ${occ.optionVariant}`
    : occ.cleanedProcessName.includes("(") ? occ.cleanedProcessName : "Default";

  // Detect 4-dimension scoring: look for "Adoption complexity", "Priority to implement",
  // "Implementation Effort", "Organization changes" + nearby Poor/Fair/Good marker
  const scoring: Record<string, string | null> = {
    adoption: null,
    priority: null,
    effort: null,
    org: null,
  };
  const comments: Record<string, string> = {};

  const dimensions: Array<{ key: string; rx: RegExp }> = [
    { key: "adoption", rx: /Adoption\s*complexity[\s\S]{0,400}/i },
    { key: "priority", rx: /Priority\s*to\s*implement[\s\S]{0,400}/i },
    { key: "effort", rx: /Implementation\s*Effort[\s\S]{0,400}/i },
    { key: "org", rx: /Organization\/?\s*Organization\s*Changes|Organization\s*changes[\s\S]{0,400}/i },
  ];
  for (const d of dimensions) {
    const m = d.rx.exec(pageText);
    if (m) {
      const block = m[0];
      // Score: prefer Good > Fair > Poor presence near the dimension
      let score: string | null = null;
      if (/\bGood\b/.test(block) && !/\bnot\s*Good\b/i.test(block)) score = "Good";
      else if (/\bFair\b/.test(block)) score = "Fair";
      else if (/\bPoor\b/.test(block)) score = "Poor";
      scoring[d.key] = score;
      // Pull comment text after the score (best-effort)
      const after = block.replace(/^[^\n]+\n?/, "").slice(0, 200).trim();
      if (after) comments[d.key] = after;
    }
  }

  // Bullets — lines starting with "1. ", "2. ", etc., under "Proposed Solution" / "Key benefits"
  const proposedBullets: string[] = [];
  const benefitBullets: string[] = [];
  const lines = pageText.split(/\.\s+/);
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 10 || t.length > 250) continue;
    if (/^(\d+)[.)]\s+(.+)/.test(t) || /(Eliminat|Centrali[sz]ed|Reduce|Improve|Standard|Automat|Real-?time)/i.test(t)) {
      if (proposedBullets.length < 6) proposedBullets.push(t.slice(0, 220));
    }
  }

  return {
    optionLabel: optLabel,
    optionNumber: occ.optionNumber,
    optionType: categorizeOptionType(occ.optionVariant),
    variantLabel: occ.optionVariant,
    adoptionComplexity: scoring.adoption ?? null,
    priorityToImplement: scoring.priority ?? null,
    implementationEffort: scoring.effort ?? null,
    organizationChanges: scoring.org ?? null,
    scoringComments: comments,
    proposedSolutionBullets: proposedBullets.slice(0, 6),
    keyBenefitsBullets: benefitBullets.slice(0, 6),
    sourcePage: occ.pageNumber,
  };
}

// -------------------------------------------------------------
// Pain points (numbered + prose)
// -------------------------------------------------------------

function extractPainPoints(pageText: string): string[] {
  const out = new Set<string>();
  const lines = pageText.split("\n");

  // Multi-line numbered-item capture: when we see "1." or "2." etc.
  // (often in the Pain Points table), collect text from that line +
  // any following continuation lines until the next numbered item OR
  // a blank line followed by structural marker.
  let inPain = false;
  let currentItem: string[] | null = null;

  function flushItem() {
    if (currentItem && currentItem.length > 0) {
      const joined = currentItem.join(" ").replace(/\s+/g, " ").trim();
      if (joined.length > 15 && joined.length < 600) out.add(joined.slice(0, 320));
    }
    currentItem = null;
  }

  for (const raw of lines) {
    const line = raw;
    const t = raw.trim();

    if (/^Pain\s*Points\b/i.test(t) || /^Key\s+improvements\b/i.test(t)
        || /^Finding\s*$/i.test(t) || /^Business\s+Impact\s*$/i.test(t)) {
      flushItem();
      inPain = true;
      continue;
    }
    if (/^(Proposed Solution|Key benefits|Adoption|Process:|To\s*-\s*Be|Step\s*\d|Conclusion)/i.test(t)) {
      flushItem();
      inPain = false;
      continue;
    }

    if (inPain) {
      // Numbered item start (1., 2., 3., etc.) — supports leading whitespace
      const numMatch = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
      if (numMatch) {
        flushItem();
        currentItem = [numMatch[2]!.trim()];
        continue;
      }
      // Continuation line — append to current item if it's substantive text
      if (currentItem && t.length > 3 && !/^(Key|Finding|Business|Impact|Pain|Compliance|Regulatory|requirements|improvements|Packing)$/i.test(t)) {
        currentItem.push(t);
      }
    }
  }
  flushItem();

  // Also scan entire page for prose-pattern pain triggers (single-line items)
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 20 || t.length > 320) continue;
    if (/(Proposed|Solution|Benefit|Adoption|Implementation\s*Effort|Process:)/i.test(t)) continue;
    for (const rx of PAIN_PROSE_TRIGGERS) {
      if (rx.test(t)) {
        out.add(t.slice(0, 320));
        break;
      }
    }
  }

  return Array.from(out).slice(0, 30);
}

// -------------------------------------------------------------
// Reference extraction (tcodes / notes / tables / reports)
// -------------------------------------------------------------

interface ExtractedRef {
  referenceType: string;
  referenceCode: string;
  context: string;
  pageNumber: number;
}

function extractReferences(page: PageContent): ExtractedRef[] {
  const out = new Map<string, ExtractedRef>(); // dedup key: type+code
  const text = page.rawText;
  function add(type: string, code: string, idx: number) {
    const key = `${type}::${code}`;
    if (out.has(key)) return;
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + 60);
    const ctx = text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 240);
    out.set(key, { referenceType: type, referenceCode: code, context: ctx, pageNumber: page.pageNumber });
  }

  // SAP Notes
  let m;
  while ((m = NOTE_RX.exec(text)) !== null) {
    add("SAP_NOTE", `Note ${m[1]}`, m.index);
  }
  NOTE_RX.lastIndex = 0;

  // Transaction codes — only count those with known prefix
  TCODE_FREE_RX.lastIndex = 0;
  while ((m = TCODE_FREE_RX.exec(text)) !== null) {
    const candidate = m[1]!;
    const prefix2 = candidate.slice(0, 2);
    const prefix3 = candidate.slice(0, 3);
    if (SAP_TCODE_PREFIXES.has(prefix2) || SAP_TCODE_PREFIXES.has(prefix3)) {
      add("TRANSACTION_CODE", candidate, m.index);
    }
  }

  // Table names
  for (const t of KNOWN_SAP_TABLES) {
    const rx = new RegExp(`\\b${t}\\b`, "g");
    let mm;
    while ((mm = rx.exec(text)) !== null) {
      add("TABLE_NAME", t, mm.index);
      break; // only one per page per table to avoid noise
    }
  }

  // Reports (RFITEMxx etc.)
  REPORT_RX.lastIndex = 0;
  while ((m = REPORT_RX.exec(text)) !== null) {
    add("REPORT_ID", m[1]!, m.index);
  }

  // Fiori app IDs (F1234)
  FIORI_RX.lastIndex = 0;
  while ((m = FIORI_RX.exec(text)) !== null) {
    add("FIORI_APP", m[1]!, m.index);
  }

  // BAdIs
  BADI_RX.lastIndex = 0;
  while ((m = BADI_RX.exec(text)) !== null) {
    add("BADI", m[1]!, m.index);
  }

  // Function modules / BAPIs
  FUNCTION_RX.lastIndex = 0;
  while ((m = FUNCTION_RX.exec(text)) !== null) {
    add("FUNCTION_MODULE", m[1]!, m.index);
  }

  return Array.from(out.values());
}

// -------------------------------------------------------------
// Main orchestrator
// -------------------------------------------------------------

async function main(): Promise<void> {
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  const guide = await prisma.brownfieldGuide.findFirst({
    where: { sourceDocument: "TIME_App2b_Process_Assessment.pdf" },
    select: { id: true, sha256: true },
  });
  if (!guide) throw new Error("App 2(b) BrownfieldGuide not found");
  console.log(`[deep-extract] Assessment: ${assessment.id}`);
  console.log(`[deep-extract] Guide: ${guide.id} (sha256 ${guide.sha256.slice(0, 12)}...)`);

  console.log(`[deep-extract] Reading PDF ...`);
  const fullText = await extractText(PDF_PATH);
  const pages = splitPages(fullText);
  console.log(`[deep-extract] Got ${pages.length} pages`);

  // 1. Per-page classification
  console.log(`[deep-extract] Classifying every page ...`);
  const classifications = pages.map(classifyPage);
  await prisma.app2bPageClassification.deleteMany({ where: { guideId: guide.id } });
  // Insert in chunks
  for (let i = 0; i < classifications.length; i += 100) {
    const slice = classifications.slice(i, i + 100);
    await prisma.app2bPageClassification.createMany({
      data: slice.map((c) => ({
        guideId: guide.id,
        pageNumber: c.pageNumber,
        pageTypes: c.pageTypes,
        detectedProcessNames: c.detectedProcessNames,
        linkedProcessIds: [],
        pageTitle: c.pageTitle,
        textExcerpt: c.textExcerpt,
        classificationConfidence: c.classificationConfidence,
      })),
    });
  }
  const typeStats: Record<string, number> = {};
  for (const c of classifications) for (const t of c.pageTypes) typeStats[t] = (typeStats[t] ?? 0) + 1;
  console.log(`[deep-extract] Classified ${classifications.length} pages`);
  console.log(`[deep-extract] Page-type distribution:`);
  for (const [t, n] of Object.entries(typeStats).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(20)} ${n}`);
  }

  // 2. Process headers + canonical grouping (REUSE existing CustomerProcess rows; don't delete)
  const allOccurrences: ProcessOccurrence[] = [];
  for (const p of pages) allOccurrences.push(...detectHeaders(p));
  const canonical = groupCanonical(allOccurrences, pages);
  console.log(`[deep-extract] Detected ${allOccurrences.length} process headers → ${canonical.size} canonical processes`);

  // Refresh painPoints + page-text on existing CustomerProcess rows
  const existingProcs = await prisma.customerProcess.findMany({
    where: { assessmentId: assessment.id },
    select: { id: true, processName: true },
  });
  const procByName = new Map<string, string>(); // displayName → id
  for (const p of existingProcs) procByName.set(p.processName, p.id);

  // 3. Re-extract pain points (prose + numbered) per process; update existing rows
  console.log(`[deep-extract] Re-extracting pain points (prose + numbered) ...`);
  let painUpdates = 0;
  for (const c of canonical.values()) {
    const displayName = c.rtmId ? `${c.cleanedProcessName} (${c.rtmId})` : c.cleanedProcessName;
    const procId = procByName.get(displayName);
    if (!procId) continue;
    const allText = Array.from(c.pageTexts.values()).join("\n\n");
    const painPoints = extractPainPoints(allText);
    if (painPoints.length === 0) continue;
    await prisma.customerProcess.update({
      where: { id: procId },
      data: { painPoints },
    });
    painUpdates++;
  }
  console.log(`[deep-extract] Updated painPoints on ${painUpdates} processes`);

  // 4. Extract To-Be Options + scoring
  console.log(`[deep-extract] Extracting To-Be options + scoring ...`);
  await prisma.customerProcessOption.deleteMany({
    where: { customerProcess: { assessmentId: assessment.id } },
  });
  let optionsInserted = 0;
  for (const c of canonical.values()) {
    const displayName = c.rtmId ? `${c.cleanedProcessName} (${c.rtmId})` : c.cleanedProcessName;
    const procId = procByName.get(displayName);
    if (!procId) continue;
    for (const occ of c.occurrences) {
      if (occ.direction !== "TO_BE") continue;
      const pageText = c.pageTexts.get(occ.pageNumber);
      if (!pageText) continue;
      const opt = extractOptionFromPage(occ, pageText);
      if (!opt) continue;
      await prisma.customerProcessOption.create({
        data: {
          customerProcessId: procId,
          optionLabel: opt.optionLabel,
          optionNumber: opt.optionNumber,
          optionType: opt.optionType,
          variantLabel: opt.variantLabel,
          adoptionComplexity: opt.adoptionComplexity,
          priorityToImplement: opt.priorityToImplement,
          implementationEffort: opt.implementationEffort,
          organizationChanges: opt.organizationChanges,
          scoringComments: opt.scoringComments,
          proposedSolutionBullets: opt.proposedSolutionBullets,
          keyBenefitsBullets: opt.keyBenefitsBullets,
          sourcePage: opt.sourcePage,
        },
      });
      optionsInserted++;
    }
  }
  console.log(`[deep-extract] Inserted ${optionsInserted} CustomerProcessOption rows`);

  // 5. Reference extraction (tcodes / notes / tables / reports / BAdIs)
  console.log(`[deep-extract] Extracting transaction codes, SAP Notes, tables, reports, BAdIs, fn modules ...`);
  await prisma.customerProcessReference.deleteMany({ where: { guideId: guide.id } });
  let refsInserted = 0;
  // Build pageNumber → process IDs map (for FK linkage)
  const pageToProcessIds = new Map<number, string[]>();
  for (const c of canonical.values()) {
    const displayName = c.rtmId ? `${c.cleanedProcessName} (${c.rtmId})` : c.cleanedProcessName;
    const procId = procByName.get(displayName);
    if (!procId) continue;
    for (const pg of c.pageRefs) {
      const list = pageToProcessIds.get(pg) ?? [];
      list.push(procId);
      pageToProcessIds.set(pg, list);
    }
  }
  for (const page of pages) {
    const refs = extractReferences(page);
    if (refs.length === 0) continue;
    const procIds = pageToProcessIds.get(page.pageNumber) ?? [null];
    for (const ref of refs) {
      // Insert one row per (page, ref) — link to first process if any
      try {
        await prisma.customerProcessReference.create({
          data: {
            customerProcessId: procIds[0] ?? null,
            guideId: guide.id,
            pageNumber: page.pageNumber,
            referenceType: ref.referenceType,
            referenceCode: ref.referenceCode,
            context: ref.context,
          },
        });
        refsInserted++;
      } catch {
        // duplicate (unique constraint) — ignore
      }
    }
  }
  console.log(`[deep-extract] Inserted ${refsInserted} CustomerProcessReference rows`);
  const refStats = await prisma.customerProcessReference.groupBy({
    by: ["referenceType"],
    where: { guideId: guide.id },
    _count: { id: true },
  });
  console.log(`[deep-extract] Reference distribution:`);
  for (const r of refStats.sort((a, b) => b._count.id - a._count.id)) {
    console.log(`    ${r.referenceType.padEnd(20)} ${r._count.id}`);
  }

  console.log(``);
  console.log(`[deep-extract] Done. Coverage proof:`);
  const totalPagesClassified = await prisma.app2bPageClassification.count({ where: { guideId: guide.id } });
  console.log(`  Pages classified : ${totalPagesClassified} / 614 (${(totalPagesClassified / 614 * 100).toFixed(1)}%)`);
  console.log(`  Options w/ scoring: ${optionsInserted}`);
  console.log(`  References extracted: ${refsInserted}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[deep-extract] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
