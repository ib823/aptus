/**
 * /api/studio/clients — segregation of duties on credential issuance.
 *
 * A credential that reads a client's live SAP data is not a convenience, it is
 * a governance act. A developer who could both request access AND issue
 * themselves the credential to use it has no oversight at all — which would
 * quietly undo the entire access ledger.
 *
 * Revocation deliberately carries no such rule, and there is a test for that
 * too: requiring a colleague to stop a leaking credential is a control that
 * costs you exactly when you can least afford it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstSolution: vi.fn(),
  findFirstClient: vi.fn(),
  upsertClient: vi.fn(),
  updateClient: vi.fn(),
  findManyClients: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findFirst: mocks.findFirstSolution },
    solutionClient: {
      findFirst: mocks.findFirstClient,
      upsert: mocks.upsertClient,
      update: mocks.updateClient,
      findMany: mocks.findManyClients,
    },
    configAudit: { create: mocks.createAudit },
  },
}));

import { PATCH, POST } from "@/app/api/studio/clients/route";

const ISSUER = { id: "u_issuer", email: "a@abeam.com", role: "consultant", organizationId: "org_a" };
const OWNER_ID = "u_owner";

const SOLUTION = {
  id: "sol_1",
  name: "Finance accelerator",
  technicalOwnerId: OWNER_ID,
  businessOwnerId: "u_biz",
  supportOwnerId: "u_sup",
};

function req(body: unknown, method = "POST") {
  return new Request("http://localhost:3003/api/studio/clients", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const VALID = { solutionId: "sol_1", label: "prod client", environment: "PROD" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ISSUER);
  mocks.findFirstSolution.mockResolvedValue(SOLUTION);
  mocks.findFirstClient.mockResolvedValue({ id: "client_1", solutionId: "sol_1" });
  mocks.upsertClient.mockResolvedValue({
    id: "client_1",
    solutionId: "sol_1",
    label: "prod client",
    environment: "PROD",
    createdAt: new Date(),
  });
  mocks.updateClient.mockResolvedValue({
    id: "client_1",
    solutionId: "sol_1",
    label: "prod client",
    environment: "PROD",
    isActive: false,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: new Date(),
    createdAt: new Date(),
  });
  mocks.createAudit.mockResolvedValue({ id: "a1" });
});

describe("segregation of duties on issuance", () => {
  it("lets a non-owner issue the credential", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(201);
  });

  it("refuses an owner issuing their OWN solution's credential", async () => {
    for (const ownerField of ["technicalOwnerId", "businessOwnerId", "supportOwnerId"] as const) {
      vi.clearAllMocks();
      mocks.getCurrentUser.mockResolvedValue({ ...ISSUER, id: "u_me" });
      mocks.findFirstSolution.mockResolvedValue({ ...SOLUTION, [ownerField]: "u_me" });
      const res = await POST(req(VALID));
      expect(res.status, `${ownerField} must be refused`).toBe(403);
      expect(mocks.upsertClient).not.toHaveBeenCalled();
    }
  });

  it("explains WHY, so the refusal is actionable rather than baffling", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ISSUER, id: OWNER_ID });
    const res = await POST(req(VALID));
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("own this solution");
    expect(json.error.message.toLowerCase()).toContain("colleague");
  });

  it("applies the same rule to ROTATION, which also mints a working token", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ISSUER, id: OWNER_ID });
    mocks.findFirstSolution.mockResolvedValue(SOLUTION);
    const res = await PATCH(req({ clientId: "client_1", action: "rotate" }, "PATCH"));
    expect(res.status).toBe(403);
  });
});

describe("revocation is deliberately NOT gated", () => {
  it("lets an owner revoke their own solution's credential", async () => {
    // Requiring a colleague to stop a leaking credential is a control that costs
    // exactly when you can least afford it.
    mocks.getCurrentUser.mockResolvedValue({ ...ISSUER, id: OWNER_ID });
    const res = await PATCH(req({ clientId: "client_1", action: "revoke" }, "PATCH"));
    expect(res.status).toBe(200);
  });

  it("does not even consult the solution's owners when revoking", async () => {
    await PATCH(req({ clientId: "client_1", action: "revoke" }, "PATCH"));
    expect(mocks.findFirstSolution).not.toHaveBeenCalled();
  });
});

describe("the response tells the truth about the token", () => {
  it("returns the raw token once, with a warning that it cannot be shown again", async () => {
    const res = await POST(req(VALID));
    const json = (await res.json()) as { data: { token: string; warning: string } };
    expect(json.data.token).toMatch(/^ce_/);
    expect(json.data.warning.toLowerCase()).toContain("cannot be shown again");
    expect(json.data.warning.toLowerCase()).toContain("server-side");
  });

  it("says plainly that rotation killed the previous token", async () => {
    mocks.updateClient.mockResolvedValue({
      id: "client_1",
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      createdAt: new Date(),
    });
    const res = await PATCH(req({ clientId: "client_1", action: "rotate" }, "PATCH"));
    const json = (await res.json()) as { data: { warning: string } };
    expect(json.data.warning.toLowerCase()).toContain("stopped working immediately");
  });

  it("never writes the token into the audit trail", async () => {
    const res = await POST(req(VALID));
    const json = (await res.json()) as { data: { token: string } };
    const auditArg = JSON.stringify(mocks.createAudit.mock.calls[0]?.[0] ?? {});
    expect(auditArg).not.toContain(json.data.token);
  });
});

describe("guards", () => {
  it("401s an anonymous caller", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(req(VALID))).status).toBe(401);
  });

  it("403s an oversight role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ISSUER, role: "platform_admin" });
    expect((await POST(req(VALID))).status).toBe(403);
  });

  it("404s a solution in another tenant", async () => {
    mocks.findFirstSolution.mockResolvedValue(null);
    expect((await POST(req(VALID))).status).toBe(404);
  });

  it("scopes the solution lookup by organization", async () => {
    await POST(req(VALID));
    const where = mocks.findFirstSolution.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.organizationId).toBe("org_a");
  });

  it("rejects an unknown environment", async () => {
    expect((await POST(req({ ...VALID, environment: "STAGING" }))).status).toBe(400);
  });
});
