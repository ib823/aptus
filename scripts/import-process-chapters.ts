/**
 * ABeam Workbench — Affirm chaptered-content importer CLI (PR-2).
 *
 * Thin wrapper over src/lib/affirm/chapters-import.ts. Loads the reviewable
 * chapter/story JSON (generated drafts + curated overlay) from
 * curation-model/chapters/ and upserts AffirmProcessChapter +
 * AffirmScopeItemStory. Reviewed (curated) items are stamped
 * reviewedAt/reviewedById; drafts import unreviewed and never render on /a/*.
 *
 * Usage:
 *   tsx scripts/import-process-chapters.ts --reviewed-by <userEmailOrId>
 * The --reviewed-by user is required whenever any item is `reviewed: true`.
 */

import { PrismaClient } from "@prisma/client";
import { importChapters, loadMergedCuration } from "../src/lib/affirm/chapters-import";

const prisma = new PrismaClient();

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const reviewedItems = loadMergedCuration().filter((i) => i.reviewed);

  let reviewerId: string | null = null;
  if (reviewedItems.length > 0) {
    const who = argValue("--reviewed-by");
    if (!who) {
      throw new Error(
        `--reviewed-by <userEmailOrId> is required (${reviewedItems.length} reviewed items to stamp)`,
      );
    }
    const user =
      (await prisma.user.findUnique({ where: { id: who }, select: { id: true } })) ??
      (await prisma.user.findUnique({ where: { email: who }, select: { id: true } }));
    if (!user) throw new Error(`--reviewed-by user not found: ${who}`);
    reviewerId = user.id;
  }

  const result = await importChapters(prisma, { reviewerId });
  console.log(
    `[import-chapters] imported ${result.items} items, ${result.chapters} chapters, ${result.reviewed} reviewed`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
