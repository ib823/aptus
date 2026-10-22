/**
 * The console read gate (audit E15, P0).
 *
 * `/api/sap/tdd/preview`, `/entities` and `/operations` open a live connection to
 * a client's SAP system. They were gated on a Studio role and nothing else — no
 * grant, no environment ceiling, and no record that the read ever happened. The
 * broker's own comment named all three when the Test Console was moved off these
 * routes: "role-gated env-tenant reads with no grant check, no environment
 * binding, and no northbound audit row".
 *
 * What is pinned here is the DECISION, not the plumbing: which landscapes a
 * console may read freely, what a grant has to look like to open the rest, and
 * that the decision is the same one `access.ts` would reach about the same grant.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyGrants: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    apiAccessGrant: { findMany: mocks.findManyGrants },
    northboundAuditEvent: { create: mocks.createAudit },
  },
}));

import { consoleGrantMode, decideConsoleRead, recordConsoleRead } from "@/lib/sap-public/console-read-guard";

const ORG = "org_a";
const NOW = new Date("2026-09-12T12:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");

beforeEach(() => {
  mocks.findManyGrants.mockReset();
  mocks.createAudit.mockReset();
  mocks.findManyGrants.mockResolvedValue([]);
  mocks.createAudit.mockResolvedValue({});
});

describe("the environment ceiling", () => {
  it("lets a Sandbox read through without touching the grant table", async () => {
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "SANDBOX", now: NOW });
    expect(decision.allowed).toBe(true);
    // Not merely "allowed" — the grant table is never consulted, because
    // discovery on a sandbox must not require a grant for the thing being
    // discovered. That would be a circular gate.
    expect(mocks.findManyGrants).not.toHaveBeenCalled();
  });

  it("lets a Dev read through the same way", async () => {
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "DEV", now: NOW });
    expect(decision.allowed).toBe(true);
    expect(mocks.findManyGrants).not.toHaveBeenCalled();
  });

  it("refuses TEST with no grant", async () => {
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "TEST", now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe("NO_APPROVED_GRANT");
    expect(decision.message).toContain("TEST");
  });

  it("refuses PROD with no grant", async () => {
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe("NO_APPROVED_GRANT");
  });

  it("refuses an undeclared landscape, and says why in its own words", async () => {
    const decision = await decideConsoleRead({ organizationId: ORG, environment: null, now: NOW });
    expect(decision.allowed).toBe(false);
    // Its OWN refusal, not NO_APPROVED_GRANT: the fix is different. One needs a
    // grant, the other needs somebody to declare the connection's landscape.
    expect(decision.refusal).toBe("UNDECLARED_ENVIRONMENT");
    expect(decision.message).toMatch(/might be production is treated as production/);
  });

  it("never reveals another organization's estate in a refusal", async () => {
    for (const env of ["TEST", "PROD", null] as const) {
      const decision = await decideConsoleRead({ organizationId: ORG, environment: env, now: NOW });
      expect(decision.message).not.toMatch(/https?:\/\//);
      expect(decision.message).not.toContain(ORG);
    }
  });
});

describe("what opens TEST and PROD", () => {
  it("a live APPROVED grant for that environment", async () => {
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: FUTURE, revokedAt: null },
    ]);
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW });
    expect(decision.allowed).toBe(true);
  });

  it("scopes the grant query to the organization and the environment asked for", async () => {
    await decideConsoleRead({ organizationId: ORG, environment: "TEST", now: NOW });
    expect(mocks.findManyGrants).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, environment: "TEST" } }),
    );
  });

  it("an EXPIRED grant does not", async () => {
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: PAST, revokedAt: null },
    ]);
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW });
    expect(decision.allowed).toBe(false);
  });

  it("a REVOKED grant does not, even with a future expiry", async () => {
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: FUTURE, revokedAt: PAST },
    ]);
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW });
    expect(decision.allowed).toBe(false);
  });

  it("a REJECTED or still-REQUESTED grant does not", async () => {
    for (const d of ["REJECTED", "REQUESTED", "EXPIRED"]) {
      mocks.findManyGrants.mockResolvedValue([{ decision: d, expiresAt: FUTURE, revokedAt: null }]);
      const decision = await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW });
      expect(decision.allowed, `${d} must not open PROD`).toBe(false);
    }
  });

  it("SANDBOX_ONLY does not open PROD — the same answer access.ts gives", async () => {
    // `grantsRead`, not `isGranting`. The northbound discovery route has been
    // wrong on exactly this distinction twice; this guard uses the enforcement
    // predicate so it cannot be wrong a third time in a third place.
    mocks.findManyGrants.mockResolvedValue([
      { decision: "SANDBOX_ONLY", expiresAt: FUTURE, revokedAt: null },
    ]);
    const prod = await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW });
    expect(prod.allowed).toBe(false);
  });

  /*
   * P0.14b review round 5: the grants read in the connection's own statement
   * are judged exactly as the rows this function would have read, and no
   * second lookup is sent.
   */
  it("judges grants read with the connection by the same rules, and reads none itself", async () => {
    const judge = (grants: { decision: string; expiresAt: Date | null; revokedAt: Date | null }[]) =>
      decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW, grants });
    expect((await judge([{ decision: "APPROVED", expiresAt: FUTURE, revokedAt: null }])).allowed).toBe(true);
    expect((await judge([{ decision: "APPROVED", expiresAt: FUTURE, revokedAt: PAST }])).allowed).toBe(false);
    expect((await judge([{ decision: "APPROVED", expiresAt: PAST, revokedAt: null }])).allowed).toBe(false);
    expect((await judge([{ decision: "SANDBOX_ONLY", expiresAt: FUTURE, revokedAt: null }])).allowed).toBe(false);
    expect((await judge([])).refusal).toBe("NO_APPROVED_GRANT");
    expect(mocks.findManyGrants).not.toHaveBeenCalled();
  });

  it("a null expiry is open-ended, not expired", async () => {
    mocks.findManyGrants.mockResolvedValue([
      { decision: "READ_ONLY", expiresAt: null, revokedAt: null },
    ]);
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "TEST", now: NOW });
    expect(decision.allowed).toBe(true);
  });
});

/*
 * Wave 2 integration review round 3. The ceiling is coarser than the broker
 * on WHICH service, on purpose; it was coarser on WHETHER a grant still
 * counts by accident: a RETIRED app's grant, or an unbound one under strict
 * grant binding, authorises nothing at the broker, the lane board or
 * discovery, and still opened PROD here. Counting only the grants the
 * broker's rules honour is a new refusal, so COREEDGE_CONSOLE_GRANTS=observe
 * (the default) allows and reports, and enforce refuses.
 */
describe("grants the broker's rules no longer honour", () => {
  const live = { decision: "APPROVED", expiresAt: FUTURE, revokedAt: null } as const;
  const retired = { ...live, interfaceId: "if_1", solutionStatus: "RETIRED" };
  const unbound = { ...live, interfaceId: null, solutionStatus: "ACTIVE" };
  const honoured = { ...live, interfaceId: "if_2", solutionStatus: "ACTIVE" };
  const judge = (grants: object[], mode: "observe" | "enforce", bindingMode: "legacy" | "strict" = "legacy") =>
    decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW, grants: grants as never, mode, bindingMode });

  it("a RETIRED app's grant: allowed and reported under observe, refused under enforce", async () => {
    expect(await judge([retired], "observe")).toEqual({ allowed: true, refusal: null, message: null, observed: "SOLUTION_RETIRED" });
    const refused = await judge([retired], "enforce");
    expect(refused).toMatchObject({ allowed: false, refusal: "NO_APPROVED_GRANT" });
    expect(refused.message).toMatch(/retired/);
  });

  it("an unbound grant under strict binding: reported under observe, refused under enforce; legacy honours it", async () => {
    expect((await judge([unbound], "observe", "strict")).observed).toBe("GRANT_NEEDS_REAPPROVAL");
    expect(await judge([unbound], "enforce", "strict")).toMatchObject({ allowed: false, refusal: "NO_APPROVED_GRANT" });
    expect(await judge([unbound], "enforce", "legacy")).toEqual({ allowed: true, refusal: null, message: null });
  });

  it("one honoured grant opens the landscape, whatever else is set aside", async () => {
    expect(await judge([retired, unbound, honoured], "enforce", "strict")).toEqual({ allowed: true, refusal: null, message: null });
  });

  it("a grant that is not live is not reported as set aside: it never opened anything", async () => {
    expect(await judge([{ ...retired, revokedAt: PAST }], "observe")).toMatchObject({ allowed: false, refusal: "NO_APPROVED_GRANT" });
  });

  it("reads each grant's interface and its app's status when it reads the grants itself", async () => {
    mocks.findManyGrants.mockResolvedValue([{ ...live, interfaceId: "if_1", solution: { status: "RETIRED", organizationId: ORG } }]);
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW, mode: "enforce" });
    expect(decision.allowed).toBe(false);
    expect(mocks.findManyGrants).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ interfaceId: true, solution: { select: { status: true, organizationId: true } } }),
      }),
    );
    // An ACTIVE app of this organization opens it.
    mocks.findManyGrants.mockResolvedValue([{ ...live, interfaceId: "if_1", solution: { status: "ACTIVE", organizationId: ORG } }]);
    expect((await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW, mode: "enforce" })).allowed).toBe(true);
    // Another organization's app, under this organization's grant, is not this organization's.
    mocks.findManyGrants.mockResolvedValue([{ ...live, interfaceId: "if_1", solution: { status: "ACTIVE", organizationId: "org_b" } }]);
    expect((await decideConsoleRead({ organizationId: ORG, environment: "PROD", now: NOW, mode: "enforce" })).allowed).toBe(false);
  });

  it("COREEDGE_CONSOLE_GRANTS: enforce only when it says so", () => {
    expect(consoleGrantMode({})).toBe("observe");
    expect(consoleGrantMode({ COREEDGE_CONSOLE_GRANTS: "enforce" })).toBe("enforce");
    expect(consoleGrantMode({ COREEDGE_CONSOLE_GRANTS: "ENFORCE " })).toBe("enforce");
    expect(consoleGrantMode({ COREEDGE_CONSOLE_GRANTS: "enforced" })).toBe("observe");
  });
});

describe("the audit row a console read leaves", () => {
  it("names the actor, names no solution and no credential, and is a dry run", async () => {
    await recordConsoleRead({
      organizationId: ORG,
      actorUserId: "u_7",
      externalId: "API_BUSINESS_PARTNER",
      environment: "DEV",
      status: 200,
      rowCount: 3,
      correlationId: "corr-1",
      connectionId: "conn_1",
      connectionEnvironment: "DEV",
    });

    expect(mocks.createAudit).toHaveBeenCalledTimes(1);
    const { data } = mocks.createAudit.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data.actorUserId).toBe("u_7");
    // A console read has no solution and no credential. Borrowing one would
    // invent a solution that was not involved and then group every console read
    // in the estate under it on the operations board.
    expect(data.solutionId).toBeNull();
    expect(data.clientTokenId).toBeNull();
    // Real traffic on a real tenant, initiated from a console — the same column
    // the Test Console's broker dry run sets, for the same reason.
    expect(data.dryRun).toBe(true);
    expect(data.connectionId).toBe("conn_1");
    expect(data.correlationId).toBe("corr-1");
  });
});
