/**
 * The authorization chain.
 *
 * Each link is tested for the thing it is there to stop:
 *   - another TENANT's interface  → scoped query cannot see it
 *   - a sibling SOLUTION's interface → same 404, no existence oracle
 *   - a capability with no grant  → 403
 *   - a grant approved for a DIFFERENT environment → 403 (this is why the
 *     environment is recorded at all)
 *   - an expired grant → 403, evaluated at call time
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirstInterface: vi.fn(),
  findManyGrants: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findFirst: mocks.findFirstInterface },
    apiAccessGrant: { findMany: mocks.findManyGrants },
  },
}));

import { resolveReadableInterface } from "@/lib/northbound/access";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const SCOPE = tenantScopeOf("org_a");
const NOW = new Date("2026-07-25T12:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");

const IFACE = {
  id: "if_1",
  name: "BP read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  entitySet: "A_BusinessPartner",
  operation: "READ",
  mode: "READ",
  version: 1,
  solutionId: "sol_1",
};

const APPROVED = [{ decision: "APPROVED", expiresAt: null }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirstInterface.mockResolvedValue(IFACE);
  mocks.findManyGrants.mockResolvedValue(APPROVED);
});

describe("tenant and solution isolation", () => {
  it("scopes the interface lookup by organization", async () => {
    await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    const where = mocks.findFirstInterface.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.organizationId).toBe("org_a");
    expect(where.id).toBe("if_1");
  });

  it("refuses an interface that does not exist", async () => {
    mocks.findFirstInterface.mockResolvedValue(null);
    const r = await resolveReadableInterface(SCOPE, "sol_1", "if_x", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INTERFACE_NOT_FOUND");
  });

  it("refuses a SIBLING solution's interface with the same message as 'not found'", async () => {
    // A token is issued per solution. Distinguishing "exists but not yours"
    // would let a client enumerate its neighbours.
    mocks.findFirstInterface.mockResolvedValue({ ...IFACE, solutionId: "sol_other" });
    const r = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("NOT_THIS_SOLUTION");
      expect(r.message).toBe("No such interface.");
    }
  });

  it("scopes the grant query by organization too", async () => {
    await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    const where = mocks.findManyGrants.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.organizationId).toBe("org_a");
    expect(where.solutionId).toBe("sol_1");
  });
});

describe("the grant requirement", () => {
  it("allows a read with a live approved grant", async () => {
    const r = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(true);
  });

  it("refuses when no grant exists", async () => {
    mocks.findManyGrants.mockResolvedValue([]);
    const r = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_APPROVED_GRANT");
  });

  it("refuses when the grant was REJECTED or is still only REQUESTED", async () => {
    for (const decision of ["REQUESTED", "REJECTED", "EXPIRED"]) {
      mocks.findManyGrants.mockResolvedValue([{ decision, expiresAt: null }]);
      const r = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
      expect(r.ok, decision).toBe(false);
    }
  });

  it("accepts APPROVED and READ_ONLY for a read — reading is what READ_ONLY is for", async () => {
    for (const decision of ["APPROVED", "READ_ONLY"]) {
      mocks.findManyGrants.mockResolvedValue([{ decision, expiresAt: null }]);
      const r = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
      expect(r.ok, decision).toBe(true);
    }
  });

  it("refuses SANDBOX_ONLY outside SANDBOX, on the read path too", async () => {
    // This assertion used to read "accepts the narrower granting decisions too"
    // and lumped SANDBOX_ONLY in with the rest at PROD. That encoded the defect:
    // the decision was matched against the grant row's own environment and then
    // ignored, so a decision that says "sandbox only" authorised production.
    mocks.findManyGrants.mockResolvedValue([{ decision: "SANDBOX_ONLY", expiresAt: null }]);
    const refused = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("NO_APPROVED_GRANT");

    mocks.findManyGrants.mockResolvedValue([{ decision: "SANDBOX_ONLY", expiresAt: null }]);
    const allowed = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "SANDBOX", NOW);
    expect(allowed.ok).toBe(true);
  });

  it("queries grants for THIS client's environment", async () => {
    // A grant approved for SANDBOX must not authorise the PROD client — which is
    // the entire reason the environment is recorded on the grant.
    await resolveReadableInterface(SCOPE, "sol_1", "if_1", "SANDBOX", NOW);
    const where = mocks.findManyGrants.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.environment).toBe("SANDBOX");
  });

  it("refuses an EXPIRED grant at call time", async () => {
    // Not when a sweep job next runs — otherwise the expiry date is decorative.
    mocks.findManyGrants.mockResolvedValue([{ decision: "APPROVED", expiresAt: PAST }]);
    const r = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("GRANT_EXPIRED");
  });

  it("accepts a grant that has not expired yet", async () => {
    mocks.findManyGrants.mockResolvedValue([{ decision: "APPROVED", expiresAt: FUTURE }]);
    expect((await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW)).ok).toBe(true);
  });

  it("accepts when ANY of several grants is live", async () => {
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: PAST },
      { decision: "READ_ONLY", expiresAt: FUTURE },
    ]);
    expect((await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW)).ok).toBe(true);
  });
});

describe("v1 serves reads only", () => {
  it("refuses a WRITE-mode interface rather than quietly downgrading it", async () => {
    // Silently turning a write request into a read is a worse surprise than a
    // clear refusal.
    mocks.findFirstInterface.mockResolvedValue({ ...IFACE, mode: "WRITE" });
    const r = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("WRITE_NOT_SERVED");
  });

  it("refuses the write BEFORE consulting grants — mode is the harder gate", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...IFACE, mode: "WRITE" });
    await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(mocks.findManyGrants).not.toHaveBeenCalled();
  });
});
