/**
 * Presales OTP issue/verify — delivery and the lockout alert.
 *
 * THE DEFECT THIS PINS: issuePresalesOtp hashed the code into the grant and
 * then only console.log'd it outside production — nothing was ever SENT. The
 * redeem route wrote an `otp_sent` audit row all the same, so the system
 * asserted a delivery that never happened and a guest could never obtain
 * their code. The sibling flows (affirm, discovery) dispatched through the
 * shared transport all along; these tests hold presales to the same bar.
 *
 * Mock pattern mirrors tests/unit/affirm/external/otp.test.ts.
 */

import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const grantFindUnique = vi.fn();
  const grantUpdate = vi.fn();
  const auditCreate = vi.fn();
  const bundleFindUnique = vi.fn();
  const userFindUnique = vi.fn();
  const transaction = vi.fn();
  const prismaMock = {
    presalesAccessGrant: { findUnique: grantFindUnique, update: grantUpdate },
    presalesAuditEvent: { create: auditCreate },
    presalesBundle: { findUnique: bundleFindUnique },
    user: { findUnique: userFindUnique },
    $transaction: transaction,
  };
  return {
    grantFindUnique,
    grantUpdate,
    auditCreate,
    bundleFindUnique,
    userFindUnique,
    transaction,
    prismaMock,
    dispatchEmail: vi.fn(),
    renderOtpEmail: vi.fn(() => ({ to: 'x', subject: 's', html: 'h', text: 't' })),
    renderPresalesLockoutAlertEmail: vi.fn(() => ({ to: 'x', subject: 's', html: 'h', text: 't' })),
  };
});

vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prismaMock }));
vi.mock('@/lib/presales/emails', () => ({
  dispatchEmail: mocks.dispatchEmail,
  renderOtpEmail: mocks.renderOtpEmail,
  renderPresalesLockoutAlertEmail: mocks.renderPresalesLockoutAlertEmail,
}));

import { issuePresalesOtp, verifyPresalesOtp } from '@/lib/presales/otp';

const NOW = new Date('2026-07-30T12:00:00.000Z');
const GRANT_ID = 'grant-1';

function otpHashFor(code: string): string {
  return createHash('sha256').update(`${GRANT_ID}:${code}`).digest('hex');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dispatchEmail.mockResolvedValue({ delivered: true, messageId: 'm1' });
  // guards.ts runs its lockout transaction as an array of prisma promises.
  mocks.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  mocks.grantUpdate.mockResolvedValue({ email: 'guest@example.com' });
  mocks.auditCreate.mockResolvedValue({ id: 'evt-1' });
});

describe('issuePresalesOtp — the code is actually sent', () => {
  it('emails the code to the grantee', async () => {
    await issuePresalesOtp(GRANT_ID, NOW);

    expect(mocks.dispatchEmail).toHaveBeenCalledOnce();
    expect(mocks.renderOtpEmail).toHaveBeenCalledOnce();
    const ctx = mocks.renderOtpEmail.mock.calls[0]![0] as {
      recipientEmail: string;
      code: string;
      expiresMinutes: number;
    };
    expect(ctx.recipientEmail).toBe('guest@example.com');
    expect(ctx.code).toMatch(/^\d{6}$/);
    expect(ctx.expiresMinutes).toBe(10);
    // Best-effort: a bounced OTP is re-requestable via /c/verify/resend.
    expect(mocks.dispatchEmail.mock.calls[0]![1]).toEqual({ bestEffort: true });
  });

  it('stores the hash of the SAME code it sends', async () => {
    await issuePresalesOtp(GRANT_ID, NOW);

    const sent = (mocks.renderOtpEmail.mock.calls[0]![0] as { code: string }).code;
    const stored = mocks.grantUpdate.mock.calls[0]![0] as {
      data: { otpHash: string };
    };
    expect(stored.data.otpHash).toBe(otpHashFor(sent));
  });

  it('a failed send does not throw — the hash stands and resend recovers', async () => {
    mocks.dispatchEmail.mockResolvedValue({ delivered: false, bestEffortFailed: true });
    await expect(issuePresalesOtp(GRANT_ID, NOW)).resolves.toBeUndefined();
  });
});

describe('verifyPresalesOtp — the fifth failure alerts the consultant', () => {
  /** Grant shape serving BOTH verify's findUnique and guards.ts's re-read. */
  const grantRow = {
    id: GRANT_ID,
    email: 'guest@example.com',
    bundleId: 'bundle-1',
    revokedAt: null,
    otpHash: otpHashFor('111111'),
    otpExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    otpAttemptCount: 4,
    bundle: { createdBy: 'consultant-user-1' },
  };

  beforeEach(() => {
    mocks.grantFindUnique.mockResolvedValue(grantRow);
    mocks.userFindUnique.mockResolvedValue({ email: 'consultant@abeam.com' });
    mocks.bundleFindUnique.mockResolvedValue({ clientCompanyName: 'Acme Corp' });
  });

  it('locks, and the alert email reaches the bundle creator', async () => {
    const result = await verifyPresalesOtp({
      grantId: GRANT_ID,
      code: '999999',
      uaHash: 'ua-1',
      now: NOW,
    });

    expect(result).toEqual({ kind: 'locked' });
    expect(mocks.renderPresalesLockoutAlertEmail).toHaveBeenCalledOnce();
    expect(mocks.renderPresalesLockoutAlertEmail.mock.calls[0]![0]).toEqual({
      consultantEmail: 'consultant@abeam.com',
      granteeEmail: 'guest@example.com',
      clientCompanyName: 'Acme Corp',
    });
    // NOT best-effort: a throw is how guards.ts learns to write the
    // alert_dispatch_failed audit row. Swallowing it would erase the record.
    const alertCall = mocks.dispatchEmail.mock.calls.find(
      (c) => (c[1] as { bestEffort?: boolean } | undefined)?.bestEffort === false,
    );
    expect(alertCall).toBeDefined();
  });

  it('a failed alert still locks — and is audited as alert_dispatch_failed', async () => {
    mocks.dispatchEmail.mockRejectedValue(new Error('smtp down'));

    const result = await verifyPresalesOtp({
      grantId: GRANT_ID,
      code: '999999',
      uaHash: 'ua-1',
      now: NOW,
    });

    expect(result).toEqual({ kind: 'locked' });
    const auditPayloads = mocks.auditCreate.mock.calls.map(
      (c) => (c[0] as { data: { payload?: { reason?: string } } }).data.payload,
    );
    expect(auditPayloads.some((p) => p?.reason === 'alert_dispatch_failed')).toBe(true);
  });

  it('a wrong code below the limit does not alert anyone', async () => {
    mocks.grantFindUnique.mockResolvedValue({ ...grantRow, otpAttemptCount: 1 });

    const result = await verifyPresalesOtp({
      grantId: GRANT_ID,
      code: '999999',
      uaHash: 'ua-1',
      now: NOW,
    });

    expect(result).toEqual({ kind: 'invalid', attemptsRemaining: 3 });
    expect(mocks.renderPresalesLockoutAlertEmail).not.toHaveBeenCalled();
  });

  it('the right code verifies without any email', async () => {
    const result = await verifyPresalesOtp({
      grantId: GRANT_ID,
      code: '111111',
      uaHash: 'ua-1',
      now: NOW,
    });

    expect(result).toEqual({ kind: 'ok' });
    expect(mocks.dispatchEmail).not.toHaveBeenCalled();
  });
});
