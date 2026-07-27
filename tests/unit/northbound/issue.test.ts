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
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solutionClient: {
      upsert: mocks.upsert,
      findFirst: mocks.findFirst,
      update: mocks.update,
      findMany: mocks.findMany,
    },
  },
}));

import { hashClientToken } from "@/lib/northbound/auth";
import {
  generateClientToken,
  issueClientToken,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsert.mockResolvedValue(ROW);
  mocks.findFirst.mockResolvedValue({ id: "client_1" });
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

  it("upserts on (organization, solution), so it neither accumulates nor leaves the tenant", async () => {
    // Two properties, and the second was missing until the compound key landed.
    //
    // Keyed by solution: four live tokens is four things to leak and four to
    // remember to revoke, so re-issuing must rotate rather than add.
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
      organizationId_solutionId: { organizationId: "org_a", solutionId: "sol_1" },
    });
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
