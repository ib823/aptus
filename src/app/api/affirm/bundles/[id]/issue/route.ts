/**
 * POST /api/affirm/bundles/[id]/issue — transition DRAFT -> ISSUED.
 *
 * Snapshots the in-scope L2 questions onto the bundle (via the
 * AffirmBundleQuestion join) so a later question-bank edit cannot
 * mutate what the client sees. Excluded questions are filtered here —
 * they never appear in the client view per master-prompt caveat 1.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { assertTransition } from "@/lib/affirm/bundle";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id },
      include: { scopeItems: { select: { scopeItemId: true } } },
    });
    if (!bundle) return { error: "not_found" as const };
    try {
      assertTransition(bundle.state as never, "issued");
    } catch {
      return { error: "illegal_transition" as const };
    }

    const scopeIds = bundle.scopeItems.map((s) => s.scopeItemId);
    if (scopeIds.length === 0) {
      return { error: "empty_scope" as const };
    }

    // Snapshot non-excluded in-scope questions.
    const questions = await tx.affirmQuestion.findMany({
      where: {
        status: { not: "excluded" },
        scopeItemRefs: { hasSome: scopeIds },
      },
      select: { id: true },
    });

    await tx.affirmBundleQuestion.deleteMany({ where: { bundleId: id } });
    if (questions.length) {
      await tx.affirmBundleQuestion.createMany({
        data: questions.map((q) => ({ bundleId: id, questionId: q.id })),
        skipDuplicates: true,
      });
    }

    await tx.affirmBundle.update({
      where: { id },
      data: { state: "issued", issuedAt: new Date() },
    });
    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "issued",
        actorId: user.id,
        payload: { questionCount: questions.length },
      },
    });

    return { ok: true as const, questions: questions.length };
  });

  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "empty_scope"
          ? 400
          : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, questions: result.questions });
}
