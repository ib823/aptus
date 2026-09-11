/**
 * Northbound token authentication.
 *
 * This is the front door to a customer's live SAP data, so the tests are about
 * what must NEVER work: an unknown token, a revoked one, an expired one, and —
 * the quiet one — a token that is merely deactivated rather than revoked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  findSolution: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solutionClient: { findUnique: mocks.findUnique, update: mocks.update },
    solution: { findFirst: mocks.findSolution },
  },
}));

import {
  authenticateClientToken,
  extractBearer,
  hashClientToken,
  touchClientLastUsed,
} from "@/lib/northbound/auth";

const NOW = new Date("2026-07-25T12:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");

const LIVE_ROW = {
  id: "client_1",
  organizationId: "org_a",
  solutionId: "sol_1",
  environment: "PROD",
  isActive: true,
  revokedAt: null,
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(LIVE_ROW);
  mocks.update.mockResolvedValue({});
  mocks.findSolution.mockResolvedValue({ status: "ACTIVE" });
});

/*
 * The solution behind the token.
 *
 * Nothing on the northbound path loaded it: token, grant and interface were
 * each checked and none consulted the status of the thing that owns them, so
 * retiring a solution — the closest thing the product has to decommissioning —
 * changed nothing at runtime. A duplicate solution retired precisely so it could
 * not be used again was callable the moment after.
 */
describe("the owning solution", () => {
  it("refuses a token whose solution is RETIRED", async () => {
    mocks.findSolution.mockResolvedValue({ status: "RETIRED" });
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r).toEqual({ ok: false, reason: "SOLUTION_RETIRED" });
  });

  it("refuses a token whose solution row is gone — an orphan is not served", async () => {
    mocks.findSolution.mockResolvedValue(null);
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r).toEqual({ ok: false, reason: "SOLUTION_MISSING" });
  });

  it("looks the solution up scoped to the token's organization, never by id alone", async () => {
    await authenticateClientToken("ce_x", NOW);
    expect(mocks.findSolution).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LIVE_ROW.solutionId, organizationId: LIVE_ROW.organizationId },
      }),
    );
  });

  // RESTRICTED is an ACTIVE solution that lost an owner — a governance flag from
  // a personnel change, not a decision to stop the integration. Refusing it
  // would take a running solution down because someone left. That is a product
  // decision, so it is deliberately NOT gated here; this test pins the scope.
  it.each(["ACTIVE", "DRAFT", "RESTRICTED"])("still serves a %s solution", async (status) => {
    mocks.findSolution.mockResolvedValue({ status });
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r.ok).toBe(true);
  });

  it("checks the token's own states first, so a revoked token audits as REVOKED even on a retired solution", async () => {
    mocks.findUnique.mockResolvedValue({ ...LIVE_ROW, revokedAt: PAST });
    mocks.findSolution.mockResolvedValue({ status: "RETIRED" });
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r).toEqual({ ok: false, reason: "REVOKED" });
    expect(mocks.findSolution).not.toHaveBeenCalled();
  });
});

describe("extractBearer", () => {
  it("reads a bearer token", () => {
    expect(extractBearer("Bearer ce_abc123")).toBe("ce_abc123");
  });

  it("is case-insensitive on the scheme and tolerates spacing", () => {
    expect(extractBearer("bearer   ce_abc")).toBe("ce_abc");
    expect(extractBearer("  Bearer ce_abc  ")).toBe("ce_abc");
  });

  it("returns null for anything that is not a bearer credential", () => {
    for (const header of [null, "", "Basic abc", "Bearer", "Bearer   ", "ce_abc"]) {
      expect(extractBearer(header), JSON.stringify(header)).toBeNull();
    }
  });
});

describe("hashing", () => {
  it("is deterministic and not the token itself", () => {
    const raw = "ce_super_secret";
    const hash = hashClientToken(raw);
    expect(hash).toBe(hashClientToken(raw));
    expect(hash).not.toContain(raw);
    expect(hash).toHaveLength(64); // sha256 hex
  });

  it("looks the token up BY HASH, never by raw value", async () => {
    // A raw-value column would put a working credential in every backup and on
    // the screen of anyone who can read the table.
    await authenticateClientToken("ce_raw", NOW);
    const where = mocks.findUnique.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.tokenHash).toBe(hashClientToken("ce_raw"));
    expect(JSON.stringify(where)).not.toContain("ce_raw");
  });
});

describe("what must not authenticate", () => {
  it("rejects a missing token", async () => {
    const r = await authenticateClientToken(null, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_TOKEN");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown token", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const r = await authenticateClientToken("ce_nope", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNKNOWN_TOKEN");
  });

  it("rejects a REVOKED token", async () => {
    mocks.findUnique.mockResolvedValue({ ...LIVE_ROW, revokedAt: PAST });
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("REVOKED");
  });

  it("reports revocation even when the row is also inactive", async () => {
    // Revocation is the security event worth seeing in the audit; "inactive"
    // would understate it.
    mocks.findUnique.mockResolvedValue({ ...LIVE_ROW, revokedAt: PAST, isActive: false });
    const r = await authenticateClientToken("ce_x", NOW);
    if (!r.ok) expect(r.reason).toBe("REVOKED");
  });

  it("rejects a deactivated token", async () => {
    mocks.findUnique.mockResolvedValue({ ...LIVE_ROW, isActive: false });
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INACTIVE");
  });

  it("rejects an EXPIRED token at call time", async () => {
    // Evaluated per call, so expiry bites the moment it passes rather than
    // whenever a sweep job next runs.
    mocks.findUnique.mockResolvedValue({ ...LIVE_ROW, expiresAt: PAST });
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EXPIRED");
  });

  it("rejects exactly ON the expiry instant", async () => {
    mocks.findUnique.mockResolvedValue({ ...LIVE_ROW, expiresAt: NOW });
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r.ok).toBe(false);
  });
});

describe("what does authenticate", () => {
  it("accepts a live token and returns tenancy from the TOKEN", async () => {
    const r = await authenticateClientToken("ce_x", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Never from the request — this is the whole basis of isolation.
      expect(r.client.organizationId).toBe("org_a");
      expect(r.client.solutionId).toBe("sol_1");
      expect(r.client.environment).toBe("PROD");
      expect(r.client.clientId).toBe("client_1");
    }
  });

  it("accepts a token whose expiry is still in the future", async () => {
    mocks.findUnique.mockResolvedValue({ ...LIVE_ROW, expiresAt: FUTURE });
    expect((await authenticateClientToken("ce_x", NOW)).ok).toBe(true);
  });

  it("carries a tenant scope so downstream queries are structurally bound", async () => {
    const r = await authenticateClientToken("ce_x", NOW);
    if (r.ok) expect(r.client.scope.organizationId).toBe("org_a");
  });
});

describe("lastUsedAt", () => {
  it("records usage, scoped to the organization as well as the id", async () => {
    // The id alone would be a bare-id update on a tenant-anchored model: the
    // update now re-asserts the tenant rather than trusting whoever passed the id.
    await touchClientLastUsed("client_1", "org_a");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client_1", organizationId: "org_a" } }),
    );
  });

  it("never throws — a bookkeeping failure must not fail a read", async () => {
    mocks.update.mockRejectedValue(new Error("db down"));
    await expect(touchClientLastUsed("client_1", "org_a")).resolves.toBeUndefined();
  });
});
