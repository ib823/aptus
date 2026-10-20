/**
 * Lane checks on a feed that carries its OWN service path.
 *
 * The sweep, the manual re-check and the lane board all resolve a feed's
 * service through `resolveLaneServicePath`, which now goes through the same
 * `resolveInterfaceService` the broker calls. So a custom feed is checked on
 * its own path (no catalogue lookup at all), two custom feeds never share a
 * memoised answer, and the board does not claim "service cannot be resolved"
 * for a feed the broker would serve.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";
import type * as ConnectionHealthModule from "@/lib/studio/connection-health";

const mocks = vi.hoisted(() => ({
  findSolutions: vi.fn(),
  findConnections: vi.fn(),
  findInterface: vi.fn(),
  findGrants: vi.fn(),
  findClients: vi.fn(),
  findLaneChecks: vi.fn(),
  upsertLaneCheck: vi.fn(),
  upsertServiceHealth: vi.fn(),
  resolveSapConnections: vi.fn(),
  probeConnection: vi.fn(),
  readEntitySet: vi.fn(),
  findHubContent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findMany: mocks.findSolutions },
    sapConnection: { findMany: mocks.findConnections },
    interface: { findFirst: mocks.findInterface },
    apiAccessGrant: { findMany: mocks.findGrants },
    solutionClient: { findMany: mocks.findClients },
    laneCheck: { upsert: mocks.upsertLaneCheck, findMany: mocks.findLaneChecks },
    sapServiceHealth: { upsert: mocks.upsertServiceHealth },
    sapHubContent: { findFirst: mocks.findHubContent },
  },
}));
vi.mock("@/lib/db/tenant-guard", () => ({ permitCrossTenantReads: vi.fn() }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolverModule>()),
  resolveSapConnections: mocks.resolveSapConnections,
}));
vi.mock("@/lib/studio/connection-health", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionHealthModule>()),
  probeConnection: mocks.probeConnection,
}));
vi.mock("@/lib/northbound/read", () => ({ readEntitySet: mocks.readEntitySet }));

import { listLanes } from "@/lib/coreedge/queries";
import {
  laneServiceKey,
  recheckOneLane,
  resolveLaneServicePath,
  sweepLaneChecks,
} from "@/lib/ops/lane-check-sweep";

const PATH_A = "/sap/opu/odata/sap/ZUI_A_O2";
const PATH_B = "/sap/opu/odata/sap/ZUI_B_O2";

function feed(id: string, path: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    sapProduct: "s4hana-onprem",
    externalId: path ? `custom:${path}` : "API_BUSINESS_PARTNER",
    entitySet: "A_Travel",
    operation: "READ",
    status: "ACTIVE",
    servicePath: path,
    odataVersion: path ? "V2" : null,
    ...extra,
  };
}

const RESOLVED = {
  id: "conn_1",
  key: "erp-dev",
  product: "s4hana-onprem",
  environment: "DEV",
  baseUrl: "https://erp.example.internal",
  apiPath: "/sap/opu/odata/sap/ZPROBE_SRV",
  client: "100",
  secrets: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findConnections.mockResolvedValue([{ id: "conn_1", organizationId: "org_a", environment: "DEV", label: "ERP DEV" }]);
  mocks.resolveSapConnections.mockResolvedValue([RESOLVED]);
  mocks.probeConnection.mockResolvedValue({ status: "OK", httpStatus: 200, detail: "", durationMs: 5 });
  mocks.readEntitySet.mockResolvedValue({ status: "OK", httpStatus: 200, records: [{ id: 1 }] });
  mocks.findHubContent.mockResolvedValue(null);
  mocks.upsertLaneCheck.mockResolvedValue({});
  mocks.upsertServiceHealth.mockResolvedValue({});
  mocks.findGrants.mockResolvedValue([]);
  mocks.findClients.mockResolvedValue([]);
  mocks.findLaneChecks.mockResolvedValue([]);
});

describe("resolveLaneServicePath", () => {
  it("returns a custom feed's own path, without the catalogue", async () => {
    expect(await resolveLaneServicePath("s4hana-onprem", `custom:${PATH_A}`, PATH_A, "V2")).toBe(PATH_A);
    expect(mocks.findHubContent).not.toHaveBeenCalled();
  });

  it("keeps the two-argument catalogue call exactly as it was", async () => {
    mocks.findHubContent.mockResolvedValue({
      contentType: "API",
      apiType: "ODATAV2",
      externalId: "API_BUSINESS_PARTNER",
      title: "Business Partner",
      packageId: null,
      communicationScenarios: ["SAP_COM_0008"],
    });
    expect(await resolveLaneServicePath("s4hana", "API_BUSINESS_PARTNER")).toBe(
      "/sap/opu/odata/sap/API_BUSINESS_PARTNER",
    );
    expect(mocks.findHubContent).toHaveBeenCalledTimes(1);
  });

  it("refuses a custom path the broker would refuse", async () => {
    expect(await resolveLaneServicePath("s4hana-onprem", "custom:/x", "/a/../b", "V2")).toBeNull();
    expect(await resolveLaneServicePath("ariba", "custom:/x", "/x", "V2")).toBeNull();
  });

  it("the shared key separates feeds by their own path and version", () => {
    const a = laneServiceKey({ product: "p", externalId: "custom:/a", servicePath: "/a", odataVersion: "V2" });
    const b = laneServiceKey({ product: "p", externalId: "custom:/a", servicePath: "/a", odataVersion: "V4" });
    expect(a).not.toBe(b);
  });
});

describe("the nightly sweep", () => {
  it("reads each custom feed on its own path, and never asks the catalogue", async () => {
    mocks.findSolutions.mockResolvedValue([
      { id: "sol_1", organizationId: "org_a", interfaces: [feed("if_a", PATH_A), feed("if_b", PATH_B)] },
    ]);
    const result = await sweepLaneChecks(new Date("2026-10-20T04:30:00Z"));
    expect(result.checked).toBe(2);
    expect(result.skippedNoService).toBe(0);
    const paths = mocks.readEntitySet.mock.calls.map((c) => (c[0] as { servicePath: string }).servicePath).sort();
    // Two custom feeds, two answers — the memo never merged them.
    expect(paths).toEqual([PATH_A, PATH_B]);
    expect(mocks.findHubContent).not.toHaveBeenCalled();
  });

  it("skips a custom feed whose stored path no longer resolves, as the broker would refuse it", async () => {
    mocks.findSolutions.mockResolvedValue([
      { id: "sol_1", organizationId: "org_a", interfaces: [feed("if_bad", "/a/../b")] },
    ]);
    const result = await sweepLaneChecks();
    expect(result.skippedNoService).toBe(1);
    expect(mocks.readEntitySet).not.toHaveBeenCalled();
  });
});

describe("the manual re-check", () => {
  it("re-checks a custom feed on its own path", async () => {
    mocks.findInterface.mockResolvedValue(feed("if_a", PATH_A));
    const out = await recheckOneLane("org_a", "sol_1", "if_a", "DEV");
    expect(out).toMatchObject({ ok: true, readStatus: "OK" });
    expect(mocks.readEntitySet.mock.calls[0]![0]).toMatchObject({ servicePath: PATH_A, entitySet: "A_Travel" });
    // It selected the service fields — without them the row reads as catalogue.
    expect(mocks.findInterface.mock.calls[0]![0].select).toMatchObject({ servicePath: true, odataVersion: true });
  });
});

describe("the lane board", () => {
  function solutionWith(f: ReturnType<typeof feed>) {
    return [{ id: "sol_1", slug: "app", name: "App", status: "ACTIVE", interfaces: [f] }];
  }

  it("does not claim a custom feed's service cannot be resolved", async () => {
    const f = feed("if_a", PATH_A);
    mocks.findSolutions.mockResolvedValue(solutionWith(f));
    mocks.findGrants.mockResolvedValue([
      {
        solutionId: "sol_1",
        externalId: f.externalId,
        operation: "READ",
        environment: "DEV",
        decision: "APPROVED",
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
      },
    ]);
    const lanes = await listLanes("org_a");
    const dev = lanes.find((l) => l.environment === "DEV")!;
    expect(JSON.stringify(dev.verdict)).not.toContain("feedServiceUnresolved");
  });

  it("does say so for a custom feed whose path no longer resolves", async () => {
    const f = feed("if_bad", "/a/../b");
    mocks.findSolutions.mockResolvedValue(solutionWith(f));
    mocks.findGrants.mockResolvedValue([
      {
        solutionId: "sol_1",
        externalId: f.externalId,
        operation: "READ",
        environment: "DEV",
        decision: "APPROVED",
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
      },
    ]);
    const lanes = await listLanes("org_a");
    const dev = lanes.find((l) => l.environment === "DEV")!;
    expect(JSON.stringify(dev.verdict)).toContain("feedServiceUnresolved");
  });
});
