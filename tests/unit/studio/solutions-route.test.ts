/**
 * /api/studio/solutions — that the route actually applies the ownership gate.
 *
 * The rules are proved in solutions.test.ts. What matters here is that the gate
 * lives on the WRITE PATH: a control that only exists in the form is one API
 * call away from being bypassed, and this is the test that would fail if someone
 * moved it there.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstSolution: vi.fn(),
  createSolution: vi.fn(),
  updateSolution: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: {
      findFirst: mocks.findFirstSolution,
      create: mocks.createSolution,
      update: mocks.updateSolution,
      findMany: vi.fn().mockResolvedValue([]),
    },
    configAudit: { create: mocks.createAudit },
  },
}));

import { PATCH, POST } from "@/app/api/studio/solutions/route";

const BUILDER = { id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };

function req(body: unknown, method = "POST") {
  return new Request("http://localhost:3003/api/studio/solutions", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const VALID_CREATE = {
  name: "Finance Accelerator",
  classification: "INTERNAL_ACCELERATOR",
  businessProblem: "Speeds up the finance close for mid-market clients.",
  dataClass: "internal",
};

const ACTIVE_COMPLETE = {
  id: "sol_1",
  name: "Finance Accelerator",
  status: "ACTIVE",
  technicalOwnerId: "u_tech",
  businessOwnerId: "u_biz",
  supportOwnerId: "u_sup",
  repoUrl: null,
  packagingNote: null,
  reuseIntent: null,
  businessProblem: "x",
  dataClass: "internal",
  classification: "INTERNAL_ACCELERATOR",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstSolution.mockResolvedValue(null); // no slug clash by default
  mocks.createSolution.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "sol_1", ...data }),
  );
  mocks.updateSolution.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "sol_1", ...data }),
  );
  mocks.createAudit.mockResolvedValue({ id: "a1" });
});

describe("registering a solution", () => {
  it("always creates a DRAFT — nothing arrives already ACTIVE", async () => {
    const res = await POST(req(VALID_CREATE));
    expect(res.status).toBe(201);
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("DRAFT");
  });

  it("stamps the caller's organization", async () => {
    await POST(req(VALID_CREATE));
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.organizationId).toBe("org_a");
  });

  it("derives a slug from the name", async () => {
    await POST(req(VALID_CREATE));
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.slug).toBe("finance-accelerator");
  });

  it("suffixes a clashing slug rather than failing the save", async () => {
    // A second "Finance Accelerator" is a normal thing to want.
    mocks.findFirstSolution.mockResolvedValueOnce({ id: "existing" }).mockResolvedValueOnce(null);
    await POST(req(VALID_CREATE));
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.slug).toBe("finance-accelerator-2");
  });

  it("refuses a name with no usable slug rather than inventing an identifier", async () => {
    expect((await POST(req({ ...VALID_CREATE, name: "!!!" }))).status).toBe(400);
  });

  it("403s a role that cannot author", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    expect((await POST(req(VALID_CREATE))).status).toBe(403);
  });

  it("writes a ConfigAudit entry", async () => {
    await POST(req(VALID_CREATE));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: "Solution", action: "CREATE" }),
      }),
    );
  });
});

describe("the ownership gate lives on the write path", () => {
  it("409s a promotion to ACTIVE with a missing owner", async () => {
    mocks.findFirstSolution.mockResolvedValue({
      ...ACTIVE_COMPLETE,
      status: "DRAFT",
      supportOwnerId: null,
    });
    const res = await PATCH(req({ id: "sol_1", status: "ACTIVE" }, "PATCH"));
    expect(res.status).toBe(409);
    expect(mocks.updateSolution).not.toHaveBeenCalled();
  });

  it("allows promotion when all three owners are present", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "DRAFT" });
    const res = await PATCH(req({ id: "sol_1", status: "ACTIVE" }, "PATCH"));
    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("ACTIVE");
  });

  it("records a promotion as PROMOTE, distinct from an ordinary edit", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "DRAFT" });
    await PATCH(req({ id: "sol_1", status: "ACTIVE" }, "PATCH"));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "PROMOTE" }) }),
    );
  });

  it("auto-drops an ACTIVE solution to RESTRICTED when an owner is cleared", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    const res = await PATCH(req({ id: "sol_1", businessOwnerId: null }, "PATCH"));
    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    // The record must never sit ACTIVE with nobody accountable.
    expect(data.status).toBe("RESTRICTED");
    expect(data.businessOwnerId).toBeNull();
  });

  it("tells the caller the drop happened, and why", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    const res = await PATCH(req({ id: "sol_1", supportOwnerId: null }, "PATCH"));
    const json = (await res.json()) as { data: { autoDropped: boolean; autoDropReason?: string } };
    expect(json.data.autoDropped).toBe(true);
    expect(json.data.autoDropReason).toContain("support owner");
  });

  it("leaves an ACTIVE solution active when an unrelated field changes", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    await PATCH(req({ id: "sol_1", dataClass: "confidential" }, "PATCH"));
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("ACTIVE");
  });

  it("distinguishes 'not mentioned' from 'explicitly cleared'", async () => {
    // Omitting an owner must not silently wipe it — that distinction is what
    // makes the auto-drop expressible without booby-trapping every edit.
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    await PATCH(req({ id: "sol_1", name: "Renamed" }, "PATCH"));
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.technicalOwnerId).toBe("u_tech");
    expect(data.status).toBe("ACTIVE");
  });
});

describe("cross-tenant", () => {
  it("scopes the lookup to the caller's organization", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    await PATCH(req({ id: "sol_1", name: "Renamed solution" }, "PATCH"));
    expect(mocks.findFirstSolution).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sol_1", organizationId: "org_a" } }),
    );
  });

  it("404s a solution in another tenant", async () => {
    mocks.findFirstSolution.mockResolvedValue(null);
    expect((await PATCH(req({ id: "sol_other", name: "Renamed solution" }, "PATCH"))).status).toBe(404);
    expect(mocks.updateSolution).not.toHaveBeenCalled();
  });
});
