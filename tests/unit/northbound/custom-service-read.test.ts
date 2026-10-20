// @vitest-environment node
/**
 * The northbound READ through an interface's OWN service path.
 *
 * The real route, the real resolver (interface-service.ts) and the real
 * `readEntitySet` — only the gates, the binding and the catalogue lookup are
 * stood in for. What is asserted is the one thing that matters to the
 * customer's SAP system: the exact URL the broker sends, on the connection's
 * host, with sap-client placed by CoreEdge after the full path. And that a
 * catalogue interface's URL is what it always was.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, BASE } = vi.hoisted(() => ({
  BASE: "https://erp.example.internal:44300",
  mocks: {
    access: vi.fn(),
    record: vi.fn(),
    hub: vi.fn(),
    binding: vi.fn(),
  },
}));

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "client_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      scope: { organizationId: "org_a" },
      environment: "DEV",
      sapClient: "100",
    },
  }),
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.record }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: {} },
}));
vi.mock("@/lib/northbound/access", () => ({ resolveReadableInterface: mocks.access }));
vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnectionForEnvironment: mocks.binding,
  connectionRefusalMessage: () => "Not configured",
  buildAuthHeadersFromConnection: async () => ({ Authorization: "Basic dTpw" }),
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({ resolveHubService: mocks.hub }));

import { GET } from "@/app/api/northbound/interfaces/[id]/data/route";

const CONNECTION = {
  id: "conn_dev",
  baseUrl: BASE,
  client: "100",
  environment: "DEV",
  writeEnabled: false,
  authType: "basic",
  timeoutMs: null,
};

function iface(overrides: Record<string, unknown> = {}) {
  return {
    id: "if_1",
    name: "Travel read",
    version: 2,
    entitySet: "A_Travel",
    sapProduct: "s4hana-onprem",
    externalId: "custom:/sap/opu/odata/sap/ZUI_X_O2",
    operation: "READ",
    mode: "READ",
    draft: false,
    servicePath: "/sap/opu/odata/sap/ZUI_X_O2",
    odataVersion: "V2",
    serviceVerifiedAt: null,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function get() {
  return GET(
    new NextRequest("http://localhost/api/northbound/interfaces/if_1/data", {
      headers: { authorization: "Bearer ce_test" },
    }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
}

beforeEach(() => {
  mocks.binding.mockResolvedValue({ ok: true, connection: CONNECTION, bindingUnverified: false });
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

describe("a custom V2 service", () => {
  it("is read on its own path, on the connection's host, with sap-client after the full path", async () => {
    mocks.access.mockResolvedValue({ ok: true, iface: iface() });
    const res = await get();
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${BASE}/sap/opu/odata/sap/ZUI_X_O2/A_Travel?$top=10&$format=json&sap-client=100`,
    );
    // The catalogue was never asked.
    expect(mocks.hub).not.toHaveBeenCalled();
    const body = (await res.json()) as { data: { records: unknown[] } };
    expect(body.data.records).toEqual([{ TravelID: "1" }]);
  });

  it("is audited under its derived grant id, like any interface", async () => {
    mocks.access.mockResolvedValue({ ok: true, iface: iface() });
    await get();
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "custom:/sap/opu/odata/sap/ZUI_X_O2",
        status: 200,
        connectionId: "conn_dev",
      }),
    );
  });

  it("reads are not gated on verification (the read path reports NOT_FOUND honestly)", async () => {
    mocks.access.mockResolvedValue({ ok: true, iface: iface({ serviceVerifiedAt: null }) });
    expect((await get()).status).toBe(200);
  });
});

describe("a custom V4 service", () => {
  it("is read on its service-group path", async () => {
    mocks.access.mockResolvedValue({
      ok: true,
      iface: iface({
        servicePath: "/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001",
        externalId: "custom:/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001",
        odataVersion: "V4",
        entitySet: "Travel",
      }),
    });
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ value: [{ TravelID: "1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const res = await get();
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${BASE}/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001/Travel?$top=10&$format=json&sap-client=100`,
    );
  });
});

describe("a custom path that no longer resolves", () => {
  it("is refused 400 without calling SAP or the catalogue", async () => {
    mocks.access.mockResolvedValue({ ok: true, iface: iface({ servicePath: "/a/../b" }) });
    const res = await get();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("This interface's own service path is not valid for its product. Fix it in Studio.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.hub).not.toHaveBeenCalled();
  });
});

describe("a catalogue interface is unchanged", () => {
  it("resolves through the catalogue and reads its path", async () => {
    mocks.access.mockResolvedValue({
      ok: true,
      iface: iface({
        externalId: "API_BUSINESS_PARTNER",
        servicePath: null,
        odataVersion: null,
        entitySet: "A_BusinessPartner",
      }),
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(mocks.hub).toHaveBeenCalledWith(expect.objectContaining({ key: "s4hana-onprem" }), "API_BUSINESS_PARTNER");
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${BASE}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=10&$format=json&sap-client=100`,
    );
  });

  it("a catalogue miss keeps its original sentence byte for byte", async () => {
    mocks.hub.mockResolvedValue(null);
    mocks.access.mockResolvedValue({ ok: true, iface: iface({ externalId: "API_NOPE", servicePath: null, odataVersion: null }) });
    const res = await get();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("The catalogue service for this interface could not be resolved.");
  });
});
