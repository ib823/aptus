/**
 * ABeam Workbench — Presales application-layer guards.
 *
 * These functions enforce two refinements that the Prisma schema deliberately
 * does NOT enforce at the DB level:
 *
 *   R1  Snapshot mutability before send.
 *       While a PresalesBundle has no `bundle_sent` audit event, its
 *       `contentSnapshotJson` and `scopeCodes` are mutable. Once `bundle_sent`
 *       has been written, both fields lock and any mutation returns 409.
 *
 *   R2  OTP lockout.
 *       When a PresalesAccessGrant's `otpAttemptCount` reaches 5, the grant
 *       auto-revokes, an `external_action_denied` audit event is written, and
 *       the bundle creator (consultant) is emailed. Permanent — no timer-based
 *       re-arm. Consultant must issue a fresh grant via the re-issue flow,
 *       which chains `supersededByGrantId`.
 *
 * These are skeletons. The redaction-layer step lands first; these guards
 * become live in the bundle-mutation and OTP-verify routes.
 */

import type { PrismaClient } from '@prisma/client';

// ─── R1: snapshot lock ──────────────────────────────────────────────────────

export class SnapshotLockedError extends Error {
  readonly httpStatus = 409;
  readonly code = 'PRESALES_BUNDLE_SENT';
  constructor(bundleId: string) {
    super(`PresalesBundle ${bundleId} is locked: bundle_sent has fired`);
    this.name = 'SnapshotLockedError';
  }
}

/**
 * Call before every server-side mutation that touches
 * `contentSnapshotJson` or `scopeCodes`. Throws SnapshotLockedError (409) if
 * the bundle has already been sent.
 *
 * Implementation note: a single `bundle_sent` row is the source of truth.
 * Use the existing PresalesAuditEvent index `[bundleId, createdAt]` and limit
 * 1 — this is hot path, do not full-scan.
 */
export async function assertBundleDraft(
  prisma: PrismaClient,
  bundleId: string,
): Promise<void> {
  const sentEvent = await prisma.presalesAuditEvent.findFirst({
    where: { bundleId, eventType: 'bundle_sent' },
    select: { id: true },
  });
  if (sentEvent) throw new SnapshotLockedError(bundleId);
}

// ─── R2: OTP-5 lockout ──────────────────────────────────────────────────────

export const OTP_MAX_ATTEMPTS = 5;

export interface OtpLockoutDeps {
  prisma: PrismaClient;
  /** Resend-backed alert to bundle.createdBy. Implemented at email layer. */
  sendConsultantLockoutAlert: (args: {
    consultantUserId: string;
    bundleId: string;
    grantId: string;
    granteeEmail: string;
  }) => Promise<void>;
  now?: () => Date;
}

/**
 * Call from the OTP-verify route AFTER incrementing `otpAttemptCount` on a
 * failed attempt. If the new count is the limit, run the lockout cascade in
 * a single transaction:
 *
 *   (a) grant.revokedAt = now
 *   (b) grant.revokedBy = bundle.createdBy
 *   (c) PresalesAuditEvent { external_action_denied, payload.reason="otp_exhausted", attempts: 5 }
 *
 * Then, OUTSIDE the transaction (don't block the verify response on email
 * deliverability), dispatch the consultant alert. The alert is best-effort:
 * a failed send must log to Sentry but must NOT roll back the lockout.
 *
 * Returns true if the lockout was applied on this call (so callers can return
 * a "permanently locked" body to the client instead of "wrong code, try
 * again").
 */
export async function maybeApplyOtpLockout(
  deps: OtpLockoutDeps,
  args: { grantId: string; newAttemptCount: number },
): Promise<boolean> {
  if (args.newAttemptCount < OTP_MAX_ATTEMPTS) return false;

  const { prisma, sendConsultantLockoutAlert, now = () => new Date() } = deps;

  const grant = await prisma.presalesAccessGrant.findUnique({
    where: { id: args.grantId },
    select: {
      id: true,
      email: true,
      revokedAt: true,
      bundleId: true,
      bundle: { select: { createdBy: true } },
    },
  });
  if (!grant) return false;
  if (grant.revokedAt) return true; // already locked; idempotent

  // Apply the lockout and create the primary audit row in one transaction.
  // We capture the audit row's id so a follow-up alert-dispatch-failed row
  // (if email send fails) can reference it via payload.originalEventId.
  const [, lockoutEvent] = await prisma.$transaction([
    prisma.presalesAccessGrant.update({
      where: { id: grant.id },
      data: { revokedAt: now(), revokedBy: grant.bundle.createdBy },
    }),
    prisma.presalesAuditEvent.create({
      data: {
        bundleId: grant.bundleId,
        grantId: grant.id,
        eventType: 'external_action_denied',
        payload: { reason: 'otp_exhausted', attempts: OTP_MAX_ATTEMPTS },
      },
      select: { id: true },
    }),
  ]);

  // Best-effort consultant alert. A send failure must NOT roll back the
  // lockout — but the consultant needs to see that the alert may not have
  // reached them. So on failure we write a second audit row of the same
  // type with reason='alert_dispatch_failed', cross-referencing the
  // original lockout event. On next dashboard load the consultant sees both
  // the lockout AND the delivery uncertainty.
  try {
    await sendConsultantLockoutAlert({
      consultantUserId: grant.bundle.createdBy,
      bundleId: grant.bundleId,
      grantId: grant.id,
      granteeEmail: grant.email,
    });
  } catch {
    try {
      await prisma.presalesAuditEvent.create({
        data: {
          bundleId: grant.bundleId,
          grantId: grant.id,
          eventType: 'external_action_denied',
          payload: {
            reason: 'alert_dispatch_failed',
            grantId: grant.id,
            originalEventId: lockoutEvent.id,
          },
        },
      });
    } catch {
      /* the email transport already logged the dispatch failure; if the
         audit-write also fails, Sentry on the transport side is the
         backstop. We do not surface this to the OTP-verify response. */
    }
  }

  return true;
}
