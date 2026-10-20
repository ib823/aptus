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
 *      before SAP is touched — and "verified" means verified FOR THIS
 *      ENVIRONMENT, through the connection, SAP client and host the write is
 *      bound to. A SANDBOX verify does not open a DEV (or PROD) write.
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
import { withServiceVerification } from "@/lib/sap-public/service-verifications";

const PATH = "/sap/opu/odata/sap/ZUI_X_O2";
const DEV_VERIFIED = {
  DEV: { at: "2026-10-19T10:00:00.000Z", connectionId: "conn_dev", sapClient: "100", baseUrl: BASE },
};

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
    serviceVerifications: DEV_VERIFIED,
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
    mocks.access.mockResolvedValue({
      ok: true,
      iface: iface({ serviceVerifiedAt: null, serviceVerifications: null }),
    });
    const res = await post();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/has not been verified in DEV.*since it last changed\. Verify it in Studio for DEV/);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    // …and the refusal is in the trail, against the connection it was bound to.
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, externalId: `custom:${PATH}`, connectionId: "conn_dev" }),
    );
  });
});

describe("verification is per environment and per binding (review round 1)", () => {
  async function refused(serviceVerifications: unknown) {
    mocks.access.mockResolvedValue({ ok: true, iface: iface({ serviceVerifications }) });
    const res = await post();
    expect(res.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    return res;
  }

  it("a verify in SANDBOX does not open a DEV write, though serviceVerifiedAt is set", async () => {
    const res = await refused({
      SANDBOX: { at: "2026-10-19T10:00:00.000Z", connectionId: "conn_sbx", sapClient: "100", baseUrl: BASE },
    });
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("not been verified in DEV");
  });

  it("a DEV verify made through another connection does not count", async () => {
    await refused({ DEV: { ...DEV_VERIFIED.DEV, connectionId: "conn_other" } });
  });

  it("a DEV verify made on another SAP client does not count", async () => {
    await refused({ DEV: { ...DEV_VERIFIED.DEV, sapClient: "200" } });
  });

  it("a DEV verify made against another host does not count", async () => {
    await refused({ DEV: { ...DEV_VERIFIED.DEV, baseUrl: "https://erp-old.example.internal:44300" } });
  });

  it("a malformed entry reads as not verified", async () => {
    await refused({ DEV: { at: "2026-10-19T10:00:00.000Z" } });
  });

  it("the matching DEV entry, beside others, opens the DEV write", async () => {
    mocks.access.mockResolvedValue({
      ok: true,
      iface: iface({
        serviceVerifications: {
          ...DEV_VERIFIED,
          PROD: { at: "2026-10-19T11:00:00.000Z", connectionId: "conn_prd", sapClient: "300", baseUrl: "https://prd" },
        },
      }),
    });
    const res = await post();
    expect(res.status).toBe(201);
  });
});

describe("two SAP clients in one environment (review round 2)", () => {
  it("verifying client 200 after client 100 leaves the client-100 write open", async () => {
    // The order Studio's Verify panel produces: DEV · client 100, then DEV · client 200.
    let stored: unknown = null;
    stored = withServiceVerification(stored, "DEV", DEV_VERIFIED.DEV);
    stored = withServiceVerification(stored, "DEV", {
      at: "2026-10-19T12:00:00.000Z",
      connectionId: "conn_dev_200",
      sapClient: "200",
      baseUrl: BASE,
    });
    mocks.access.mockResolvedValue({ ok: true, iface: iface({ serviceVerifications: stored }) });
    const res = await post();
    expect(res.status).toBe(201);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });

  it("only the other client verified still refuses the client-100 write", async () => {
    const stored = withServiceVerification(null, "DEV", {
      at: "2026-10-19T12:00:00.000Z",
      connectionId: "conn_dev_200",
      sapClient: "200",
      baseUrl: BASE,
    });
    mocks.access.mockResolvedValue({ ok: true, iface: iface({ serviceVerifications: stored }) });
    expect((await post()).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
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
        serviceVerifications: null,
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
