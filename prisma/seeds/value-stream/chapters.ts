/**
 * Seeds the Affirm chaptered process content (PR-2) from the committed
 * reviewable JSON in curation-model/chapters/. Idempotent (chapters replaced,
 * stories upserted). Ensures a system reviewer so curated stories pass the
 * render gate. A missing/empty curation dir is a no-op (returns zeros).
 */

import type { PrismaClient } from "@prisma/client";
import { importChapters, loadMergedCuration } from "../../../src/lib/affirm/chapters-import";

const SYSTEM_REVIEWER_EMAIL = "affirm-curation@abeam.local";

export async function seedChapters(prisma: PrismaClient): Promise<{
  items: number;
  chapters: number;
  reviewed: number;
}> {
  const hasReviewed = loadMergedCuration().some((i) => i.reviewed);
  let reviewerId: string | null = null;
  if (hasReviewed) {
    const reviewer = await prisma.user.upsert({
      where: { email: SYSTEM_REVIEWER_EMAIL },
      update: {},
      create: { email: SYSTEM_REVIEWER_EMAIL, name: "Affirm Curation", role: "consultant" },
      select: { id: true },
    });
    reviewerId = reviewer.id;
  }
  return importChapters(prisma, { reviewerId });
}
