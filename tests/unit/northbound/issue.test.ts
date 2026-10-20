/**
 * Issuing, rotating and revoking a runtime credential.
 *
 * The assertions that matter: the raw token is never persisted, rotation kills
 * the old token with no overlap window, and revocation KEEPS the row so the
 * audit stays legible afterwards.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  closeLinks: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
  solutionFind: vi.fn(),
  liveUsers: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => {
  const client = {
    solutionClient: {
      upsert: mocks.upsert,
      findFirst: mocks.findFirst,
      update: mocks.update,
      findMany: mocks.findMany,
    },
    // Every change to a lane's key closes the claim links still out for it.
    keyClaimLink: { updateMany: mocks.closeLinks },
    // The owner gate's reads, re-applied under the lock when an issuer is named.
    solution: { findFirst: mocks.solutionFind },
    user: { findMany: mocks.liveUsers },
    // The Solution row lock must be taken on the transaction, never the client.
    $queryRaw: () => {
      throw new Error("the Solution row lock must be taken on the transaction");
    },
  };
  return {
    prisma: {
      ...client,
      // Each key change is ONE transaction (P0.1): the lock, both closes and the
      // write run on `tx`, and a throw anywhere in it is the transaction's throw.
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        mocks.transaction();
        return fn({ ...client, $queryRaw: mocks.lock });
      },
    },
  };
});

import { hashClientToken } from "@/lib/northbound/auth";
import {
  generateClientToken,
  issueClientToken,
  KeyIssuerRefused,
  listClients,
  revokeClientToken,
  rotateClientToken,
} from "@/lib/northbound/issue";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const SCOPE = tenantScopeOf("org_a");
const ROW = {
  id: "client_1",
  solutionId: "sol_1",
  label: "Finance accelerator",
  environment: "PROD",
  createdAt: new Date("2026-07-25T00:00:00Z"),
};

/** The row as the lookups select it: a live credential with no expiry. */
const LIVE = {
  id: "client_1",
  solutionId: "sol_1",
  environment: "PROD",
  isActive: true,
  revokedAt: null,
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsert.mockResolvedValue(ROW);
  mocks.findFirst.mockResolvedValue(LIVE);
  mocks.closeLinks.mockResolvedValue({ count: 0 });
  mocks.update.mockResolvedValue({ ...ROW, isActive: false, revokedAt: new Date() });
  mocks.findMany.mockResolvedValue([]);
});

describe("token generation", () => {
  it("is prefixed, long, and never repeats", () => {
    const a = generateClientToken();
    const b = generateClientToken();
    expect(a).toMatch(/^ce_/);
    expect(a).not.toBe(b);
    // 32 bytes base64url ≈ 43 chars, plus the prefix.
    expect(a.length).toBeGreaterThan(40);
  });

  it("is URL-safe, so it survives being pasted into a header or env file", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateClientToken()).toMatch(/^ce_[A-Za-z0-9_-]+$/);
    }
  });
});

describe("issuing", () => {
  it("stores only the HASH, never the raw token", async () => {
    const issued = await issueClientToken(SCOPE, {
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      createdById: "u_issuer",
    });

    const call = mocks.upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    // The single most important assertion in this file.
    expect(JSON.stringify(call)).not.toContain(issued.rawToken);
    expect(call.create.tokenHash).toBe(hashClientToken(issued.rawToken));
    expect(call.create).not.toHaveProperty("token");
  });

  it("returns the raw token exactly once, to the caller", async () => {
    const issued = await issueClientToken(SCOPE, {
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      createdById: "u",
    });
    expect(issued.rawToken).toMatch(/^ce_/);
  });

  it("stamps the caller's organization", async () => {
    await issueClientToken(SCOPE, {
      solutionId: "sol_1",
      label: "x",
      environment: "DEV",
      createdById: "u",
    });
    const call = mocks.upsert.mock.calls[0]?.[0] as { create: Record<string, unknown> };
    expect(call.create.organizationId).toBe("org_a");
  });

  it("upserts on (organization, solution, environment), so it neither accumulates nor leaves the tenant", async () => {
    // Three properties.
    //
    // Keyed by solution AND environment (AD-11): four live tokens for one
    // environment is four things to leak and four to remember to revoke, so
    // re-issuing for the same environment must rotate rather than add — while
    // a second environment adds a credential beside the first instead of
    // killing it, which is what promotion through a landscape needs.
    //
    // Keyed by ORGANIZATION too: the update branch of this upsert rotates the
    // token hash and revives a revoked credential. Keyed on `{ solutionId }`
    // alone, nothing in the write itself keeps it inside the tenant — the only
    // thing that did was the caller scoping the solution lookup one line above,
    // which is precisely the arrangement PR #169 removed from eleven other
    // mutations. This asserts the tenant is in the key, not in the context.
    await issueClientToken(SCOPE, {
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      createdById: "u",
    });
    const call = mocks.upsert.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(call.where).toEqual({
      organizationId_solutionId_environment: { organizationId: "org_a", solutionId: "sol_1", environment: "PROD" },
    });
  });

  it("never rewrites the environment on rotation — it is the key, not a field", async () => {
    // Under the old solution-only key a re-issue could reclassify a credential
    // from DEV to PROD in place, voiding the grant that authorised it.
    await issueClientToken(SCOPE, {
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      createdById: "u",
    });
    const call = mocks.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    expect(call.update).not.toHaveProperty("environment");
  });

  it("re-issuing revives a revoked credential — that is what the request means", async () => {
    await issueClientToken(SCOPE, {
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      createdById: "u",
    });
    const call = mocks.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    expect(call.update.isActive).toBe(true);
    expect(call.update.revokedAt).toBeNull();
  });
});

describe("rotation", () => {
  beforeEach(() => {
    mocks.update.mockResolvedValue(ROW);
  });

  it("replaces the hash, so the previous token dies immediately", async () => {
    const rotated = await rotateClientToken(SCOPE, "client_1");
    expect(rotated).not.toBeNull();
    const data = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.tokenHash).toBe(hashClientToken(rotated!.rawToken));
  });

  it("leaves NO overlap window where both tokens work", async () => {
    // An overlap is exactly how a leaked credential survives its own rotation.
    await rotateClientToken(SCOPE, "client_1");
    const data = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    // One hash column, overwritten. No "previousTokenHash", no grace period.
    expect(Object.keys(data).filter((k) => k.toLowerCase().includes("hash"))).toEqual(["tokenHash"]);
  });

  it("is scoped — another tenant's credential is not found", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await rotateClientToken(SCOPE, "client_other")).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("scopes the lookup by organization", async () => {
    await rotateClientToken(SCOPE, "client_1");
    const where = mocks.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.organizationId).toBe("org_a");
  });
});

describe("revocation", () => {
  it("deactivates and stamps a revocation time", async () => {
    await revokeClientToken(SCOPE, "client_1");
    const data = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.isActive).toBe(false);
    expect(data.revokedAt).toBeInstanceOf(Date);
  });

  it("KEEPS the row rather than deleting it", async () => {
    // Delete the client and its audit history becomes anonymous — precisely
    // backwards for the situation you revoke in.
    await revokeClientToken(SCOPE, "client_1");
    expect(mocks.update).toHaveBeenCalled();
  });

  it("is scoped to the caller's organization", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await revokeClientToken(SCOPE, "client_other")).toBeNull();
  });
});

/**
 * What a change to a lane's key does to everything else that could bring a key
 * back — the claim links still out for it, and the write key sealed on its row.
 */
describe("every change to a key closes the lane's pending claim links", () => {
  const LANE_LINKS = {
    organizationId: "org_a",
    solutionId: "sol_1",
    environment: "PROD",
    claimedAt: null,
    revokedAt: null,
  };

  it("revoking closes them, before the key is revoked", async () => {
    // A link sent on day 0 and opened after a day-1 revocation used to bring
    // the revoked key back as active with a fresh token.
    await revokeClientToken(SCOPE, "client_1");

    const close = mocks.closeLinks.mock.calls[0]?.[0] as { where: unknown; data: Record<string, unknown> };
    expect(close.where).toEqual(LANE_LINKS);
    expect(close.data.revokedAt).toBeInstanceOf(Date);
    expect(close.data.revokedReason).toBe("The key was revoked.");
    // Safe-first: a failure between the two writes leaves a dead link and a
    // live key, never a revoked key with a live link aimed at it.
    expect(mocks.closeLinks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0]!,
    );
  });

  it("issuing closes them, so a link sent earlier cannot replace the new key", async () => {
    await issueClientToken(SCOPE, { solutionId: "sol_1", label: "x", environment: "PROD", createdById: "u" });

    const close = mocks.closeLinks.mock.calls[0]?.[0] as { where: unknown };
    expect(close.where).toEqual(LANE_LINKS);
    expect(mocks.closeLinks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upsert.mock.invocationCallOrder[0]!,
    );
  });

  it("rotating closes them too", async () => {
    mocks.update.mockResolvedValue(ROW);
    await rotateClientToken(SCOPE, "client_1");

    const close = mocks.closeLinks.mock.calls[0]?.[0] as { where: unknown };
    expect(close.where).toEqual(LANE_LINKS);
    expect(mocks.closeLinks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0]!,
    );
  });

  it("each closes them again once the key is written, for a link sent in between", async () => {
    // The close and the write are separate statements. A link sent between
    // them is stamped after the close, and a re-issue, a rotation and a
    // revocation all leave the row's createdAt where it was, so no claim-time
    // check can tell it from a deliberate send against the new key.
    const changes = [
      {
        reason: "A key was issued for this environment.",
        write: mocks.upsert,
        run: () =>
          issueClientToken(SCOPE, { solutionId: "sol_1", label: "x", environment: "PROD", createdById: "u" }),
      },
      {
        reason: "The key for this environment was rotated.",
        write: mocks.update,
        run: () => rotateClientToken(SCOPE, "client_1"),
      },
      {
        reason: "The key was revoked.",
        write: mocks.update,
        run: () => revokeClientToken(SCOPE, "client_1"),
      },
    ];
    for (const { reason, write, run } of changes) {
      mocks.closeLinks.mockClear();
      write.mockClear();
      await run();

      expect(mocks.closeLinks, reason).toHaveBeenCalledTimes(2);
      const [before, after] = mocks.closeLinks.mock.invocationCallOrder;
      expect(before, reason).toBeLessThan(write.mock.invocationCallOrder[0]!);
      expect(after, reason).toBeGreaterThan(write.mock.invocationCallOrder[0]!);
      const second = mocks.closeLinks.mock.calls[1]?.[0] as { where: unknown; data: Record<string, unknown> };
      expect(second.where, reason).toEqual(LANE_LINKS);
      expect(second.data.revokedReason).toBe(reason);
    }
  });

  it("fails as a whole when the close AFTER the write fails — the write is in the same transaction", async () => {
    // It used to be a best-effort statement after the write: a failure left the
    // new key standing with a live link aimed at it, and that link, opened
    // later, replaced the token its holder had just been shown. Now the close
    // and the write commit together or not at all, and no token is returned.
    const changes = [
      () => issueClientToken(SCOPE, { solutionId: "sol_1", label: "x", environment: "PROD", createdById: "u" }),
      () => rotateClientToken(SCOPE, "client_1"),
      () => revokeClientToken(SCOPE, "client_1"),
    ];
    for (const run of changes) {
      mocks.closeLinks.mockReset();
      mocks.closeLinks.mockResolvedValueOnce({ count: 0 }).mockRejectedValueOnce(new Error("pool timeout"));
      await expect(run()).rejects.toThrow("pool timeout");
    }
  });

  it("runs the lock, both closes and the write inside ONE transaction, the lock first", async () => {
    const changes = [
      { write: mocks.upsert, run: () => issueClientToken(SCOPE, { solutionId: "sol_1", label: "x", environment: "PROD", createdById: "u" }) },
      { write: mocks.update, run: () => rotateClientToken(SCOPE, "client_1") },
      { write: mocks.update, run: () => revokeClientToken(SCOPE, "client_1") },
    ];
    for (const { write, run } of changes) {
      vi.clearAllMocks();
      mocks.closeLinks.mockResolvedValue({ count: 0 });
      mocks.findFirst.mockResolvedValue(LIVE);
      mocks.upsert.mockResolvedValue(ROW);
      mocks.update.mockResolvedValue(ROW);
      await run();
      expect(mocks.transaction).toHaveBeenCalledOnce();
      // The app's row lock, on the transaction, keyed by the tenant too.
      expect(mocks.lock).toHaveBeenCalledOnce();
      expect(mocks.lock.mock.calls[0]?.slice(1)).toEqual(["sol_1", "org_a"]);
      const lockedAt = mocks.lock.mock.invocationCallOrder[0]!;
      expect(lockedAt).toBeLessThan(mocks.closeLinks.mock.invocationCallOrder[0]!);
      expect(lockedAt).toBeLessThan(write.mock.invocationCallOrder[0]!);
    }
  });

  it("still fails when the close BEFORE the write fails — the key must not change with a link aimed at it", async () => {
    mocks.closeLinks.mockReset();
    mocks.closeLinks.mockRejectedValueOnce(new Error("pool timeout"));
    await expect(rotateClientToken(SCOPE, "client_1")).rejects.toThrow("pool timeout");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("closes nothing for a credential in another tenant", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await revokeClientToken(SCOPE, "client_other");
    await rotateClientToken(SCOPE, "client_other");
    expect(mocks.closeLinks).not.toHaveBeenCalled();
  });
});

describe("a revoked credential does not keep its write key", () => {
  it("revoking destroys the sealed write key", async () => {
    // `secretsCiphertext` is sealed against the row id, and every revival
    // reuses the row — so a write key left here verified again beside the
    // next token issued on this lane.
    await revokeClientToken(SCOPE, "client_1");
    const data = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).toHaveProperty("secretsCiphertext", null);
  });

  it("re-issuing onto a revoked row clears a write key left from before", async () => {
    mocks.findFirst.mockResolvedValue({ isActive: false, revokedAt: new Date("2026-07-01T00:00:00Z") });
    await issueClientToken(SCOPE, { solutionId: "sol_1", label: "x", environment: "PROD", createdById: "u" });
    const call = mocks.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    expect(call.update).toHaveProperty("secretsCiphertext", null);
  });

  it("re-issuing a LIVE credential leaves its write key alone", async () => {
    // Rotation of a working key is not a compromise; killing the write key
    // there would break writes nobody asked to stop.
    mocks.findFirst.mockResolvedValue({ isActive: true, revokedAt: null });
    await issueClientToken(SCOPE, { solutionId: "sol_1", label: "x", environment: "PROD", createdById: "u" });
    const call = mocks.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    expect(call.update).not.toHaveProperty("secretsCiphertext");
  });

  it("rotating a revoked credential clears it, rotating a live one does not", async () => {
    mocks.update.mockResolvedValue(ROW);
    mocks.findFirst.mockResolvedValue({ ...LIVE, isActive: false, revokedAt: new Date("2026-07-01T00:00:00Z") });
    await rotateClientToken(SCOPE, "client_1");
    expect(mocks.update.mock.calls[0]?.[0]?.data).toHaveProperty("secretsCiphertext", null);

    mocks.findFirst.mockResolvedValue(LIVE);
    await rotateClientToken(SCOPE, "client_1");
    expect(mocks.update.mock.calls[1]?.[0]?.data).not.toHaveProperty("secretsCiphertext");
  });
});

describe("rotation renews a lapsed expiry", () => {
  beforeEach(() => {
    mocks.update.mockResolvedValue(ROW);
  });

  it("clears an expiry that has already passed, so the new token is not refused on arrival", async () => {
    mocks.findFirst.mockResolvedValue({ ...LIVE, expiresAt: new Date(Date.now() - 60_000) });
    await rotateClientToken(SCOPE, "client_1");
    expect(mocks.update.mock.calls[0]?.[0]?.data).toHaveProperty("expiresAt", null);
  });

  it("keeps an expiry still in the future — that is the issuer's decision", async () => {
    mocks.findFirst.mockResolvedValue({ ...LIVE, expiresAt: new Date(Date.now() + 86_400_000) });
    await rotateClientToken(SCOPE, "client_1");
    expect(mocks.update.mock.calls[0]?.[0]?.data).not.toHaveProperty("expiresAt");
  });
});

describe("listing", () => {
  it("selects no field that could carry a credential", async () => {
    await listClients(SCOPE);
    const select = mocks.findMany.mock.calls[0]?.[0]?.select as Record<string, unknown>;
    expect(select).not.toHaveProperty("tokenHash");
    expect(select).not.toHaveProperty("secretsCiphertext");
  });

  it("is organization-scoped", async () => {
    await listClients(SCOPE);
    const where = mocks.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.organizationId).toBe("org_a");
  });
});

describe("the owner gate is re-applied under the lock, with the key write (P0.1)", () => {
  const OWNERS = { status: "ACTIVE", technicalOwnerId: "u_t", businessOwnerId: "u_b", supportOwnerId: "u_s" };
  const issue = () =>
    issueClientToken(
      SCOPE,
      { solutionId: "sol_1", label: "x", environment: "PROD", createdById: "u_issuer" },
      { issuerId: "u_issuer" },
    );

  beforeEach(() => {
    mocks.solutionFind.mockResolvedValue(OWNERS);
    mocks.liveUsers.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map((id) => ({ id }))),
    );
  });

  it("issues when three live owners hold the slots and the issuer is none of them", async () => {
    await expect(issue()).resolves.toMatchObject({ id: "client_1" });
    // Read after the lock, on the transaction.
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.solutionFind.mock.invocationCallOrder[0]!);
  });

  it("refuses, and writes nothing, when a slot's owner has left — judged on live members", async () => {
    mocks.liveUsers.mockResolvedValue([{ id: "u_t" }, { id: "u_s" }]);
    await expect(issue()).rejects.toMatchObject({
      name: "KeyIssuerRefused",
      refusal: { reason: "ownersMissing", missing: ["business owner"], departed: true },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.closeLinks).not.toHaveBeenCalled();
  });

  it("refuses an issuer who became an owner before the lock was theirs", async () => {
    mocks.solutionFind.mockResolvedValue({ ...OWNERS, supportOwnerId: "u_issuer" });
    const err = await issue().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KeyIssuerRefused);
    expect((err as KeyIssuerRefused).refusal).toEqual({ reason: "issuerIsOwner" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("refuses a RETIRED app under the lock too", async () => {
    mocks.solutionFind.mockResolvedValue({ ...OWNERS, status: "RETIRED" });
    await expect(issue()).rejects.toMatchObject({ refusal: { reason: "solutionRetired" } });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
