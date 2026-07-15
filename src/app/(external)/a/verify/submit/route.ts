/**
 * POST /a/verify/submit — Affirm external OTP verify.
 *
 * Resolves the session, verifies the 6-digit code, and redirects to /a/home
 * (success), back to /a/verify with an error (invalid / expired), or /a/expired
 * (locked — the grant is revoked inside verifyGuestOtp's lockout cascade).
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireGuestSession, isAffirmExternalEnabled } from "@/lib/affirm/external/guards";
import { verifySessionNonce } from "@/lib/affirm/external/csrf";
import { verifyGuestOtp } from "@/lib/affirm/external/otp";
import { touchGuestSession } from "@/lib/affirm/external/session";

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAffirmExternalEnabled()) return new NextResponse(null, { status: 404 });

  const ctx = await requireGuestSession();
  if (!ctx) return redirectTo(req, "/a/expired");

  const form = await req.formData();
  const csrf = String(form.get("csrf") ?? "");
  if (!verifySessionNonce(ctx.session.id, csrf)) {
    return redirectTo(req, "/a/verify?error=invalid");
  }
  const code = String(form.get("otp") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return redirectTo(req, "/a/verify?error=invalid");
  }

  const result = await verifyGuestOtp({ grantId: ctx.grant.id, code, uaHash: ctx.uaHash });
  switch (result.kind) {
    case "ok":
      await touchGuestSession(ctx.session.id);
      return redirectTo(req, "/a/home");
    case "invalid":
      return redirectTo(req, "/a/verify?error=invalid");
    case "expired":
      return redirectTo(req, "/a/verify?error=expired");
    case "locked":
    default:
      return redirectTo(req, "/a/expired");
  }
}
