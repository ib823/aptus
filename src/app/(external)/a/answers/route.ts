/**
 * POST /a/answers — Affirm external guest answer upsert.
 *
 * The existing consultant answer path (PUT /api/affirm/bundles/[id]/responses)
 * is bound to getCurrentUser (abeam-session), so guests get their own route
 * with token/grant auth. JSON in, flat { error } out (affirm convention).
 *
 * Guards: fail-closed flag, resolved session, per-device OTP, bundle must be
 * ISSUED (submitted is sealed), the question must be in the grant's visible
 * scope, deviate requires a reason (≤2000, server-enforced). CSRF via the
 * x-affirm-csrf header (session nonce) — SameSite=Strict already blocks the
 * cross-origin case; the nonce covers same-origin form-injection.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireGuestSession, isAffirmExternalEnabled, isDeviceVerified } from "@/lib/affirm/external/guards";
import { verifySessionNonce } from "@/lib/affirm/external/csrf";
import { getAffirmSetForGrant } from "@/lib/affirm/external/serializers";
import { writeGuestEvent } from "@/lib/affirm/external/audit";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { validateChoiceReason } from "@/lib/affirm/bundle";
import type { AffirmChoice } from "@/lib/affirm/types";

const Body = z.object({
  questionId: z.string().min(1),
  choice: z.enum(["standard", "discuss", "deviate"]),
  reason: z.string().max(2000).nullish(),
});

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

  if (ctx.bundle.state !== "issued") {
    return NextResponse.json({ error: "sealed" }, { status: 409 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { questionId, choice } = parsed.data;
  const reason = parsed.data.reason ?? null;

  // The question must be in THIS grant's visible scope.
  const set = await getAffirmSetForGrant(ctx.grant.id);
  const visible = new Set(set?.questions.map((q) => q.id) ?? []);
  if (!visible.has(questionId)) {
    return NextResponse.json({ error: "out_of_scope" }, { status: 403 });
  }

  const check = validateChoiceReason(choice as AffirmChoice, reason);
  if (!check.ok) return NextResponse.json({ error: "reason_required" }, { status: 422 });

  await prisma.affirmResponse.upsert({
    where: { bundleId_questionId: { bundleId: ctx.bundle.id, questionId } },
    create: { bundleId: ctx.bundle.id, questionId, choice, reason },
    update: { choice, reason, answeredAt: new Date() },
  });

  await writeGuestEvent({
    bundleId: ctx.bundle.id,
    type: "guest_answer_saved",
    grantId: ctx.grant.id,
    payload: { questionId, choice },
  });

  void touchGuestSession(ctx.session.id);
  return NextResponse.json({ ok: true });
}
