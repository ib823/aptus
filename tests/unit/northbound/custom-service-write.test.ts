// @vitest-environment node
/**
 * The northbound WRITE through an interface's OWN service path.
 *
 * The real route, resolver and write executor; the gates, binding, catalogue
 * and idempotency store stood in for. Three properties:
 *
 *   1. A verified custom service is written on its own path — the CSRF
 *      handshake and the POST both on the connection's host, both carrying
 *      sap-client after the full path — and the idempotency key is bound to
 *      that path, so reusing a key after the path changes is a conflict.
 *   2. An UNVERIFIED custom service is refused before the key is reserved and
 *      before SAP is touched.
 *   3. A catalogue interface writes exactly as it always did.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Idempotency from "@/lib/northbound/idempotency";

const { mocks, BASE } = vi.hoisted(() => ({
  BASE: "https://erp.example.internal:44300",
  mocks: {
    access: vi.fn(),
    record: vi.fn(),
    hub: vi.fn(),
    reserve: vi.fn(),
    complete: vi.fn(),
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
vi.mock("@/lib/northbound/write-credential", () => ({ verifyWriteCredential: async () => true }));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.record }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: {} },
}));
vi.mock("@/lib/northbound/access", () => ({ resolveWritableInterface: mocks.access }));
vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnectionForEnvironment: async () => ({
    ok: true,
    connection: {
      id: "conn_dev",
      baseUrl: BASE,
      client: "100",
      environment: "DEV",
      writeEnabled: true,
      authType: "basic",
      timeoutMs: null,
    },
  }),
  connectionRefusalMessage: () => "Not configured",
  buildAuthHeadersFromConnection: async () => ({ Authorization: "Basic dTpw" }),
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({ resolveHubService: mocks.hub }));
vi.mock("@/lib/northbound/idempotency", async (importOriginal) => ({
  ...(await importOriginal<typeof Idempotency>()),
  reserveIdempotencyKey: mocks.reserve,
  completeIdempotencyKey: mocks.complete,
}));

import { POST } from "@/app/api/northbound/interfaces/[id]/data/write/route";

const PATH = "/sap/opu/odata/sap/ZUI_X_O2";

function iface(overrides: Record<string, unknown> = {}) {
  return {
    id: "if_1",
    name: "Create travel",
    version: 3,
    entitySet: "A_Travel",
    sapProduct: "s4hana-onprem",
    externalId: `custom:${PATH}`,
    operation: "CREATE",
    mode: "WRITE",
    draft: false,
    servicePath: PATH,
    odataVersion: "V2",
    serviceVerifiedAt: new Date("2026-10-19T10:00:00Z"),
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function post() {
  return POST(
    new NextRequest("http://localhost/api/northbound/interfaces/if_1/data/write", {
      method: "POST",
      headers: {
        authorization: "Bearer ce_test",
        "x-coreedge-write-key": "cew_test",
        "idempotency-key": "travel-4471-a",
      },
      body: JSON.stringify({ record: { Description: "Trip" } }),
    }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
}

beforeEach(() => {
  mocks.reserve.mockResolvedValue({ outcome: "proceed", recordId: "idem_1" });
  mocks.complete.mockResolvedValue(undefined);
  mocks.hub.mockResolvedValue({ path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" });
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "GET") return new Response("", { headers: { "x-csrf-token": "tok" } });
    return new Response(JSON.stringify({ d: { TravelID: "42" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("a verified custom service", () => {
  it("handshakes and posts on its own path, both carrying sap-client", async () => {
    mocks.access.mockResolvedValue({ ok: true, iface: iface() });
    const res = await post();
    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}${PATH}/?sap-client=100`);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "GET" });
    expect(fetchMock.mock.calls[1]![0]).toBe(`${BASE}${PATH}/A_Travel?sap-client=100`);
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "POST" });
    expect(mocks.hub).not.toHaveBeenCalled();
  });

  it("binds the idempotency key to the custom path", async () => {
    mocks.access.mockResolvedValue({ ok: true, iface: iface() });
    await post();
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: expect.objectContaining({
          servicePath: PATH,
          entitySet: "A_Travel",
          sapClient: "100",
          interfaceVersion: 3,
        }),
      }),
    );
  });
});

describe("an unverified custom service", () => {
  it("is refused 400 before the key is reserved and before SAP is touched", async () => {
    mocks.access.mockResolvedValue({ ok: true, iface: iface({ serviceVerifiedAt: null }) });
    const res = await post();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/has not been verified since it last changed\. Verify it in Studio/);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    // …and the refusal is in the trail, against the connection it was bound to.
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, externalId: `custom:${PATH}`, connectionId: "conn_dev" }),
    );
  });
});

describe("a catalogue write is unchanged", () => {
  it("writes on the catalogue path, with no verification gate", async () => {
    mocks.access.mockResolvedValue({
      ok: true,
      iface: iface({
        externalId: "API_BUSINESS_PARTNER",
        entitySet: "A_BusinessPartner",
        servicePath: null,
        odataVersion: null,
        serviceVerifiedAt: null,
      }),
    });
    const res = await post();
    expect(res.status).toBe(201);
    expect(mocks.hub).toHaveBeenCalledWith(expect.objectContaining({ key: "s4hana-onprem" }), "API_BUSINESS_PARTNER");
    expect(fetchMock.mock.calls[1]![0]).toBe(
      `${BASE}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?sap-client=100`,
    );
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: expect.objectContaining({ servicePath: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" }),
      }),
    );
  });
});
