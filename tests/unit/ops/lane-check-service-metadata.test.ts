/**
 * The SAP systems screen's per-service "Metadata" column is that service's own
 * `$metadata` answer (P0.3, A30).
 *
 * THE DEFECT. The lane check recorded `SapServiceHealth.metadataStatus` for a
 * lane's service from `probeConnection(connection)`, which asks the
 * CONNECTION's default probe path (its apiPath, else the product's first
 * curated service). The lane's own service was never asked, so every service
 * on a system showed a verdict observed on another one: "Metadata OK" for a
 * service whose description nobody requested, or NOT_FOUND for every service
 * because the probe path's service is not activated, while their reads worked.
 *
 * Here the real probe runs (credentials, SAP client, EDMX test) against a
 * stubbed SAP whose answers differ by service, so the test can tell which
 * service's answer was recorded.
 *
 * AND A 403 ON ONE SERVICE IS NOT A SIGN-IN FAILURE. Asked per service, a
 * `$metadata` 403 means the communication user may not use THIS service; it
 * used to be classified with 401 as UNAUTHORIZED, which the screen reads as
 * "SAP rejected our sign-in, every lane on this system stops" and hands to the
 * platform admin. It is recorded as FORBIDDEN: SAP refused this service, one
 * lane stops, and the client's SAP admin fixes it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  findSolutions: vi.fn(),
  findInterface: vi.fn(),
  findGrants: vi.fn(),
  findClients: vi.fn(),
  upsertLaneCheck: vi.fn(),
  upsertServiceHealth: vi.fn(),
  resolveSapConnections: vi.fn(),
  readEntitySet: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findMany: mocks.findSolutions },
    interface: { findFirst: mocks.findInterface },
    apiAccessGrant: { findMany: mocks.findGrants },
    solutionClient: { findMany: mocks.findClients },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: async () => [{ revision: 1 }],
        laneCheck: { upsert: mocks.upsertLaneCheck },
        sapServiceHealth: { upsert: mocks.upsertServiceHealth },
      }),
  },
}));
vi.mock("@/lib/db/tenant-guard", () => ({ permitCrossTenantReads: vi.fn() }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolverModule>()),
  resolveSapConnections: mocks.resolveSapConnections,
}));
vi.mock("@/lib/northbound/read", () => ({ readEntitySet: mocks.readEntitySet }));

import { serviceHealthFactsOf, verdictForService, ownerForService } from "@/lib/coreedge/service-health";
import { recheckOneLane, sweepLaneChecks } from "@/lib/ops/lane-check-sweep";

const BASE = "https://erp.example.internal";
const LANE_SERVICE = "/sap/opu/odata/sap/ZUI_TRAVEL_O2";
const PROBE_PATH = "/sap/opu/odata/sap/ZPROBE_SRV";

const CONNECTION = {
  source: "db",
  id: "conn_1",
  organizationId: "org_a",
  revision: 1,
  key: "erp-dev",
  label: "ERP DEV",
  product: "s4hana-onprem",
  environment: "DEV",
  baseUrl: BASE,
  authType: "basic",
  secrets: { username: "COMM_USER", password: "not-a-real-password" },
  oauthTokenUrl: null,
  writeEnabled: false,
  // The connection's own probe path: a DIFFERENT service from the lane's.
  apiPath: PROBE_PATH,
  timeoutMs: 2_000,
  client: "100",
};

function feed(id: string, solutionId: string) {
  return {
    id,
    name: id,
    solutionId,
    sapProduct: "s4hana-onprem",
    externalId: `custom:${LANE_SERVICE}`,
    entitySet: "Travel",
    operation: "READ",
    mode: "READ",
    status: "ACTIVE",
    version: 1,
    servicePath: LANE_SERVICE,
    odataVersion: "V2",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    grantMatchChangedAt: null,
  };
}

function approved(f: ReturnType<typeof feed>) {
  return {
    id: `g_${f.id}`,
    organizationId: "org_a",
    solutionId: f.solutionId,
    externalId: f.externalId,
    operation: "READ",
    environment: "DEV",
    decision: "APPROVED",
    expiresAt: null,
    revokedAt: null,
    interfaceId: f.id,
    sapProduct: "s4hana-onprem",
    unboundLastUsedAt: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    unboundCutoffAt: null,
  };
}

const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

/** SAP: the lane's service describes itself; the connection's probe path is not activated. */
const sap = vi.fn();
const serveLaneServiceOnly = async (url: string | URL) =>
  String(url).includes(`${LANE_SERVICE}/$metadata`)
    ? new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } })
    : new Response("not activated", { status: 404 });

const metadataUrls = () => sap.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("$metadata"));

type HealthWrite = {
  where: { connectionId_serviceName_entitySet: { serviceName: string } };
  create: { metadataStatus: string | null; metadataAt: Date | null; readStatus: string; readAt: Date; readRowCount: number };
};

beforeEach(() => {
  vi.clearAllMocks();
  sap.mockImplementation(serveLaneServiceOnly);
  vi.stubGlobal("fetch", sap);
  mocks.resolveSapConnections.mockResolvedValue([CONNECTION]);
  mocks.readEntitySet.mockResolvedValue({ status: "OK", httpStatus: 200, records: [{ id: 1 }] });
  mocks.findClients.mockResolvedValue([]);
  mocks.upsertLaneCheck.mockResolvedValue({});
  mocks.upsertServiceHealth.mockResolvedValue({});
});
afterEach(() => vi.unstubAllGlobals());

describe("the Metadata fact is the lane's own service's (A30)", () => {
  it("asks the lane's service for its $metadata, never the connection's probe path, and records that answer", async () => {
    const f = feed("if_a", "sol_1");
    mocks.findInterface.mockResolvedValue({ ...f, solution: { status: "ACTIVE" } });
    mocks.findGrants.mockResolvedValue([approved(f)]);

    const now = new Date();
    const outcome = await recheckOneLane("org_a", "sol_1", "if_a", "DEV", now);
    expect(outcome.ok).toBe(true);

    expect(metadataUrls()).toEqual([expect.stringContaining(`${LANE_SERVICE}/$metadata`)]);
    expect(metadataUrls().some((u) => u.includes(PROBE_PATH))).toBe(false);

    const health = mocks.upsertServiceHealth.mock.calls[0]![0] as HealthWrite;
    // The service the row is for answered 200 with EDMX: OK, not the probe path's 404.
    expect(health.create.metadataStatus).toBe("OK");
    expect(mocks.upsertLaneCheck.mock.calls[0]![0].create.probeStatus).toBe("OK");
  });

  it("records the lane's service as NOT_FOUND when it is that service which is missing, whatever the probe path says", async () => {
    sap.mockImplementation(async (url: string | URL) =>
      String(url).includes(`${PROBE_PATH}/$metadata`)
        ? new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } })
        : new Response("no such service", { status: 404 }),
    );
    const f = feed("if_a", "sol_1");
    mocks.findInterface.mockResolvedValue({ ...f, solution: { status: "ACTIVE" } });
    mocks.findGrants.mockResolvedValue([approved(f)]);

    await recheckOneLane("org_a", "sol_1", "if_a", "DEV", new Date());

    const health = mocks.upsertServiceHealth.mock.calls[0]![0] as HealthWrite;
    expect(health.create.metadataStatus).toBe("NOT_FOUND");
  });

  it("records a 403 on the service as FORBIDDEN: SAP refused this service, not our sign-in", async () => {
    sap.mockImplementation(async (url: string | URL) =>
      String(url).includes(`${PROBE_PATH}/$metadata`)
        ? new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } })
        : new Response("forbidden", { status: 403 }),
    );
    mocks.readEntitySet.mockResolvedValue({ status: "ERROR", httpStatus: 403, records: [] });
    const f = feed("if_a", "sol_1");
    mocks.findInterface.mockResolvedValue({ ...f, solution: { status: "ACTIVE" } });
    mocks.findGrants.mockResolvedValue([approved(f)]);

    const now = new Date();
    await recheckOneLane("org_a", "sol_1", "if_a", "DEV", now);

    const health = mocks.upsertServiceHealth.mock.calls[0]![0] as HealthWrite;
    expect(health.create.metadataStatus).toBe("FORBIDDEN");
    const facts = serviceHealthFactsOf(health.create);
    expect(verdictForService(facts, now).status).toBe("sapRefused");
    expect(ownerForService(facts, now)).toBe("Client SAP admin");
  });

  it("records a token-endpoint 403 as UNAUTHORIZED: we never signed in, so SAP refused no service (review round 1)", async () => {
    const TOKEN_URL = "https://auth.example.internal/oauth/token";
    mocks.resolveSapConnections.mockResolvedValue([
      {
        ...CONNECTION,
        authType: "oauth-client-credentials",
        secrets: { clientId: "client", clientSecret: "rotated-away" },
        oauthTokenUrl: TOKEN_URL,
      },
    ]);
    // The token endpoint (or the gateway in front of it) answers 403; any
    // request that did reach the tenant would be served.
    sap.mockImplementation(async (url: string | URL) =>
      String(url).startsWith(TOKEN_URL) ? new Response("forbidden", { status: 403 }) : serveLaneServiceOnly(url),
    );
    mocks.readEntitySet.mockResolvedValue({ status: "ERROR", httpStatus: 401, records: [] });
    const f = feed("if_a", "sol_1");
    mocks.findInterface.mockResolvedValue({ ...f, solution: { status: "ACTIVE" } });
    mocks.findGrants.mockResolvedValue([approved(f)]);

    const now = new Date();
    await recheckOneLane("org_a", "sol_1", "if_a", "DEV", now);

    // The tenant was never asked for $metadata.
    expect(metadataUrls()).toEqual([]);
    const health = mocks.upsertServiceHealth.mock.calls[0]![0] as HealthWrite;
    expect(health.create.metadataStatus).toBe("UNAUTHORIZED");
    const facts = serviceHealthFactsOf(health.create);
    expect(verdictForService(facts, now).status).toBe("signInRefused");
    expect(ownerForService(facts, now)).not.toBe("Client SAP admin");
  });

  it("still records a 401 on the service as UNAUTHORIZED, the sign-in failure it is", async () => {
    sap.mockImplementation(async () => new Response("no", { status: 401 }));
    mocks.readEntitySet.mockResolvedValue({ status: "ERROR", httpStatus: 401, records: [] });
    const f = feed("if_a", "sol_1");
    mocks.findInterface.mockResolvedValue({ ...f, solution: { status: "ACTIVE" } });
    mocks.findGrants.mockResolvedValue([approved(f)]);

    const now = new Date();
    await recheckOneLane("org_a", "sol_1", "if_a", "DEV", now);

    const health = mocks.upsertServiceHealth.mock.calls[0]![0] as HealthWrite;
    expect(health.create.metadataStatus).toBe("UNAUTHORIZED");
    expect(verdictForService(serviceHealthFactsOf(health.create), now).status).toBe("signInRefused");
  });

  it("asks SAP once per service in a sweep, however many lanes read it", async () => {
    const a = feed("if_a", "sol_1");
    const b = feed("if_b", "sol_2");
    mocks.findSolutions.mockResolvedValue([
      { id: "sol_1", organizationId: "org_a", status: "ACTIVE", interfaces: [a] },
      { id: "sol_2", organizationId: "org_a", status: "ACTIVE", interfaces: [b] },
    ]);
    mocks.findGrants.mockResolvedValue([approved(a), approved(b)]);

    const result = await sweepLaneChecks(new Date());

    expect(result.checked).toBe(2);
    expect(metadataUrls()).toHaveLength(1);
    expect(metadataUrls()[0]).toContain(`${LANE_SERVICE}/$metadata`);
    for (const call of mocks.upsertServiceHealth.mock.calls) {
      expect((call[0] as HealthWrite).create.metadataStatus).toBe("OK");
    }
  });
});
