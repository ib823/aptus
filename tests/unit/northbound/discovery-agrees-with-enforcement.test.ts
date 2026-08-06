/**
 * What the discovery endpoint advertises must be what the data route allows.
 *
 * WHY THIS FILE EXISTS. `GET /api/northbound/interfaces` returns a `callable`
 * flag per interface, and its own comment states the purpose: so a developer can
 * see why a call would be refused "instead of discovering it as a 403". It
 * computed that flag with `isGranting` — the predicate that asks only whether a
 * decision is one of the granting kinds, and which PR #168 demoted to
 * display-only precisely because it cannot answer an authorization question.
 * The data route uses `grantsRead(decision, environment)`.
 *
 * The two disagree on exactly one input, and it is the input #168 was written
 * for: a SANDBOX_ONLY decision read from a non-SANDBOX environment. Discovery
 * said `callable: true`; the data route returned 403 NO_APPROVED_GRANT. The
 * endpoint built to prevent a surprising 403 manufactured one.
 *
 * SO THE TEST ASSERTS BOTH SIDES AGAINST ONE FIXTURE, IN ONE TEST. Split across
 * two files they drift again — each stays internally consistent while the pair
 * stops agreeing, which is the whole defect. Here a single grant row feeds the
 * listing and the enforcement path, and both verdicts are asserted together.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyInterfaces: vi.fn(),
  findManyGrants: vi.fn(),
  findFirstInterface: vi.fn(),
  authenticate: vi.fn(),
  touch: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findMany: mocks.findManyInterfaces, findFirst: mocks.findFirstInterface },
    apiAccessGrant: { findMany: mocks.findManyGrants },
  },
}));

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: mocks.authenticate,
  extractBearer: (h: string | null) => h?.replace(/^Bearer /, "") ?? null,
  touchClientLastUsed: mocks.touch,
}));

import { NextRequest } from "next/server";

import { GET } from "@/app/api/northbound/interfaces/route";
import { resolveReadableInterface } from "@/lib/northbound/access";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const SCOPE = tenantScopeOf("org_a");
const NOW = new Date("2026-07-27T12:00:00Z");

const IFACE = {
  id: "if_1",
  name: "BP read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BusinessPartner",
  mode: "READ",
  version: 1,
  status: "ACTIVE",
  solutionId: "sol_1",
};

/** One client, and the environment it is stamped with is what both sides read. */
function authenticateAs(environment: string) {
  mocks.authenticate.mockResolvedValue({
    ok: true,
    client: {
      clientId: "cl_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      environment,
      scope: SCOPE,
    },
  });
}

async function listing() {
  const request = new NextRequest("http://localhost/api/northbound/interfaces", {
    headers: { authorization: "Bearer ce_live_x" },
  });
  const response = await GET(request);
  const body = (await response.json()) as {
    data: { interfaces: Array<{ externalId: string; callable: boolean }> };
  };
  return body.data.interfaces;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findManyInterfaces.mockResolvedValue([IFACE]);
  mocks.findFirstInterface.mockResolvedValue(IFACE);
  mocks.touch.mockResolvedValue(undefined);
});

describe("a SANDBOX_ONLY grant read from outside SANDBOX", () => {
  const GRANT = {
    externalId: "API_BUSINESS_PARTNER",
    operation: "READ",
    decision: "SANDBOX_ONLY",
    expiresAt: null,
    revokedAt: null,
  };

  it("is advertised as NOT callable, and is refused — the two agreeing", async () => {
    authenticateAs("PROD");
    mocks.findManyGrants.mockResolvedValue([GRANT]);

    // 1 — what discovery tells the developer.
    const advertised = await listing();
    expect(advertised).toHaveLength(1);
    expect(advertised[0]?.callable, "discovery must not advertise this as callable").toBe(false);

    // 2 — what the data route actually does with the same grant row.
    const enforced = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(enforced.ok, "the read path must refuse it").toBe(false);
    if (!enforced.ok) expect(enforced.reason).toBe("NO_APPROVED_GRANT");
  });

  it("is callable and permitted INSIDE sandbox — the same pair, agreeing the other way", async () => {
    // Without this the first test passes on a `callable` hardcoded to false.
    authenticateAs("SANDBOX");
    mocks.findManyGrants.mockResolvedValue([GRANT]);

    expect((await listing())[0]?.callable).toBe(true);
    expect((await resolveReadableInterface(SCOPE, "sol_1", "if_1", "SANDBOX", NOW)).ok).toBe(true);
  });
});

describe("the rest of the decision set stays in step", () => {
  it.each([
    ["APPROVED", true],
    ["READ_ONLY", true],
    ["REJECTED", false],
    ["PENDING", false],
  ])("%s → callable %s, and the read path agrees", async (decision, expected) => {
    authenticateAs("PROD");
    mocks.findManyGrants.mockResolvedValue([
      { externalId: "API_BUSINESS_PARTNER", operation: "READ", decision, expiresAt: null, revokedAt: null },
    ]);

    expect((await listing())[0]?.callable).toBe(expected);
    expect((await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW)).ok).toBe(expected);
  });

  it("an expired grant is neither advertised nor honoured", async () => {
    authenticateAs("PROD");
    mocks.findManyGrants.mockResolvedValue([
      {
        externalId: "API_BUSINESS_PARTNER",
        operation: "READ",
        decision: "APPROVED",
        expiresAt: new Date("2026-01-01T00:00:00Z"),
        revokedAt: null,
      },
    ]);

    expect((await listing())[0]?.callable).toBe(false);
    expect((await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW)).ok).toBe(false);
  });

  /*
   * THE FIXTURE GAP THAT KEPT A LIVE DISAGREEMENT GREEN. This file existed to
   * assert discovery == enforcement, and no fixture ever set `revokedAt` — so
   * when access.ts learned to refuse revoked grants (GRANT_REVOKED), discovery
   * went on advertising them as callable and every test here still passed.
   * A revoked grant is the one state an admin created ON PURPOSE to end access;
   * advertising it is the worst version of the surprising 403.
   */
  it("a revoked grant is neither advertised nor honoured — and the refusal names the revocation", async () => {
    authenticateAs("PROD");
    mocks.findManyGrants.mockResolvedValue([
      {
        externalId: "API_BUSINESS_PARTNER",
        operation: "READ",
        decision: "APPROVED",
        expiresAt: null,
        revokedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);

    expect((await listing())[0]?.callable, "discovery must not advertise a revoked grant").toBe(false);
    const enforced = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(enforced.ok).toBe(false);
    if (!enforced.ok) expect(enforced.reason).toBe("GRANT_REVOKED");
  });

  it("a grant both revoked and expired refuses as REVOKED — the deliberate act wins", async () => {
    authenticateAs("PROD");
    mocks.findManyGrants.mockResolvedValue([
      {
        externalId: "API_BUSINESS_PARTNER",
        operation: "READ",
        decision: "APPROVED",
        expiresAt: new Date("2026-01-01T00:00:00Z"),
        revokedAt: new Date("2025-12-01T00:00:00Z"),
      },
    ]);

    expect((await listing())[0]?.callable).toBe(false);
    const enforced = await resolveReadableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(enforced.ok).toBe(false);
    if (!enforced.ok) expect(enforced.reason).toBe("GRANT_REVOKED");
  });
});
