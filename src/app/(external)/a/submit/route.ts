/**
 * POST /a/submit — Affirm external guest submit (ISSUED -> SUBMITTED).
 *
 * Submit seals the WHOLE bundle, not just this grant's slice — so PR-3 surfaces
 * a confirm dialog with all grantees' progress before calling this. Any
 * OTP-verified grantee may submit; the submitting grant is recorded in the
 * guest_submitted event payload. Materializes default "standard" for unanswered
 * questions (default-to-standard), mirroring the consultant submit route.
 *
 * Guards: fail-closed flag, resolved session, per-device OTP, CSRF header,
 * monotonic assertTransition.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireGuestSession, isAffirmExternalEnabled, isDeviceVerified } from "@/lib/affirm/external/guards";
import { verifySessionNonce } from "@/lib/affirm/external/csrf";
import { assertTransition } from "@/lib/affirm/bundle";

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAffirmExternalEnabled()) return new NextResponse(null, { status: 404 });

  const ctx = await requireGuestSession();
  if (!ctx) return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) {
    return NextResponse.json({ error: "otp_required" }, { status: 403 });
  }
  const csrf = req.headers.get("x-affirm-csrf") ?? "";
  if (!verifySessionNonce(ctx.session.id, csrf)) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }

  const bundleId = ctx.bundle.id;
  const grantId = ctx.grant.id;

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id: bundleId },
      include: {
        questions: { select: { questionId: true } },
        responses: { select: { questionId: true, choice: true, reason: true } },
      },
    });
    if (!bundle) return { error: "not_found" as const };
    try {
      assertTransition(bundle.state as never, "submitted");
    } catch {
      return { error: "illegal_transition" as const };
    }

    const answered = new Set(bundle.responses.map((r) => r.questionId));
    const missing = bundle.questions.map((q) => q.questionId).filter((qid) => !answered.has(qid));
    if (missing.length) {
      await tx.affirmResponse.createMany({
        data: missing.map((qid) => ({ bundleId, questionId: qid, choice: "standard", reason: null })),
        skipDuplicates: true,
      });
    }

    const bad = bundle.responses.filter((r) => r.choice === "deviate" && (!r.reason || !r.reason.trim()));
    if (bad.length) return { error: "deviate_missing_reason" as const };

    await tx.affirmBundle.update({
      where: { id: bundleId },
      data: { state: "submitted", submittedAt: new Date() },
    });
    await tx.affirmEvent.create({
      data: {
        bundleId,
        type: "guest_submitted",
        actorId: null,
        payload: { grantId, defaultsMaterialized: missing.length },
      },
    });

    return { ok: true as const, defaultsMaterialized: missing.length };
  });

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "deviate_missing_reason" ? 422 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
