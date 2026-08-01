/**
 * ABeam Workbench — Affirm external OTP issue/verify + lockout cascade.
 *
 * 6-digit code, 10-minute expiry, per-device verification (uaHash added to
 * AffirmAccessGrant.otpVerifiedUaHashes on success). Resend is throttled to a
 * 30s minimum gap. Five failed attempts permanently locks the grant:
 *
 *   (a) grant.revokedAt = now, grant.revokedById = bundle.createdById
 *   (b) otp_lockout AffirmEvent (actorId null, payload.grantId)
 *   (c) end any active guest sessions for the grant (bundle_state_change n/a →
 *       superseded reason "ended_by_consultant" is wrong; we use "superseded")
 *   (d) best-effort email to the bundle's consultant (createdBy)
 *
 * The email is best-effort and must NOT roll back the lockout. In dev with no
 * SMTP configured, dispatchEmail logs instead of sending.
 */

import { prisma } from "@/lib/db/prisma";
import { createHash, randomInt } from "crypto";
import { dispatchEmail } from "@/lib/presales/emails";
import { writeGuestEvent } from "./audit";
import { renderAffirmOtpEmail, renderAffirmLockoutAlertEmail } from "./emails";

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
export function canResendOtp(
  grant: { otpExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!grant.otpExpiresAt) return true;
  const issuedAt = grant.otpExpiresAt.getTime() - OTP_TTL_MIN * 60 * 1000;
  return now.getTime() - issuedAt >= OTP_RESEND_MIN_GAP_MS;
}

/**
 * Issue (or re-issue) an OTP for a grant, reset the attempt counter, email the
 * code (best-effort), and write an otp_issued event. Returns the raw code for
 * dev logging only.
 */
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

  const grant = await prisma.affirmAccessGrant.update({
    where: { id: args.grantId },
    data: { otpHash: hashOtp(code, args.grantId), otpExpiresAt, otpAttemptCount: 0 },
    select: { id: true, email: true, displayName: true, bundleId: true },
  });

  await writeGuestEvent({
    bundleId: grant.bundleId,
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
    console.log(`[affirm-otp] grantId=${grant.id} code=${code} (dev-only log)`);
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
  const grant = await prisma.affirmAccessGrant.findUnique({
    where: { id: args.grantId },
  });
  if (!grant) return { kind: "invalid", attemptsRemaining: 0 };
  if (grant.revokedAt) return { kind: "locked" };
  /*
   * A LAPSED GRANT IS A CLOSED DOOR. Checked alongside revocation because it
   * has the same meaning to the holder: this link no longer opens. Without it
   * the expiry column would be a label the runtime never reads.
   */
  if (grant.expiresAt !== null && grant.expiresAt <= now) return { kind: "locked" };
  if (!grant.otpHash || !grant.otpExpiresAt) return { kind: "expired" };
  if (grant.otpExpiresAt <= now) return { kind: "expired" };

  if (hashOtp(args.code, args.grantId) === grant.otpHash) {
    const verifiedUaHashes = grant.otpVerifiedUaHashes.includes(args.uaHash)
      ? grant.otpVerifiedUaHashes
      : [...grant.otpVerifiedUaHashes, args.uaHash];
    await prisma.affirmAccessGrant.update({
      where: { id: args.grantId },
      data: {
        otpHash: null,
        otpExpiresAt: null,
        otpAttemptCount: 0,
        otpVerifiedUaHashes: verifiedUaHashes,
      },
    });
    await writeGuestEvent({
      bundleId: grant.bundleId,
      type: "otp_verified",
      grantId: grant.id,
      payload: { uaHash: args.uaHash },
    });
    return { kind: "ok" };
  }

  const newCount = grant.otpAttemptCount + 1;
  await prisma.affirmAccessGrant.update({
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
 * Revoke + audit land in one transaction; the consultant alert is best-effort
 * and must not roll back the lockout.
 */
export async function applyOtpLockout(grantId: string, now: Date = new Date()): Promise<void> {
  const grant = await prisma.affirmAccessGrant.findUnique({
    where: { id: grantId },
    include: {
      bundle: { select: { id: true, client: true, createdById: true } },
    },
  });
  if (!grant) return;
  if (grant.revokedAt) return; // already locked; idempotent

  await prisma.$transaction(async (tx) => {
    await tx.affirmAccessGrant.update({
      where: { id: grantId },
      data: { revokedAt: now, revokedById: grant.bundle.createdById ?? null },
    });
    await tx.affirmGuestSession.updateMany({
      where: { grantId, endedAt: null },
      data: { endedAt: now, endedReason: "superseded" },
    });
    await tx.affirmEvent.create({
      data: {
        bundleId: grant.bundleId,
        type: "otp_lockout",
        actorId: null,
        payload: { grantId, attempts: OTP_MAX_ATTEMPTS },
      },
    });
  });

  // Best-effort consultant alert. A failed send must not undo the lockout.
  try {
    const consultant = grant.bundle.createdById
      ? await prisma.user.findUnique({
          where: { id: grant.bundle.createdById },
          select: { email: true, name: true },
        })
      : null;
    if (consultant?.email) {
      await dispatchEmail(
        renderAffirmLockoutAlertEmail({
          consultantEmail: consultant.email,
          consultantName: consultant.name,
          clientLabel: grant.bundle.client,
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
