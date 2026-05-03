/**
 * Generic PDF → BrownfieldGuide ingester.
 *
 * Stores the PDF as bytea + parses its TOC into BrownfieldGuideSection rows.
 * Idempotent via SHA-256 of the binary content.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/brownfield-pdf-guide-adapter.ts <pdf-path> \
 *       --title "Conversion Guide for SAP S/4HANA Cloud Private Edition 2025" \
 *       [--source-url <https://...>] \
 *       [--catalog-id <id>] \
 *       [--industry-tag BANKING] \
 *       [--conversion-path BROWNFIELD_SUM]
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { basename } from "path";
import { prisma } from "../../src/lib/db/prisma";

const pExecFile = promisify(execFile);

interface ParsedSection {
  sectionRef: string;
  title: string;
  pageStart: number;
  depth: number;
  parentRef: string | null;
  sequence: number;
}

/**
 * Run pdftotext with -layout, return the text. Page-tracking via -f/-l
 * one-page-at-a-time would be slow on a 1500-page PDF, so we use -layout
 * and rely on the TOC's printed page numbers (from the dot-leader trailer
 * common in SAP-published guides).
 */
async function extractText(pdfPath: string): Promise<{ text: string; numPages: number }> {
  const { stdout: rawText } = await pExecFile("pdftotext", ["-layout", pdfPath, "-"]);
  const { stdout: infoStdout } = await pExecFile("pdfinfo", [pdfPath]);
  const pagesMatch = /^Pages:\s+(\d+)/m.exec(infoStdout);
  const numPages = pagesMatch ? Number(pagesMatch[1]) : 0;
  return { text: rawText, numPages };
}

/**
 * Parse the table-of-contents region of a SAP-style PDF. The TOC entries
 * have the canonical shape:
 *
 *   "1.2.3.   Section Title ............ 42"
 *
 * (any number of dot-separated digits, optional trailing dot, then title,
 * then a dot-leader, then a 1-3 digit page number)
 *
 * Anything before the first TOC entry and after the last TOC entry is
 * skipped. The TOC region usually starts after the cover page and ends
 * before the first body chapter heading (which is the same text as the
 * first TOC entry but WITHOUT a dot-leader).
 */
function parseToc(text: string): ParsedSection[] {
  // Match TOC lines with dot-leader + page number trailer.
  // SAP-published guides use either tight dot-leaders ("....") OR
  // sparse dots ("\. \. \. ") — accept both. The section ref allows trailing
  // period (e.g. "2.1.") OR none ("2.1"). The page number is 1–4 digits.
  const TOC_LINE_RX = /^\s*([0-9]+(?:\.[0-9]+)*)\.?\s+(.+?)\s+(?:\.\s*){3,}\s*(\d{1,4})\s*$/;
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  // Track last-seen sequence per parent for sibling ordering
  const seqByParent = new Map<string, number>();

  for (const line of lines) {
    const m = TOC_LINE_RX.exec(line);
    if (!m) continue;
    const sectionRef = m[1]!;
    const title = m[2]!.trim();
    const pageStart = Number.parseInt(m[3]!, 10);
    if (!Number.isFinite(pageStart)) continue;
    if (title.length < 2) continue; // skip noise
    if (title.length > 250) continue; // skip lines that aren't TOC

    const parts = sectionRef.split(".").filter((p) => p.length > 0);
    const depth = parts.length;
    const parentRef = depth > 1 ? parts.slice(0, -1).join(".") : null;
    const parentKey = parentRef ?? "(root)";
    const seq = (seqByParent.get(parentKey) ?? 0) + 1;
    seqByParent.set(parentKey, seq);

    sections.push({
      sectionRef,
      title,
      pageStart,
      depth,
      parentRef,
      sequence: seq,
    });
  }

  return sections;
}

interface IngestOptions {
  title: string;
  sourceUrl?: string;
  catalogId?: string;
  industryTag?: string;
  conversionPath?: string;
  notes?: string;
}

export async function runPdfGuideIngest(
  pdfPath: string,
  options: IngestOptions,
): Promise<{ guideId: string; sectionCount: number; reused: boolean }> {
  console.log(`[pdf-guide] Reading ${pdfPath}`);
  const buf = await readFile(pdfPath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  console.log(`[pdf-guide] sha256=${sha256}  size=${buf.byteLength.toLocaleString()} bytes`);

  // Idempotency check
  const existing = await prisma.brownfieldGuide.findUnique({
    where: { sha256 },
    include: { _count: { select: { sections: true } } },
  });
  if (existing) {
    console.log(
      `[pdf-guide] Guide already ingested as ${existing.id} ("${existing.title}", ${existing._count.sections} sections). No-op.`,
    );
    return { guideId: existing.id, sectionCount: existing._count.sections, reused: true };
  }

  // Resolve catalog
  let catalogId = options.catalogId ?? null;
  if (!catalogId) {
    const latest = await prisma.brownfieldCatalogVersion.findFirst({
      where: { isActive: true },
      orderBy: { ingestedAt: "desc" },
    });
    if (latest) catalogId = latest.id;
  }

  console.log(`[pdf-guide] Extracting text + TOC ...`);
  const { text, numPages } = await extractText(pdfPath);
  console.log(`[pdf-guide] PDF has ${numPages} pages, ${text.length.toLocaleString()} chars`);

  const sections = parseToc(text);
  console.log(`[pdf-guide] Parsed ${sections.length} TOC sections`);

  // Insert guide
  const guide = await prisma.brownfieldGuide.create({
    data: {
      catalogVersionId: catalogId,
      title: options.title,
      sourceDocument: basename(pdfPath),
      sourceUrl: options.sourceUrl ?? null,
      mimeType: "application/pdf",
      fileSizeBytes: buf.byteLength,
      sha256,
      content: buf,
      industryTag: options.industryTag ?? null,
      conversionPath: options.conversionPath ?? null,
      notes: options.notes ?? null,
    },
  });
  console.log(`[pdf-guide] Created BrownfieldGuide ${guide.id}`);

  // Insert sections; resolve parent refs in two passes (FK self-reference)
  if (sections.length > 0) {
    const refToId = new Map<string, string>();
    // First pass: insert with parentSectionId=null
    for (const s of sections) {
      const created = await prisma.brownfieldGuideSection.create({
        data: {
          guideId: guide.id,
          sectionRef: s.sectionRef,
          title: s.title,
          pageStart: s.pageStart,
          depth: s.depth,
          sequence: s.sequence,
        },
      });
      refToId.set(s.sectionRef, created.id);
    }
    // Second pass: backfill parent links
    let parentLinked = 0;
    for (const s of sections) {
      if (!s.parentRef) continue;
      const parentId = refToId.get(s.parentRef);
      if (!parentId) continue;
      const childId = refToId.get(s.sectionRef);
      if (!childId) continue;
      await prisma.brownfieldGuideSection.update({
        where: { id: childId },
        data: { parentSectionId: parentId },
      });
      parentLinked++;
    }
    // Third pass: derive pageEnd as next sibling's pageStart - 1 (sibling = same parent)
    const allSections = await prisma.brownfieldGuideSection.findMany({
      where: { guideId: guide.id },
      orderBy: { pageStart: "asc" },
      select: { id: true, pageStart: true },
    });
    for (let i = 0; i < allSections.length; i++) {
      const cur = allSections[i]!;
      const next = allSections[i + 1];
      const pageEnd = next ? Math.max(cur.pageStart, next.pageStart - 1) : numPages;
      if (pageEnd && pageEnd >= cur.pageStart) {
        await prisma.brownfieldGuideSection.update({
          where: { id: cur.id },
          data: { pageEnd },
        });
      }
    }
    console.log(
      `[pdf-guide] Inserted ${sections.length} sections (${parentLinked} parent-linked, pageEnd backfilled)`,
    );
  }

  return { guideId: guide.id, sectionCount: sections.length, reused: false };
}

if (process.argv[1] && process.argv[1].endsWith("brownfield-pdf-guide-adapter.ts")) {
  const args = process.argv.slice(2);
  const pdfPath = args[0];
  if (!pdfPath || pdfPath.startsWith("--")) {
    console.error(
      "Usage: tsx scripts/ingest/brownfield-pdf-guide-adapter.ts <pdf-path> --title 'Title' [--source-url URL] [--catalog-id ID] [--industry-tag TAG] [--conversion-path TAG]",
    );
    process.exit(1);
  }

  function getArg(name: string): string | undefined {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1] : undefined;
  }

  const title = getArg("--title");
  if (!title) {
    console.error("Missing required --title");
    process.exit(1);
  }

  const opts: IngestOptions = { title };
  const su = getArg("--source-url");
  const ci = getArg("--catalog-id");
  const it = getArg("--industry-tag");
  const cp = getArg("--conversion-path");
  const nt = getArg("--notes");
  if (su) opts.sourceUrl = su;
  if (ci) opts.catalogId = ci;
  if (it) opts.industryTag = it;
  if (cp) opts.conversionPath = cp;
  if (nt) opts.notes = nt;

  runPdfGuideIngest(pdfPath, opts)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[pdf-guide] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
