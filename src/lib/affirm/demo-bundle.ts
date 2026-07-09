/**
 * Shared demo-bundle provisioning for the affirm training sandbox.
 *
 * Ensures a single re-testable demo bundle named "DEMO · Lead to Cash"
 * exists in ISSUED state, scoped to the whole Lead-to-Cash value stream,
 * with its in-scope questions snapshot. If one already exists it is
 * rewound to ISSUED and its answers wiped so the sandbox is always a
 * clean start.
 *
 * This mirrors the create/reissue logic in /api/dev/seed-affirm but is
 * callable from an authenticated in-app endpoint (no dev secret), so a
 * logged-in workbench user can spin up the sample without swapping their
 * own session. Requires the value-stream master data to already be
 * seeded (returns { error: "no_master_data" } if not).
 */

import { prisma } from "@/lib/db/prisma";

export const DEMO_BUNDLE_NAME = "DEMO · Lead to Cash";
const DEMO_STREAM_ID = "lead-to-cash";

export type EnsureDemoResult =
  | { ok: true; id: string; created: boolean; questionCount: number }
  | { ok: false; error: "no_master_data" };

export async function ensureDemoBundle(ownerId: string): Promise<EnsureDemoResult> {
  // Guard: the demo needs the value-stream master data in place.
  const scopeCount = await prisma.affirmScopeItem.count();
  if (scopeCount === 0) return { ok: false, error: "no_master_data" };

  const existing = await prisma.affirmBundle.findFirst({
    where: { client: DEMO_BUNDLE_NAME },
    orderBy: { createdAt: "desc" },
    select: { id: true, state: true, _count: { select: { questions: true } } },
  });

  if (existing) {
    // Rewind to a clean, open (issued) state so the sandbox is re-runnable.
    if (existing.state !== "issued") {
      await prisma.$transaction(async (tx) => {
        await tx.affirmResponse.deleteMany({ where: { bundleId: existing.id } });
        await tx.affirmBundle.update({
          where: { id: existing.id },
          data: { state: "issued", submittedAt: null, releasedAt: null, releasedById: null },
        });
        await tx.affirmEvent.create({
          data: {
            bundleId: existing.id,
            type: "seed_refresh",
            actorId: ownerId,
            payload: { sandbox: true },
          },
        });
      });
    }
    return { ok: true, id: existing.id, created: false, questionCount: existing._count.questions };
  }

  // Build a fresh demo bundle scoped to the whole Lead-to-Cash stream.
  const scope = await prisma.affirmScopeItem.findMany({
    where: { streamId: DEMO_STREAM_ID },
    select: { id: true },
  });
  const scopeIds = scope.map((s) => s.id);

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.create({
      data: { client: DEMO_BUNDLE_NAME, state: "draft", createdById: ownerId },
    });
    if (scope.length) {
      await tx.affirmBundleScopeItem.createMany({
        data: scope.map((s) => ({ bundleId: bundle.id, scopeItemId: s.id })),
        skipDuplicates: true,
      });
    }
    await tx.affirmEvent.create({
      data: {
        bundleId: bundle.id,
        type: "bundle_created",
        actorId: ownerId,
        payload: { scopeCount: scope.length, sandbox: true },
      },
    });

    const questions = scopeIds.length
      ? await tx.affirmQuestion.findMany({
          where: {
            OR: [
              { scopeItemRefs: { hasSome: scopeIds } },
              { scopeItemRefs: { isEmpty: true }, streamId: { in: [DEMO_STREAM_ID] } },
            ],
          },
          select: { id: true, status: true, displayOrder: true, format: true },
        })
      : [];
    if (questions.length) {
      await tx.affirmBundleQuestion.createMany({
        data: questions.map((q) => ({
          bundleId: bundle.id,
          questionId: q.id,
          enabled: q.status !== "excluded",
          displayOrder: q.displayOrder,
          format: q.format,
        })),
        skipDuplicates: true,
      });
    }
    await tx.affirmBundle.update({
      where: { id: bundle.id },
      data: { state: "issued", issuedAt: new Date() },
    });
    await tx.affirmEvent.create({
      data: {
        bundleId: bundle.id,
        type: "issued",
        actorId: ownerId,
        payload: { questionCount: questions.length, sandbox: true },
      },
    });
    return { id: bundle.id, questionCount: questions.length };
  });

  return { ok: true, id: result.id, created: true, questionCount: result.questionCount };
}
