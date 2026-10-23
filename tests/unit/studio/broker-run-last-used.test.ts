// @vitest-environment node
/**
 * The Test Console's broker run stamps its credential's `lastUsedAt` at most
 * once a minute, as the northbound calls do (P0.19, auth.ts
 * LAST_USED_STAMP_INTERVAL_MS).
 *
 * The run reads its credential row and stamped it on every run without
 * passing the row's `lastUsedAt`, so the once-a-minute rule never applied and
 * every console run sent an UPDATE of the key's row. The real route and the
 * real `touchClientLastUsed`; the database, identity, gates and binding stood
 * in for.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuthModule from "@/lib/northbound/auth";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findIface: vi.fn(),
    findClients: vi.fn(),
    updateClient: vi.fn(),
    access: vi.fn(),
    record: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findFirst: mocks.findIface },
    solutionClient: { findMany: mocks.findClients, update: mocks.updateClient },
  },
}));
vi.mock("@/lib/northbound/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  checkSolutionRuntime: async () => ({ ok: true }),
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
      baseUrl: "https://erp.example.internal:44300",
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

import { POST } from "@/app/api/studio/test/broker-run/route";

function run() {
  return POST(
    new NextRequest("http://localhost/api/studio/test/broker-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interfaceId: "if_1" }),
    }),
  );
}

/** The run's credential row, last stamped `lastUsedAt`. */
function credential(lastUsedAt: Date | null) {
  return [{ id: "cl_1", environment: "DEV", sapClient: "100", expiresAt: null, lastUsedAt }];
}

/** The fire-and-forget stamp settles after the response; let it. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mocks.findIface.mockResolvedValue({
    id: "if_1",
    name: "Travel read",
    solutionId: "sol_1",
    externalId: "custom:/sap/opu/odata/sap/ZUI_X_O2",
    sapProduct: "s4hana-onprem",
    entitySet: "A_Travel",
    servicePath: "/sap/opu/odata/sap/ZUI_X_O2",
    odataVersion: "V2",
  });
  mocks.access.mockResolvedValue({ ok: true, iface: { draft: false } });
  mocks.updateClient.mockResolvedValue({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ d: { results: [{ TravelID: "1" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the console run's credential stamp", () => {
  it("reads the credential's lastUsedAt with the row it runs as", async () => {
    mocks.findClients.mockResolvedValue(credential(new Date()));
    await run();
    expect(mocks.findClients.mock.calls[0]![0].select).toMatchObject({ lastUsedAt: true });
  });

  it("sends no stamp for a credential stamped in the last minute", async () => {
    mocks.findClients.mockResolvedValue(credential(new Date(Date.now() - 10_000)));
    const body = (await (await run()).json()) as { data: { outcome: string } };
    await settled();
    expect(body.data.outcome).toBe("ran");
    expect(mocks.updateClient).not.toHaveBeenCalled();
  });

  it.each([
    ["last stamped over a minute ago", new Date(Date.now() - 5 * 60_000)],
    ["never stamped", null],
  ])("stamps a credential %s once, scoped to its organization", async (_label, lastUsedAt) => {
    mocks.findClients.mockResolvedValue(credential(lastUsedAt));
    const body = (await (await run()).json()) as { data: { outcome: string } };
    await settled();
    expect(body.data.outcome).toBe("ran");
    expect(mocks.updateClient).toHaveBeenCalledTimes(1);
    expect(mocks.updateClient.mock.calls[0]![0]).toMatchObject({
      where: { id: "cl_1", organizationId: "org_a" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });
});
