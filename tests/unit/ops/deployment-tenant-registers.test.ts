/**
 * Both connection registers say what the deployment's env tenant serves, and
 * that the broker never uses it (P0.3, A59).
 *
 * THE DEFECT. Control Tower's register and the Operations connection health
 * view reported the deployment's env tenant as "in use" exactly when the
 * organization had no active stored connection — "the broker's own fallback
 * rule" — and told the reader that traffic "falls back to the deployment's
 * configured tenant". The broker does the opposite: the northbound data and
 * write routes bind only through the organization's own connections and
 * refuse with CONNECTION_NOT_CONFIGURED when there is none. Meanwhile the
 * console reads (Explore, preview, the operations screens) resolve the
 * deployment tenant for every organization, connections or not. So a reviewer
 * was told an organization with no connection had live apps on the shared
 * tenant while every app call was refused, and told an organization WITH a
 * connection that the env tenant was not in use while its users' console
 * reads reached it.
 *
 * Now two facts, neither derived from the other: `deploymentTenant` (exists,
 * serves console reads for everyone, never the broker) and `brokerReachable`
 * (the organization has an active connection).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  connectionFindMany: vi.fn(),
  fallbackTenants: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/studio/tenants", () => ({ deploymentFallbackTenants: mocks.fallbackTenants }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapConnection: { findMany: mocks.connectionFindMany, count: async () => 0 } },
}));

import { GET as controlTowerConnections } from "@/app/api/control-tower/connections/route";
import { GET as connectionsHealth } from "@/app/api/ops/connections-health/route";

const ADMIN = { id: "u_a", email: "admin@abeam.test", role: "platform_admin", organizationId: "org_a" };
const TDD = { key: "s4_tdd", label: "ABeam S/4 TDD", product: "s4hana", source: "environment", environment: null };

const row = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  organizationId: "org_a",
  product: "s4hana",
  key: "dev",
  label: "DEV",
  environment: "DEV",
  authType: "basic",
  writeEnabled: false,
  isActive: true,
  lastValidationStatus: "OK",
  lastValidatedAt: new Date(),
  createdAt: new Date(),
  ...over,
});

const REGISTERS = [
  ["Control Tower connections", () => controlTowerConnections(new NextRequest("https://x.test/api/control-tower/connections"))],
  ["Operations connection health", () => connectionsHealth()],
] as const;

type Body = {
  data: {
    brokerReachable: boolean;
    deploymentTenant: { configured: boolean; servesBroker: boolean; tenants: { key: string }[] };
    provenance: Record<string, unknown>;
  } & Record<string, unknown>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ADMIN);
});

describe.each(REGISTERS)("%s (A59)", (_name, get) => {
  it("an organization with no connection: the broker refuses its apps, and nothing claims the env tenant stands in", async () => {
    mocks.connectionFindMany.mockResolvedValue([]);
    mocks.fallbackTenants.mockReturnValue([TDD]);

    const body = (await (await get()).json()) as Body;
    const text = JSON.stringify(body);

    expect(body.data.brokerReachable).toBe(false);
    expect(body.data.provenance.brokerReachability).toEqual(expect.stringContaining("CONNECTION_NOT_CONFIGURED"));
    expect(body.data.deploymentTenant).toMatchObject({ configured: true, servesBroker: false });
    // The old claims, gone in every form.
    expect(text).not.toMatch(/falls back to the deployment/i);
    expect(text).not.toMatch(/fallback rule/i);
    expect(body.data.deploymentFallback).toBeUndefined();
  });

  it("an organization WITH a connection still sees the env tenant, because console reads reach it", async () => {
    mocks.connectionFindMany.mockResolvedValue([row()]);
    mocks.fallbackTenants.mockReturnValue([TDD]);

    const body = (await (await get()).json()) as Body;

    expect(body.data.brokerReachable).toBe(true);
    expect(body.data.provenance.brokerReachability).toBeNull();
    expect(body.data.deploymentTenant.configured).toBe(true);
    expect(body.data.deploymentTenant.tenants.map((t) => t.key)).toEqual(["s4_tdd"]);
    expect(body.data.provenance.deploymentTenantScope).toEqual(expect.stringContaining("never uses it"));
  });

  it("a deployment with no env tenant says there is none, and still says the broker refuses", async () => {
    mocks.connectionFindMany.mockResolvedValue([]);
    mocks.fallbackTenants.mockReturnValue([]);

    const body = (await (await get()).json()) as Body;

    expect(body.data.deploymentTenant.configured).toBe(false);
    expect(body.data.provenance.deploymentTenantScope).toBeNull();
    expect(body.data.brokerReachable).toBe(false);
  });
});

describe("Control Tower counts reachability from ACTIVE connections only", () => {
  it("a register holding only deactivated connections is not reachable by the broker", async () => {
    mocks.connectionFindMany.mockResolvedValue([row({ isActive: false })]);
    mocks.fallbackTenants.mockReturnValue([]);

    const body = (await (await controlTowerConnections(new NextRequest("https://x.test/api/control-tower/connections"))).json()) as Body;
    expect(body.data.brokerReachable).toBe(false);
  });
});
