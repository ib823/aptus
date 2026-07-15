/**
 * ABeam Workbench — Affirm chapterization pipeline (PR-2).
 *
 * For each scope item in the 2 pilot value streams (lead-to-cash, source-to-pay)
 * that has MY-mandatory process steps, groups the ordered steps into business
 * chapters and emits a REVIEWABLE draft JSON per stream at
 *   curation-model/chapters/<streamId>.json
 *
 * The draft carries mechanically-generated (de-jargonized) chapter titles/
 * summaries and a draft story, each item flagged `reviewed: false`. A human
 * (or this build's curation pass) edits the copy and flips `reviewed: true`;
 * scripts/import-process-chapters.ts then loads the JSON and stamps
 * reviewedAt/reviewedById for the reviewed items.
 *
 * The SAP-verbatim AffirmProcessStep.activity is NEVER written here — only step
 * RANGES and newly-authored text.
 *
 * Usage:  tsx scripts/chapterize-process-flows.ts
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import {
  draftChapterSummary,
  draftChapterTitle,
  groupStepsIntoChapters,
  type ChapterStepInput,
} from "../src/lib/affirm/chapterize";

const PILOT_STREAMS = ["lead-to-cash", "source-to-pay"];
const SOURCE_ATTRIBUTION = "SAP Best Practices, S/4HANA Cloud Public Edition 2602";
const OUT_DIR = join(process.cwd(), "curation-model", "chapters");

const prisma = new PrismaClient();

interface DraftChapter {
  chapterNumber: number;
  title: string;
  summary: string;
  stepStart: number;
  stepEnd: number;
  roles: string[];
  fioriApps: string[];
  benefitNote: string | null;
}

interface DraftStory {
  headline: string;
  outcomeBullets: string[];
  kpiHints: string[];
  integrationNotes: string[];
  sourceAttribution: string;
  processNavigatorUrl: string | null;
}

interface DraftItem {
  scopeItemId: string;
  description: string;
  reviewed: boolean;
  story: DraftStory;
  chapters: DraftChapter[];
}

async function integrationNotesFor(scopeCode: string): Promise<string[]> {
  try {
    const rows = await prisma.sapHubContent.findMany({
      where: { scopeItemCodes: { has: scopeCode } },
      select: { title: true },
      take: 3,
    });
    return rows.map((r) => r.title);
  } catch {
    return [];
  }
}

async function buildStreamDraft(streamId: string): Promise<DraftItem[]> {
  const items = await prisma.affirmScopeItem.findMany({
    where: { streamId, flow: { isNot: null } },
    select: { id: true, description: true },
    orderBy: { id: "asc" },
  });

  const drafts: DraftItem[] = [];
  for (const item of items) {
    const steps = await prisma.affirmProcessStep.findMany({
      where: { scopeItemId: item.id },
      orderBy: { stepNumber: "asc" },
      select: { stepNumber: true, activity: true, fioriApps: true },
    });
    if (steps.length === 0) continue; // no MY steps → flat-strip fallback, no chapters

    const ranges = groupStepsIntoChapters(steps as ChapterStepInput[]);
    const chapters: DraftChapter[] = ranges.map((r, i) => ({
      chapterNumber: i + 1,
      title: draftChapterTitle(r),
      summary: draftChapterSummary(r),
      stepStart: r.stepStart,
      stepEnd: r.stepEnd,
      // Role source is not available in the step data; left empty for the
      // reviewer to fill rather than fabricated. See BUILD-LOG.
      roles: [],
      fioriApps: Array.from(new Set(r.steps.flatMap((s) => s.fioriApps))).sort(),
      benefitNote: null,
    }));

    drafts.push({
      scopeItemId: item.id,
      description: item.description,
      reviewed: false,
      story: {
        headline: `How ${item.description.toLowerCase()} runs, end to end`,
        outcomeBullets: [],
        kpiHints: [],
        integrationNotes: await integrationNotesFor(item.id),
        sourceAttribution: SOURCE_ATTRIBUTION,
        // Left null rather than guessing the Process Navigator URL shape.
        processNavigatorUrl: null,
      },
      chapters,
    });
  }
  return drafts;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const streamId of PILOT_STREAMS) {
    const items = await buildStreamDraft(streamId);
    const payload = {
      streamId,
      sourceAttribution: SOURCE_ATTRIBUTION,
      itemCount: items.length,
      items,
    };
    const outPath = join(OUT_DIR, `${streamId}.json`);
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    const chaptered = items.reduce((n, i) => n + i.chapters.length, 0);
    console.log(`[chapterize] ${streamId}: ${items.length} items, ${chaptered} chapters → ${outPath}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
