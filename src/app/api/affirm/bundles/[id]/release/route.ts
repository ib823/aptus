/**
 * POST /api/affirm/bundles/[id]/release — THE GATE.
 *
 * Transition SUBMITTED -> RELEASED. The only path that produces a signed
 * affirmation record and a Fit-to-Standard workshop agenda. Anything
 * generated here is held server-side; the consultant sends to the
 * client manually (master prompt §6 — "all client delivery is manual,
 * no auto-send, ever").
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { assertTransition } from "@/lib/affirm/bundle";
import { buildAgenda, buildSignedRecord, type QuestionContext } from "@/lib/affirm/agenda";
import type { AffirmChoice } from "@/lib/affirm/types";

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
      include: {
        questions: {
          include: {
            question: {
              include: {
                stream: { select: { name: true } },
                subProcess: { select: { name: true } },
              },
            },
          },
        },
        responses: {
          select: { questionId: true, choice: true, reason: true },
        },
      },
    });
    if (!bundle) return { error: "not_found" as const };
    try {
      assertTransition(bundle.state as never, "released");
    } catch {
      return { error: "illegal_transition" as const };
    }

    const ctxRows: QuestionContext[] = bundle.questions.map((bq) => ({
      id: bq.question.id,
      sapVerbatim: bq.question.sapVerbatim,
      consultantWording: bq.question.consultantWording,
      plainLanguageSuggested: bq.question.plainLanguageSuggested,
      sapArea: bq.question.sapArea,
      sapTopic: bq.question.sapTopic,
      subProcessName: bq.question.subProcess.name,
      streamName: bq.question.stream.name,
      status: bq.question.status,
    }));

    const releasedAt = new Date();
    const agenda = buildAgenda(
      ctxRows,
      bundle.responses.map((r) => ({
        questionId: r.questionId,
        choice: r.choice as AffirmChoice,
        reason: r.reason,
      })),
    );
    const signedRecord = buildSignedRecord(
      bundle.client,
      ctxRows,
      bundle.responses.map((r) => ({
        questionId: r.questionId,
        choice: r.choice as AffirmChoice,
        reason: r.reason,
      })),
      releasedAt,
      user.id,
    );

    await tx.affirmBundle.update({
      where: { id },
      data: {
        state: "released",
        releasedAt,
        releasedById: user.id,
        signedRecordJson: signedRecord as never,
        agendaJson: agenda as never,
        questionSnapshotJson: ctxRows as never,
      },
    });
    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "released",
        actorId: user.id,
        payload: {
          totals: signedRecord.totals,
          agendaCounts: {
            fastConfirm: agenda.fastConfirm.length,
            discuss: agenda.discuss.length,
            deviations: agenda.deviations.length,
          },
        },
      },
    });

    return { ok: true as const, totals: signedRecord.totals };
  });

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
