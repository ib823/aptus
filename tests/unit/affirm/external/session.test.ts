/**
 * Unit tests for Affirm external guest session lifecycle.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    affirmGuestSession: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

import {
  createGuestSession,
  endActiveSessionsForDevice,
  endGuestSession,
  isClientFacingState,
  readGuestSession,
} from "@/lib/affirm/external/session";
import { hashToken } from "@/lib/affirm/external/tokens";

const NOW = new Date("2026-07-15T12:00:00.000Z");

/** Build a resolvable session row (createdAt now, seen now, live grant/bundle). */
function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    grantId: "grant-1",
    tokenHash: "hash",
    uaHash: "ua",
    createdAt: NOW,
    lastSeenAt: NOW,
    endedAt: null,
    endedReason: null,
    grant: {
      id: "grant-1",
      revokedAt: null,
      supersededByGrantId: null,
      bundle: { id: "bundle-1", state: "issued" },
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("isClientFacingState", () => {
  it("is true only for issued/submitted", () => {
    expect(isClientFacingState("issued")).toBe(true);
    expect(isClientFacingState("submitted")).toBe(true);
    expect(isClientFacingState("draft")).toBe(false);
    expect(isClientFacingState("released")).toBe(false);
  });
});

describe("createGuestSession", () => {
  it("stores the hash of the raw token and returns the raw", async () => {
    mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "sess-1",
      ...data,
    }));
    const { rawToken } = await createGuestSession({ grantId: "grant-1", uaHash: "ua", now: NOW });
    const created = mocks.create.mock.calls[0]![0].data;
    expect(created.tokenHash).toBe(hashToken(rawToken));
    expect(created.tokenHash).not.toBe(rawToken);
  });
});

describe("readGuestSession", () => {
  it("returns the chain for a valid session", async () => {
    mocks.findUnique.mockResolvedValue(sessionRow());
    const r = await readGuestSession({ cookieValue: "raw", now: NOW });
    expect(r).not.toBeNull();
    expect(r!.bundle.id).toBe("bundle-1");
  });

  it("null when no cookie", async () => {
    expect(await readGuestSession({ cookieValue: undefined, now: NOW })).toBeNull();
  });

  it("null when session ended", async () => {
    mocks.findUnique.mockResolvedValue(sessionRow({ endedAt: NOW }));
    expect(await readGuestSession({ cookieValue: "raw", now: NOW })).toBeNull();
  });

  it("null past the 8h absolute cap", async () => {
    mocks.findUnique.mockResolvedValue(sessionRow({ createdAt: new Date("2026-07-15T03:00:00.000Z") }));
    expect(await readGuestSession({ cookieValue: "raw", now: NOW })).toBeNull();
  });

  it("null past the 60min idle window", async () => {
    mocks.findUnique.mockResolvedValue(sessionRow({ lastSeenAt: new Date("2026-07-15T11:00:00.000Z") }));
    expect(await readGuestSession({ cookieValue: "raw", now: NOW })).toBeNull();
  });

  it("null when grant revoked", async () => {
    mocks.findUnique.mockResolvedValue(
      sessionRow({ grant: { id: "grant-1", revokedAt: NOW, supersededByGrantId: null, bundle: { id: "b", state: "issued" } } }),
    );
    expect(await readGuestSession({ cookieValue: "raw", now: NOW })).toBeNull();
  });

  it("null when grant superseded", async () => {
    mocks.findUnique.mockResolvedValue(
      sessionRow({ grant: { id: "grant-1", revokedAt: null, supersededByGrantId: "g2", bundle: { id: "b", state: "issued" } } }),
    );
    expect(await readGuestSession({ cookieValue: "raw", now: NOW })).toBeNull();
  });

  it("null when bundle no longer client-facing", async () => {
    mocks.findUnique.mockResolvedValue(
      sessionRow({ grant: { id: "grant-1", revokedAt: null, supersededByGrantId: null, bundle: { id: "b", state: "released" } } }),
    );
    expect(await readGuestSession({ cookieValue: "raw", now: NOW })).toBeNull();
  });
});

describe("session ending", () => {
  it("endGuestSession only ends live rows", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await endGuestSession({ sessionId: "sess-1", reason: "logout", now: NOW });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "sess-1", endedAt: null },
      data: { endedAt: NOW, endedReason: "logout" },
    });
  });

  it("endActiveSessionsForDevice scopes by grant + uaHash", async () => {
    mocks.updateMany.mockResolvedValue({ count: 2 });
    await endActiveSessionsForDevice({ grantId: "grant-1", uaHash: "ua", reason: "superseded", now: NOW });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { grantId: "grant-1", uaHash: "ua", endedAt: null },
      data: { endedAt: NOW, endedReason: "superseded" },
    });
  });
});
