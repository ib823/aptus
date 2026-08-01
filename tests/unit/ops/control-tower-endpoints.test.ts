/**
 * The Control Tower read endpoints.
 *
 * Same two invariants as the Operations Center, because both fail silently:
 * who may read these feeds, and what the responses can never contain. Asserted
 * per route from a table, so a sixth endpoint cannot ship with one gate instead
 * of three.
 *
 * ONE DIFFERENCE FROM OPS, AND IT IS THE POINT OF THIS FILE. The two workspaces
 * answer to different people. `support` runs the Operations Center and must NOT
 * reach Control Tower — watching whether the system is healthy is not the same
 * authority as reviewing whether the portfolio is governed. A guard that admits
 * the wrong persona still returns 200 and looks entirely correct in review.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  solutionFindMany: vi.fn(),
  interfaceGroupBy: vi.fn(),
  clientFindMany: vi.fn(),
  clientGroupBy: vi.fn(),
  clientCount: vi.fn(),
  auditFindMany: vi.fn(),
  auditCount: vi.fn(),
  auditGroupBy: vi.fn(),
  grantFindMany: vi.fn(),
  grantCount: vi.fn(),
  grantGroupBy: vi.fn(),
  connectionFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findMany: mocks.solutionFindMany },
    interface: { groupBy: mocks.interfaceGroupBy },
    solutionClient: {
      findMany: mocks.clientFindMany,
      groupBy: mocks.clientGroupBy,
      count: mocks.clientCount,
    },
    configAudit: {
      findMany: mocks.auditFindMany,
      count: mocks.auditCount,
      groupBy: mocks.auditGroupBy,
    },
    apiAccessGrant: {
      findMany: mocks.grantFindMany,
      count: mocks.grantCount,
      groupBy: mocks.grantGroupBy,
    },
    sapConnection: { findMany: mocks.connectionFindMany },
  },
}));

import { GET as audit } from "@/app/api/control-tower/audit/route";
import { GET as connections } from "@/app/api/control-tower/connections/route";
import { GET as grants } from "@/app/api/control-tower/grants/route";
import { GET as portfolio } from "@/app/api/control-tower/portfolio/route";
import { GET as tokens } from "@/app/api/control-tower/tokens/route";

const ADMIN = { id: "u_a", email: "admin@abeam.test", role: "platform_admin", organizationId: "org_a" };
const PARTNER_LEAD = { id: "u_p", email: "pl@abeam.test", role: "partner_lead", organizationId: "org_a" };
const SUPPORT = { id: "u_s", email: "support@abeam.test", role: "support", organizationId: "org_a" };
const CONSULTANT = { id: "u_c", email: "dev@abeam.test", role: "consultant", organizationId: "org_a" };
const ADMIN_NO_ORG = { ...ADMIN, organizationId: null };

function req(path: string) {
  return new NextRequest(`https://x.test/api/control-tower/${path}`);
}

const ROUTES = [
  ["portfolio", () => portfolio(req("portfolio"))],
  ["audit", () => audit(req("audit"))],
  ["grants", () => grants(req("grants"))],
  ["connections", () => connections(req("connections"))],
  ["tokens", () => tokens(req("tokens"))],
] as const;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.solutionFindMany.mockResolvedValue([]);
  mocks.interfaceGroupBy.mockResolvedValue([]);
  mocks.clientFindMany.mockResolvedValue([]);
  mocks.clientGroupBy.mockResolvedValue([]);
  mocks.clientCount.mockResolvedValue(0);
  mocks.auditFindMany.mockResolvedValue([]);
  mocks.auditCount.mockResolvedValue(0);
  mocks.auditGroupBy.mockResolvedValue([]);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.grantCount.mockResolvedValue(0);
  mocks.grantGroupBy.mockResolvedValue([]);
  mocks.connectionFindMany.mockResolvedValue([]);
});

describe("every Control Tower feed is gated the same way", () => {
  it("401s an unauthenticated caller on every route", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    for (const [name, call] of ROUTES) {
      expect((await call()).status, `${name} must refuse anonymous`).toBe(401);
    }
  });

  it("403s the SUPPORT persona — a different workspace, not a lesser one", async () => {
    // The assertion this file exists for. `support` owns the Operations Center;
    // whether the running system is healthy is not the same question as whether
    // the portfolio is governed, and a guard that conflates them still 200s.
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    for (const [name, call] of ROUTES) {
      expect((await call()).status, `${name} must refuse support`).toBe(403);
    }
  });

  it("403s a consultant", async () => {
    mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
    for (const [name, call] of ROUTES) {
      expect((await call()).status, `${name} must refuse consultant`).toBe(403);
    }
  });

  it("admits an admin and a partner lead", async () => {
    for (const actor of [ADMIN, PARTNER_LEAD]) {
      mocks.getCurrentUser.mockResolvedValue(actor);
      for (const [name, call] of ROUTES) {
        expect((await call()).status, `${name} must admit ${actor.role}`).toBe(200);
      }
    }
  });
});

describe("tenant scoping, and widening only ever an admin", () => {
  it("scopes every query to the caller's organization", async () => {
    mocks.getCurrentUser.mockResolvedValue(PARTNER_LEAD);
    for (const [, call] of ROUTES) await call();

    for (const [name, m] of [
      ["solutions", mocks.solutionFindMany],
      ["audit", mocks.auditFindMany],
      ["grants", mocks.grantFindMany],
      ["connections", mocks.connectionFindMany],
      ["clients", mocks.clientFindMany],
    ] as const) {
      for (const c of m.mock.calls) {
        expect(c[0]?.where?.organizationId, `${name} must be org-scoped`).toBe("org_a");
      }
    }
  });

  it("lets a global admin read across tenants, and labels the response", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN_NO_ORG);
    const body = await (await portfolio(req("portfolio"))).json();
    expect(body.data.scope).toBe("global");
    expect(mocks.solutionFindMany.mock.calls[0]?.[0]?.where?.organizationId).toBeUndefined();
  });
});

describe("secret-safety is a property of the query", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("the credential register never selects a hash or a sealed secret", async () => {
    await tokens(req("tokens"));
    const select = mocks.clientFindMany.mock.calls[0]?.[0]?.select ?? {};
    expect(select.tokenHash).toBeUndefined();
    expect(select.secretsCiphertext).toBeUndefined();
  });

  it("the connection register never selects a secret, a host or a token URL", async () => {
    // A SAP hostname is not exactly a secret, but a governance view has no need
    // for it, and the cheapest way never to leak it is never to read it.
    await connections(req("connections"));
    const select = mocks.connectionFindMany.mock.calls[0]?.[0]?.select ?? {};
    expect(select.secretsCiphertext).toBeUndefined();
    expect(select.baseUrl).toBeUndefined();
    expect(select.oauthTokenUrl).toBeUndefined();
  });

  it("the audit trail never returns the before/after snapshots", async () => {
    // They hold whole entity records, which can carry fields this view has no
    // business projecting.
    await audit(req("audit"));
    const select = mocks.auditFindMany.mock.calls[0]?.[0]?.select ?? {};
    expect(select.before).toBeUndefined();
    expect(select.after).toBeUndefined();
  });
});

describe("the audit trail stays append-only", () => {
  it("reads and nothing else — no writer is even reachable from this module", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    await audit(req("audit"));
    // The mocked client exposes no create/update/delete for configAudit at all,
    // so a route that tried would throw rather than silently succeed.
    expect(mocks.auditFindMany).toHaveBeenCalled();
    expect(mocks.auditCount).toHaveBeenCalled();
  });
});

describe("the portfolio is honest about what it does not enforce", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("names dataClass as a declaration rather than a control", async () => {
    const body = await (await portfolio(req("portfolio"))).json();
    expect(body.data.provenance.dataClassIsNotEnforced).toContain("no gate depends on it");
  });

  it("names which owner slots are missing, not just how many", async () => {
    // "2 of 3 owners" tells nobody who to chase.
    mocks.solutionFindMany.mockResolvedValue([
      {
        id: "sol_1",
        name: "Acme",
        slug: "acme",
        status: "DRAFT",
        classification: "CLIENT_APP",
        dataClass: "internal",
        technicalOwnerId: "u1",
        businessOwnerId: null,
        supportOwnerId: null,
        createdAt: new Date(),
      },
    ]);
    const body = await (await portfolio(req("portfolio"))).json();
    expect(body.data.solutions[0].ownership.missing).toEqual(["business owner", "support owner"]);
    expect(body.data.counts.unowned).toBe(1);
  });
});

describe("grants report what a decision actually authorises", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  function grantRow(over: Record<string, unknown> = {}) {
    return {
      id: "g1",
      solutionId: "sol_1",
      externalId: "API_BP",
      operation: "READ",
      environment: "PROD",
      justification: "because",
      decision: "APPROVED",
      requestedById: "u1",
      decidedById: "u2",
      decidedAt: new Date("2026-07-01"),
      expiresAt: null,
      createdAt: new Date("2026-06-01"),
      ...over,
    };
  }

  it("computes authorisation with the runtime predicates, not the label", async () => {
    // A viewer reading "SANDBOX_ONLY" on a PROD grant would otherwise have to
    // know from elsewhere that it authorises nothing.
    mocks.grantFindMany.mockResolvedValue([grantRow({ decision: "SANDBOX_ONLY" })]);
    mocks.grantCount.mockResolvedValue(1);
    const body = await (await grants(req("grants"))).json();
    expect(body.data.grants[0].authorises).toEqual({ read: false, write: false });
  });

  it("marks a settled grant with no expiry as unbounded", async () => {
    // Still reported even now that revocation exists: nothing ENDS this grant
    // on its own, and a manual withdrawal depends on somebody noticing. The
    // remedy changed; the defect did not.
    mocks.grantFindMany.mockResolvedValue([grantRow()]);
    mocks.grantCount.mockResolvedValue(1);
    const body = await (await grants(req("grants"))).json();
    expect(body.data.grants[0].unbounded).toBe(true);
    expect(body.data.counts.unbounded).toBe(1);
    // The provenance used to claim "there is no revocation path in this
    // release". There is one now, and a screen that still said otherwise would
    // be telling an operator they cannot do the thing they can.
    expect(body.data.provenance.howAGrantEnds).toContain("revoke");
    expect(body.data.provenance.whyExpiryIsStillRequired).toContain("Expiry remains mandatory");
  });

  it("reports a revoked grant as authorising nothing, without rewriting the decision", async () => {
    mocks.grantFindMany.mockResolvedValue([
      grantRow({ revokedAt: new Date("2026-07-01"), revokedReason: "credential leaked" }),
    ]);
    mocks.grantCount.mockResolvedValue(1);
    const body = await (await grants(req("grants"))).json();
    const g = body.data.grants[0];
    expect(g.lifecycle).toBe("revoked");
    expect(g.authorises.read).toBe(false);
    expect(g.authorises.write).toBe(false);
    // The approval happened. The ledger keeps saying so.
    expect(g.decision).toBe("APPROVED");
    expect(g.revokedReason).toBe("credential leaked");
  });

  it("treats a lapsed grant as authorising nothing", async () => {
    mocks.grantFindMany.mockResolvedValue([
      grantRow({ expiresAt: new Date("2026-01-01") }),
    ]);
    mocks.grantCount.mockResolvedValue(1);
    const body = await (await grants(req("grants"))).json();
    expect(body.data.grants[0].lifecycle).toBe("lapsed");
    expect(body.data.grants[0].authorises.read).toBe(false);
  });

  it("says an empty queue means nothing was asked for", async () => {
    const body = await (await grants(req("grants"))).json();
    expect(body.data.provenance.emptyByDesign).toContain("nothing has been asked for");
  });
});

describe("the credential register renders segregation of duties", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("checks the issuer against the owner set rather than printing an id", async () => {
    mocks.clientFindMany.mockResolvedValue([
      {
        id: "cl_1",
        solutionId: "sol_1",
        label: "Acme · DEV",
        environment: "DEV",
        isActive: true,
        createdById: "u_issuer",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
      },
    ]);
    mocks.solutionFindMany.mockResolvedValue([
      {
        id: "sol_1",
        name: "Acme",
        status: "ACTIVE",
        technicalOwnerId: "u1",
        businessOwnerId: "u2",
        supportOwnerId: "u3",
      },
    ]);
    const body = await (await tokens(req("tokens"))).json();
    expect(body.data.credentials[0].segregation.issuerWasAnOwner).toBe(false);
    expect(body.data.credentials[0].segregation.ownershipComplete).toBe(true);
    // Should be zero; a non-zero means the control did not hold.
    expect(body.data.counts.issuedByAnOwner).toBe(0);
  });

  it("reports segregation as unknowable, not false, when the solution is out of scope", async () => {
    mocks.clientFindMany.mockResolvedValue([
      {
        id: "cl_1",
        solutionId: "sol_missing",
        label: "x",
        environment: "DEV",
        isActive: true,
        createdById: "u1",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
      },
    ]);
    const body = await (await tokens(req("tokens"))).json();
    expect(body.data.credentials[0].segregation).toBeNull();
  });

  it("does not claim one credential per solution can be plural", async () => {
    const body = await (await tokens(req("tokens"))).json();
    expect(body.data.provenance.oneCredentialPerSolution).toContain("replaces the previous token");
  });
});

describe("the connection register does not ship a constant dressed as a measurement", () => {
  it("states that sealing is guaranteed instead of counting it", async () => {
    // secretsCiphertext is a REQUIRED column on SapConnection, so a
    // "has a sealed secret" count could only ever equal the total — the same
    // defect class as a revoked count that can never leave zero.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const body = await (await connections(req("connections"))).json();
    expect(body.data.counts.withSealedSecret).toBeUndefined();
    expect(body.data.provenance.everyConnectionIsSealed).toContain("required column");
  });

  it("includes deactivated connections, unlike the Operations health view", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    await connections(req("connections"));
    // No isActive filter at all: the estate is what is governed, not the
    // subset currently serving traffic.
    const where = mocks.connectionFindMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect("isActive" in where).toBe(false);
  });

  it("names the actions that exist here but cannot be invoked here", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const body = await (await connections(req("connections"))).json();
    expect(body.data.delegatedActions[0].availableTo).toBe("consultant");
    expect(body.data.delegatedActions[0].where).toContain("Developer Studio");
  });
});
