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

/**
 * EVERY ROUTE THAT RESOLVES A TENANT KEY RESOLVES BOTH REGISTRIES.
 *
 * The first fix for this defect changed the two routes it was reported against —
 * /preview and /entities — and left five others calling `getSapTenant` directly.
 * The tenant switcher offers CONNECTION keys to every SAP surface, so Discover's
 * "Probe all" answered
 *
 *     No TDD tenant "qa-conn-verify" configured for S/4HANA Cloud
 *
 * to a key the product itself had just put in the dropdown. The user hit it in
 * normal use, one merge after the fix was declared complete.
 *
 * The lesson was already written down, in the commit that closed the same shape
 * for the probe guard: "the omission is never in the route you were told about."
 * It was written and then not applied — which is why this is a scan and not a
 * checklist. A scan cannot forget the seventh route.
 */
describe("no route resolves a tenant key from one registry only", () => {
  it("finds the SAP routes, so a broken walk cannot pass vacuously", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join, resolve } = await import("node:path");
    const root = resolve(__dirname, "../../../src/app/api/sap");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const f = join(d, e);
        return statSync(f).isDirectory() ? walk(f) : e === "route.ts" ? [f] : [];
      });
    expect(walk(root).length).toBeGreaterThan(5);
  });

  it("uses the shared resolver wherever a caller-supplied key is turned into a tenant", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join, relative, resolve } = await import("node:path");
    const root = resolve(__dirname, "../../..");
    const api = join(root, "src/app/api/sap");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const f = join(d, e);
        return statSync(f).isDirectory() ? walk(f) : e === "route.ts" ? [f] : [];
      });

    /*
     * THE WRITE RING IS DEPLOYMENT-SCOPED, AND LEGITIMATELY SO.
     *
     * /write and hub-content/write-test are gated by isSapTddWriteEnabled — a
     * DEPLOYMENT env flag — plus an env write secret and an env entity-set
     * allowlist. Resolving an organization's own connection there would point a
     * deployment-configured, env-secret-protected write ring at a tenant that
     * facility knows nothing about. They read the deployment registry because
     * that is the registry they belong to.
     *
     * Two entries, named, with a reason. If this list grows, the growth is the
     * thing to question.
     */
    const DEPLOYMENT_SCOPED = [
      "src/app/api/sap/tdd/write/route.ts",
      "src/app/api/sap/tdd/hub-content/write-test/route.ts",
    ];

    const offenders = walk(api)
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        // Calling getSapTenant is only a problem when the route does NOT also
        // consult the connection registry. A route may legitimately use both.
        return src.includes("getSapTenant(") && !src.includes("resolveReadTenant");
      })
      .map((f) => relative(root, f))
      .filter((f) => !DEPLOYMENT_SCOPED.includes(f));

    expect(
      offenders,
      "These routes turn a caller-supplied key into a tenant using the DEPLOYMENT\n" +
        "registry only. The Studio tenant switcher offers CONNECTION keys, so every\n" +
        "connection a user declares is unusable here — the exact defect that was\n" +
        "fixed in /preview and /entities and left in place everywhere else:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
