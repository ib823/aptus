/**
 * ABeam Workbench — Presales OTP issue/verify.
 *
 * Stub for the Resend transport — real email send lands at build sequence
 * step 7. In dev the code is logged so a developer can copy it from the
 * server console.
 *
 * Lockout cascade fires via maybeApplyOtpLockout in guards.ts when
 * otpAttemptCount reaches 5.
 */

import { prisma } from '@/lib/db/prisma';
import { createHash, randomInt } from 'crypto';
import { maybeApplyOtpLockout } from './guards';

const OTP_TTL_MIN = 10;

function hashOtp(code: string, grantId: string): string {
  return createHash('sha256').update(`${grantId}:${code}`).digest('hex');
}

export async function issuePresalesOtp(grantId: string, now: Date = new Date()): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const otpHash = hashOtp(code, grantId);
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000);

  await prisma.presalesAccessGrant.update({
    where: { id: grantId },
    data: { otpHash, otpExpiresAt, otpAttemptCount: 0 },
  });

  // Stub: real send lands when Resend wiring goes in (build seq §7).
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[presales-otp] grantId=${grantId} code=${code} (dev-only log)`);
  }
}

export type OtpVerifyResult =
  | { kind: 'ok' }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'expired' }
  | { kind: 'locked' };

export async function verifyPresalesOtp(args: {
  grantId: string;
  code: string;
  uaHash: string;
  ip?: string;
  userAgent?: string;
  now?: Date;
}): Promise<OtpVerifyResult> {
  const now = args.now ?? new Date();
  const grant = await prisma.presalesAccessGrant.findUnique({
    where: { id: args.grantId },
  });
  if (!grant) return { kind: 'invalid', attemptsRemaining: 0 };
  if (grant.revokedAt) return { kind: 'locked' };
  if (!grant.otpHash || !grant.otpExpiresAt) return { kind: 'expired' };
  if (grant.otpExpiresAt <= now) return { kind: 'expired' };

  const candidate = hashOtp(args.code, args.grantId);
  if (candidate === grant.otpHash) {
    await prisma.presalesAccessGrant.update({
      where: { id: args.grantId },
      data: { otpHash: null, otpExpiresAt: null, otpAttemptCount: 0 },
    });
    // Per-device OTP gate: the uaHash in the payload is what the workbench
    // page checks before serving content. Audit row is per-device — never
    // mutate or overwrite an existing otp_verified row for another device.
    await prisma.presalesAuditEvent.create({
      data: {
        bundleId: grant.bundleId,
        grantId: grant.id,
        eventType: 'otp_verified',
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        payload: { uaHash: args.uaHash },
      },
    });
    return { kind: 'ok' };
  }

  const newCount = grant.otpAttemptCount + 1;
  await prisma.presalesAccessGrant.update({
    where: { id: args.grantId },
    data: { otpAttemptCount: newCount },
  });
  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: grant.bundleId,
      grantId: grant.id,
      eventType: 'otp_failed',
      payload: { attempt: newCount },
    },
  });

  const locked = await maybeApplyOtpLockout(
    {
      prisma,
      sendConsultantLockoutAlert: async () => {
        // Stubbed Resend dispatcher. Logs in dev for now.
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log(`[presales-otp] consultant alert (stub) — grant=${args.grantId}`);
        }
      },
    },
    { grantId: args.grantId, newAttemptCount: newCount },
  );

  if (locked) return { kind: 'locked' };
  return { kind: 'invalid', attemptsRemaining: Math.max(0, 5 - newCount) };
}
