// @vitest-environment node
/**
 * The write route's 201 — and the copy the idempotency store replays — never
 * names the customer's SAP host.
 *
 * The real write executor and the real route, with only the gates and the
 * store mocked. SAP answers the way SAP Gateway does: a V2 `d` carrying
 * `__metadata` and `__deferred` URIs, and an absolute Location header, all on
 * the tenant's host. Before the fix, `data.record.__metadata.uri`,
 * `data.record.to_BusinessPartnerAddress.__deferred.uri` and `data.location`
 * each carried it, and completeIdempotencyKey stored the lot to be served to
 * every retry under the same key for 24 hours.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Idempotency from "@/lib/northbound/idempotency";

const { mocks, BASE, SERVICE_PATH, CONNECTION } = vi.hoisted(() => {
  const BASE = "https://my404711-api.s4hana.cloud.sap";
  return {
    mocks: { reserve: vi.fn(), complete: vi.fn() },
    BASE,
    SERVICE_PATH: "/sap/opu/odata/sap/API_BUSINESS_PARTNER",
    CONNECTION: {
      id: "conn_1",
      baseUrl: BASE,
      client: null,
      environment: "SANDBOX",
      writeEnabled: true,
      authType: "basic",
      timeoutMs: null,
    },
  };
});

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "client_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      scope: { organizationId: "org_a" },
      environment: "SANDBOX",
      sapClient: null,
    },
  }),
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/write-credential", () => ({ verifyWriteCredential: async () => true }));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: {} },
}));
vi.mock("@/lib/northbound/access", () => ({
  resolveWritableInterface: async () => ({
    ok: true,
    iface: {
      id: "if_1",
      name: "Create BP",
      version: 1,
      entitySet: "A_BusinessPartner",
      sapProduct: "s4hana",
      externalId: "API_BUSINESS_PARTNER",
    },
  }),
}));
vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnectionForEnvironment: async () => ({ ok: true, connection: CONNECTION }),
  connectionRefusalMessage: () => "Not configured",
  buildAuthHeadersFromConnection: async () => ({ Authorization: "Basic dTpw" }),
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: async () => ({ path: SERVICE_PATH }),
}));
vi.mock("@/lib/northbound/idempotency", async (importOriginal) => ({
  ...(await importOriginal<typeof Idempotency>()),
  reserveIdempotencyKey: mocks.reserve,
  completeIdempotencyKey: mocks.complete,
}));

import { POST } from "@/app/api/northbound/interfaces/[id]/data/write/route";

const HOST = new URL(BASE).host;
const SVC = `${BASE}:443${SERVICE_PATH}`;
const ENTITY = `${SVC}/A_BusinessPartner('1000123')`;

function sap(): typeof fetch {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "GET") {
      return new Response("", { headers: { "x-csrf-token": "tok" } });
    }
    return new Response(
      JSON.stringify({
        d: {
          __metadata: { id: ENTITY, uri: ENTITY, type: "API_BUSINESS_PARTNER.A_BusinessPartnerType" },
          BusinessPartner: "1000123",
          BusinessPartnerName: "Acme",
          to_BusinessPartnerAddress: { __deferred: { uri: `${ENTITY}/to_BusinessPartnerAddress` } },
        },
      }),
      { status: 201, headers: { "content-type": "application/json", location: ENTITY } },
    );
  }) as unknown as typeof fetch;
}

function post() {
  return POST(
    new NextRequest("http://localhost/api/northbound/interfaces/if_1/data/write", {
      method: "POST",
      headers: {
        authorization: "Bearer ce_test",
        "x-coreedge-write-key": "cew_test",
        "idempotency-key": "order-4471-a",
      },
      body: JSON.stringify({ record: { BusinessPartnerName: "Acme" } }),
    }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
}

beforeEach(() => {
  mocks.reserve.mockResolvedValue({ outcome: "proceed", recordId: "idem_1" });
  mocks.complete.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", sap());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("a successful create through the broker", () => {
  it("returns the record and its identity without the SAP host", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { record: unknown; location: unknown } };
    expect(JSON.stringify(body)).not.toContain(HOST);
    expect(body.data.record).toEqual({ BusinessPartner: "1000123", BusinessPartnerName: "Acme" });
    expect(body.data.location).toBe("/A_BusinessPartner('1000123')");
  });

  it("stores a host-free envelope for the idempotent replay", async () => {
    await post();
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    const stored = mocks.complete.mock.calls[0]?.[3];
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(HOST);
  });
});
