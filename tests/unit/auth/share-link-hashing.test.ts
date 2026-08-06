/**
 * Share-link tokens are stored as hashes, dual-read for legacy rows.
 *
 * The raw token IS the credential — anyone holding it reads the assessment —
 * so a readable token column was a database that could leak usable links.
 * These tests pin the three behaviors the migration depends on: hash-first
 * lookup, the legacy fallback matching the old plaintext column, and the
 * one-time in-place upgrade that closes the dual-read window by itself.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assessmentShareLink: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create,
    },
  },
}));

import { hashShareLinkToken, verifyShareLink } from "@/lib/auth/share-link";

const TOKEN = "a".repeat(43); // plausible urlsafe-base64 length
const ROW = {
  id: "sl-1",
  assessmentId: "as-1",
  scopeJson: null,
  expiresAt: null,
  revokedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({});
});

describe("verifyShareLink — hash first, legacy second, upgrade once", () => {
  it("matches a hashed row by tokenHash and never rewrites it", async () => {
    mocks.findUnique.mockImplementation((args: { where: Record<string, string> }) =>
      Promise.resolve(
        args.where.tokenHash === hashShareLinkToken(TOKEN)
          ? { ...ROW, tokenHash: hashShareLinkToken(TOKEN) }
          : null,
      ),
    );

    const ctx = await verifyShareLink(TOKEN);
    expect(ctx.assessmentId).toBe("as-1");

    const updateData = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(updateData.tokenHash).toBeUndefined();
    expect(updateData.token).toBeUndefined();
  });

  it("falls back to the legacy plaintext column and upgrades the row in place", async () => {
    mocks.findUnique.mockImplementation((args: { where: Record<string, string> }) =>
      Promise.resolve(args.where.token === TOKEN ? { ...ROW, tokenHash: null } : null),
    );

    const ctx = await verifyShareLink(TOKEN);
    expect(ctx.shareLinkId).toBe("sl-1");

    // The upgrade: hash written, plaintext nulled — the window closes itself.
    const updateData = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(updateData.tokenHash).toBe(hashShareLinkToken(TOKEN));
    expect(updateData.token).toBeNull();
  });

  it("rejects an unknown token on both paths", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(verifyShareLink(TOKEN)).rejects.toMatchObject({ reason: "UNKNOWN" });
    // Both lookups were tried before giving up.
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("issuance stores only the hash", () => {
  it("the create route writes tokenHash and no token column", async () => {
    // Source-level: the property is that no code path writes plaintext for new
    // rows. The route builds its create data inline; assert on the source.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/api/assessments/[id]/share-links/route.ts", "utf8");
    expect(src).toContain("tokenHash: hashShareLinkToken(token)");
    expect(src).not.toMatch(new RegExp("data:\\s*\\{[^}]*\\btoken:\\s*token\\b", "s"));
  });
});
