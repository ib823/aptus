/**
 * POST /api/studio/interfaces — the "Add to interface" write path.
 *
 * The test that matters most here is cross-tenant: `solutionId` is supplied by
 * the caller, and this repository has shipped this exact bug before (a lookup by
 * attacker-supplied id that forgot to re-scope to the caller's organization). So
 * the guard is pinned explicitly, in both directions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstSolution: vi.fn(),
  createInterface: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findFirst: mocks.findFirstSolution },
    interface: { create: mocks.createInterface },
    configAudit: { create: mocks.createAudit },
  },
}));

import { POST } from "@/app/api/studio/interfaces/route";

const BUILDER = {
  id: "u_builder",
  email: "dev@abeam.com",
  role: "consultant",
  organizationId: "org_a",
};

function req(body: unknown) {
  return new Request("http://localhost:3003/api/studio/interfaces", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const VALID = {
  solutionId: "sol_1",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  name: "Business Partner read",
  operation: "READ",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstSolution.mockResolvedValue({ id: "sol_1", name: "Acme accelerator" });
  mocks.createInterface.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "if_1", version: 1, ...data }),
  );
  mocks.createAudit.mockResolvedValue({ id: "audit_1" });
});

describe("auth and role", () => {
  it("401s an anonymous caller", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(req(VALID))).status).toBe(401);
  });

  it("403s a role that cannot reach Studio at all", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "viewer" });
    expect((await POST(req(VALID))).status).toBe(403);
  });

  it("403s a platform_admin — Studio access is oversight, not authorship", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    const res = await POST(req(VALID));
    expect(res.status).toBe(403);
    expect(mocks.createInterface).not.toHaveBeenCalled();
  });

  it("403s a builder with no organization before any query runs", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, organizationId: null });
    const res = await POST(req(VALID));
    expect(res.status).toBe(403);
    expect(mocks.findFirstSolution).not.toHaveBeenCalled();
  });
});

describe("cross-tenant guard", () => {
  it("scopes the solution lookup to the caller's organization", async () => {
    await POST(req(VALID));
    expect(mocks.findFirstSolution).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sol_1", organizationId: "org_a" },
      }),
    );
  });

  it("404s a solution that belongs to another tenant — indistinguishable from absent", async () => {
    // The scoped lookup finds nothing, exactly as it would for a non-existent id.
    mocks.findFirstSolution.mockResolvedValue(null);
    const res = await POST(req({ ...VALID, solutionId: "sol_in_org_b" }));
    expect(res.status).toBe(404);
    expect(mocks.createInterface).not.toHaveBeenCalled();
  });

  it("stamps the created interface with the caller's own organizationId", async () => {
    await POST(req(VALID));
    expect(mocks.createInterface).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org_a" }),
      }),
    );
  });
});

describe("validation", () => {
  it("400s a malformed body", async () => {
    expect((await POST(req({ solutionId: "sol_1" }))).status).toBe(400);
  });

  it("400s an unknown SAP product", async () => {
    expect((await POST(req({ ...VALID, sapProduct: "hana_cloud" }))).status).toBe(400);
  });

  it("400s a non-JSON body rather than throwing", async () => {
    const bad = new Request("http://localhost:3003/api/studio/interfaces", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    }) as never;
    expect((await POST(bad)).status).toBe(400);
  });
});

describe("what it creates", () => {
  it("always creates a DRAFT with mapping left to v2", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(201);
    const data = mocks.createInterface.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("DRAFT");
    // mappingVersion must stay unset — the mapping engine is v2.
    expect(data.mappingVersion).toBeUndefined();
  });

  it("marks READ as read-mode", async () => {
    await POST(req(VALID));
    const data = mocks.createInterface.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.mode).toBe("READ");
  });

  it("marks CREATE/UPDATE as WRITE mode, which carries the stronger review", async () => {
    for (const operation of ["CREATE", "UPDATE"]) {
      vi.clearAllMocks();
      mocks.getCurrentUser.mockResolvedValue(BUILDER);
      mocks.findFirstSolution.mockResolvedValue({ id: "sol_1", name: "Acme" });
      mocks.createInterface.mockResolvedValue({ id: "if_1" });
      await POST(req({ ...VALID, operation }));
      const data = mocks.createInterface.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data.mode, `${operation} must be WRITE mode`).toBe("WRITE");
    }
  });

  it("writes a ConfigAudit entry for the creation", async () => {
    await POST(req(VALID));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_a",
          actorId: "u_builder",
          entityType: "Interface",
          action: "CREATE",
        }),
      }),
    );
  });

  it("still returns the interface if the audit write fails (loud, not fatal)", async () => {
    mocks.createAudit.mockRejectedValue(new Error("db down"));
    const res = await POST(req(VALID));
    // Losing the user's change because the audit row failed would be worse than
    // a visible gap in the trail.
    expect(res.status).toBe(201);
  });
});
