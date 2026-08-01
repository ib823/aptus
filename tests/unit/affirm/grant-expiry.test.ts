/**
 * An executive invite emails an external party a live link to a client's
 * unreleased Fit-to-Standard decisions. Two controls make that safe, and both
 * were absent: the link has to end, and its scope has to be chosen.
 *
 * These pin the parts that live in library code. The zod schema that makes
 * scope mandatory is asserted from the route's contract in the API tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const grantCreate = vi.fn();
  const grantFindUnique = vi.fn();
  const grantUpdate = vi.fn();
  const grantFindMany = vi.fn();
  const sessionUpdateMany = vi.fn();
  const bundleFindUnique = vi.fn();
  const responseFindMany = vi.fn();
  return {
    grantCreate,
    grantFindUnique,
    grantUpdate,
    grantFindMany,
    sessionUpdateMany,
    bundleFindUnique,
    responseFindMany,
    prismaMock: {
      affirmAccessGrant: {
        create: grantCreate,
        findUnique: grantFindUnique,
        update: grantUpdate,
        findMany: grantFindMany,
      },
      affirmGuestSession: { updateMany: sessionUpdateMany },
      affirmBundle: { findUnique: bundleFindUnique },
      affirmResponse: { findMany: responseFindMany },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    },
    writeGuestEvent: vi.fn(),
    getAffirmSetForGrant: vi.fn(async () => ({ questions: [] })),
    mintToken: vi.fn(() => ({ raw: "raw-token", tokenHash: "hash" })),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/affirm/external/audit", () => ({ writeGuestEvent: mocks.writeGuestEvent }));
vi.mock("@/lib/affirm/external/serializers", () => ({
  getAffirmSetForGrant: mocks.getAffirmSetForGrant,
}));
vi.mock("@/lib/affirm/external/tokens", () => ({ mintToken: mocks.mintToken }));

import {
  DEFAULT_GRANT_WINDOW_DAYS,
  createGrant,
  defaultGrantExpiry,
  listGrantsForBundle,
  reissueGrant,
} from "@/lib/affirm/external/grants";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.grantCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "g1",
    ...data,
  }));
});

describe("defaultGrantExpiry", () => {
  it("is a bounded window, not 'forever'", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    expect(defaultGrantExpiry(now).getTime()).toBe(
      now.getTime() + DEFAULT_GRANT_WINDOW_DAYS * DAY,
    );
    expect(DEFAULT_GRANT_WINDOW_DAYS).toBeGreaterThan(0);
  });
});

describe("createGrant", () => {
  it("persists the expiry it was given", async () => {
    const expiresAt = new Date("2026-09-01T00:00:00Z");
    await createGrant({
      bundleId: "b1",
      email: "cfo@client.test",
      displayName: "Jane Tan",
      valueStreamIds: ["finance"],
      expiresAt,
      actorId: "u1",
    });
    expect(mocks.grantCreate).toHaveBeenCalledTimes(1);
    expect(mocks.grantCreate.mock.calls[0]![0].data.expiresAt).toBe(expiresAt);
  });

  it("records the expiry in the audit event, not just the row", async () => {
    const expiresAt = new Date("2026-09-01T00:00:00Z");
    await createGrant({
      bundleId: "b1",
      email: "cfo@client.test",
      displayName: "Jane Tan",
      valueStreamIds: ["finance"],
      expiresAt,
      actorId: "u1",
    });
    expect(mocks.writeGuestEvent.mock.calls[0]![0].payload.expiresAt).toBe(
      expiresAt.toISOString(),
    );
  });
});

describe("reissueGrant", () => {
  it("bounds the fresh grant instead of copying an absent expiry", async () => {
    // A reissue mints a working credential, so it is an issue. Carrying every
    // field EXCEPT the expiry would recreate the unbounded-link defect behind
    // the "resend" button.
    mocks.grantFindUnique.mockResolvedValue({
      id: "old",
      bundleId: "b1",
      email: "cfo@client.test",
      displayName: "Jane Tan",
      roleLabel: null,
      valueStreamIds: ["finance"],
      revokedAt: null,
      expiresAt: null,
    });

    const before = Date.now();
    const out = await reissueGrant({ grantId: "old", actorId: "u2" });
    expect(out).not.toBeNull();

    const written = mocks.grantCreate.mock.calls[0]![0].data.expiresAt as Date;
    expect(written).toBeInstanceOf(Date);
    expect(written.getTime()).toBeGreaterThan(before);
  });

  it("honours an explicit window when one is supplied", async () => {
    mocks.grantFindUnique.mockResolvedValue({
      id: "old",
      bundleId: "b1",
      email: "cfo@client.test",
      displayName: "Jane Tan",
      roleLabel: null,
      valueStreamIds: ["finance"],
      revokedAt: null,
      expiresAt: null,
    });
    const expiresAt = new Date("2026-10-01T00:00:00Z");
    await reissueGrant({ grantId: "old", actorId: "u2", expiresAt });
    expect(mocks.grantCreate.mock.calls[0]![0].data.expiresAt).toBe(expiresAt);
  });
});

describe("grant status", () => {
  function grantRow(over: Record<string, unknown> = {}) {
    return {
      id: "g1",
      email: "cfo@client.test",
      displayName: "Jane Tan",
      roleLabel: null,
      valueStreamIds: ["finance"],
      ackAt: new Date("2026-07-01T00:00:00Z"),
      otpVerifiedUaHashes: ["ua"],
      otpAttemptCount: 0,
      revokedAt: null,
      supersededByGrantId: null,
      expiresAt: null,
      createdAt: new Date("2026-07-01T00:00:00Z"),
      ...over,
    };
  }

  beforeEach(() => {
    mocks.bundleFindUnique.mockResolvedValue({ state: "issued" });
    mocks.responseFindMany.mockResolvedValue([]);
  });

  it("reports a lapsed grant as expired", async () => {
    mocks.grantFindMany.mockResolvedValue([
      grantRow({ expiresAt: new Date(Date.now() - DAY) }),
    ]);
    const [summary] = await listGrantsForBundle("b1");
    expect(summary!.status).toBe("expired");
  });

  it("leaves a grant inside its window alone", async () => {
    mocks.grantFindMany.mockResolvedValue([
      grantRow({ expiresAt: new Date(Date.now() + DAY) }),
    ]);
    const [summary] = await listGrantsForBundle("b1");
    expect(summary!.status).not.toBe("expired");
  });

  it("keeps saying 'revoked' when a grant was revoked before it lapsed", async () => {
    // Revocation is a decision someone made; lapsing is time passing. The
    // record should not lose the fact that a human ended this.
    mocks.grantFindMany.mockResolvedValue([
      grantRow({
        revokedAt: new Date(Date.now() - 2 * DAY),
        expiresAt: new Date(Date.now() - DAY),
      }),
    ]);
    const [summary] = await listGrantsForBundle("b1");
    expect(summary!.status).toBe("revoked");
  });

  it("surfaces the expiry so the panel can show when access ends", async () => {
    const expiresAt = new Date(Date.now() + 5 * DAY);
    mocks.grantFindMany.mockResolvedValue([grantRow({ expiresAt })]);
    const [summary] = await listGrantsForBundle("b1");
    expect(summary!.expiresAt).toBe(expiresAt);
  });
});
