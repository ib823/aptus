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
  findManyClients: vi.fn(),
  findManyGrants: vi.fn(),
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
    solutionClient: { findMany: mocks.findManyClients },
    apiAccessGrant: { findMany: mocks.findManyGrants },
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
  solutionId: "sol_1",
  externalId: "API_BUSINESS_PARTNER",
};

/** A live TEST credential; whether it carries a write key is decided per query below. */
const TEST_CREDENTIAL = { environment: "TEST", expiresAt: null };
const APPROVED_TEST_GRANT = { environment: "TEST", decision: "APPROVED", expiresAt: null, revokedAt: null };

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
  mocks.findManyClients.mockResolvedValue([]);
  mocks.findManyGrants.mockResolvedValue([]);
});

/**
 * The route asks for live credentials twice: all of them, then the subset
 * carrying a write key (a filter on the sealed column). Answer each by the
 * shape of its where-clause.
 */
function credentials(all: { environment: string; expiresAt: Date | null }[], withWriteKey: string[]) {
  mocks.findManyClients.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve("NOT" in where ? all.filter((c) => withWriteKey.includes(c.environment)) : all),
  );
}


describe("ACTIVE has preconditions — the gate is the API, not the greyed button", () => {
  it("refuses to activate without an entity set", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...EXISTING, entitySet: null });
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/without an entity set/);
    expect(mocks.updateInterface).not.toHaveBeenCalled();
  });

  it("refuses to activate a WRITE interface when no environment holds the full write chain", async () => {
    // A CREATE interface could be defined, requested, approved and marked
    // ACTIVE — then never called, because nothing had issued the write key
    // the broker checks first. The developer built toward a wall.
    mocks.findFirstInterface.mockResolvedValue({ ...EXISTING, operation: "CREATE", mode: "WRITE" });
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/CREATE interface cannot be activated until some environment holds the full write chain/);
    expect(body.error.message).toMatch(/No environment has a credential or a write grant yet/);
    expect(mocks.updateInterface).not.toHaveBeenCalled();
    // The write-key lookup is a FILTER on the sealed column, selecting the environment only.
    const writeKeyQuery = mocks.findManyClients.mock.calls.find(
      (c) => "NOT" in (c[0] as { where: Record<string, unknown> }).where,
    )?.[0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(writeKeyQuery.where).toMatchObject({
      organizationId: "org_a",
      solutionId: "sol_1",
      isActive: true,
      revokedAt: null,
      NOT: { secretsCiphertext: null },
    });
    expect(writeKeyQuery.select).toEqual({ environment: true });
    // …and the grants are this capability's, for THIS operation.
    expect(mocks.findManyGrants).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ solutionId: "sol_1", externalId: "API_BUSINESS_PARTNER", operation: "CREATE" }),
      }),
    );
  });

  it("refuses when the write key and the approved grant sit in DIFFERENT environments — and says so per environment", async () => {
    // The interim gate passed this: "some credential carries a write key".
    // A DEV write key beside a PROD-only grant activates an interface that no
    // environment can call.
    mocks.findFirstInterface.mockResolvedValue({ ...EXISTING, operation: "CREATE", mode: "WRITE" });
    credentials([{ environment: "DEV", expiresAt: null }, { environment: "PROD", expiresAt: null }], ["DEV"]);
    mocks.findManyGrants.mockResolvedValue([{ ...APPROVED_TEST_GRANT, environment: "PROD" }]);
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("DEV: credential with write key · no write grant requested");
    expect(body.error.message).toContain("PROD: credential without a write key · write grant approved");
    expect(body.error.message).not.toMatch(/SANDBOX:|TEST:/); // nothing started there — not listed
    expect(mocks.updateInterface).not.toHaveBeenCalled();
  });

  it("refuses when the only approved grant is revoked or expired — the broker's own predicates", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...EXISTING, operation: "CREATE", mode: "WRITE" });
    credentials([TEST_CREDENTIAL], ["TEST"]);
    mocks.findManyGrants.mockResolvedValue([{ ...APPROVED_TEST_GRANT, expiresAt: new Date("2020-01-01T00:00:00Z") }]);
    let res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("TEST: credential with write key · write grant expired");

    mocks.findManyGrants.mockResolvedValue([{ ...APPROVED_TEST_GRANT, revokedAt: new Date() }]);
    res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect((await res.json()).error.message).toContain("write grant revoked");
  });

  it("…and the same for an interface being switched to UPDATE in the same edit", async () => {
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE", operation: "UPDATE" }));
    expect(res.status).toBe(400);
    expect(mocks.updateInterface).not.toHaveBeenCalled();
  });

  it("activates a WRITE interface once one environment holds credential-with-key AND approved grant", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...EXISTING, operation: "CREATE", mode: "WRITE" });
    credentials([TEST_CREDENTIAL], ["TEST"]);
    mocks.findManyGrants.mockResolvedValue([APPROVED_TEST_GRANT]);
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(200);
    expect(lastUpdateData().status).toBe("ACTIVE");
  });

  it("does not count an EXPIRED credential, even one carrying a write key", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...EXISTING, operation: "CREATE", mode: "WRITE" });
    credentials([{ environment: "TEST", expiresAt: new Date("2020-01-01T00:00:00Z") }], ["TEST"]);
    mocks.findManyGrants.mockResolvedValue([APPROVED_TEST_GRANT]);
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("TEST: no live credential · write grant approved");
  });

  it("never consults credentials or grants for a READ interface", async () => {
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(200);
    expect(mocks.findManyClients).not.toHaveBeenCalled();
    expect(mocks.findManyGrants).not.toHaveBeenCalled();
  });

  it("does not re-check on an interface that is already ACTIVE", async () => {
    // Promotion is the gate; a later revocation is the broker's to refuse per call.
    mocks.findFirstInterface.mockResolvedValue({ ...EXISTING, operation: "CREATE", mode: "WRITE", status: "ACTIVE" });
    const res = await PATCH(req({ id: "if_1", status: "ACTIVE", name: "Renamed" }));
    expect(res.status).toBe(200);
    expect(mocks.findManyClients).not.toHaveBeenCalled();
  });
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
