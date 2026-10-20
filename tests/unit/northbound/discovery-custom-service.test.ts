/**
 * Discovery and YOUR OWN API.
 *
 * `GET /api/northbound/interfaces` must keep agreeing with enforcement: a
 * custom interface with a live grant on its derived `custom:` id is callable,
 * and one whose stored path the data route would refuse is not. It says which
 * kind of service each interface is — and never hands out upstream addressing
 * (no service-path field, no host).
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/northbound/interfaces/route";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const mocks = vi.hoisted(() => ({
  findManyInterfaces: vi.fn(),
  findManyGrants: vi.fn(),
  auditCreate: vi.fn(),
  authenticate: vi.fn(),
  findHub: vi.fn(),
}));

// Rows as the P0.1 deploy leaves them: these fixtures predate grant binding.
vi.mock("@/lib/db/prisma", async () => {
  const { deployedGrantRows, preDeployInterfaceRows } = await import("../../helpers/legacy-grants");
  return {
    prisma: {
      interface: { findMany: async (...a: unknown[]) => preDeployInterfaceRows(await mocks.findManyInterfaces(...a)) },
      apiAccessGrant: { findMany: async (...a: unknown[]) => deployedGrantRows(await mocks.findManyGrants(...a)) },
      northboundAuditEvent: { create: mocks.auditCreate },
      sapHubContent: { findFirst: mocks.findHub },
    },
  };
});

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: mocks.authenticate,
  extractBearer: (h: string | null) => h?.replace(/^Bearer /, "") ?? null,
  touchClientLastUsed: vi.fn(),
}));

const PATH = "/sap/opu/odata/sap/ZUI_X_O2";

const base = {
  sapProduct: "s4hana-onprem",
  operation: "READ",
  entitySet: "A_Travel",
  mode: "READ",
  version: 1,
  status: "ACTIVE",
  solutionId: "sol_1",
};

const CUSTOM = { ...base, id: "if_c", name: "Travel", externalId: `custom:${PATH}`, servicePath: PATH, odataVersion: "V2" };
const BROKEN = {
  ...base,
  id: "if_b",
  name: "Broken",
  externalId: "custom:/a/../b",
  servicePath: "/a/../b",
  odataVersion: "V2",
};
const CATALOGUE = {
  ...base,
  id: "if_k",
  name: "BP",
  externalId: "API_BUSINESS_PARTNER",
  servicePath: null,
  odataVersion: null,
};

const grant = (externalId: string) => ({
  externalId,
  operation: "READ",
  decision: "APPROVED",
  expiresAt: null,
  revokedAt: null,
});

type Listed = {
  id: string;
  externalId: string;
  callable: boolean;
  service: { source: string; odataVersion: string | null };
} & Record<string, unknown>;

async function list(): Promise<Listed[]> {
  const res = await GET(
    new NextRequest("http://localhost/api/northbound/interfaces", { headers: { authorization: "Bearer ce_live_x" } }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { interfaces: Listed[] } }).data.interfaces;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    ok: true,
    client: {
      clientId: "cl_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      environment: "DEV",
      scope: tenantScopeOf("org_a"),
    },
  });
  mocks.findManyInterfaces.mockResolvedValue([CUSTOM, BROKEN, CATALOGUE]);
  mocks.findManyGrants.mockResolvedValue([
    grant(`custom:${PATH}`),
    grant("custom:/a/../b"),
    grant("API_BUSINESS_PARTNER"),
  ]);
  mocks.auditCreate.mockResolvedValue({});
});

describe("discovery with your own API", () => {
  it("a custom read with a live grant on its custom: id is callable, and says it is custom", async () => {
    const c = (await list()).find((i) => i.id === "if_c")!;
    expect(c.callable).toBe(true);
    expect(c.service).toEqual({ source: "custom", odataVersion: "V2" });
  });

  it("a grant on another id does not make it callable", async () => {
    mocks.findManyGrants.mockResolvedValue([grant("custom:/sap/opu/odata/sap/ZUI_OTHER")]);
    expect((await list()).find((i) => i.id === "if_c")!.callable).toBe(false);
  });

  it("a stored path the data route would refuse is not advertised as callable", async () => {
    expect((await list()).find((i) => i.id === "if_b")!.callable).toBe(false);
  });

  it("never returns a service-path field or a host", async () => {
    const all = await list();
    for (const i of all) {
      expect(i).not.toHaveProperty("servicePath");
      expect(JSON.stringify(i)).not.toMatch(/https?:\/\//);
    }
  });

  it("catalogue callable is unchanged and makes no catalogue lookup", async () => {
    const k = (await list()).find((i) => i.id === "if_k")!;
    expect(k.callable).toBe(true);
    expect(k.service).toEqual({ source: "catalogue", odataVersion: null });
    expect(mocks.findHub).not.toHaveBeenCalled();
  });
});
