/**
 * Brownfield narrative ingest — parses the SAP-published Simplification List
 * PDF (e.g. SIMPL_OP2025.pdf) into per-item narrative rows.
 *
 * The PDF complements the SIC database extract: SIC carries structured
 * metadata + automated check rules; the PDF carries the human-readable
 * "Symptom / Description / Solution / Required Actions / How to Determine
 * Relevancy / Transport behavior" sections that consultants need.
 *
 * Strategy:
 *   1. Run pdftotext -layout to get plain text
 *   2. Skip past the TOC (entries with ....... <page> dot-leader trailers)
 *   3. Walk the body, splitting on item headers:
 *        ^(\d+(?:\.\d+)+)\.\s+(SAP_PREFIX)\s+-\s+TITLE$
 *      where SAP_PREFIX ∈ {S4TWL, ABAPTWL, ABAP4TWL, BW4SL, …}
 *   4. For each item block, split by section headings into named columns
 *   5. Match the item to a SimplificationItem row (titleEn ≈ PDF title) via
 *      a series of fallbacks: exact, prefix-stripped, case-folded contains
 *   6. Upsert SimplificationItemNarrative; log unmatched items for review
 *   7. Post-pass: install/refresh the FTS column + GIN index on the
 *      SimplificationItemNarrative table
 *
 * Idempotent — re-running with the same PDF replaces narratives by FK.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/brownfield-narrative-adapter.ts \
 *       /workspaces/aptus/Conversion/SIMPL_OP2025.pdf
 *   $ pnpm tsx scripts/ingest/brownfield-narrative-adapter.ts \
 *       <pdf-path> --catalog-id <id>
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { prisma } from "../../src/lib/db/prisma";

const pExecFile = promisify(execFile);

const SAP_PREFIXES = [
  "S4TWL",
  "ABAPTWL",
  "ABAP4TWL",
  "BW4SL",
  "S4HUR",
  "S4HCM",
  "S4ECP",
  "MDS_TWL",
  "FINTWL",
];

// Section headings (in canonical capitalization). Order matters: longest
// substrings first so "Required and Recommended Action(s)" doesn't match
// inside "How to Determine Relevancy" if both happen on one line (they don't,
// but defensive).
const SECTIONS = [
  { key: "applicationComponent", header: "Application Component:" },
  { key: "relatedNotesRaw", header: "Related Notes:" },
  { key: "symptomMd", header: "Symptom" },
  { key: "descriptionMd", header: "Description" },
  { key: "solutionMd", header: "Solution" },
  { key: "businessProcessImpactMd", header: "Business Process related information" },
  { key: "requiredActionMd", header: "Required and Recommended Action(s)" },
  { key: "relevancyMd", header: "How to Determine Relevancy" },
  { key: "transportBehaviorMd", header: "Transport behavior" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

interface ParsedItem {
  sectionRef: string; // e.g. "2.1.1"
  prefix: string;     // e.g. "S4TWL"
  title: string;      // e.g. "End of Support for Pool Tables"
  fullTitleForMatch: string; // "S4TWL - End of Support for Pool Tables"
  rawText: string;    // entire item block
  sections: Partial<Record<SectionKey, string>>;
  additionalSections: string[]; // unmapped section headings + their content
}

// -------------------------------------------------------------
// PDF → text
// -------------------------------------------------------------

async function extractText(pdfPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "narrative-"));
  const txtPath = join(dir, "out.txt");
  await pExecFile("pdftotext", ["-layout", pdfPath, txtPath]);
  const text = await readFile(txtPath, "utf8");
  await rm(dir, { recursive: true, force: true });
  return text;
}

// -------------------------------------------------------------
// Item header detection
// -------------------------------------------------------------

/**
 * Header pattern: one or more dot-separated digits, then a dot+space, then a
 * SAP prefix, then " - ", then a title that does NOT end with a TOC-style
 * dot-leader + page number.
 *
 * Examples:
 *   "2.1.1. ABAPTWL - End of Support for Pool Tables"      ← BODY (capture)
 *   "2.1.1. ABAPTWL - End of Support for Pool Tables ..... 30"   ← TOC (skip)
 */
const HEADER_RX = new RegExp(
  String.raw`^\s*(\d+(?:\.\d+)+)\.\s+(${SAP_PREFIXES.join("|")})\s+-\s+(.+?)\s*$`,
);

/** True if the line is a TOC entry (has dot-leader + trailing page number). */
function isTocLine(line: string): boolean {
  return /\.{4,}\s*\d+\s*$/.test(line);
}

/** Page-footer / page-header noise we strip from item bodies. */
const NOISE_PATTERNS: RegExp[] = [
  /^Page \| \d+\s*$/i,
  /^Simplification List for SAP S\/4HANA.*$/i,
  /^.*Feature Pack Stack.*$/i,
];

function isNoise(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false; // blank lines are kept (paragraph separators)
  return NOISE_PATTERNS.some((rx) => rx.test(t));
}

// -------------------------------------------------------------
// Section splitting within an item block
// -------------------------------------------------------------

/**
 * Walk the item's lines. A "section heading" is a line whose trimmed content
 * exactly matches one of the SECTIONS[].header strings. Content runs until
 * the next section heading (or end of block).
 *
 * Sub-headings we don't recognize are accumulated into additionalSections so
 * no narrative content is lost.
 */
function splitItemSections(rawText: string, title: string): {
  sections: Partial<Record<SectionKey, string>>;
  additionalSections: string[];
} {
  const lines = rawText.split("\n");
  const sections: Partial<Record<SectionKey, string>> = {};
  const additionalSections: string[] = [];
  let currentKey: SectionKey | null = null;
  let currentExtraTitle: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (currentKey) {
      const text = buffer.join("\n").trim();
      if (text.length > 0) sections[currentKey] = text;
    } else if (currentExtraTitle) {
      const text = buffer.join("\n").trim();
      if (text.length > 0) {
        additionalSections.push(`### ${currentExtraTitle}\n\n${text}`);
      }
    }
    buffer = [];
  }

  // Skip the first line (the item header itself) when computing sections.
  let started = false;
  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    if (!started) {
      // The very first non-empty line is the item header line itself
      if (trimmed.length > 0) started = true;
      continue;
    }

    // Try to match a known section heading on its own line
    const matchedSection = SECTIONS.find((s) => trimmed === s.header);
    if (matchedSection) {
      flush();
      currentKey = matchedSection.key;
      currentExtraTitle = null;
      continue;
    }

    // "Application Component: BC-DWB-DIC" — same line, value follows the colon
    if (trimmed.startsWith("Application Component:")) {
      flush();
      const value = trimmed.slice("Application Component:".length).trim();
      sections.applicationComponent = value;
      currentKey = null;
      currentExtraTitle = null;
      continue;
    }

    // Heuristic for "minor section heading" — short single-line non-noise text
    // followed by a blank line, with no leading punctuation. We DON'T promote
    // these because the noise rate is too high; they get rolled into the
    // current section's text. Keep simple and let the column store everything
    // verbatim — extra sections are only created when explicitly captured.

    if (isNoise(line)) continue;

    buffer.push(line);
  }
  flush();

  // Sanity: ensure rawText hasn't been entirely lost (defensive)
  if (
    !sections.symptomMd &&
    !sections.solutionMd &&
    !sections.descriptionMd &&
    !sections.requiredActionMd &&
    additionalSections.length === 0
  ) {
    // Item had no recognized sections — store everything as descriptionMd
    sections.descriptionMd = rawText.trim();
  }

  return { sections, additionalSections };
}

/**
 * "Related Notes:" subsection has a tabular form:
 *
 *   Note Type            Note Number    Note Description
 *   Business Impact      0002577406     End of support for pool tables...
 *
 * We capture it as JSON for structured display.
 */
function parseRelatedNotes(rawNotes: string): Array<{ noteType: string; noteNumber: string; noteDescription: string }> {
  const out: Array<{ noteType: string; noteNumber: string; noteDescription: string }> = [];
  const lines = rawNotes.split("\n");
  let inHeader = false;
  let lastEntry: { noteType: string; noteNumber: string; noteDescription: string } | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (trimmed === "" || isNoise(line)) {
      if (lastEntry && trimmed === "") inHeader = false; // blank line ends current entry
      continue;
    }
    // Detect "Note Type ... Note Number ... Note Description" header line
    if (/Note\s+Type\s+Note\s+Number\s+Note\s+Description/i.test(trimmed)) {
      inHeader = true;
      continue;
    }
    if (!inHeader) continue;
    // A new entry starts when the line begins with a known note type AND has a 10-digit number
    const m = /^(Business Impact|Pre-Check|Side-Effect|Other)\s+(\d{6,10})\s+(.+)$/i.exec(trimmed);
    if (m) {
      lastEntry = {
        noteType: m[1]!.trim(),
        noteNumber: m[2]!.padStart(10, "0"),
        noteDescription: m[3]!.trim(),
      };
      out.push(lastEntry);
    } else if (lastEntry) {
      // Continuation of the previous entry's description (wrapped lines)
      lastEntry.noteDescription = (lastEntry.noteDescription + " " + trimmed).trim();
    }
  }
  return out;
}

// -------------------------------------------------------------
// Walking the PDF text → ParsedItem[]
// -------------------------------------------------------------

function parseItems(text: string): { items: ParsedItem[]; tocEnd: number } {
  const lines = text.split("\n");
  // Find the boundary between TOC and body. Heuristic: the first line that
  // matches HEADER_RX AND is NOT a TOC line.
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = HEADER_RX.exec(line);
    if (m && !isTocLine(line)) {
      bodyStart = i;
      break;
    }
  }

  // Walk body, collecting items
  const items: ParsedItem[] = [];
  let current: ParsedItem | null = null;
  let buffer: string[] = [];

  function commit() {
    if (!current) return;
    current.rawText = buffer.join("\n").trim();
    const split = splitItemSections(current.rawText, current.title);
    current.sections = split.sections;
    current.additionalSections = split.additionalSections;
    items.push(current);
    buffer = [];
  }

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    if (isTocLine(line)) continue;
    const m = HEADER_RX.exec(line);
    if (m) {
      const sectionRef = m[1]!;
      const prefix = m[2]!;
      const title = m[3]!.trim();
      // Some TOC-style dot-leaders sneak into body lines; skip those defensively
      if (/\.{4,}\s*\d+\s*$/.test(title)) continue;
      commit();
      current = {
        sectionRef,
        prefix,
        title,
        fullTitleForMatch: `${prefix} - ${title}`,
        rawText: "",
        sections: {},
        additionalSections: [],
      };
      buffer.push(line);
      continue;
    }
    if (current) buffer.push(line);
  }
  commit();
  return { items, tocEnd: bodyStart };
}

// -------------------------------------------------------------
// Title matching against SimplificationItem rows
// -------------------------------------------------------------

interface SicRow {
  id: string;
  titleEn: string;
  normalizedTitle: string;
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[–—]/g, "-") // en-dash, em-dash → hyphen
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 \-_/]/g, "")
    .trim();
}

function buildTitleIndex(rows: SicRow[]): {
  exact: Map<string, SicRow>;
  contains: Map<string, SicRow>;
} {
  const exact = new Map<string, SicRow>();
  const contains = new Map<string, SicRow>();
  for (const r of rows) {
    const norm = r.normalizedTitle;
    exact.set(norm, r);
    // Strip the "PREFIX - " wrap so we can match by the trailing title alone
    const stripped = norm.replace(/^[a-z0-9_]+\s*-\s*/, "").trim();
    if (stripped.length > 5 && !contains.has(stripped)) {
      contains.set(stripped, r);
    }
  }
  return { exact, contains };
}

function matchToSic(
  item: ParsedItem,
  index: { exact: Map<string, SicRow>; contains: Map<string, SicRow> },
): SicRow | null {
  const fullNorm = normalizeTitle(item.fullTitleForMatch);
  const exact = index.exact.get(fullNorm);
  if (exact) return exact;
  const titleNorm = normalizeTitle(item.title);
  const contains = index.contains.get(titleNorm);
  if (contains) return contains;
  // Last-ditch: contains-substring against full SIC titles
  for (const [norm, row] of index.exact.entries()) {
    if (norm.includes(titleNorm) && titleNorm.length > 10) return row;
  }
  return null;
}

// -------------------------------------------------------------
// FTS column + GIN index (post-ingest)
// -------------------------------------------------------------

async function setupFts(): Promise<void> {
  // Idempotent: add the column if missing, refresh the GIN index, populate it.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'SimplificationItemNarrative'
          AND column_name = 'search_vector'
      ) THEN
        EXECUTE $sql$
          ALTER TABLE "SimplificationItemNarrative"
          ADD COLUMN search_vector tsvector
            GENERATED ALWAYS AS (
              setweight(to_tsvector('english', coalesce("symptomMd",'')), 'A') ||
              setweight(to_tsvector('english', coalesce("descriptionMd",'')), 'A') ||
              setweight(to_tsvector('english', coalesce("solutionMd",'')), 'B') ||
              setweight(to_tsvector('english', coalesce("requiredActionMd",'')), 'B') ||
              setweight(to_tsvector('english', coalesce("relevancyMd",'')), 'C') ||
              setweight(to_tsvector('english', coalesce("transportBehaviorMd",'')), 'C') ||
              setweight(to_tsvector('english', coalesce("businessProcessImpactMd",'')), 'D') ||
              setweight(to_tsvector('english', coalesce("rawTextMd",'')), 'D')
            ) STORED
        $sql$;
      END IF;
    END$$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS simpl_narrative_search_idx
      ON "SimplificationItemNarrative" USING GIN(search_vector);
  `);
}

// -------------------------------------------------------------
// Orchestrator
// -------------------------------------------------------------

export async function runNarrativeIngest(
  pdfPath: string,
  options: { catalogId?: string } = {},
): Promise<void> {
  console.log(`[brownfield-narrative] Reading ${pdfPath}`);

  let resolvedCatalogId = options.catalogId ?? null;
  if (!resolvedCatalogId) {
    const latest = await prisma.brownfieldCatalogVersion.findFirst({
      where: { isActive: true },
      orderBy: { ingestedAt: "desc" },
    });
    if (!latest) {
      throw new Error(
        "No active BrownfieldCatalogVersion exists. Run brownfield-sic-adapter.ts first or pass --catalog-id.",
      );
    }
    resolvedCatalogId = latest.id;
    console.log(`[brownfield-narrative] Pinning to catalog ${latest.id} (${latest.label ?? "no label"})`);
  }

  const text = await extractText(pdfPath);
  console.log(`[brownfield-narrative] Extracted ${text.length.toLocaleString()} chars from PDF`);

  const { items: parsed } = parseItems(text);
  console.log(`[brownfield-narrative] Parsed ${parsed.length} items from PDF body`);

  // Load all SIC rows for matching
  const sicRows = await prisma.simplificationItem.findMany({
    where: { catalogVersionId: resolvedCatalogId },
    select: { id: true, titleEn: true },
  });
  const indexedRows: SicRow[] = sicRows.map((r) => ({
    id: r.id,
    titleEn: r.titleEn,
    normalizedTitle: normalizeTitle(r.titleEn),
  }));
  const titleIndex = buildTitleIndex(indexedRows);
  console.log(`[brownfield-narrative] Loaded ${sicRows.length} SIC items for matching`);

  const sourceDocument = `SIMPL_OP2025.pdf v1.36 2026-02-18`;
  let matched = 0;
  const unmatched: ParsedItem[] = [];
  let upserted = 0;

  // Cache to detect duplicate matches (one SIC item shouldn't get 2 narratives)
  const seenSicIds = new Set<string>();

  for (const item of parsed) {
    const sic = matchToSic(item, titleIndex);
    if (!sic) {
      unmatched.push(item);
      continue;
    }
    matched++;
    if (seenSicIds.has(sic.id)) {
      // Duplicate match — skip (the first match wins). Log for review.
      console.log(`[brownfield-narrative] WARN: duplicate match for SIC ${sic.id} ("${sic.titleEn}") — second item ignored: ${item.fullTitleForMatch}`);
      continue;
    }
    seenSicIds.add(sic.id);

    const relatedNotes = item.sections.relatedNotesRaw
      ? parseRelatedNotes(item.sections.relatedNotesRaw)
      : [];

    const baseData = {
      sourceDocument,
      sectionRef: item.sectionRef,
      applicationComponent: item.sections.applicationComponent ?? null,
      symptomMd: item.sections.symptomMd ?? null,
      descriptionMd: item.sections.descriptionMd ?? null,
      solutionMd: item.sections.solutionMd ?? null,
      businessProcessImpactMd: item.sections.businessProcessImpactMd ?? null,
      requiredActionMd: item.sections.requiredActionMd ?? null,
      relevancyMd: item.sections.relevancyMd ?? null,
      transportBehaviorMd: item.sections.transportBehaviorMd ?? null,
      additionalSectionsMd:
        item.additionalSections.length > 0 ? item.additionalSections.join("\n\n") : null,
      rawTextMd: item.rawText,
    };
    const relatedNotesField =
      relatedNotes.length > 0 ? { relatedNotesJson: relatedNotes } : {};
    await prisma.simplificationItemNarrative.upsert({
      where: { simplificationItemId: sic.id },
      create: { simplificationItemId: sic.id, ...baseData, ...relatedNotesField },
      update: { ...baseData, ...relatedNotesField, parsedAt: new Date() },
    });
    upserted++;
  }

  console.log(`[brownfield-narrative] Matched ${matched} of ${parsed.length} parsed items (${unmatched.length} unmatched)`);
  console.log(`[brownfield-narrative] Upserted ${upserted} narrative rows`);

  if (unmatched.length > 0) {
    const logPath = "/workspaces/aptus/logs/brownfield-narrative-unmatched.txt";
    const lines = unmatched.map(
      (u) => `${u.sectionRef}\t${u.prefix} - ${u.title}`,
    );
    await writeFile(logPath, lines.join("\n"));
    console.log(`[brownfield-narrative] Wrote ${unmatched.length} unmatched titles to ${logPath} (sample: ${unmatched.slice(0, 3).map((u) => u.fullTitleForMatch).join(" | ")})`);
  }

  console.log(`[brownfield-narrative] Setting up FTS column + index ...`);
  await setupFts();
  console.log(`[brownfield-narrative] FTS ready.`);
}

if (process.argv[1] && process.argv[1].endsWith("brownfield-narrative-adapter.ts")) {
  const args = process.argv.slice(2);
  const pdfPath = args[0];
  if (!pdfPath) {
    console.error(
      "Usage: tsx scripts/ingest/brownfield-narrative-adapter.ts <pdf-path> [--catalog-id <id>]",
    );
    process.exit(1);
  }
  const catalogIdx = args.indexOf("--catalog-id");
  const opts: { catalogId?: string } = {};
  const ci = catalogIdx >= 0 ? args[catalogIdx + 1] : undefined;
  if (ci) opts.catalogId = ci;
  runNarrativeIngest(pdfPath, opts)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[brownfield-narrative] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
