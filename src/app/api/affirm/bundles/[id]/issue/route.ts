/**
 * POST /api/affirm/bundles/[id]/issue — transition DRAFT -> ISSUED.
 *
 * Snapshots the in-scope L2 questions onto the bundle (via the
 * AffirmBundleQuestion join) so a later question-bank edit cannot
 * mutate what the client sees.
 *
 * v2 (CCC follow-up §4): the 15 SAP-excluded rows are kept in the
 * record but ARRIVE PRE-DISABLED (enabled=false). The client view
 * filters by enabled=true; the consultant editor sees them so the
 * audit record is complete.
 *
 * Defensive: this endpoint is idempotent with respect to the editor
 * pre-materialization (the editor page may pre-create rows in DRAFT
 * state). We `upsert` per join row so editor edits — wording flips,
 * format toggles, disables — are preserved through issue.
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

    // All in-scope questions, including excluded — excluded come in
    // disabled (enabled=false) so they live in the audit record without
    // being shown to the client.
    const questions = await tx.affirmQuestion.findMany({
      where: {
        scopeItemRefs: { hasSome: scopeIds },
      },
      select: { id: true, status: true, displayOrder: true, format: true },
    });

    // Upsert per row so editor-state (wording, format, displayOrder,
    // enabled) is preserved if the consultant already opened the editor.
    for (const q of questions) {
      const isExcluded = q.status === "excluded";
      await tx.affirmBundleQuestion.upsert({
        where: {
          bundleId_questionId: { bundleId: id, questionId: q.id },
        },
        update: {}, // editor's choices win on issue
        create: {
          bundleId: id,
          questionId: q.id,
          enabled: !isExcluded,
          displayOrder: q.displayOrder,
          // v2.1: SAP default format from the question bank. Consultant
          // override on the join row wins after first edit.
          format: q.format,
        },
      });
    }

    await tx.affirmBundle.update({
      where: { id },
      data: { state: "issued", issuedAt: new Date() },
    });

    const enabledCount = await tx.affirmBundleQuestion.count({
      where: { bundleId: id, enabled: true },
    });
    const disabledCount = questions.length - enabledCount;

    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "issued",
        actorId: user.id,
        payload: {
          totalQuestions: questions.length,
          enabledQuestions: enabledCount,
          disabledQuestions: disabledCount,
        },
      },
    });

    return { ok: true as const, questions: enabledCount, totalSnapshot: questions.length };
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
  return NextResponse.json({
    ok: true,
    questions: result.questions,
    totalSnapshot: result.totalSnapshot,
  });
}
