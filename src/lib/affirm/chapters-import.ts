/**
 * ABeam Workbench — Affirm chaptered-content import core (PR-2).
 *
 * Shared by scripts/import-process-chapters.ts (CLI) and the seed
 * (prisma/seeds/value-stream/chapters.ts) so a fresh `db:seed` reproduces the
 * committed chaptered content. Reads the reviewable JSON from
 * curation-model/chapters/ (generated drafts + the hand-authored curated
 * overlay), merges (curated overrides by scopeItemId), and upserts
 * AffirmProcessChapter + AffirmScopeItemStory.
 *
 * Review gate: a story is stamped reviewedAt/reviewedById only when its JSON
 * entry is `reviewed: true` (curated items). Unreviewed drafts import with
 * reviewedAt = null and never render on /a/*.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";

const PILOT_STREAMS = ["lead-to-cash", "source-to-pay"];

export interface CuratedChapter {
  chapterNumber: number;
  title: string;
  summary: string;
  stepStart: number;
  stepEnd: number;
  roles: string[];
  fioriApps: string[];
  benefitNote: string | null;
}
export interface CuratedStory {
  headline: string;
  outcomeBullets: string[];
  kpiHints: string[];
  integrationNotes: string[];
  sourceAttribution: string;
  processNavigatorUrl: string | null;
}
export interface CuratedItem {
  scopeItemId: string;
  description: string;
  reviewed: boolean;
  story: CuratedStory;
  chapters: CuratedChapter[];
}

export function curationDir(): string {
  return join(process.cwd(), "curation-model", "chapters");
}

function loadItems(dir: string, file: string): CuratedItem[] {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, file), "utf8")) as { items?: CuratedItem[] };
    return parsed.items ?? [];
  } catch {
    return [];
  }
}

/** Merge generated drafts with the curated overlay (curated wins by scopeItemId). */
export function loadMergedCuration(dir = curationDir()): CuratedItem[] {
  const merged = new Map<string, CuratedItem>();
  for (const stream of PILOT_STREAMS) {
    for (const item of loadItems(dir, `${stream}.json`)) merged.set(item.scopeItemId, item);
  }
  for (const item of loadItems(dir, "curated.json")) merged.set(item.scopeItemId, item);
  return [...merged.values()];
}

export interface ImportResult {
  items: number;
  chapters: number;
  reviewed: number;
}

/**
 * Upsert chapters + stories for every curation item whose scope item exists.
 * `reviewerId` is stamped on reviewed stories; pass null only when there are no
 * reviewed items (otherwise those stories import unreviewed).
 */
export async function importChapters(
  prisma: PrismaClient,
  opts: { reviewerId: string | null; now?: Date; dir?: string },
): Promise<ImportResult> {
  const items = loadMergedCuration(opts.dir ?? curationDir());
  const now = opts.now ?? new Date();
  let chapters = 0;
  let reviewed = 0;

  for (const item of items) {
    const exists = await prisma.affirmScopeItem.findUnique({
      where: { id: item.scopeItemId },
      select: { id: true },
    });
    if (!exists) continue;

    await prisma.$transaction(async (tx) => {
      await tx.affirmProcessChapter.deleteMany({ where: { scopeItemId: item.scopeItemId } });
      if (item.chapters.length > 0) {
        await tx.affirmProcessChapter.createMany({
          data: item.chapters.map((c) => ({ scopeItemId: item.scopeItemId, ...c })),
        });
      }
      chapters += item.chapters.length;

      const storyData = {
        headline: item.story.headline,
        outcomeBullets: item.story.outcomeBullets,
        kpiHints: item.story.kpiHints,
        integrationNotes: item.story.integrationNotes,
        sourceAttribution: item.story.sourceAttribution,
        processNavigatorUrl: item.story.processNavigatorUrl,
        reviewedAt: item.reviewed ? now : null,
        reviewedById: item.reviewed ? opts.reviewerId : null,
      };
      await tx.affirmScopeItemStory.upsert({
        where: { scopeItemId: item.scopeItemId },
        create: { scopeItemId: item.scopeItemId, ...storyData },
        update: storyData,
      });
    });

    if (item.reviewed) reviewed += 1;
  }

  return { items: items.length, chapters, reviewed };
}
