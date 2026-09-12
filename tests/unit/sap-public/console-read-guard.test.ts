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

import { decideConsoleRead, recordConsoleRead } from "@/lib/sap-public/console-read-guard";

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

  it("a null expiry is open-ended, not expired", async () => {
    mocks.findManyGrants.mockResolvedValue([
      { decision: "READ_ONLY", expiresAt: null, revokedAt: null },
    ]);
    const decision = await decideConsoleRead({ organizationId: ORG, environment: "TEST", now: NOW });
    expect(decision.allowed).toBe(true);
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
