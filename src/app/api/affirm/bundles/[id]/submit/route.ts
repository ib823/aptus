/**
 * POST /api/affirm/bundles/[id]/submit — transition ISSUED -> SUBMITTED.
 *
 * Client seals their answers. All in-scope questions must have a
 * response (defaults to "standard" silently? No — per master prompt
 * the default IS "standard" so we let unanswered questions count as
 * standard at submit time, recorded explicitly so the audit log is
 * complete). Deviate-without-reason is rejected at the per-response
 * write path; we re-check here defensively.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { assertTransition } from "@/lib/affirm/bundle";
import { requireAffirmBundleAccess } from "@/lib/affirm/authz";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireAffirmBundleAccess(id, user);
  if (!access.ok) return access.response;

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id },
      include: {
        questions: { select: { questionId: true } },
        responses: {
          select: { questionId: true, choice: true, reason: true },
        },
      },
    });
    if (!bundle) return { error: "not_found" as const };
    try {
      assertTransition(bundle.state as never, "submitted");
    } catch {
      return { error: "illegal_transition" as const };
    }

    const answered = new Set(bundle.responses.map((r) => r.questionId));

    // Materialize defaults for unanswered questions (default-to-standard,
    // master prompt §4). This ensures Screen 3 / Screen 4 see one row
    // per in-scope question, with no ambiguous "blank" state.
    const missing = bundle.questions
      .map((q) => q.questionId)
      .filter((qid) => !answered.has(qid));
    if (missing.length) {
      await tx.affirmResponse.createMany({
        data: missing.map((qid) => ({
          bundleId: id,
          questionId: qid,
          choice: "standard",
          reason: null,
        })),
        skipDuplicates: true,
      });
    }

    // Defensive re-check: any deviate-without-reason rows would be a bug
    // — the per-response route already rejects them — but if one exists,
    // surface it as 409 so the consultant doesn't release on bad data.
    const bad = bundle.responses.filter(
      (r) => r.choice === "deviate" && (!r.reason || !r.reason.trim()),
    );
    if (bad.length) {
      return { error: "deviate_missing_reason" as const, count: bad.length };
    }

    await tx.affirmBundle.update({
      where: { id },
      data: { state: "submitted", submittedAt: new Date() },
    });
    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "submitted",
        actorId: user.id,
        payload: { defaultsMaterialized: missing.length },
      },
    });

    return { ok: true as const, defaultsMaterialized: missing.length };
  });

  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "deviate_missing_reason"
          ? 422
          : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
