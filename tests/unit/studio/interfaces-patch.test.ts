/**
 * PATCH /api/studio/interfaces — versioning, mode derivation, and the mapping lock.
 *
 * The mapping tests are the point of this file. A greyed-out card is a hint; an
 * API that refuses the field is a guarantee, and only the second one survives
 * someone with curl.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstInterface: vi.fn(),
  updateInterface: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: {
      findFirst: mocks.findFirstInterface,
      update: mocks.updateInterface,
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    solution: { findFirst: vi.fn() },
    configAudit: { create: mocks.createAudit },
  },
}));

import { PATCH } from "@/app/api/studio/interfaces/route";

const BUILDER = { id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };

const EXISTING = {
  id: "if_1",
  name: "Business Partner read",
  version: 1,
  operation: "READ",
  entitySet: "A_BusinessPartner",
  mode: "READ",
  status: "DRAFT",
  mappingVersion: null,
};

function req(body: unknown) {
  return new Request("http://localhost:3003/api/studio/interfaces", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

function lastUpdateData(): Record<string, unknown> {
  return mocks.updateInterface.mock.calls[0]?.[0]?.data as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstInterface.mockResolvedValue(EXISTING);
  mocks.updateInterface.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "if_1", version: 1, mappingVersion: null, ...data }),
  );
  mocks.createAudit.mockResolvedValue({ id: "a1" });
});

describe("mapping stays disabled — enforced by the API, not the UI", () => {
  it("ignores a client-supplied mappingVersion entirely", async () => {
    const res = await PATCH(req({ id: "if_1", mappingVersion: 3 }));
    expect(res.status).toBe(200);
    expect(lastUpdateData().mappingVersion).toBeUndefined();
  });

  it("ignores it even alongside otherwise valid edits", async () => {
    await PATCH(req({ id: "if_1", name: "Renamed", mappingVersion: 7 }));
    const data = lastUpdateData();
    expect(data.name).toBe("Renamed");
    expect(data.mappingVersion).toBeUndefined();
  });

  it("never writes mappingVersion on any edit path", async () => {
    for (const body of [
      { id: "if_1", status: "ACTIVE" },
      { id: "if_1", operation: "CREATE" },
      { id: "if_1", entitySet: "A_Other" },
    ]) {
      vi.clearAllMocks();
      mocks.getCurrentUser.mockResolvedValue(BUILDER);
      mocks.findFirstInterface.mockResolvedValue(EXISTING);
      mocks.updateInterface.mockResolvedValue({ id: "if_1" });
      await PATCH(req(body));
      expect(lastUpdateData()).not.toHaveProperty("mappingVersion");
    }
  });
});

describe("version bumps track the contract, not cosmetics", () => {
  it("bumps when the operation changes", async () => {
    await PATCH(req({ id: "if_1", operation: "UPDATE" }));
    expect(lastUpdateData().version).toEqual({ increment: 1 });
  });

  it("bumps when the entity set changes", async () => {
    await PATCH(req({ id: "if_1", entitySet: "A_Supplier" }));
    expect(lastUpdateData().version).toEqual({ increment: 1 });
  });

  it("does NOT bump for a rename — a label is not a contract", async () => {
    // Inflating the version for cosmetics makes the number worthless to anyone
    // pinning it.
    await PATCH(req({ id: "if_1", name: "Nicer name" }));
    expect(lastUpdateData().version).toBeUndefined();
  });

  it("does NOT bump for a status change", async () => {
    await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(lastUpdateData().version).toBeUndefined();
  });

  it("does NOT bump when a field is resent unchanged", async () => {
    await PATCH(req({ id: "if_1", operation: "READ", entitySet: "A_BusinessPartner" }));
    expect(lastUpdateData().version).toBeUndefined();
  });
});

describe("mode is derived from the operation, never client-supplied", () => {
  it("keeps READ in read mode", async () => {
    await PATCH(req({ id: "if_1", operation: "READ" }));
    expect(lastUpdateData().mode).toBe("READ");
  });

  it("moves CREATE and UPDATE into WRITE mode", async () => {
    for (const operation of ["CREATE", "UPDATE"]) {
      vi.clearAllMocks();
      mocks.getCurrentUser.mockResolvedValue(BUILDER);
      mocks.findFirstInterface.mockResolvedValue(EXISTING);
      mocks.updateInterface.mockResolvedValue({ id: "if_1" });
      await PATCH(req({ id: "if_1", operation }));
      expect(lastUpdateData().mode, `${operation}`).toBe("WRITE");
    }
  });

  it("ignores a client attempt to set mode directly", async () => {
    // A caller must not be able to declare a CREATE "read mode" and dodge the
    // stronger review that WRITE carries.
    await PATCH(req({ id: "if_1", operation: "CREATE", mode: "READ" }));
    expect(lastUpdateData().mode).toBe("WRITE");
  });
});

describe("guards", () => {
  it("401s an anonymous caller", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await PATCH(req({ id: "if_1", name: "x" }))).status).toBe(401);
  });

  it("403s an oversight role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    expect((await PATCH(req({ id: "if_1", name: "x" }))).status).toBe(403);
  });

  it("scopes the lookup to the caller's organization", async () => {
    await PATCH(req({ id: "if_1", name: "x" }));
    expect(mocks.findFirstInterface).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "if_1", organizationId: "org_a" } }),
    );
  });

  it("404s an interface in another tenant", async () => {
    mocks.findFirstInterface.mockResolvedValue(null);
    expect((await PATCH(req({ id: "if_other", name: "x" }))).status).toBe(404);
    expect(mocks.updateInterface).not.toHaveBeenCalled();
  });

  it("audits the edit with before and after", async () => {
    await PATCH(req({ id: "if_1", operation: "CREATE" }));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: "Interface", action: "UPDATE" }),
      }),
    );
  });
});
