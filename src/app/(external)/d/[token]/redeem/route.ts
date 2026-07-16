/**
 * POST /d/[token]/redeem — Neutral Process Discovery acknowledgement + session start.
 *
 * Mirrors the Affirm redeem sequence exactly, on the Discovery tables:
 *   1. Fail-closed flag check (404 when disabled).
 *   2. Validate CSRF nonce against the URL token; require legal ack.
 *   3. Resolve token → grant → engagement; polymorphic /d/expired on any guard.
 *   4. Record acknowledgement (idempotent) + grant_acknowledged (first time).
 *   5. Create the guest session, set the discovery-guest cookie, write
 *      guest_session_started.
 *   6. OTP gate: if this device has cleared OTP (uaHash ∈ otpVerifiedUaHashes)
 *      go to /d/home; else issue an OTP and go to /d/verify.
 *   7. 303 redirect — drops the token from the URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/affirm/external/tokens";
import { hashUserAgent } from "@/lib/security/ua-fingerprint";
import { writeDiscoveryEvent } from "@/lib/discovery/external/audit";
import { buildDiscoveryGuestCookie } from "@/lib/discovery/external/cookies";
import { verifyRedeemNonce } from "@/lib/discovery/external/csrf";
import { DISCOVERY_ACK_VERSION, DISCOVERY_PDPA_VERSION } from "@/lib/discovery/external/legal";
import { issueGuestOtp } from "@/lib/discovery/external/otp";
import {
  createGuestSession,
  endActiveSessionsForDevice,
  isClientFacingState,
} from "@/lib/discovery/external/session";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

interface RouteContext {
  params: Promise<{ token: string }>;
}

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });

  const { token } = await ctx.params;
  if (!token || token.length < 16) return redirectTo(req, "/d/expired");

  const form = await req.formData();
  const csrf = String(form.get("csrf") ?? "");
  if (!verifyRedeemNonce(token, csrf)) {
    return redirectTo(req, `/d/${encodeURIComponent(token)}?csrf=stale`);
  }
  if (form.get("acknowledge_legal") !== "1") {
    return redirectTo(req, `/d/${encodeURIComponent(token)}?ack=missing`);
  }
  const pdpaConsent = form.get("pdpa_consent") === "1";

  const grant = await prisma.discoveryAccessGrant.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { engagement: { select: { id: true, state: true } } },
  });
  const now = new Date();
  if (!grant) return redirectTo(req, "/d/expired");
  if (grant.revokedAt) return redirectTo(req, "/d/expired");
  if (grant.supersededByGrantId) return redirectTo(req, "/d/expired");
  if (!isClientFacingState(grant.engagement.state)) return redirectTo(req, "/d/expired");

  const ua = req.headers.get("user-agent") ?? "";
  const uaHash = hashUserAgent(ua);

  const firstAck = grant.ackAt === null;
  await prisma.discoveryAccessGrant.update({
    where: { id: grant.id },
    data: {
      ackAt: grant.ackAt ?? now,
      pdpaVersion: grant.pdpaVersion ?? (pdpaConsent ? DISCOVERY_PDPA_VERSION : null),
      lastAccessAt: now,
    },
  });
  if (firstAck) {
    await writeDiscoveryEvent({
      engagementId: grant.engagementId,
      type: "grant_acknowledged",
      grantId: grant.id,
      payload: { ackVersion: DISCOVERY_ACK_VERSION, pdpaConsent },
    });
  }

  // Fresh session for this device; end any stale one for the same device.
  await endActiveSessionsForDevice({ grantId: grant.id, uaHash, reason: "superseded", now });
  const { session, rawToken } = await createGuestSession({ grantId: grant.id, uaHash, now });
  await writeDiscoveryEvent({
    engagementId: grant.engagementId,
    type: "guest_session_started",
    grantId: grant.id,
    payload: { uaHash },
  });

  const deviceVerified = grant.otpVerifiedUaHashes.includes(uaHash);
  if (!deviceVerified) {
    await issueGuestOtp({ grantId: grant.id, now, kind: "initial", sessionId: session.id });
  }

  const res = redirectTo(req, deviceVerified ? "/d/home" : "/d/verify");
  const cookie = buildDiscoveryGuestCookie(rawToken);
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
