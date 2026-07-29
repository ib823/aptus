/**
 * /api/studio/access-grants — the transport around the governance rules.
 *
 * The rules themselves are proved in grants.test.ts; what is proved here is that
 * the route actually applies them, scopes every lookup to the caller's tenant,
 * and cannot be talked into pre-approving anything.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstSolution: vi.fn(),
  createGrant: vi.fn(),
  findFirstGrant: vi.fn(),
  updateGrant: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findFirst: mocks.findFirstSolution },
    apiAccessGrant: {
      create: mocks.createGrant,
      findFirst: mocks.findFirstGrant,
      update: mocks.updateGrant,
      findMany: vi.fn().mockResolvedValue([]),
    },
    configAudit: { create: mocks.createAudit },
  },
}));

import { PATCH, POST } from "@/app/api/studio/access-grants/route";

const REQUESTER = { id: "u_req", email: "a@abeam.com", role: "consultant", organizationId: "org_a" };
const APPROVER = { id: "u_app", email: "b@abeam.com", role: "consultant", organizationId: "org_a" };

function req(body: unknown, method = "POST") {
  return new Request("http://localhost:3003/api/studio/access-grants", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const VALID_REQUEST = {
  solutionId: "sol_1",
  externalId: "API_BUSINESS_PARTNER",
  operation: "READ",
  environment: "DEV",
  justification: "Needed to read supplier master for the onboarding accelerator.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(REQUESTER);
  mocks.findFirstSolution.mockResolvedValue({ id: "sol_1" });
  mocks.createGrant.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "g_1", ...data }),
  );
  mocks.updateGrant.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "g_1", ...data }),
  );
  mocks.createAudit.mockResolvedValue({ id: "a_1" });
});

describe("raising a request", () => {
  it("always records REQUESTED — a request never arrives pre-approved", async () => {
    const res = await POST(req(VALID_REQUEST));
    expect(res.status).toBe(201);
    const data = mocks.createGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.decision).toBe("REQUESTED");
  });

  it("ignores a client-supplied decision entirely", async () => {
    await POST(req({ ...VALID_REQUEST, decision: "APPROVED" }));
    const data = mocks.createGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.decision).toBe("REQUESTED");
  });

  it("stamps the requester so segregation of duties is enforceable later", async () => {
    await POST(req(VALID_REQUEST));
    const data = mocks.createGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.requestedById).toBe("u_req");
  });

  it("scopes the solution lookup to the caller's organization", async () => {
    await POST(req(VALID_REQUEST));
    expect(mocks.findFirstSolution).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sol_1", organizationId: "org_a" } }),
    );
  });

  it("404s a solution in another tenant", async () => {
    mocks.findFirstSolution.mockResolvedValue(null);
    expect((await POST(req(VALID_REQUEST))).status).toBe(404);
    expect(mocks.createGrant).not.toHaveBeenCalled();
  });

  it("requires a real justification", async () => {
    expect((await POST(req({ ...VALID_REQUEST, justification: "pls" }))).status).toBe(400);
  });

  it("rejects an unknown environment", async () => {
    expect((await POST(req({ ...VALID_REQUEST, environment: "STAGING" }))).status).toBe(400);
  });

  it("403s a role that cannot author", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...REQUESTER, role: "platform_admin" });
    expect((await POST(req(VALID_REQUEST))).status).toBe(403);
  });
});

describe("recording a decision", () => {
  const PENDING_READ = {
    id: "g_1",
    decision: "REQUESTED",
    operation: "READ",
    environment: "DEV",
    requestedById: "u_req",
    externalId: "API_X",
    solutionId: "sol_1",
    // Bounded. The expiry rule covers reads now, so a request that arrived
    // without one is refused — which is its own test below, not the default.
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  };

  it("403s approving a READ that arrived with no expiry", async () => {
    // The asymmetry this closes: a read grant approved unbounded could never
    // end, because there is no revocation path and a settled grant cannot be
    // re-decided.
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue({ ...PENDING_READ, expiresAt: null });
    const res = await PATCH(req({ grantId: "g_1", decision: "APPROVED" }, "PATCH"));
    expect(res.status).toBe(403);
    expect(mocks.updateGrant).not.toHaveBeenCalled();
  });

  it("scopes the grant lookup to the caller's organization", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue(PENDING_READ);
    await PATCH(req({ grantId: "g_1", decision: "APPROVED" }, "PATCH"));
    expect(mocks.findFirstGrant).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g_1", organizationId: "org_a" } }),
    );
  });

  it("404s a grant in another tenant", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue(null);
    expect((await PATCH(req({ grantId: "g_other", decision: "APPROVED" }, "PATCH"))).status).toBe(404);
  });

  it("403s the requester deciding their own request", async () => {
    mocks.getCurrentUser.mockResolvedValue(REQUESTER);
    mocks.findFirstGrant.mockResolvedValue(PENDING_READ);
    const res = await PATCH(req({ grantId: "g_1", decision: "APPROVED" }, "PATCH"));
    expect(res.status).toBe(403);
    expect(mocks.updateGrant).not.toHaveBeenCalled();
  });

  it("lets a different builder decide, and records who", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue(PENDING_READ);
    const res = await PATCH(req({ grantId: "g_1", decision: "APPROVED" }, "PATCH"));
    expect(res.status).toBe(200);
    const data = mocks.updateGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.decidedById).toBe("u_app");
    expect(data.decision).toBe("APPROVED");
  });

  it("403s approving a WRITE without the checklist", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue({ ...PENDING_READ, operation: "CREATE" });
    const res = await PATCH(req({ grantId: "g_1", decision: "APPROVED" }, "PATCH"));
    expect(res.status).toBe(403);
    expect(mocks.updateGrant).not.toHaveBeenCalled();
  });

  it("allows the WRITE once the checklist is acknowledged and it is time-bounded", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue({
      ...PENDING_READ,
      operation: "CREATE",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
    const res = await PATCH(
      req({ grantId: "g_1", decision: "APPROVED", writeChecklistAcknowledged: true }, "PATCH"),
    );
    expect(res.status).toBe(200);
  });

  it("403s an unbounded WRITE grant even with the checklist acknowledged", async () => {
    // The grant row carries no expiry, so approving would create a permanent
    // write authorisation — and there is deliberately no revocation to undo it.
    //
    // This case previously PASSED against a `=== null` check, because the mocked
    // grant omits `expiresAt` entirely and `undefined !== null`. A missing field
    // is not a permission; the production check is `== null` for exactly this.
    //
    // `expiresAt: null` is now EXPLICIT. The shared fixture became bounded when
    // the expiry rule widened to reads, so spreading it no longer produces an
    // unbounded grant — this test would have kept passing while testing the
    // checklist instead, which is the thing it is named after not testing.
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue({ ...PENDING_READ, operation: "CREATE", expiresAt: null });
    const res = await PATCH(
      req({ grantId: "g_1", decision: "APPROVED", writeChecklistAcknowledged: true }, "PATCH"),
    );
    expect(res.status).toBe(403);
    expect(mocks.updateGrant).not.toHaveBeenCalled();
  });

  it("409s re-deciding a settled grant", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue({ ...PENDING_READ, decision: "APPROVED" });
    const res = await PATCH(req({ grantId: "g_1", decision: "REJECTED" }, "PATCH"));
    expect(res.status).toBe(409);
  });

  it("rejects EXPIRED as a hand-set decision at the schema boundary", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue(PENDING_READ);
    expect((await PATCH(req({ grantId: "g_1", decision: "EXPIRED" }, "PATCH"))).status).toBe(400);
  });

  it("audits the decision with before and after", async () => {
    mocks.getCurrentUser.mockResolvedValue(APPROVER);
    mocks.findFirstGrant.mockResolvedValue(PENDING_READ);
    await PATCH(req({ grantId: "g_1", decision: "REJECTED" }, "PATCH"));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "ApiAccessGrant",
          action: "DECISION",
          actorId: "u_app",
        }),
      }),
    );
  });
});
