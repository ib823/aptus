import { repoPath } from "../../helpers/source-files";
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

import type { ReadTenantRefusal, ResolvedReadTenant } from "@/lib/sap-public/tenant-for-read";

const mocks = vi.hoisted(() => ({
  getSapTenant: vi.fn(),
  resolveSapConnection: vi.fn(),
  hasActiveSapConnection: vi.fn(),
}));

vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapTenant: mocks.getSapTenant,
}));

vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnection: mocks.resolveSapConnection,
  hasActiveSapConnection: mocks.hasActiveSapConnection,
  connectionRefusalMessage: () => "Re-save the connection's secrets in Studio, or deactivate the broken row.",
  toSapTenant: (c: { key: string; label: string; baseUrl: string }) => ({
    key: c.key,
    label: c.label,
    baseUrl: c.baseUrl,
  }),
}));

/** The resolution, asserted not to be a refusal, so a test can read its fields. */
function resolvedOf(out: ResolvedReadTenant | ReadTenantRefusal | null): ResolvedReadTenant | null {
  if (out && "refused" in out) throw new Error(`expected a tenant, got refusal ${out.refused}`);
  return out;
}

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
  mocks.hasActiveSapConnection.mockReset();
  mocks.hasActiveSapConnection.mockResolvedValue(false);
});

describe("a key from either registry resolves", () => {
  it("resolves a deployment tenant, as it always did", async () => {
    mocks.getSapTenant.mockReturnValue(DEPLOYMENT_TENANT);
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    const out = resolvedOf(await resolveReadTenant("S4_TDD", "s4hana", "org_1", "customizing"));
    expect(out?.tenant.key).toBe("customizing");
    expect(out?.source).toBe("deployment");
    // The organization's connections are asked only whether one SHADOWS this
    // key (see the collision case below). No connection is opened: that check
    // needs no secrets, so a deployment read costs one existence lookup and
    // cannot fail on a row it never uses.
    expect(mocks.hasActiveSapConnection).toHaveBeenCalledWith("org_1", "s4hana", "customizing");
    expect(mocks.resolveSapConnection).not.toHaveBeenCalled();
  });

  it("resolves a DECLARED CONNECTION — the case that used to 400", async () => {
    mocks.getSapTenant.mockReturnValue(null);
    mocks.resolveSapConnection.mockResolvedValue(DECLARED_CONNECTION);
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    const out = resolvedOf(await resolveReadTenant("S4_TDD", "s4hana", "org_1", "qa-conn-verify"));
    expect(
      out,
      "a key the product's own tenant switcher offers must be readable",
    ).not.toBeNull();
    expect(out?.tenant.key).toBe("qa-conn-verify");
    expect(out?.tenant.baseUrl).toBe(DECLARED_CONNECTION.baseUrl);
    expect(out?.source).toBe("connection");
  });
});

describe("a key both registries know is refused, never guessed", () => {
  /*
   * THIS CASE USED TO ASSERT THE OPPOSITE: the deployment tenant won, which the
   * test called "never silently redirecting". It was the silent redirect, in the
   * other direction. The tenant switcher lists the organization's own rows, so
   * it showed the organization's connection while every read went to the shared
   * demo host with the deployment's credentials, without the environment
   * ceiling a stored connection gets, and with probes filed under the shared
   * bare key. Picking the connection instead would move every existing reader of
   * the deployment key. Neither is right, so the read is refused (audit A41).
   */
  it("refuses an organization whose own active connection shadows a deployment key", async () => {
    mocks.getSapTenant.mockReturnValue({ ...DEPLOYMENT_TENANT, key: "default" });
    mocks.hasActiveSapConnection.mockResolvedValue(true);
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    const out = await resolveReadTenant("S4_TDD", "s4hana", "org_1", "default");
    expect(out).toEqual({ refused: "TENANT_KEY_SHADOWED" });
    // The refusal needs to know the row exists, not what its secrets are.
    expect(mocks.resolveSapConnection).not.toHaveBeenCalled();
  });

  it("says which key collided and how to get out of it", async () => {
    const { readTenantRefusalResponse } = await import("@/lib/sap-public/tenant-for-read");
    const res = readTenantRefusalResponse({ refused: "TENANT_KEY_SHADOWED" }, "default");
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain('"default"');
    expect(body.error.message).toMatch(/different key/i);
  });

  it("still serves the deployment tenant to a caller with no organization", async () => {
    // No organization, no connections that could shadow anything.
    mocks.getSapTenant.mockReturnValue({ ...DEPLOYMENT_TENANT, key: "default" });
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    const out = resolvedOf(await resolveReadTenant("S4_TDD", "s4hana", null, "default"));
    expect(out?.source).toBe("deployment");
    expect(mocks.hasActiveSapConnection).not.toHaveBeenCalled();
  });
});

describe("a connection that will not open is refused, not thrown", () => {
  /*
   * The resolver throws when a row's secrets will not decrypt (a rotated
   * SAP_CONNECTION_ENCRYPTION_KEY, a restored backup) or its auth type is
   * unknown. Every /api/sap/tdd/* route called this function outside its try
   * block, so that throw was a 500 with an empty body (audit A27).
   */
  it("returns CONNECTION_UNREADABLE instead of rejecting", async () => {
    mocks.getSapTenant.mockReturnValue(null);
    mocks.resolveSapConnection.mockRejectedValue(
      new Error("SapConnection secret blob is too short to be valid ciphertext."),
    );
    const { resolveReadTenant } = await import("@/lib/sap-public/tenant-for-read");

    await expect(resolveReadTenant("S4_TDD", "s4hana", "org_1", "old")).resolves.toEqual({
      refused: "CONNECTION_UNREADABLE",
    });
  });

  it("answers it with a 409 that names the fix, not a parse error", async () => {
    const { readTenantRefusalResponse } = await import("@/lib/sap-public/tenant-for-read");
    const res = readTenantRefusalResponse({ refused: "CONNECTION_UNREADABLE" }, "old");
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/Re-save/);
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
    const { join, resolve } = await import("node:path");
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
      .map((f) => repoPath(f, root))
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
