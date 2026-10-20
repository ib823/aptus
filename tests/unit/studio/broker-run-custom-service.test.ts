// @vitest-environment node
/**
 * The Test Console's broker run on an interface's OWN service path.
 *
 * The console exists to answer "what would the deployed application see?", so
 * it must resolve the service exactly as the broker does: the interface's own
 * path when it carries one, the catalogue's otherwise. The real route, resolver
 * and `readEntitySet`; identity, gates and binding stood in for.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, BASE } = vi.hoisted(() => ({
  BASE: "https://erp.example.internal:44300",
  mocks: {
    findIface: vi.fn(),
    findClients: vi.fn(),
    access: vi.fn(),
    record: vi.fn(),
    hub: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findFirst: mocks.findIface },
    solutionClient: { findMany: mocks.findClients },
  },
}));
vi.mock("@/lib/northbound/auth", () => ({
  checkSolutionRuntime: async () => ({ ok: true }),
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: { limit: 60 } },
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.record }));
vi.mock("@/lib/northbound/access", () => ({ resolveReadableInterface: mocks.access }));
vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnectionForEnvironment: async () => ({
    ok: true,
    bindingUnverified: false,
    connection: {
      id: "conn_dev",
      key: "dev",
      label: "ERP DEV",
      baseUrl: BASE,
      client: "100",
      environment: "DEV",
      writeEnabled: false,
      authType: "basic",
      timeoutMs: null,
    },
  }),
  connectionRefusalMessage: () => "Not configured",
  buildAuthHeadersFromConnection: async () => ({ Authorization: "Basic dTpw" }),
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({ resolveHubService: mocks.hub }));

import { POST } from "@/app/api/studio/test/broker-run/route";

const PATH = "/sap/opu/odata/sap/ZUI_X_O2";
let fetchMock: ReturnType<typeof vi.fn>;

function run() {
  return POST(
    new NextRequest("http://localhost/api/studio/test/broker-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interfaceId: "if_1" }),
    }),
  );
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "if_1",
    name: "Travel read",
    solutionId: "sol_1",
    externalId: `custom:${PATH}`,
    sapProduct: "s4hana-onprem",
    entitySet: "A_Travel",
    servicePath: PATH,
    odataVersion: "V2",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.findClients.mockResolvedValue([{ id: "cl_1", environment: "DEV", sapClient: "100", expiresAt: null }]);
  mocks.access.mockResolvedValue({ ok: true, iface: { draft: false } });
  mocks.hub.mockResolvedValue({ path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" });
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ d: { results: [{ TravelID: "1" }] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the console run", () => {
  it("reads the custom service on its own path, as the broker would", async () => {
    mocks.findIface.mockResolvedValue(row());
    const res = await run();
    const body = (await res.json()) as { data: { outcome: string; count: number } };
    expect(body.data.outcome).toBe("ran");
    expect(body.data.count).toBe(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}${PATH}/A_Travel?$top=10&$format=json&sap-client=100`);
    expect(mocks.hub).not.toHaveBeenCalled();
    // The select asks for the service fields — without them every row reads as catalogue.
    expect(mocks.findIface.mock.calls[0]![0].select).toMatchObject({ servicePath: true, odataVersion: true });
  });

  it("is a dry-run audit row under the derived grant id", async () => {
    mocks.findIface.mockResolvedValue(row());
    await run();
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, externalId: `custom:${PATH}`, status: 200 }),
    );
  });

  it("refuses an invalid stored path with the custom sentence", async () => {
    mocks.findIface.mockResolvedValue(row({ servicePath: "//evil.example/x" }));
    const res = await run();
    const body = (await res.json()) as { data: { outcome: string; refusal: { message: string } } };
    expect(body.data.outcome).toBe("refused");
    expect(body.data.refusal.message).toBe("This interface's own service path is not valid for its product. Fix it in Studio.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a catalogue interface exactly as it was", async () => {
    mocks.findIface.mockResolvedValue(
      row({ externalId: "API_BUSINESS_PARTNER", entitySet: "A_BusinessPartner", servicePath: null, odataVersion: null }),
    );
    const res = await run();
    const body = (await res.json()) as { data: { outcome: string } };
    expect(body.data.outcome).toBe("ran");
    expect(mocks.hub).toHaveBeenCalledWith(expect.objectContaining({ key: "s4hana-onprem" }), "API_BUSINESS_PARTNER");
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${BASE}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=10&$format=json&sap-client=100`,
    );
  });
});
