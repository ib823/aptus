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
 *
 * And the credential-hygiene rules (P0.11): a PROD key without an expiry is a
 * 400, a TEST or PROD key past the maximum is a 400, and a rotation says
 * until when the key it replaced keeps working.
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
  closeLinks: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => {
  const client = {
    solution: { findFirst: mocks.findFirstSolution },
    solutionClient: {
      findFirst: mocks.findFirstClient,
      upsert: mocks.upsertClient,
      update: mocks.updateClient,
      findMany: mocks.findManyClients,
    },
    // Every owner named here is a live member of the organization (A69).
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })),
    },
    configAudit: { create: mocks.createAudit },
    // Issue, rotate and revoke each close the lane's pending claim links.
    keyClaimLink: { updateMany: mocks.closeLinks },
  };
  // Each key change is one transaction under the app lock (P0.1).
  return {
    prisma: { ...client, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ ...client, $queryRaw: async () => [] }) },
  };
});

import { PATCH, POST } from "@/app/api/studio/clients/route";

const ISSUER = { id: "u_issuer", email: "a@abeam.com", role: "consultant", organizationId: "org_a", authMethod: "session" };
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

const DAY = 24 * 60 * 60 * 1000;
/** A PROD key must name its expiry (P0.11); thirty days is inside the maximum. */
const IN_30_DAYS = new Date(Date.now() + 30 * DAY).toISOString();
const VALID = { solutionId: "sol_1", label: "prod client", environment: "PROD", expiresAt: IN_30_DAYS };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ISSUER);
  mocks.findFirstSolution.mockResolvedValue(SOLUTION);
  // The row as the credential lookups select it: live, no expiry.
  mocks.findFirstClient.mockResolvedValue({
    id: "client_1",
    solutionId: "sol_1",
    environment: "PROD",
    tokenHash: "hash_of_the_live_key",
    isActive: true,
    revokedAt: null,
    expiresAt: null,
    previousValidUntil: null,
  });
  mocks.closeLinks.mockResolvedValue({ count: 0 });
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

  it("says until when the previous token keeps working, and that a leak is a revoke (P0.11)", async () => {
    const until = new Date(Date.now() + DAY);
    mocks.updateClient.mockResolvedValue({
      id: "client_1",
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      expiresAt: new Date(Date.now() + 90 * DAY),
      previousValidUntil: until,
      createdAt: new Date(),
    });
    const res = await PATCH(req({ clientId: "client_1", action: "rotate" }, "PATCH"));
    const json = (await res.json()) as {
      data: { warning: string; previousValidUntil: string; tokenPrefix: string; token: string };
    };
    expect(json.data.warning).toContain(`keeps working until ${until.toISOString()}`);
    expect(json.data.warning.toLowerCase()).toContain("revoke instead");
    expect(json.data.previousValidUntil).toBe(until.toISOString());
    expect(json.data.token.startsWith("ce_live_")).toBe(true);
    expect(json.data.tokenPrefix).toBe("ce_live_");
    // The ROTATE audit row records the overlap end.
    const audit = mocks.createAudit.mock.calls[0]?.[0] as { data: { action: string; after: Record<string, unknown> } };
    expect(audit.data.action).toBe("ROTATE");
    expect(audit.data.after.previousValidUntil).toEqual(until);
  });

  it("says plainly that rotation killed the previous token when nothing overlaps", async () => {
    mocks.updateClient.mockResolvedValue({
      id: "client_1",
      solutionId: "sol_1",
      label: "x",
      environment: "PROD",
      expiresAt: new Date(Date.now() + 90 * DAY),
      previousValidUntil: null,
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

describe("keys expire (P0.11)", () => {
  it("refuses a PROD key without an expiry with 400, before minting anything", async () => {
    const { expiresAt: _omitted, ...withoutExpiry } = VALID;
    const res = await POST(req(withoutExpiry));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("PROD key must have an expiry");
    expect(mocks.upsertClient).not.toHaveBeenCalled();
  });

  it("refuses a TEST or PROD expiry past the maximum (90 days by default)", async () => {
    for (const environment of ["TEST", "PROD"]) {
      vi.clearAllMocks();
      mocks.getCurrentUser.mockResolvedValue(ISSUER);
      mocks.findFirstSolution.mockResolvedValue(SOLUTION);
      const res = await POST(req({ ...VALID, environment, expiresAt: new Date(Date.now() + 91 * DAY).toISOString() }));
      expect(res.status, environment).toBe(400);
      expect(mocks.upsertClient).not.toHaveBeenCalled();
    }
  });

  it("refuses an expiry that has already passed", async () => {
    const res = await POST(req({ ...VALID, expiresAt: new Date(Date.now() - DAY).toISOString() }));
    expect(res.status).toBe(400);
  });

  it("gives a TEST key with no expiry the default lifetime, and mints it with the ce_test_ prefix", async () => {
    mocks.findFirstClient.mockResolvedValue(null);
    const { expiresAt: _omitted, ...withoutExpiry } = VALID;
    const res = await POST(req({ ...withoutExpiry, environment: "TEST" }));
    expect(res.status).toBe(201);
    const call = mocks.upsertClient.mock.calls[0]?.[0] as { create: { expiresAt: Date; tokenPrefix: string } };
    expect(Math.abs(call.create.expiresAt.getTime() - (Date.now() + 90 * DAY))).toBeLessThan(60_000);
    expect(call.create.tokenPrefix).toBe("ce_test_");
    const json = (await res.json()) as { data: { token: string } };
    expect(json.data.token.startsWith("ce_test_")).toBe(true);
  });

  it("honours COREEDGE_KEY_MAX_TTL_DAYS", async () => {
    vi.stubEnv("COREEDGE_KEY_MAX_TTL_DAYS", "30");
    try {
      const res = await POST(req({ ...VALID, expiresAt: new Date(Date.now() + 45 * DAY).toISOString() }));
      expect(res.status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("restores the old behaviour under COREEDGE_KEY_EXPIRY=off — the rollback lever", async () => {
    vi.stubEnv("COREEDGE_KEY_EXPIRY", "off");
    try {
      const { expiresAt: _omitted, ...withoutExpiry } = VALID;
      expect((await POST(req(withoutExpiry))).status).toBe(201);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses a rotation to an expiry past the maximum, before minting", async () => {
    const res = await PATCH(
      req({ clientId: "client_1", action: "rotate", expiresAt: new Date(Date.now() + 120 * DAY).toISOString() }, "PATCH"),
    );
    expect(res.status).toBe(400);
    expect(mocks.updateClient).not.toHaveBeenCalled();
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
