/**
 * POST /a/end — Affirm external sign-out.
 *
 * Idempotent. Ends the session (if the cookie resolves), writes
 * guest_session_ended, clears the cookie, and 303s to /a/ended. A bad CSRF
 * nonce is treated as benign here — the user wanted to log out anyway.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireGuestSession, isAffirmExternalEnabled } from "@/lib/affirm/external/guards";
import { endGuestSession } from "@/lib/affirm/external/session";
import { clearAffirmGuestCookie } from "@/lib/affirm/external/cookies";
import { writeGuestEvent } from "@/lib/affirm/external/audit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAffirmExternalEnabled()) return new NextResponse(null, { status: 404 });

  const ctx = await requireGuestSession();
  if (ctx) {
    await endGuestSession({ sessionId: ctx.session.id, reason: "logout" });
    await writeGuestEvent({
      bundleId: ctx.bundle.id,
      type: "guest_session_ended",
      grantId: ctx.grant.id,
      payload: { reason: "logout" },
    });
  }

  const res = NextResponse.redirect(new URL("/a/ended", req.url), { status: 303 });
  const cookie = clearAffirmGuestCookie();
  res.cookies.set({
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    maxAge: cookie.maxAge,
  });
  return res;
}
