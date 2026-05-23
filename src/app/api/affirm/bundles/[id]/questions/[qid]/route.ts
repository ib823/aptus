/**
 * PUT    /api/affirm/bundles/[id]/questions/[qid]
 * DELETE /api/affirm/bundles/[id]/questions/[qid]
 *
 * Consultant question-editor mutations (v2 §4):
 *
 *   PUT body: {
 *     consultantWording?: string,
 *     aboutText?: string,
 *     standardMeans?: string,
 *     format?: "decision" | "information",
 *     enabled?: boolean,
 *     displayOrder?: number
 *   }
 *
 * Wording / aboutText / standardMeans persist on AffirmQuestion (the
 * question content). format / enabled / displayOrder persist on
 * AffirmBundleQuestion (the per-bundle join row).
 *
 * Locked, always: sapVerbatim is never editable; SAP questions
 * (isCustom=false) are never deletable — DELETE returns 422 unless
 * the question is consultant-added. Disable via PUT { enabled:false }
 * instead.
 *
 * Available while bundle.state is "draft" OR "issued" (consultant can
 * keep curating until the client submits). Rejected on submitted /
 * released.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

const PutBody = z.object({
  consultantWording: z.string().max(4000).nullable().optional(),
  aboutText: z.string().max(4000).nullable().optional(),
  standardMeans: z.string().max(4000).nullable().optional(),
  format: z.enum(["decision", "information"]).optional(),
  enabled: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
});

function isEditable(state: string): boolean {
  return state === "draft" || state === "issued";
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; qid: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, qid } = await ctx.params;

  const parsed = PutBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.format() },
      { status: 400 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id },
      select: { state: true },
    });
    if (!bundle) return { error: "not_found" as const };
    if (!isEditable(bundle.state)) return { error: "locked" as const };

    const link = await tx.affirmBundleQuestion.findUnique({
      where: { bundleId_questionId: { bundleId: id, questionId: qid } },
      include: { question: { select: { id: true } } },
    });
    if (!link) return { error: "not_in_bundle" as const };

    // 1. Question content (locked: sapVerbatim).
    const contentUpdate: Record<string, string | null> = {};
    if (parsed.data.consultantWording !== undefined) {
      contentUpdate.consultantWording = parsed.data.consultantWording;
    }
    if (parsed.data.aboutText !== undefined) {
      contentUpdate.aboutText = parsed.data.aboutText;
    }
    if (parsed.data.standardMeans !== undefined) {
      contentUpdate.standardMeans = parsed.data.standardMeans;
    }
    if (Object.keys(contentUpdate).length) {
      await tx.affirmQuestion.update({
        where: { id: qid },
        data: contentUpdate,
      });
    }

    // 2. Join-row controls.
    const joinUpdate: Record<string, string | boolean | number> = {};
    if (parsed.data.format !== undefined) joinUpdate.format = parsed.data.format;
    if (parsed.data.enabled !== undefined) joinUpdate.enabled = parsed.data.enabled;
    if (parsed.data.displayOrder !== undefined) {
      joinUpdate.displayOrder = parsed.data.displayOrder;
    }
    if (Object.keys(joinUpdate).length) {
      await tx.affirmBundleQuestion.update({
        where: { bundleId_questionId: { bundleId: id, questionId: qid } },
        data: joinUpdate,
      });
    }

    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "question_edited",
        actorId: user.id,
        payload: {
          questionId: qid,
          fields: [...Object.keys(contentUpdate), ...Object.keys(joinUpdate)],
        },
      },
    });

    return { ok: true as const };
  });

  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "not_in_bundle"
          ? 404
          : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; qid: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, qid } = await ctx.params;

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id },
      select: { state: true },
    });
    if (!bundle) return { error: "not_found" as const };
    if (!isEditable(bundle.state)) return { error: "locked" as const };

    const link = await tx.affirmBundleQuestion.findUnique({
      where: { bundleId_questionId: { bundleId: id, questionId: qid } },
      include: { question: { select: { isCustom: true } } },
    });
    if (!link) return { error: "not_in_bundle" as const };

    // SAP questions are never deletable — only disable.
    if (!link.question.isCustom) {
      return { error: "sap_question_not_deletable" as const };
    }

    await tx.affirmBundleQuestion.delete({
      where: { bundleId_questionId: { bundleId: id, questionId: qid } },
    });
    // Also delete the custom question record itself; it's bundle-scoped.
    await tx.affirmQuestion.delete({ where: { id: qid } });

    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "custom_question_deleted",
        actorId: user.id,
        payload: { questionId: qid },
      },
    });

    return { ok: true as const };
  });

  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "not_in_bundle"
          ? 404
          : result.error === "sap_question_not_deletable"
            ? 422
            : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
