/**
 * Unit tests for Affirm external OTP issue/verify + lockout cascade.
 */

import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const grantFindUnique = vi.fn();
  const grantUpdate = vi.fn();
  const sessionUpdateMany = vi.fn();
  const eventCreate = vi.fn();
  const userFindUnique = vi.fn();
  const transaction = vi.fn();
  const prismaMock = {
    affirmAccessGrant: { findUnique: grantFindUnique, update: grantUpdate },
    affirmGuestSession: { updateMany: sessionUpdateMany },
    affirmEvent: { create: eventCreate },
    user: { findUnique: userFindUnique },
    $transaction: transaction,
  };
  return {
    grantFindUnique,
    grantUpdate,
    sessionUpdateMany,
    eventCreate,
    userFindUnique,
    transaction,
    prismaMock,
    dispatchEmail: vi.fn(),
    writeGuestEvent: vi.fn(),
  };
});

const prismaMock = mocks.prismaMock;

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/presales/emails", () => ({ dispatchEmail: mocks.dispatchEmail }));
vi.mock("@/lib/affirm/external/audit", () => ({ writeGuestEvent: mocks.writeGuestEvent }));
vi.mock("@/lib/affirm/external/emails", () => ({
  renderAffirmOtpEmail: vi.fn(() => ({ to: "x", subject: "s", html: "h", text: "t" })),
  renderAffirmLockoutAlertEmail: vi.fn(() => ({ to: "x", subject: "s", html: "h", text: "t" })),
}));

import { canResendOtp, issueGuestOtp, verifyGuestOtp } from "@/lib/affirm/external/otp";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const GRANT_ID = "grant-1";

function otpHashFor(code: string): string {
  return createHash("sha256").update(`${GRANT_ID}:${code}`).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.grantUpdate.mockResolvedValue({ id: GRANT_ID, email: "e", displayName: "n", bundleId: "b" });
  mocks.dispatchEmail.mockResolvedValue({ delivered: false });
  // Default $transaction executes its callback against the prisma mock.
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
});

describe("canResendOtp", () => {
  it("allows when no live OTP", () => {
    expect(canResendOtp({ otpExpiresAt: null }, NOW)).toBe(true);
  });
  it("blocks within 30s of issue", () => {
    const expiresAt = new Date(NOW.getTime() + 10 * 60 * 1000); // issued now
    expect(canResendOtp({ otpExpiresAt: expiresAt }, NOW)).toBe(false);
  });
  it("allows after 30s", () => {
    const expiresAt = new Date(NOW.getTime() + 10 * 60 * 1000 - 40_000); // issued 40s ago
    expect(canResendOtp({ otpExpiresAt: expiresAt }, NOW)).toBe(true);
  });
});

describe("issueGuestOtp", () => {
  it("resets the attempt counter, sets expiry, emails, and audits", async () => {
    await issueGuestOtp({ grantId: GRANT_ID, now: NOW, kind: "initial", sessionId: "s1" });
    const data = mocks.grantUpdate.mock.calls[0]![0].data;
    expect(data.otpAttemptCount).toBe(0);
    expect(data.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.dispatchEmail).toHaveBeenCalledOnce();
    expect(mocks.writeGuestEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "otp_issued", grantId: GRANT_ID }),
    );
  });
});

describe("verifyGuestOtp", () => {
  it("invalid when grant missing", async () => {
    mocks.grantFindUnique.mockResolvedValue(null);
    expect(await verifyGuestOtp({ grantId: GRANT_ID, code: "123456", uaHash: "ua" })).toEqual({
      kind: "invalid",
      attemptsRemaining: 0,
    });
  });

  it("locked when grant already revoked", async () => {
    mocks.grantFindUnique.mockResolvedValue({ id: GRANT_ID, revokedAt: NOW });
    expect((await verifyGuestOtp({ grantId: GRANT_ID, code: "123456", uaHash: "ua" })).kind).toBe("locked");
  });

  it("expired when no live code", async () => {
    mocks.grantFindUnique.mockResolvedValue({ id: GRANT_ID, revokedAt: null, otpHash: null, otpExpiresAt: null });
    expect((await verifyGuestOtp({ grantId: GRANT_ID, code: "123456", uaHash: "ua" })).kind).toBe("expired");
  });

  it("ok on correct code, records the device uaHash", async () => {
    mocks.grantFindUnique.mockResolvedValue({
      id: GRANT_ID,
      revokedAt: null,
      otpHash: otpHashFor("424242"),
      otpExpiresAt: new Date(NOW.getTime() + 60_000),
      otpAttemptCount: 0,
      otpVerifiedUaHashes: [],
      bundleId: "b",
    });
    const r = await verifyGuestOtp({ grantId: GRANT_ID, code: "424242", uaHash: "ua-device", now: NOW });
    expect(r.kind).toBe("ok");
    const data = mocks.grantUpdate.mock.calls.at(-1)![0].data;
    expect(data.otpVerifiedUaHashes).toContain("ua-device");
    expect(data.otpHash).toBeNull();
  });

  it("invalid + decrement on wrong code below the limit", async () => {
    mocks.grantFindUnique.mockResolvedValue({
      id: GRANT_ID,
      revokedAt: null,
      otpHash: otpHashFor("111111"),
      otpExpiresAt: new Date(NOW.getTime() + 60_000),
      otpAttemptCount: 1,
      otpVerifiedUaHashes: [],
      bundleId: "b",
    });
    const r = await verifyGuestOtp({ grantId: GRANT_ID, code: "999999", uaHash: "ua", now: NOW });
    expect(r).toEqual({ kind: "invalid", attemptsRemaining: 3 }); // 5 - 2
  });

  it("locks + runs the revoke cascade on the 5th wrong attempt", async () => {
    mocks.grantFindUnique
      // first call inside verify
      .mockResolvedValueOnce({
        id: GRANT_ID,
        revokedAt: null,
        otpHash: otpHashFor("111111"),
        otpExpiresAt: new Date(NOW.getTime() + 60_000),
        otpAttemptCount: 4,
        otpVerifiedUaHashes: [],
        bundleId: "b",
      })
      // second call inside applyOtpLockout
      .mockResolvedValueOnce({
        id: GRANT_ID,
        email: "exec@co.com",
        displayName: "Exec",
        revokedAt: null,
        bundleId: "b",
        bundle: { id: "b", client: "Acme", createdById: "consultant-1" },
      });
    mocks.userFindUnique.mockResolvedValue({ email: "consultant@abeam.com", name: "Consultant" });

    const r = await verifyGuestOtp({ grantId: GRANT_ID, code: "999999", uaHash: "ua", now: NOW });
    expect(r.kind).toBe("locked");
    // The lockout transaction ran (revoke + end sessions + otp_lockout event).
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "otp_lockout" }) }),
    );
    // Consultant alert emailed best-effort.
    expect(mocks.dispatchEmail).toHaveBeenCalled();
  });
});
