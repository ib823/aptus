/**
 * POST /d/verify/resend — re-issue the OTP for the current session.
 *
 * Throttle (app-level, mirroring Affirm — /d/* routes are not
 * middleware-rate-limited):
 *   - Min 30s gap between issues (canResendOtp, derived from otpExpiresAt).
 *   - Max 3 resends per session (counted via otp_issued events with
 *     payload.kind='resend' + payload.sessionId since session start).
 *
 * On exhaustion the reviewer is sent back to /d/verify with an error. Resend
 * exhaustion does NOT revoke the grant — only 5 failed code attempts do.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifySessionNonce } from "@/lib/discovery/external/csrf";
import { requireGuestSession } from "@/lib/discovery/external/guards";
import { canResendOtp, issueGuestOtp } from "@/lib/discovery/external/otp";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

const MAX_RESENDS_PER_SESSION = 3;

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });

  const ctx = await requireGuestSession();
  if (!ctx) return redirectTo(req, "/d/expired");

  const form = await req.formData();
  const csrf = String(form.get("csrf") ?? "");
  if (!verifySessionNonce(ctx.session.id, csrf)) {
    return redirectTo(req, "/d/verify?error=resend_rate_limited");
  }

  const now = new Date();

  // Session-scoped resend cap. Counted from the event log rather than a column:
  // the same approach Affirm uses, and it needs no migration.
  const resendCount = await prisma.discoveryEvent.count({
    where: {
      engagementId: ctx.engagement.id,
      type: "otp_issued",
      createdAt: { gte: ctx.session.createdAt },
      AND: [
        { payload: { path: ["kind"], equals: "resend" } },
        { payload: { path: ["sessionId"], equals: ctx.session.id } },
      ],
    },
  });
  if (resendCount >= MAX_RESENDS_PER_SESSION) {
    return redirectTo(req, "/d/verify?error=resend_exhausted");
  }

  // 30s minimum gap.
  if (!canResendOtp(ctx.grant, now)) {
    return redirectTo(req, "/d/verify?error=resend_rate_limited");
  }

  await issueGuestOtp({
    grantId: ctx.grant.id,
    now,
    kind: "resend",
    sessionId: ctx.session.id,
  });
  return redirectTo(req, "/d/verify");
}
