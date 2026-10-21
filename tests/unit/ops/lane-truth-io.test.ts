/**
 * P0.2: the I/O halves of three findings, against mocked Prisma.
 *
 *   A70  A manual Re-check of a retired or draft app's lane sent live reads to
 *        the client's SAP system; it now refuses as the sweep skips, before any
 *        secret is opened.
 *   A50  The probe sweep wrote nothing when a connection's secret would not
 *        open, so its last "OK" stood forever; it now records UNREADABLE.
 *   A18  A connection re-saved in place kept its lanes' evidence; the re-save
 *        now drops the checks made through it, in the same transaction.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

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
  transaction: vi.fn(),
  upsertLaneCheck: vi.fn(),
  resolveSapConnections: vi.fn(),
  readEntitySet: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    sapConnection: { upsert: mocks.upsertConnection },
    laneCheck: { deleteMany: mocks.deleteLaneChecks },
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
}));
vi.mock("@/lib/sap-public/secret-envelope", () => ({
  openSecretsForOrg: async () => ({}),
  sealSecretsForOrg: async () => "sealed",
}));
vi.mock("@/lib/northbound/read", () => ({ readEntitySet: mocks.readEntitySet }));
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
  it("writes UNREADABLE on every row of the group, leaving lastValidatedAt alone", async () => {
    mocks.findConnections.mockResolvedValue([
      { id: "c1", organizationId: "org_a", product: "s4hana", key: "a", label: "A", environment: "DEV", lastValidationStatus: "OK" },
      { id: "c2", organizationId: "org_a", product: "s4hana", key: "b", label: "B", environment: "TEST", lastValidationStatus: "OK" },
    ]);
    mocks.resolveSapConnections.mockRejectedValue(new Error("sealed under a previous key"));
    mocks.updateManyConnections.mockResolvedValue({ count: 1 });

    const result = await sweepConnectionProbes();
    expect(result.unreadable).toBe(2);
    expect(mocks.updateManyConnections).toHaveBeenCalledTimes(2);
    for (const [arg] of mocks.updateManyConnections.mock.calls) {
      expect(arg.data).toEqual({ lastValidationStatus: "UNREADABLE" });
      expect(arg.data).not.toHaveProperty("lastValidatedAt");
    }
  });
});

describe("A18: re-saving a connection drops the lane checks made through it", () => {
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
