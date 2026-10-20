/**
 * /api/studio/interfaces — registering and editing YOUR OWN API.
 *
 * The rules pinned here:
 *   - a custom interface's id is DERIVED (`custom:<path>`), never typed, so a
 *     grant approved for one path can never authorise another;
 *   - the path is validated with the shared rule, the version is required,
 *     and non-OData products (Ariba) have no path at all;
 *   - catalogue and custom never convert into each other;
 *   - a service change is a contract change: new version, new id, verification
 *     cleared, an active WRITE interface back to DRAFT;
 *   - a custom WRITE interface is activated only once verified;
 *   - none of this touches a catalogue interface.
 */

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstSolution: vi.fn(),
  createInterface: vi.fn(),
  findFirstInterface: vi.fn(),
  updateInterface: vi.fn(),
  createAudit: vi.fn(),
  findManyClients: vi.fn(),
  findManyGrants: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findFirst: mocks.findFirstSolution },
    interface: {
      create: mocks.createInterface,
      findFirst: mocks.findFirstInterface,
      update: mocks.updateInterface,
      findMany: vi.fn().mockResolvedValue([]),
    },
    solutionClient: { findMany: mocks.findManyClients },
    apiAccessGrant: { findMany: mocks.findManyGrants },
    configAudit: { create: mocks.createAudit },
  },
}));

import { PATCH, POST } from "@/app/api/studio/interfaces/route";

const BUILDER = { id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };
const PATH = "/sap/opu/odata/sap/ZUI_X_O2";

function req(method: "POST" | "PATCH", body: unknown) {
  return new Request("http://localhost:3003/api/studio/interfaces", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

async function message(res: Response): Promise<string> {
  return ((await res.json()) as { error: { message: string } }).error.message;
}

const REGISTER = {
  solutionId: "sol_1",
  sapProduct: "s4hana-onprem",
  name: "Travel read",
  servicePath: PATH,
  odataVersion: "V2",
  operation: "READ",
};

/** A custom interface as stored. */
const CUSTOM = {
  id: "if_1",
  name: "Travel",
  version: 3,
  operation: "READ",
  entitySet: "A_Travel",
  mode: "READ",
  status: "DRAFT",
  mappingVersion: null,
  solutionId: "sol_1",
  externalId: `custom:${PATH}`,
  sapProduct: "s4hana-onprem",
  servicePath: PATH,
  odataVersion: "V2",
  serviceVerifiedAt: new Date("2026-10-19T10:00:00Z"),
};

/** A catalogue interface as stored — selects predating this change omit the service fields. */
const CATALOGUE = {
  id: "if_2",
  name: "BP",
  version: 1,
  operation: "READ",
  entitySet: "A_BusinessPartner",
  mode: "READ",
  status: "DRAFT",
  mappingVersion: null,
  solutionId: "sol_1",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  servicePath: null,
  odataVersion: null,
  serviceVerifiedAt: null,
};

function createData(): Record<string, unknown> {
  return mocks.createInterface.mock.calls[0]?.[0]?.data as Record<string, unknown>;
}
function updateData(): Record<string, unknown> {
  return mocks.updateInterface.mock.calls[0]?.[0]?.data as Record<string, unknown>;
}

/** A write chain that is complete in TEST — so the readiness gate is not what refuses. */
function writeChainReadyInTest() {
  mocks.findManyClients.mockResolvedValue([{ environment: "TEST", expiresAt: null }]);
  mocks.findManyGrants.mockResolvedValue([
    { environment: "TEST", decision: "APPROVED", expiresAt: null, revokedAt: null },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstSolution.mockResolvedValue({ id: "sol_1", name: "Acme" });
  mocks.createInterface.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "if_new", version: 1, ...data }),
  );
  mocks.findFirstInterface.mockResolvedValue(CUSTOM);
  mocks.updateInterface.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "if_1", version: 3, ...data }),
  );
  mocks.createAudit.mockResolvedValue({ id: "a1" });
  mocks.findManyClients.mockResolvedValue([]);
  mocks.findManyGrants.mockResolvedValue([]);
});

describe("POST — register your own API", () => {
  it("derives the id from the path and stores path and version together", async () => {
    const res = await POST(req("POST", REGISTER));
    expect(res.status).toBe(201);
    expect(createData()).toMatchObject({
      externalId: `custom:${PATH}`,
      servicePath: PATH,
      odataVersion: "V2",
      sapProduct: "s4hana-onprem",
      status: "DRAFT",
      mode: "READ",
      organizationId: "org_a",
    });
  });

  it("normalizes one trailing slash before deriving the id", async () => {
    await POST(req("POST", { ...REGISTER, servicePath: `${PATH}/` }));
    expect(createData()).toMatchObject({ servicePath: PATH, externalId: `custom:${PATH}` });
  });

  it("accepts an explicit externalId only when it is the derived one", async () => {
    expect((await POST(req("POST", { ...REGISTER, externalId: `custom:${PATH}` }))).status).toBe(201);
    const res = await POST(req("POST", { ...REGISTER, externalId: "API_BUSINESS_PARTNER" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe(
      "For your own API the id is derived from the service path, so leave externalId out.",
    );
  });

  it("requires the OData version", async () => {
    const { odataVersion: _omit, ...noVersion } = REGISTER;
    const res = await POST(req("POST", noVersion));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe("Choose the OData version of this service (V2 or V4).");
    expect(mocks.createInterface).not.toHaveBeenCalled();
  });

  it("refuses Ariba — not an OData product", async () => {
    const res = await POST(req("POST", { ...REGISTER, sapProduct: "ariba" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe("Ariba is not an OData product, so it has no service path.");
  });

  it("answers a bad path with the path rule's own sentence", async () => {
    const res = await POST(req("POST", { ...REGISTER, servicePath: "https://my-host/sap/opu/odata/sap/ZUI_X_O2" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/^Enter only the path, not a full address\./);
    const dots = await POST(req("POST", { ...REGISTER, servicePath: "/sap/%2e%2e/x" }));
    expect(await message(dots)).toMatch(/hides a slash, a dot/);
    expect(mocks.createInterface).not.toHaveBeenCalled();
  });

  it("answers an over-long path with its own sentence, not the generic refusal", async () => {
    const res = await POST(req("POST", { ...REGISTER, servicePath: "/" + "a".repeat(180) }));
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/longer than 180 characters/);
  });

  it("reserves the custom: prefix — a catalogue interface cannot pose as one", async () => {
    const res = await POST(
      req("POST", { solutionId: "sol_1", sapProduct: "s4hana", name: "x", externalId: `custom:${PATH}` }),
    );
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/reserved for your own APIs/);
  });

  it("refuses an OData version without a path", async () => {
    const res = await POST(
      req("POST", { solutionId: "sol_1", sapProduct: "s4hana", name: "x", externalId: "API_X", odataVersion: "V2" }),
    );
    expect(res.status).toBe(400);
  });

  it("a catalogue POST is unchanged and carries no service keys", async () => {
    const res = await POST(
      req("POST", { solutionId: "sol_1", sapProduct: "s4hana", name: "BP", externalId: "API_BUSINESS_PARTNER" }),
    );
    expect(res.status).toBe(201);
    expect(createData().externalId).toBe("API_BUSINESS_PARTNER");
    expect(createData()).not.toHaveProperty("servicePath");
    expect(createData()).not.toHaveProperty("odataVersion");
  });

  it("a catalogue POST without an externalId is the old invalid payload", async () => {
    const res = await POST(req("POST", { solutionId: "sol_1", sapProduct: "s4hana", name: "BP" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe("Invalid interface payload.");
  });
});

describe("PATCH — the service is part of the contract", () => {
  it("a path change bumps the version, derives a new id and clears verification", async () => {
    const next = "/sap/opu/odata/sap/ZUI_Y_O2";
    const res = await PATCH(req("PATCH", { id: "if_1", servicePath: next }));
    expect(res.status).toBe(200);
    expect(updateData()).toMatchObject({
      version: { increment: 1 },
      servicePath: next,
      odataVersion: "V2",
      externalId: `custom:${next}`,
      serviceVerifiedAt: null,
      serviceVerifiedEnvironment: null,
      serviceVerifiedEntitySets: Prisma.DbNull,
    });
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ serviceChanged: true, verificationReset: true, demoted: false, contractChanged: true });
  });

  it("a version change is a service change", async () => {
    await PATCH(req("PATCH", { id: "if_1", odataVersion: "V4" }));
    expect(updateData()).toMatchObject({ odataVersion: "V4", version: { increment: 1 }, serviceVerifiedAt: null });
  });

  it("the same path with a trailing slash is not a change", async () => {
    await PATCH(req("PATCH", { id: "if_1", servicePath: `${PATH}/` }));
    expect(updateData()).not.toHaveProperty("servicePath");
    expect(updateData().version).toBeUndefined();
  });

  it("an ACTIVE WRITE interface whose service changes returns to DRAFT", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...CUSTOM, operation: "CREATE", mode: "WRITE", status: "ACTIVE" });
    const res = await PATCH(req("PATCH", { id: "if_1", servicePath: "/sap/opu/odata/sap/ZUI_Y_O2" }));
    expect(res.status).toBe(200);
    expect(updateData().status).toBe("DRAFT");
    expect(((await res.json()) as { data: { demoted: boolean } }).data.demoted).toBe(true);
  });

  it("an ACTIVE READ interface stays ACTIVE (its grants detach with the old id)", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...CUSTOM, status: "ACTIVE" });
    await PATCH(req("PATCH", { id: "if_1", servicePath: "/sap/opu/odata/sap/ZUI_Y_O2" }));
    expect(updateData()).not.toHaveProperty("status");
    expect(updateData().externalId).toBe("custom:/sap/opu/odata/sap/ZUI_Y_O2");
  });

  it("refuses a service change and activation in one request", async () => {
    const res = await PATCH(req("PATCH", { id: "if_1", servicePath: "/sap/opu/odata/sap/ZUI_Y_O2", status: "ACTIVE" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe("Change the service and activate in two steps: save it, verify it, then activate.");
    expect(mocks.updateInterface).not.toHaveBeenCalled();
  });

  it("an entity-set change clears verification", async () => {
    await PATCH(req("PATCH", { id: "if_1", entitySet: "A_Booking" }));
    expect(updateData()).toMatchObject({
      entitySet: "A_Booking",
      version: { increment: 1 },
      serviceVerifiedAt: null,
      serviceVerifiedEntitySets: Prisma.DbNull,
    });
    expect(updateData()).not.toHaveProperty("servicePath");
  });

  it("a bad path is refused with the rule's sentence", async () => {
    const res = await PATCH(req("PATCH", { id: "if_1", servicePath: "/x?sap-client=100" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe("Leave out everything from ? or # onwards. CoreEdge adds sap-client itself.");
  });

  it("a rename alone bumps nothing and resets nothing", async () => {
    await PATCH(req("PATCH", { id: "if_1", name: "Renamed" }));
    const data = updateData();
    expect(data.version).toBeUndefined();
    expect(data).not.toHaveProperty("serviceVerifiedAt");
    expect(data).not.toHaveProperty("externalId");
  });
});

describe("PATCH — activating a custom WRITE interface needs a verification", () => {
  const WRITE = { ...CUSTOM, operation: "CREATE", mode: "WRITE", status: "DRAFT" };

  it("refuses while unverified", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...WRITE, serviceVerifiedAt: null });
    writeChainReadyInTest();
    const res = await PATCH(req("PATCH", { id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/^Verify this interface's own SAP service in at least one environment/);
    expect(mocks.updateInterface).not.toHaveBeenCalled();
  });

  it("refuses when the same request changes the dataset (verification would reset)", async () => {
    mocks.findFirstInterface.mockResolvedValue(WRITE);
    writeChainReadyInTest();
    const res = await PATCH(req("PATCH", { id: "if_1", status: "ACTIVE", entitySet: "A_Booking" }));
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/^Verify this interface's own SAP service/);
  });

  it("allows it once verified — and the write chain is checked under the derived id", async () => {
    mocks.findFirstInterface.mockResolvedValue(WRITE);
    writeChainReadyInTest();
    const res = await PATCH(req("PATCH", { id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(200);
    expect(updateData().status).toBe("ACTIVE");
    expect(mocks.findManyGrants).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ externalId: `custom:${PATH}`, operation: "CREATE" }) }),
    );
  });

  it("a custom READ interface activates without a verification (reads are not gated)", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...CUSTOM, serviceVerifiedAt: null });
    const res = await PATCH(req("PATCH", { id: "if_1", status: "ACTIVE" }));
    expect(res.status).toBe(200);
  });
});

describe("PATCH — catalogue and custom never convert", () => {
  it("refuses a path on a catalogue interface", async () => {
    mocks.findFirstInterface.mockResolvedValue(CATALOGUE);
    const res = await PATCH(req("PATCH", { id: "if_2", servicePath: PATH }));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe(
      "This interface uses a catalogue service. To call your own API, register a new interface with its service path.",
    );
  });

  it("refuses a version on a catalogue interface", async () => {
    mocks.findFirstInterface.mockResolvedValue(CATALOGUE);
    expect((await PATCH(req("PATCH", { id: "if_2", odataVersion: "V4" }))).status).toBe(400);
  });

  it("refuses clearing the path or the version of a custom one", async () => {
    for (const body of [{ servicePath: null }, { odataVersion: null }]) {
      const res = await PATCH(req("PATCH", { id: "if_1", ...body }));
      expect(res.status).toBe(400);
      expect(await message(res)).toMatch(/cannot be cleared\. Deprecate the interface instead\./);
    }
    expect(mocks.updateInterface).not.toHaveBeenCalled();
  });
});

describe("PATCH — a catalogue interface is untouched", () => {
  it("writes no service keys and resets nothing on an ordinary edit", async () => {
    // As the existing PATCH tests store it: no service fields selected at all.
    const { servicePath: _a, odataVersion: _b, serviceVerifiedAt: _c, ...legacy } = CATALOGUE;
    mocks.findFirstInterface.mockResolvedValue(legacy);
    const res = await PATCH(req("PATCH", { id: "if_2", operation: "READ", name: "BP again" }));
    expect(res.status).toBe(200);
    const data = updateData();
    for (const key of ["servicePath", "odataVersion", "externalId", "serviceVerifiedAt", "serviceVerifiedEnvironment", "serviceVerifiedEntitySets"]) {
      expect(data, key).not.toHaveProperty(key);
    }
  });

  it("an entity-set change on a catalogue interface still bumps the version as before", async () => {
    mocks.findFirstInterface.mockResolvedValue(CATALOGUE);
    await PATCH(req("PATCH", { id: "if_2", entitySet: "A_Other" }));
    expect(updateData().version).toEqual({ increment: 1 });
  });
});
