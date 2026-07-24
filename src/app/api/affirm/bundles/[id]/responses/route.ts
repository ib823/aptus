/**
 * PUT /api/affirm/bundles/[id]/responses — upsert a single response.
 *
 * Body: { questionId: string, choice: "standard"|"discuss"|"deviate",
 *         reason?: string }
 *
 * Available only while the bundle is ISSUED. Submitted sealed bundles
 * reject further writes. The "deviate" branch requires a reason; the
 * server enforces it independently of the UI.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { validateChoiceReason } from "@/lib/affirm/bundle";
import { requireAffirmBundleAccess } from "@/lib/affirm/authz";

const Body = z.object({
  questionId: z.string().trim().min(1),
  choice: z.enum(["standard", "discuss", "deviate"]),
  reason: z.string().trim().max(2000).nullable().optional(),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireAffirmBundleAccess(id, user);
  if (!access.ok) return access.response;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const reasonCheck = validateChoiceReason(
    parsed.data.choice,
    parsed.data.reason ?? null,
  );
  if (!reasonCheck.ok) {
    return NextResponse.json({ error: reasonCheck.error }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id },
      select: { state: true },
    });
    if (!bundle) return { error: "not_found" as const };
    if (bundle.state !== "issued") return { error: "locked" as const };

    // Verify the question is part of this bundle's snapshot — guards
    // against a client crafting a request for an out-of-scope question.
    const link = await tx.affirmBundleQuestion.findUnique({
      where: {
        bundleId_questionId: {
          bundleId: id,
          questionId: parsed.data.questionId,
        },
      },
      include: { question: { select: { status: true } } },
    });
    if (!link) return { error: "out_of_scope" as const };
    if (link.question.status === "excluded") {
      return { error: "excluded_question" as const };
    }

    await tx.affirmResponse.upsert({
      where: {
        bundleId_questionId: {
          bundleId: id,
          questionId: parsed.data.questionId,
        },
      },
      update: {
        choice: parsed.data.choice,
        reason: parsed.data.choice === "deviate" ? parsed.data.reason ?? null : null,
        answeredAt: new Date(),
      },
      create: {
        bundleId: id,
        questionId: parsed.data.questionId,
        choice: parsed.data.choice,
        reason: parsed.data.choice === "deviate" ? parsed.data.reason ?? null : null,
      },
    });

    return { ok: true as const };
  });

  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "out_of_scope" || result.error === "excluded_question"
          ? 400
          : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
