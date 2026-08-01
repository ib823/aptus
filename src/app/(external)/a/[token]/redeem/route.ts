/**
 * POST /a/[token]/redeem — Affirm external acknowledgement + session start.
 *
 * Sequence:
 *   1. Fail-closed flag check (404 when disabled).
 *   2. Validate CSRF nonce against the URL token; require legal ack.
 *   3. Resolve token → grant → bundle; polymorphic /a/expired on any guard.
 *   4. Record acknowledgement (idempotent) + grant_acknowledged (first time).
 *   5. Create the guest session, set the affirm-guest cookie, write
 *      guest_session_started.
 *   6. OTP gate: if this device has cleared OTP (uaHash ∈ otpVerifiedUaHashes)
 *      go to /a/home; else issue an OTP and go to /a/verify.
 *   7. 303 redirect — drops the token from the URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/affirm/external/tokens";
import { verifyRedeemNonce } from "@/lib/affirm/external/csrf";
import { buildAffirmGuestCookie } from "@/lib/affirm/external/cookies";
import { isAffirmExternalEnabled } from "@/lib/affirm/external/guards";
import {
  createGuestSession,
  endActiveSessionsForDevice,
  isClientFacingState,
} from "@/lib/affirm/external/session";
import { issueGuestOtp } from "@/lib/affirm/external/otp";
import { writeGuestEvent } from "@/lib/affirm/external/audit";
import { hashUserAgent } from "@/lib/security/ua-fingerprint";
import { AFFIRM_ACK_VERSION, AFFIRM_PDPA_VERSION } from "@/lib/affirm/external/legal";

interface RouteContext {
  params: Promise<{ token: string }>;
}

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  if (!isAffirmExternalEnabled()) return new NextResponse(null, { status: 404 });

  const { token } = await ctx.params;
  if (!token || token.length < 16) return redirectTo(req, "/a/expired");

  const form = await req.formData();
  const csrf = String(form.get("csrf") ?? "");
  if (!verifyRedeemNonce(token, csrf)) {
    return redirectTo(req, `/a/${encodeURIComponent(token)}?csrf=stale`);
  }
  if (form.get("acknowledge_legal") !== "1") {
    return redirectTo(req, `/a/${encodeURIComponent(token)}?ack=missing`);
  }
  const pdpaConsent = form.get("pdpa_consent") === "1";

  const grant = await prisma.affirmAccessGrant.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { bundle: { select: { id: true, state: true } } },
  });
  const now = new Date();
  if (!grant) return redirectTo(req, "/a/expired");
  if (grant.revokedAt) return redirectTo(req, "/a/expired");
  if (grant.supersededByGrantId) return redirectTo(req, "/a/expired");
  /*
   * A LAPSED GRANT IS A CLOSED DOOR. Checked alongside revocation because it
   * has the same meaning to the holder: this link no longer opens. Without it
   * the expiry column would be a label the runtime never reads.
   */
  if (grant.expiresAt !== null && grant.expiresAt <= now) return redirectTo(req, "/a/expired");
  if (!isClientFacingState(grant.bundle.state)) return redirectTo(req, "/a/expired");

  const ua = req.headers.get("user-agent") ?? "";
  const uaHash = hashUserAgent(ua);

  const firstAck = grant.ackAt === null;
  await prisma.affirmAccessGrant.update({
    where: { id: grant.id },
    data: {
      ackAt: grant.ackAt ?? now,
      pdpaVersion: grant.pdpaVersion ?? (pdpaConsent ? AFFIRM_PDPA_VERSION : null),
      lastAccessAt: now,
    },
  });
  if (firstAck) {
    await writeGuestEvent({
      bundleId: grant.bundleId,
      type: "grant_acknowledged",
      grantId: grant.id,
      payload: { ackVersion: AFFIRM_ACK_VERSION, pdpaConsent },
    });
  }

  // Fresh session for this device; end any stale one for the same device.
  await endActiveSessionsForDevice({
    grantId: grant.id,
    uaHash,
    reason: "superseded",
    now,
  });
  const { session, rawToken } = await createGuestSession({ grantId: grant.id, uaHash, now });
  await writeGuestEvent({
    bundleId: grant.bundleId,
    type: "guest_session_started",
    grantId: grant.id,
    payload: { uaHash },
  });

  const deviceVerified = grant.otpVerifiedUaHashes.includes(uaHash);
  if (!deviceVerified) {
    await issueGuestOtp({ grantId: grant.id, now, kind: "initial", sessionId: session.id });
  }

  const res = redirectTo(req, deviceVerified ? "/a/home" : "/a/verify");
  const cookie = buildAffirmGuestCookie(rawToken);
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
