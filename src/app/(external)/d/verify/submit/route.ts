/**
 * POST /d/verify/submit — Neutral Process Discovery OTP verify.
 *
 * Resolves the session, verifies the 6-digit code, and redirects to /d/home
 * (success), back to /d/verify with an error (invalid / expired), or /d/expired
 * (locked — the grant is already revoked inside verifyGuestOtp's cascade, so the
 * terminal is honest rather than a cover story).
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifySessionNonce } from "@/lib/discovery/external/csrf";
import { requireGuestSession } from "@/lib/discovery/external/guards";
import { verifyGuestOtp } from "@/lib/discovery/external/otp";
import { touchGuestSession } from "@/lib/discovery/external/session";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

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
    return redirectTo(req, "/d/verify?error=invalid");
  }
  const code = String(form.get("otp") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return redirectTo(req, "/d/verify?error=invalid");
  }

  const result = await verifyGuestOtp({ grantId: ctx.grant.id, code, uaHash: ctx.uaHash });
  switch (result.kind) {
    case "ok":
      await touchGuestSession(ctx.session.id);
      return redirectTo(req, "/d/home");
    case "invalid":
      return redirectTo(req, "/d/verify?error=invalid");
    case "expired":
      return redirectTo(req, "/d/verify?error=expired");
    case "locked":
    default:
      return redirectTo(req, "/d/expired");
  }
}
