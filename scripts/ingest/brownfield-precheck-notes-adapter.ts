/**
 * Pre-Check Notes ingest — parses the SAP Note 2502552 umbrella (saved as
 * markdown from me.sap.com) into PreCheckNote rows, scoped to the most
 * recent BrownfieldCatalogVersion (or one passed as --catalog-id).
 *
 * Source structure (line-based):
 *   - Header (lines 1-N): metadata for the umbrella note itself
 *   - "additional notes that are delivered as prerequisites" — simple
 *     `noteId<TAB>title` table → role=PREREQUISITE_AUTO
 *   - "Prerequisites" table — full `softwareComponent | from | to | noteId
 *     | title | component` → role=PREREQUISITE
 *   - "This document refers to" → role=REFERENCES
 *   - "This document is referenced by" → role=REFERENCED_BY
 *
 * Idempotent via the @@unique([sapNoteId, role, catalogVersionId]) constraint.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/brownfield-precheck-notes-adapter.ts \
 *       /workspaces/aptus/Conversion/2502552_PreCheckNotes_Umbrella.md
 *   $ pnpm tsx scripts/ingest/brownfield-precheck-notes-adapter.ts \
 *       <md-path> --catalog-id <BrownfieldCatalogVersion-id>
 */

import { readFile } from "fs/promises";
import { prisma } from "../../src/lib/db/prisma";

const UMBRELLA_NOTE_ID = "2502552";
const NOTE_URL_PREFIX = "https://me.sap.com/notes/";

interface PreCheckNoteInput {
  sapNoteId: string;
  role: string;
  parentNoteId: string | null;
  title: string | null;
  component: string | null;
  softwareComponent: string | null;
  releaseFrom: string | null;
  releaseTo: string | null;
}

function pad7(noteId: string): string {
  const clean = noteId.replace(/^0+/, "").trim();
  return clean.padStart(7, "0");
}

function dedupeByKey<T>(rows: T[], key: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(key(r), r);
  return Array.from(map.values());
}

interface Section {
  start: number;
  end: number;
}

/** Find the line range of a labeled section by exact line text (or trim-equality). */
function findSection(lines: string[], headingPredicate: (line: string) => boolean, endPredicate: (line: string) => boolean): Section | null {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingPredicate(lines[i]!)) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (endPredicate(lines[i]!)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function parseUmbrellaNote(text: string): PreCheckNoteInput {
  // Title and component live in the second/third lines of the markdown.
  const lines = text.split("\n");
  let title: string | null = null;
  let component: string | null = null;
  for (const line of lines.slice(0, 6)) {
    if (/^2502552\s*-/.test(line.trim())) {
      title = line.trim();
    }
    const compMatch = /^Component:\s*([A-Z0-9-]+)/.exec(line.trim());
    if (compMatch) component = compMatch[1] ?? null;
  }
  return {
    sapNoteId: pad7(UMBRELLA_NOTE_ID),
    role: "UMBRELLA",
    parentNoteId: null,
    title,
    component,
    softwareComponent: null,
    releaseFrom: null,
    releaseTo: null,
  };
}

/**
 * Parses the small auto-prerequisite list (the "additional notes that are
 * delivered as prerequisites" block). Lines are `<noteId><TAB><title>`.
 */
function parseAutoPrerequisites(lines: string[]): PreCheckNoteInput[] {
  const start = lines.findIndex((l) =>
    l.includes("additional notes that are delivered as prerequisites"),
  );
  if (start === -1) return [];
  const out: PreCheckNoteInput[] = [];
  // Walk forward until we hit a blank line followed by non-data content.
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") {
      // Blank line ends the block (the change-log / "Review the change log…" follows).
      const next = lines[i + 1]?.trim() ?? "";
      if (next === "" || /^Review the change log/.test(next)) break;
      continue;
    }
    // Match `<7-digit-id><whitespace><title>`
    const m = /^(\d{7})\s+(.+)$/.exec(line);
    if (!m) continue;
    out.push({
      sapNoteId: pad7(m[1]!),
      role: "PREREQUISITE_AUTO",
      parentNoteId: pad7(UMBRELLA_NOTE_ID),
      title: m[2]!,
      component: null,
      softwareComponent: null,
      releaseFrom: null,
      releaseTo: null,
    });
  }
  return out;
}

/**
 * Parses the big "Prerequisites" table:
 *   `Software Component<TAB>From<TAB>To<TAB>SAP Note/KBA<TAB>Title<TAB>Component`
 * The header row appears once; data rows continue until the next non-tabular line.
 */
function parsePrerequisitesTable(lines: string[]): PreCheckNoteInput[] {
  const headerIdx = lines.findIndex(
    (l) =>
      l.trim().startsWith("Software Component") &&
      l.includes("SAP Note/KBA") &&
      l.includes("Component"),
  );
  if (headerIdx === -1) return [];
  const out: PreCheckNoteInput[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const cols = line.split("\t");
    if (cols.length < 6) {
      // End of table (next textual block — "This document refers to" etc.)
      if (line.trim() === "" || /^This document/.test(line.trim())) break;
      continue;
    }
    const swc = cols[0]!.trim();
    const from = cols[1]!.trim();
    const to = cols[2]!.trim();
    const noteId = cols[3]!.trim();
    const title = cols[4]!.trim();
    const component = cols[5]!.trim();
    if (!/^\d{7}$/.test(noteId)) continue;
    out.push({
      sapNoteId: pad7(noteId),
      role: "PREREQUISITE",
      parentNoteId: pad7(UMBRELLA_NOTE_ID),
      title,
      component: component || null,
      softwareComponent: swc || null,
      releaseFrom: from || null,
      releaseTo: to || null,
    });
  }
  return out;
}

/**
 * Parses the trailing "This document refers to" and "This document is
 * referenced by" tables. Both have header `SAP Note/KBA<TAB>Component<TAB>Title`.
 */
function parseTrailingTables(lines: string[]): PreCheckNoteInput[] {
  const out: PreCheckNoteInput[] = [];
  const refersStart = lines.findIndex((l) =>
    l.trim() === "This document refers to",
  );
  const referencedByStart = lines.findIndex((l) =>
    l.trim() === "This document is referenced by",
  );
  const blocks: Array<{ start: number; end: number; role: string }> = [];
  if (refersStart !== -1) {
    blocks.push({
      start: refersStart,
      end: referencedByStart === -1 ? lines.length : referencedByStart,
      role: "REFERENCES",
    });
  }
  if (referencedByStart !== -1) {
    blocks.push({ start: referencedByStart, end: lines.length, role: "REFERENCED_BY" });
  }
  for (const b of blocks) {
    // Skip the heading and the column header
    for (let i = b.start + 2; i < b.end; i++) {
      const line = lines[i]!;
      if (line.trim() === "") continue;
      const cols = line.split("\t");
      if (cols.length < 1) continue;
      const noteId = cols[0]?.trim() ?? "";
      if (!/^\d{7}$/.test(noteId)) continue;
      const component = cols[1]?.trim() ?? "";
      const title = cols[2]?.trim() ?? "";
      out.push({
        sapNoteId: pad7(noteId),
        role: b.role,
        parentNoteId: pad7(UMBRELLA_NOTE_ID),
        title: title || null,
        component: component || null,
        softwareComponent: null,
        releaseFrom: null,
        releaseTo: null,
      });
    }
  }
  return out;
}

export async function runPreCheckNotesIngest(
  mdPath: string,
  catalogId?: string,
): Promise<void> {
  console.log(`[brownfield-precheck-notes] Reading ${mdPath}`);
  const text = await readFile(mdPath, "utf8");
  const lines = text.split("\n");

  let resolvedCatalogId = catalogId ?? null;
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
    console.log(`[brownfield-precheck-notes] Pinning to catalog ${latest.id} (${latest.label ?? "no label"})`);
  }

  const umbrella = parseUmbrellaNote(text);
  const autoPrereqs = parseAutoPrerequisites(lines);
  const prereqs = parsePrerequisitesTable(lines);
  const trailing = parseTrailingTables(lines);

  console.log(
    `[brownfield-precheck-notes] Parsed: umbrella=1 autoPrereqs=${autoPrereqs.length} prereqs=${prereqs.length} trailing=${trailing.length}`,
  );

  const all = [umbrella, ...autoPrereqs, ...prereqs, ...trailing];
  // Dedup by composite (noteId, role, softwareComponent, releaseFrom, releaseTo)
  // — matches the schema's unique key. Preserves per-SWC grain.
  const deduped = dedupeByKey(
    all,
    (r) =>
      `${r.sapNoteId}::${r.role}::${r.softwareComponent ?? ""}::${r.releaseFrom ?? ""}::${r.releaseTo ?? ""}`,
  );

  const data = deduped.map((r) => ({
    catalogVersionId: resolvedCatalogId,
    sapNoteId: r.sapNoteId,
    role: r.role,
    parentNoteId: r.parentNoteId,
    title: r.title,
    component: r.component,
    softwareComponent: r.softwareComponent,
    releaseFrom: r.releaseFrom,
    releaseTo: r.releaseTo,
    url: `${NOTE_URL_PREFIX}${r.sapNoteId.replace(/^0+/, "")}`,
  }));

  const result = await prisma.preCheckNote.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(
    `[brownfield-precheck-notes] Inserted ${result.count} PreCheckNote rows (deduped from ${all.length})`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("brownfield-precheck-notes-adapter.ts")) {
  const args = process.argv.slice(2);
  const mdPath = args[0];
  if (!mdPath) {
    console.error(
      "Usage: tsx scripts/ingest/brownfield-precheck-notes-adapter.ts <markdown-path> [--catalog-id <id>]",
    );
    process.exit(1);
  }
  const catalogIdx = args.indexOf("--catalog-id");
  const catalogId = catalogIdx >= 0 ? args[catalogIdx + 1] : undefined;
  runPreCheckNotesIngest(mdPath, catalogId)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[brownfield-precheck-notes] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
