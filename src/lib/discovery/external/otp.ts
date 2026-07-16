/**
 * ABeam Workbench — Neutral Process Discovery OTP issue/verify + lockout cascade.
 *
 * Mirrors src/lib/affirm/external/otp.ts on the Discovery tables. Same contract:
 * 6-digit code, 10-minute expiry, per-device verification (uaHash appended to
 * DiscoveryAccessGrant.otpVerifiedUaHashes on success), resend throttled to a
 * 30s minimum gap, five failed attempts permanently locks the grant.
 *
 * The email RENDERERS are genuinely reused from the Affirm surface — they are
 * pure functions whose content is surface-neutral ("Your access code"), so
 * duplicating them would be a fork for no reason. Only the table access differs.
 */

import { prisma } from "@/lib/db/prisma";
import { createHash, randomInt } from "crypto";
import { dispatchEmail } from "@/lib/presales/emails";
import {
  renderAffirmLockoutAlertEmail,
  renderAffirmOtpEmail,
} from "@/lib/affirm/external/emails";
import { writeDiscoveryEvent } from "./audit";

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MIN_GAP_MS = 30_000;

function hashOtp(code: string, grantId: string): string {
  return createHash("sha256").update(`${grantId}:${code}`).digest("hex");
}

/**
 * True when a resend is allowed: no live OTP, or the live OTP was issued more
 * than OTP_RESEND_MIN_GAP_MS ago. Issue time is derived as (otpExpiresAt - TTL)
 * so no extra column is needed.
 */
export function canResendOtp(grant: { otpExpiresAt: Date | null }, now: Date = new Date()): boolean {
  if (!grant.otpExpiresAt) return true;
  const issuedAt = grant.otpExpiresAt.getTime() - OTP_TTL_MIN * 60 * 1000;
  return now.getTime() - issuedAt >= OTP_RESEND_MIN_GAP_MS;
}

export async function issueGuestOtp(args: {
  grantId: string;
  now?: Date;
  /** "initial" at redeem, "resend" from the verify/resend route (for counting). */
  kind?: "initial" | "resend";
  /** Session id stamped on the event so resends are countable per session. */
  sessionId?: string;
}): Promise<void> {
  const now = args.now ?? new Date();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000);

  const grant = await prisma.discoveryAccessGrant.update({
    where: { id: args.grantId },
    data: { otpHash: hashOtp(code, args.grantId), otpExpiresAt, otpAttemptCount: 0 },
    select: { id: true, email: true, displayName: true, engagementId: true },
  });

  await writeDiscoveryEvent({
    engagementId: grant.engagementId,
    type: "otp_issued",
    grantId: grant.id,
    payload: {
      kind: args.kind ?? "initial",
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
    },
  });

  await dispatchEmail(
    renderAffirmOtpEmail({
      recipientEmail: grant.email,
      displayName: grant.displayName,
      code,
      expiresMinutes: OTP_TTL_MIN,
    }),
    { bestEffort: true },
  );

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[discovery-otp] grantId=${grant.id} code=${code} (dev-only log)`);
  }
}

export type OtpVerifyResult =
  | { kind: "ok" }
  | { kind: "invalid"; attemptsRemaining: number }
  | { kind: "expired" }
  | { kind: "locked" };

export async function verifyGuestOtp(args: {
  grantId: string;
  code: string;
  uaHash: string;
  now?: Date;
}): Promise<OtpVerifyResult> {
  const now = args.now ?? new Date();
  const grant = await prisma.discoveryAccessGrant.findUnique({ where: { id: args.grantId } });
  if (!grant) return { kind: "invalid", attemptsRemaining: 0 };
  if (grant.revokedAt) return { kind: "locked" };
  if (!grant.otpHash || !grant.otpExpiresAt) return { kind: "expired" };
  if (grant.otpExpiresAt <= now) return { kind: "expired" };

  if (hashOtp(args.code, args.grantId) === grant.otpHash) {
    const verifiedUaHashes = grant.otpVerifiedUaHashes.includes(args.uaHash)
      ? grant.otpVerifiedUaHashes
      : [...grant.otpVerifiedUaHashes, args.uaHash];
    await prisma.discoveryAccessGrant.update({
      where: { id: args.grantId },
      data: {
        otpHash: null,
        otpExpiresAt: null,
        otpAttemptCount: 0,
        otpVerifiedUaHashes: verifiedUaHashes,
      },
    });
    await writeDiscoveryEvent({
      engagementId: grant.engagementId,
      type: "otp_verified",
      grantId: grant.id,
      payload: { uaHash: args.uaHash },
    });
    return { kind: "ok" };
  }

  const newCount = grant.otpAttemptCount + 1;
  await prisma.discoveryAccessGrant.update({
    where: { id: args.grantId },
    data: { otpAttemptCount: newCount },
  });

  if (newCount >= OTP_MAX_ATTEMPTS) {
    await applyOtpLockout(args.grantId, now);
    return { kind: "locked" };
  }

  return { kind: "invalid", attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - newCount) };
}

/**
 * Permanent lockout cascade. Idempotent (a re-entry after revoke is a no-op).
 * Revoke + session-end + audit land in one transaction; the consultant alert is
 * best-effort and must not roll back the lockout.
 */
export async function applyOtpLockout(grantId: string, now: Date = new Date()): Promise<void> {
  const grant = await prisma.discoveryAccessGrant.findUnique({
    where: { id: grantId },
    include: { engagement: { select: { id: true, client: true, createdById: true } } },
  });
  if (!grant) return;
  if (grant.revokedAt) return; // already locked; idempotent

  await prisma.$transaction(async (tx) => {
    await tx.discoveryAccessGrant.update({
      where: { id: grantId },
      data: { revokedAt: now, revokedById: grant.engagement.createdById ?? null },
    });
    await tx.discoveryGuestSession.updateMany({
      where: { grantId, endedAt: null },
      data: { endedAt: now, endedReason: "superseded" },
    });
    await tx.discoveryEvent.create({
      data: {
        engagementId: grant.engagementId,
        type: "otp_lockout",
        actorId: null,
        payload: { grantId, attempts: OTP_MAX_ATTEMPTS },
      },
    });
  });

  // Best-effort consultant alert. A failed send must not undo the lockout.
  try {
    const consultant = grant.engagement.createdById
      ? await prisma.user.findUnique({
          where: { id: grant.engagement.createdById },
          select: { email: true, name: true },
        })
      : null;
    if (consultant?.email) {
      await dispatchEmail(
        renderAffirmLockoutAlertEmail({
          consultantEmail: consultant.email,
          consultantName: consultant.name,
          clientLabel: grant.engagement.client,
          granteeEmail: grant.email,
          granteeName: grant.displayName,
        }),
        { bestEffort: true },
      );
    }
  } catch {
    // Transport already logged; the lockout stands regardless.
  }
}
