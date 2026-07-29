/**
 * "Tenant" names two registries, and the read path answers to both.
 *
 * THE DEFECT. The Studio tenant switcher lists an organization's DECLARED
 * CONNECTIONS (`SapConnection.key`, e.g. "qa-conn-verify"), because
 * `resolveStudioTenants` reads those rows. The live-read endpoints validated
 * against the DEPLOYMENT'S CONFIGURED TENANTS (env-derived, e.g. "customizing"),
 * because `getSapTenant` reads those. Two disjoint sets of keys, one word.
 *
 * So a consultant picked the connection they had just created, pressed Run, and
 * got 400 "Valid tenant and service are required" — while the same call with a
 * deployment key returned 200. Every connection a user could create was unusable
 * on the screen whose stated purpose is proving an interface against the real
 * tenant.
 *
 * WHY IT WAS INVISIBLE, AND THE REASON THIS TEST EXISTS AT ALL. Until connection
 * creation was repaired, no organization had a single connection, so
 * `resolveStudioTenants` always fell through to the deployment tenants and the
 * switcher offered exactly the keys the read path expected. THE TWO REGISTRIES
 * AGREED BECAUSE ONE OF THEM WAS PERMANENTLY EMPTY. Repairing the create path is
 * what pulled them apart — the first connection an organization successfully
 * declares is the moment its Test Console stops working.
 *
 * A disagreement between two sources of truth is unobservable while one has no
 * rows. No amount of testing the empty state would have found this; it needed a
 * row to exist. That is the shape to remember, not the fix.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSapTenant: vi.fn(),
  resolveSapConnection: vi.fn(),
}));

vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapTenant: mocks.getSapTenant,
}));

vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnection: mocks.resolveSapConnection,
  toSapTenant: (c: { key: string; label: string; baseUrl: string }) => ({
    key: c.key,
    label: c.label,
    baseUrl: c.baseUrl,
  }),
}));

const DEPLOYMENT_TENANT = {
  key: "customizing",
  label: "Customizing X5M/100",
  baseUrl: "https://dep.example",
};

const DECLARED_CONNECTION = {
  key: "qa-conn-verify",
  label: "QA-Connection-Verify",
  baseUrl: "https://my123456-api.s4hana.cloud.sap",
};

beforeEach(() => {
  mocks.getSapTenant.mockReset();
  mocks.resolveSapConnection.mockReset();
});

describe("a key from either registry resolves", () => {
  it("resolves a deployment tenant, as it always did", async () => {
    mocks.getSapTenant.mockReturnValue(DEPLOYMENT_TENANT);
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    const out = await resolveReadTenant("S4_TDD", "s4hana", "org_1", "customizing");
    expect(out?.tenant.key).toBe("customizing");
    expect(out?.source).toBe("deployment");
    // The connection registry must not even be consulted — existing callers
    // keep their exact behaviour and cost.
    expect(mocks.resolveSapConnection).not.toHaveBeenCalled();
  });

  it("resolves a DECLARED CONNECTION — the case that used to 400", async () => {
    mocks.getSapTenant.mockReturnValue(null);
    mocks.resolveSapConnection.mockResolvedValue(DECLARED_CONNECTION);
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    const out = await resolveReadTenant("S4_TDD", "s4hana", "org_1", "qa-conn-verify");
    expect(
      out,
      "a key the product's own tenant switcher offers must be readable",
    ).not.toBeNull();
    expect(out?.tenant.key).toBe("qa-conn-verify");
    expect(out?.tenant.baseUrl).toBe(DECLARED_CONNECTION.baseUrl);
    expect(out?.source).toBe("connection");
  });
});

describe("resolution order is conservative", () => {
  it("prefers the deployment tenant on a key collision, never silently redirecting", async () => {
    // Both registries know "shared". The old meaning wins: this function may add
    // reach, never move an existing caller somewhere new.
    mocks.getSapTenant.mockReturnValue({ ...DEPLOYMENT_TENANT, key: "shared" });
    mocks.resolveSapConnection.mockResolvedValue({ ...DECLARED_CONNECTION, key: "shared" });
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    const out = await resolveReadTenant("S4_TDD", "s4hana", "org_1", "shared");
    expect(out?.source).toBe("deployment");
    expect(out?.tenant.baseUrl).toBe(DEPLOYMENT_TENANT.baseUrl);
  });
});

describe("it refuses what neither registry knows, and says so usefully", () => {
  it("returns null for an unknown key", async () => {
    mocks.getSapTenant.mockReturnValue(null);
    mocks.resolveSapConnection.mockResolvedValue(null);
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    expect(await resolveReadTenant("S4_TDD", "s4hana", "org_1", "nope")).toBeNull();
  });

  it("never reaches for connections when there is no organization", async () => {
    // An unauthenticated public-catalogue caller has no organization; asking the
    // connection registry on their behalf would be meaningless.
    mocks.getSapTenant.mockReturnValue(null);
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    expect(await resolveReadTenant("S4_TDD", "s4hana", null, "qa-conn-verify")).toBeNull();
    expect(mocks.resolveSapConnection).not.toHaveBeenCalled();
  });

  it("names BOTH places it looked when a key is unknown", async () => {
    // "Valid tenant and service are required" told a consultant nothing about
    // which of the two things was wrong — on a screen where the value came from
    // a dropdown the product itself populated.
    const { unknownTenantMessage } = await import("@/lib/sap-public/tenant-for-read");
    const msg = unknownTenantMessage("qa-conn-verify");

    expect(msg).toContain("qa-conn-verify");
    expect(msg.toLowerCase()).toContain("deployment");
    expect(msg.toLowerCase()).toContain("connection");
  });
});
