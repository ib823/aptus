/**
 * POST /api/affirm/bundles/[id]/questions — add a consultant-added
 * custom question to the bundle.
 *
 * Body: {
 *   subProcessId: string,
 *   wording: string,
 *   format?: "decision" | "information",
 *   aboutText?: string,
 *   standardMeans?: string
 * }
 *
 * Creates an AffirmQuestion with isCustom=true + createdById=user.id,
 * then creates the AffirmBundleQuestion join row. The question is
 * always visibly marked "consultant-added, not from SAP" in the UI.
 *
 * Custom questions have no sapVerbatim. They appear under the chosen
 * sub-process in the editor and on the client view.
 *
 * Available while bundle.state is "draft" OR "issued".
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

const PostBody = z.object({
  subProcessId: z.string().trim().min(1),
  wording: z.string().trim().min(1).max(4000),
  format: z.enum(["decision", "information"]).default("decision"),
  aboutText: z.string().max(4000).nullable().optional(),
  standardMeans: z.string().max(4000).nullable().optional(),
});

function isEditable(state: string): boolean {
  return state === "draft" || state === "issued";
}

function customQuestionId(): string {
  // CUSTOM-<uuid> to distinguish from the SAP-numbered L2-NNN ids.
  return `CUSTOM-${randomUUID().slice(0, 8)}`;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const parsed = PostBody.safeParse(await req.json().catch(() => ({})));
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

    const sub = await tx.affirmSubProcess.findUnique({
      where: { id: parsed.data.subProcessId },
      select: { id: true, streamId: true },
    });
    if (!sub) return { error: "invalid_sub_process" as const };

    // Find the largest displayOrder in this sub-process so the new
    // question slots at the end.
    const last = await tx.affirmBundleQuestion.findFirst({
      where: { bundleId: id, question: { subProcessId: sub.id } },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });
    const nextOrder = (last?.displayOrder ?? 0) + 10;

    const questionId = customQuestionId();
    await tx.affirmQuestion.create({
      data: {
        id: questionId,
        streamId: sub.streamId,
        subProcessId: sub.id,
        scopeItemRefs: [],
        sapVerbatim: null,
        plainLanguageSuggested: parsed.data.wording,
        consultantWording: parsed.data.wording,
        aboutText: parsed.data.aboutText ?? null,
        standardMeans: parsed.data.standardMeans ?? null,
        status: "confirmed",
        flag: null,
        isCustom: true,
        createdById: user.id,
        displayOrder: nextOrder,
      },
    });
    await tx.affirmBundleQuestion.create({
      data: {
        bundleId: id,
        questionId,
        enabled: true,
        displayOrder: nextOrder,
        format: parsed.data.format,
      },
    });

    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "custom_question_added",
        actorId: user.id,
        payload: {
          questionId,
          subProcessId: sub.id,
          format: parsed.data.format,
        },
      },
    });

    return { ok: true as const, questionId };
  });

  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "invalid_sub_process"
          ? 400
          : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, questionId: result.questionId }, { status: 201 });
}
