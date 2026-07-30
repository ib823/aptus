/**
 * ABeam Workbench — Presales OTP issue/verify.
 *
 * THE CODE IS DELIVERED BY EMAIL, through the same Brevo/nodemailer transport
 * every other guest surface uses. It spent months as a stub instead: the send
 * was a dev-only console.log "waiting for the Resend wiring", but Resend was
 * dropped for Brevo and the wait's condition quietly stopped existing. The
 * sibling flows (affirm, discovery) sent all along — only this one was left
 * on the stub, while the redeem route wrote an `otp_sent` audit row for a
 * send that never happened in production. A guest could never obtain their
 * code.
 *
 * The send is best-effort: a failed dispatch never rolls back the issued
 * hash — the guest can use /c/verify/resend, and the transport logs the
 * failure.
 *
 * Lockout cascade fires via maybeApplyOtpLockout in guards.ts when
 * otpAttemptCount reaches 5. The consultant alert passed to it THROWS on
 * dispatch failure on purpose: guards.ts owns the failure handling — it
 * writes the `alert_dispatch_failed` audit row so the consultant's dashboard
 * shows both the lockout and the delivery uncertainty. Swallowing the error
 * here (bestEffort) would erase that record.
 */

import { prisma } from '@/lib/db/prisma';
import { createHash, randomInt } from 'crypto';
import { dispatchEmail, renderOtpEmail, renderPresalesLockoutAlertEmail } from './emails';
import { maybeApplyOtpLockout } from './guards';

const OTP_TTL_MIN = 10;

function hashOtp(code: string, grantId: string): string {
  return createHash('sha256').update(`${grantId}:${code}`).digest('hex');
}

export async function issuePresalesOtp(grantId: string, now: Date = new Date()): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const otpHash = hashOtp(code, grantId);
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000);

  const grant = await prisma.presalesAccessGrant.update({
    where: { id: grantId },
    data: { otpHash, otpExpiresAt, otpAttemptCount: 0 },
    select: { email: true },
  });

  await dispatchEmail(
    renderOtpEmail({ recipientEmail: grant.email, code, expiresMinutes: OTP_TTL_MIN }),
    { bestEffort: true },
  );

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
      sendConsultantLockoutAlert: async ({ consultantUserId, bundleId, granteeEmail }) => {
        const [consultant, bundle] = await Promise.all([
          prisma.user.findUnique({ where: { id: consultantUserId }, select: { email: true } }),
          prisma.presalesBundle.findUnique({
            where: { id: bundleId },
            select: { clientCompanyName: true },
          }),
        ]);
        // A missing consultant email is a failed alert, not a skipped one —
        // throw so guards.ts records alert_dispatch_failed.
        if (!consultant?.email) throw new Error('consultant account has no email address');
        await dispatchEmail(
          renderPresalesLockoutAlertEmail({
            consultantEmail: consultant.email,
            granteeEmail,
            clientCompanyName: bundle?.clientCompanyName ?? null,
          }),
          { bestEffort: false },
        );
      },
    },
    { grantId: args.grantId, newAttemptCount: newCount },
  );

  if (locked) return { kind: 'locked' };
  return { kind: 'invalid', attemptsRemaining: Math.max(0, 5 - newCount) };
}
