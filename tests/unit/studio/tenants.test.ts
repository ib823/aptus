/**
 * Studio tenant resolution — DB first, environment as the honest fallback.
 *
 * The bug this closes: a deployment with a perfectly working `S4_TDD_*` tenant —
 * the one SAP Explorer has been reading for months — showed Studio a "No SAP
 * tenant connected" empty state and disabled its own Test Console, because
 * Studio looked only at `SapConnection` rows.
 *
 * The thing these tests hold down is not just "the fallback fires". It is that
 * the fallback stays LABELLED. An environment tenant is shared by every
 * organization on the deployment; quietly rendering it as this client's own
 * connection would be a lie the UI could not walk back.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted, because vi.mock factories are lifted above these declarations.
const { findMany, getConfiguredSapTenants } = vi.hoisted(() => ({
  findMany: vi.fn(),
  getConfiguredSapTenants: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { sapConnection: { findMany } } }));

vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getConfiguredSapTenants,
  SAP_ODATA_PRODUCTS: [
    { key: "s4hana", envPrefix: "S4_TDD" },
    { key: "successfactors", envPrefix: "SF_TDD" },
  ],
}));

import {
  isSharedEnvironmentTenant,
  pickActiveTenant,
  resolveStudioTenants,
  type StudioTenant,
} from "@/lib/studio/tenants";

beforeEach(() => {
  findMany.mockReset();
  getConfiguredSapTenants.mockReset();
  findMany.mockResolvedValue([]);
  getConfiguredSapTenants.mockReturnValue([]);
});

describe("resolveStudioTenants", () => {
  it("prefers the organization's own connections and never consults env", async () => {
    findMany.mockResolvedValue([{ key: "prod", label: "Acme PROD", product: "s4hana" }]);

    const tenants = await resolveStudioTenants("org_a");

    expect(tenants).toEqual([
      { key: "prod", label: "Acme PROD", product: "s4hana", source: "connection" },
    ]);
    // A client with its own sealed connection must not be silently handed the
    // shared demo tenant alongside it.
    expect(getConfiguredSapTenants).not.toHaveBeenCalled();
  });

  it("falls back to the deployment's env tenants when the org has none", async () => {
    getConfiguredSapTenants.mockImplementation((prefix: string) =>
      prefix === "S4_TDD" ? [{ key: "default", label: "Sandbox", baseUrl: "https://x" }] : [],
    );

    const tenants = await resolveStudioTenants("org_a");

    expect(tenants).toEqual([
      { key: "default", label: "Sandbox", product: "s4hana", source: "environment" },
    ]);
  });

  it("marks every env tenant as shared, not as a connection", async () => {
    getConfiguredSapTenants.mockImplementation((prefix: string) =>
      prefix === "S4_TDD"
        ? [
            { key: "dev", label: "Dev", baseUrl: "https://d" },
            { key: "qa", label: "QA", baseUrl: "https://q" },
          ]
        : [],
    );

    const tenants = await resolveStudioTenants("org_a");

    expect(tenants).toHaveLength(2);
    expect(tenants.every((t) => t.source === "environment")).toBe(true);
  });

  it("still resolves env tenants for a caller with no organization", async () => {
    // An admin with no organizationId can reach Studio; the DB query is skipped
    // for them, and skipping it must not also skip the fallback.
    getConfiguredSapTenants.mockImplementation((prefix: string) =>
      prefix === "S4_TDD" ? [{ key: "default", label: "Sandbox", baseUrl: "https://x" }] : [],
    );

    const tenants = await resolveStudioTenants(null);

    expect(findMany).not.toHaveBeenCalled();
    expect(tenants).toEqual([
      { key: "default", label: "Sandbox", product: "s4hana", source: "environment" },
    ]);
  });

  it("returns [] when nothing is configured anywhere — an honest empty", async () => {
    expect(await resolveStudioTenants("org_a")).toEqual([]);
  });

  it("scopes the connection query to the caller's organization", async () => {
    await resolveStudioTenants("org_a");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_a" }) }),
    );
  });

  it("never selects the sealed secret column", async () => {
    await resolveStudioTenants("org_a");
    const select = findMany.mock.calls[0]?.[0]?.select ?? {};
    expect(Object.keys(select).sort()).toEqual(["key", "label", "product"]);
  });

  it("ignores inactive connections", async () => {
    await resolveStudioTenants("org_a");
    expect(findMany.mock.calls[0]?.[0]?.where?.isActive).toBe(true);
  });

  it("filters both sources by product when one is named", async () => {
    getConfiguredSapTenants.mockReturnValue([{ key: "d", label: "D", baseUrl: "https://d" }]);

    const tenants = await resolveStudioTenants("org_a", "successfactors");

    expect(findMany.mock.calls[0]?.[0]?.where?.product).toBe("successfactors");
    expect(getConfiguredSapTenants).toHaveBeenCalledTimes(1);
    expect(getConfiguredSapTenants).toHaveBeenCalledWith("SF_TDD");
    expect(tenants.map((t) => t.product)).toEqual(["successfactors"]);
  });

  it("survives a malformed env var instead of taking down the layout", async () => {
    // getConfiguredSapTenants throws on bad *_TENANTS_JSON. This runs in the
    // Studio layout, so one bad product must not 500 every Studio page.
    getConfiguredSapTenants.mockImplementation((prefix: string) => {
      if (prefix === "S4_TDD") throw new Error("S4_TDD_TENANTS_JSON must be an array");
      return [{ key: "sf", label: "SF", baseUrl: "https://sf" }];
    });

    const tenants = await resolveStudioTenants("org_a");

    expect(tenants).toEqual([
      { key: "sf", label: "SF", product: "successfactors", source: "environment" },
    ]);
  });
});

describe("pickActiveTenant", () => {
  const tenants: StudioTenant[] = [
    { key: "a", label: "A", product: "s4hana", source: "connection" },
    { key: "b", label: "B", product: "s4hana", source: "connection" },
  ];

  it("honours a remembered tenant the caller can actually use", () => {
    expect(pickActiveTenant(tenants, "b")).toBe("b");
  });

  it("falls back to the first when the cookie names a tenant not in the list", () => {
    // The cookie is a view preference. A tampered value selects nothing — it must
    // never widen what the caller can reach.
    expect(pickActiveTenant(tenants, "someone-elses-tenant")).toBe("a");
  });

  it("returns null when there are no tenants at all", () => {
    expect(pickActiveTenant([], "a")).toBeNull();
  });

  it("returns the first when nothing is remembered", () => {
    expect(pickActiveTenant(tenants, null)).toBe("a");
  });
});

describe("isSharedEnvironmentTenant", () => {
  const mixed: StudioTenant[] = [
    { key: "own", label: "Own", product: "s4hana", source: "connection" },
    { key: "shared", label: "Shared", product: "s4hana", source: "environment" },
  ];

  it("is true only for the env-sourced tenant", () => {
    expect(isSharedEnvironmentTenant(mixed, "shared")).toBe(true);
    expect(isSharedEnvironmentTenant(mixed, "own")).toBe(false);
  });

  it("is false for no tenant and for an unknown key", () => {
    expect(isSharedEnvironmentTenant(mixed, null)).toBe(false);
    expect(isSharedEnvironmentTenant(mixed, "nope")).toBe(false);
  });
});
