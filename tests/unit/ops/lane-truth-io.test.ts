/**
 * P0.2: the I/O halves of three findings, against mocked Prisma.
 *
 *   A70  A manual Re-check of a retired or draft app's lane sent live reads to
 *        the client's SAP system; it now refuses as the sweep skips, before any
 *        secret is opened.
 *   A50  The probe sweep wrote nothing when a connection's secret would not
 *        open, so its last "OK" stood forever; it now records UNREADABLE.
 *   A18  A connection re-saved in place kept its lanes' evidence; the re-save
 *        now drops the checks made through it, in the same transaction — and
 *        (P0.2 review) its service health and probe status with them, and a
 *        check already reading through the old settings records nothing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";
import type * as ConnectionHealthModule from "@/lib/studio/connection-health";

const mocks = vi.hoisted(() => ({
  findInterface: vi.fn(),
  findGrants: vi.fn(),
  findClients: vi.fn(),
  findConnections: vi.fn(),
  updateManyConnections: vi.fn(),
  findFirstConnection: vi.fn(),
  updateConnection: vi.fn(),
  upsertConnection: vi.fn(),
  deleteLaneChecks: vi.fn(),
  deleteServiceHealth: vi.fn(),
  upsertServiceHealth: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  upsertLaneCheck: vi.fn(),
  resolveSapConnections: vi.fn(),
  resolveSapConnection: vi.fn(),
  readEntitySet: vi.fn(),
  probeConnection: vi.fn(),
  findHubContent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => {
  // One transaction client for both writers: the re-save and the check.
  const tx = {
    sapConnection: { upsert: mocks.upsertConnection },
    laneCheck: { deleteMany: mocks.deleteLaneChecks, upsert: mocks.upsertLaneCheck },
    sapServiceHealth: { deleteMany: mocks.deleteServiceHealth, upsert: mocks.upsertServiceHealth },
    $queryRaw: mocks.queryRaw,
  };
  return {
    prisma: {
      interface: { findFirst: mocks.findInterface },
      apiAccessGrant: { findMany: mocks.findGrants },
      solutionClient: { findMany: mocks.findClients },
      sapConnection: {
        findMany: mocks.findConnections,
        updateMany: mocks.updateManyConnections,
        findFirst: mocks.findFirstConnection,
        update: mocks.updateConnection,
      },
      laneCheck: { upsert: mocks.upsertLaneCheck },
      sapHubContent: { findFirst: mocks.findHubContent },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => {
        mocks.transaction();
        return fn(tx);
      },
    },
  };
});
vi.mock("@/lib/db/tenant-guard", () => ({ permitCrossTenantReads: vi.fn() }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolverModule>()),
  resolveSapConnections: mocks.resolveSapConnections,
  resolveSapConnection: mocks.resolveSapConnection,
}));
vi.mock("@/lib/sap-public/secret-envelope", () => ({
  openSecretsForOrg: async () => ({}),
  sealSecretsForOrg: async () => "sealed",
}));
vi.mock("@/lib/northbound/read", () => ({ readEntitySet: mocks.readEntitySet }));
vi.mock("@/lib/studio/connection-health", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionHealthModule>()),
  probeConnection: mocks.probeConnection,
  // The lane sweep asks a service for its $metadata through the request
  // probeConnection wraps; one stand-in answers for both.
  fetchMetadataDocument: mocks.probeConnection,
}));
vi.mock("@/lib/coreedge/journey", () => ({ noteConnectionProbe: async () => undefined }));

import { sweepConnectionProbes } from "@/lib/ops/connection-probe-sweep";
import { recheckOneLane } from "@/lib/ops/lane-check-sweep";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";

const FEED = {
  id: "if_1",
  name: "Business partners",
  solutionId: "sol_1",
  sapProduct: "s4hana",
  externalId: "API_BUSINESS_PARTNER",
  entitySet: "A_BusinessPartner",
  operation: "READ",
  mode: "READ",
  status: "ACTIVE",
  version: 1,
  servicePath: null,
  odataVersion: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  grantMatchChangedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findGrants.mockResolvedValue([
    {
      id: "g_1",
      externalId: "API_BUSINESS_PARTNER",
      operation: "READ",
      environment: "DEV",
      decision: "APPROVED",
      expiresAt: null,
      revokedAt: null,
      interfaceId: "if_1",
      sapProduct: "s4hana",
      createdAt: new Date("2026-02-01T00:00:00Z"),
      unboundCutoffAt: null,
    },
  ]);
  mocks.findClients.mockResolvedValue([]);
  mocks.resolveSapConnections.mockResolvedValue([]);
});

describe("A70: a retired or draft app's lane is not read on demand", () => {
  for (const status of ["RETIRED", "DRAFT"]) {
    it(`refuses ${status} as appNotLive, before opening a secret or reading SAP`, async () => {
      mocks.findInterface.mockResolvedValue({ ...FEED, solution: { status } });
      const out = await recheckOneLane("org_a", "sol_1", "if_1", "DEV");
      expect(out).toEqual({ ok: false, skipped: "appNotLive" });
      expect(mocks.resolveSapConnections).not.toHaveBeenCalled();
      expect(mocks.readEntitySet).not.toHaveBeenCalled();
      expect(mocks.upsertLaneCheck).not.toHaveBeenCalled();
    });
  }

  it("refuses a lane the broker refuses on access, before opening a secret", async () => {
    mocks.findInterface.mockResolvedValue({ ...FEED, solution: { status: "ACTIVE" } });
    mocks.findGrants.mockResolvedValue([]);
    expect(await recheckOneLane("org_a", "sol_1", "if_1", "DEV")).toEqual({ ok: false, skipped: "accessRefused" });
    expect(mocks.resolveSapConnections).not.toHaveBeenCalled();
  });
});

describe("A50: the probe sweep records a connection whose secret will not open", () => {
  const ROWS = [
    { id: "c1", organizationId: "org_a", product: "s4hana", key: "a", label: "A", environment: "DEV", lastValidationStatus: "OK", revision: 1 },
    { id: "c2", organizationId: "org_a", product: "s4hana", key: "b", label: "B", environment: "TEST", lastValidationStatus: "OK", revision: 4 },
  ];

  it("writes UNREADABLE on the row that will not open and GROUP_UNREADABLE on its sibling, leaving lastValidatedAt alone", async () => {
    mocks.findConnections.mockResolvedValue(ROWS);
    mocks.resolveSapConnections.mockRejectedValue(new Error("sealed under a previous key"));
    // Opened one by one (P0.2 review): only "a" is sealed under the old key.
    mocks.resolveSapConnection.mockImplementation(async (_o: string, _p: string, key: string) => {
      if (key === "a") throw new Error("sealed under a previous key");
      return { id: "c2", key: "b" };
    });
    mocks.updateManyConnections.mockResolvedValue({ count: 1 });

    const result = await sweepConnectionProbes();
    expect(result.unreadable).toBe(2);
    expect(mocks.updateManyConnections).toHaveBeenCalledTimes(2);
    const byId = Object.fromEntries(
      mocks.updateManyConnections.mock.calls.map(([arg]) => [arg.where.id, arg]),
    );
    expect(byId.c1.data).toEqual({ lastValidationStatus: "UNREADABLE" });
    expect(byId.c2.data).toEqual({ lastValidationStatus: "GROUP_UNREADABLE" });
    // Each write names the revision the sweep listed: a re-save since wins.
    expect(byId.c1.where.revision).toBe(1);
    expect(byId.c2.where.revision).toBe(4);
  });

  it("writes nothing when every row opens on its own — the group's failure was not a secret", async () => {
    mocks.findConnections.mockResolvedValue(ROWS);
    mocks.resolveSapConnections.mockRejectedValue(new Error("connection reset"));
    mocks.resolveSapConnection.mockImplementation(async (_o: string, _p: string, key: string) => ({ id: key, key }));

    const result = await sweepConnectionProbes();
    expect(result.unreadable).toBe(2);
    expect(mocks.updateManyConnections).not.toHaveBeenCalled();
  });
});

const SAVED_ROW = {
  id: "conn_1",
  product: "s4hana",
  key: "acme-prod",
  label: "PROD",
  authType: "basic",
  writeEnabled: false,
  isActive: true,
  secretsCiphertext: "sealed",
};

const RESAVE = {
  organizationId: "org_a",
  product: "s4hana",
  key: "acme-prod",
  label: "PROD",
  baseUrl: "https://new-tenant.example",
  authType: "basic" as const,
  secrets: { username: "u", password: "wrong" },
  environment: "DEV" as const,
};

/** The connection a check loaded, at the revision the table held then. */
const OLD_CONNECTION = {
  source: "db" as const,
  id: "conn_1",
  organizationId: "org_a",
  product: "s4hana",
  key: "acme-prod",
  label: "PROD",
  baseUrl: "https://old-tenant.example",
  authType: "basic" as const,
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: false,
  apiPath: null,
  timeoutMs: null,
  environment: "DEV" as const,
  client: null,
  revision: 1,
};

describe("A18: re-saving a connection drops what was proved through it", () => {
  it("drops the lane checks AND the service health, clears the probe status and bumps the revision", async () => {
    // P0.2 review: the A18 reasoning ("the id alone cannot tell the old proof
    // from the new system") was applied to LaneCheck only, so the old tenant's
    // OK and its "readable N of N" services stood beside the new settings.
    mocks.upsertConnection.mockResolvedValue(SAVED_ROW);
    mocks.deleteLaneChecks.mockResolvedValue({ count: 3 });
    mocks.deleteServiceHealth.mockResolvedValue({ count: 2 });
    await upsertSapConnection(RESAVE);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const dropped = { where: { organizationId: "org_a", connectionId: "conn_1" } };
    expect(mocks.deleteLaneChecks).toHaveBeenCalledWith(dropped);
    expect(mocks.deleteServiceHealth).toHaveBeenCalledWith(dropped);
    const { update, create } = mocks.upsertConnection.mock.calls[0]![0];
    expect(update).toMatchObject({ revision: { increment: 1 }, lastValidationStatus: null, lastValidatedAt: null });
    // A new row starts at the column's default revision and has no status yet.
    expect(create).not.toHaveProperty("revision");
    expect(create).not.toHaveProperty("lastValidationStatus");
  });
});

describe("A18: a check reading when the connection is re-saved records nothing", () => {
  /** The table, as far as the two writers see it. */
  let table: { revision: number; order: string[] };

  beforeEach(() => {
    table = { revision: 1, order: [] };
    mocks.findInterface.mockResolvedValue({ ...FEED, solution: { status: "ACTIVE" } });
    mocks.resolveSapConnections.mockResolvedValue([OLD_CONNECTION]);
    mocks.findHubContent.mockResolvedValue({
      contentType: "API",
      apiType: "ODATAV2",
      externalId: "API_BUSINESS_PARTNER",
      title: "Business Partner",
      packageId: null,
      communicationScenarios: ["SAP_COM_0008"],
    });
    mocks.probeConnection.mockResolvedValue({ status: "OK", httpStatus: 200, detail: "", durationMs: 9 });
    mocks.upsertConnection.mockImplementation(async () => {
      table.revision++;
      table.order.push("resave:upsert");
      return SAVED_ROW;
    });
    mocks.deleteLaneChecks.mockImplementation(async () => {
      table.order.push("resave:deleteLaneChecks");
      return { count: 0 };
    });
    mocks.deleteServiceHealth.mockResolvedValue({ count: 0 });
    // recordLaneCheck's `SELECT "revision" ... FOR SHARE`.
    mocks.queryRaw.mockImplementation(async () => [{ revision: table.revision }]);
    mocks.upsertLaneCheck.mockImplementation(async () => {
      table.order.push("sweep:upsertLaneCheck");
      return {};
    });
    mocks.upsertServiceHealth.mockResolvedValue({});
  });

  it("a re-save during the read: the old system's answer is not written under the connection's id", async () => {
    mocks.readEntitySet.mockImplementation(async ({ connection }: { connection: { baseUrl: string } }) => {
      expect(connection.baseUrl).toBe("https://old-tenant.example");
      await upsertSapConnection(RESAVE);
      return { status: "OK", httpStatus: 200, records: [{ BusinessPartner: "1" }] };
    });
    const out = await recheckOneLane("org_a", "sol_1", "if_1", "DEV");
    expect(out).toEqual({ ok: false, skipped: "connectionChanged" });
    expect(table.order).toEqual(["resave:upsert", "resave:deleteLaneChecks"]);
    expect(mocks.upsertLaneCheck).not.toHaveBeenCalled();
    expect(mocks.upsertServiceHealth).not.toHaveBeenCalled();
  });

  it("no re-save: the check is recorded, under the connection's lock", async () => {
    mocks.readEntitySet.mockResolvedValue({ status: "OK", httpStatus: 200, records: [{ BusinessPartner: "1" }] });
    const out = await recheckOneLane("org_a", "sol_1", "if_1", "DEV");
    expect(out).toMatchObject({ ok: true, readStatus: "OK" });
    expect(mocks.upsertLaneCheck).toHaveBeenCalledTimes(1);
    expect(mocks.upsertServiceHealth).toHaveBeenCalledTimes(1);
    const sql = (mocks.queryRaw.mock.calls[0]![0] as readonly string[]).join("?");
    expect(sql).toMatch(/FOR SHARE/);
  });
});

describe("A18: the original delete-on-re-save", () => {
  it("deletes the connection's LaneCheck rows in the same transaction as the save", async () => {
    mocks.upsertConnection.mockResolvedValue({
      id: "conn_1",
      product: "s4hana",
      key: "acme-prod",
      label: "PROD",
      authType: "basic",
      writeEnabled: false,
      isActive: true,
      secretsCiphertext: "sealed",
    });
    mocks.deleteLaneChecks.mockResolvedValue({ count: 3 });
    await upsertSapConnection({
      organizationId: "org_a",
      product: "s4hana",
      key: "acme-prod",
      label: "PROD",
      baseUrl: "https://new-tenant.s4hana.ondemand.com",
      authType: "basic",
      secrets: { username: "u", password: "p" },
      environment: "PROD",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.deleteLaneChecks).toHaveBeenCalledWith({ where: { organizationId: "org_a", connectionId: "conn_1" } });
  });
});
