/**
 * A node's state is what its calls DID, and every call it counts is real
 * deployed traffic attributed to the grant that authorised it (audit A35, A05).
 *
 * Three ways the topology claimed health, or absence, it had not observed:
 *
 *   1. ANY ROW MADE A NODE GREEN. Grant, solution and interface derived their
 *      state from `calls` alone, so a PROD grant whose every call was refused
 *      403 (no connection serves PROD — the critical binding-refused incident)
 *      rendered ✓ "Observed good" beside an edge that said "bad".
 *   2. DRY RUNS COUNTED. The aggregation had no dryRun filter, so one Test
 *      Console rehearsal turned a never-deployed app's grant and interface
 *      green and drew a call on "client applications → credential".
 *   3. WRITES NEVER MET THEIR GRANT. Audit rows say WRITE; grants say CREATE.
 *      The grant key never matched, so a write grant carrying production
 *      writes read "never observed", and once revoked, `carried: false`.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/console/topology/route";
import type * as GuardModule from "@/lib/ops/guard";
import {
  attributeCalls,
  deriveGrant,
  deriveSolution,
  grantKey,
  observedState,
  pairKey,
  tallyOf,
  type AuditSlice,
} from "@/lib/ops/topology";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const NOW = new Date("2026-08-02T00:00:00.000Z");
const SINCE = new Date("2026-07-01T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");

const liveGrant = (recordedCalls: number, recordedFailures: number) =>
  deriveGrant(
    {
      id: "g",
      decision: "APPROVED",
      environment: "PROD",
      expiresAt: FUTURE,
      revokedAt: null,
      revokedReason: null,
      recordedCalls,
      recordedFailures,
    },
    NOW,
    SINCE,
  );

describe("a live node's state is what its calls did", () => {
  it("is observed-bad when every recorded call failed", () => {
    expect(liveGrant(40, 40).state).toBe("observed-bad");
    expect(
      deriveSolution({ missingOwnerCount: 0, recordedCalls: 40, recordedFailures: 40, holdsProdGrant: true })
        .state,
    ).toBe("observed-bad");
  });

  it("is observed-bad when some failed — a node has one glyph, and ✓ would hide them", () => {
    expect(liveGrant(100, 10).state).toBe("observed-bad");
    expect(observedState(100, 10)).toBe("observed-bad");
  });

  it("is observed-good only when nothing recorded under it failed", () => {
    expect(liveGrant(100, 0).state).toBe("observed-good");
  });

  it("is never-observed with no calls at all", () => {
    expect(liveGrant(0, 0).state).toBe("never-observed");
    expect(observedState(0, 0)).toBe("never-observed");
  });

  it("keeps an ended grant on `carried`, because a refusal after revocation is the control working", () => {
    const revoked = deriveGrant(
      {
        id: "g",
        decision: "APPROVED",
        environment: "PROD",
        expiresAt: FUTURE,
        revokedAt: new Date("2026-07-20T00:00:00.000Z"),
        revokedReason: null,
        recordedCalls: 12,
        recordedFailures: 3,
      },
      NOW,
      SINCE,
    );
    expect(revoked.ended?.carried).toBe(true);
    expect(revoked.state).toBe("observed-good");
  });
});

describe("a write is attributed to the CREATE grant that authorised it", () => {
  const writeRow = (over: Partial<AuditSlice> = {}): AuditSlice => ({
    solutionId: "sol1",
    interfaceId: "if_write",
    connectionId: "conn1",
    clientTokenId: "tok1",
    externalId: "API_BUSINESS_PARTNER",
    operation: "WRITE",
    environment: "PROD",
    status: 201,
    count: 50,
    ...over,
  });

  it("counts a WRITE/201 row under grantKey(..., CREATE, ...)", () => {
    const a = attributeCalls([writeRow()]);
    const gk = grantKey("sol1", "API_BUSINESS_PARTNER", "CREATE", "PROD");
    expect(tallyOf(a.byGrant, gk)).toEqual({ calls: 50, failures: 0 });
    // And on the grant → interface edge, keyed the way the route looks it up.
    expect(tallyOf(a.byGrantInterface, pairKey(gk, "if_write")).calls).toBe(50);
  });

  it("leaves READ attribution exactly as it was", () => {
    const a = attributeCalls([writeRow({ operation: "READ", status: 200, interfaceId: "if_read" })]);
    expect(tallyOf(a.byGrant, grantKey("sol1", "API_BUSINESS_PARTNER", "READ", "PROD")).calls).toBe(50);
    expect(tallyOf(a.byGrant, grantKey("sol1", "API_BUSINESS_PARTNER", "CREATE", "PROD")).calls).toBe(0);
  });
});

/* ── the route, end to end ─────────────────────────────────────────────────── */

interface FeedRow extends AuditSlice {
  dryRun: boolean;
}

const mocks = vi.hoisted(() => ({
  solutions: vi.fn(),
  interfaces: vi.fn(),
  grants: vi.fn(),
  credentials: vi.fn(),
  connections: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findMany: mocks.solutions },
    interface: { findMany: mocks.interfaces },
    apiAccessGrant: { findMany: mocks.grants },
    solutionClient: { findMany: mocks.credentials },
    sapConnection: { findMany: mocks.connections },
    northboundAuditEvent: { groupBy: mocks.groupBy },
  },
}));

vi.mock("@/lib/ops/guard", async (importOriginal) => {
  const real = await importOriginal<typeof GuardModule>();
  const ok = async () => ({
    ok: true as const,
    actor: { kind: "scoped" as const, scope: tenantScopeOf("org_a"), organizationId: "org_a", userId: "u1" },
  });
  return { ...real, requireOperations: ok, requireStudio: ok, requireControlTower: ok };
});

let feed: FeedRow[] = [];

/**
 * The audit table, grouped the way Postgres would: rows the `where` excludes
 * are not returned. Only the predicate this test is about is honoured — a
 * `dryRun` term in the where filters on it, and its absence filters nothing.
 */
function groupFeed(args: { where?: { dryRun?: boolean } }) {
  const want = args.where?.dryRun;
  return Promise.resolve(
    feed
      .filter((r) => want === undefined || r.dryRun === want)
      .map((r) => ({
        solutionId: r.solutionId,
        interfaceId: r.interfaceId,
        connectionId: r.connectionId,
        clientTokenId: r.clientTokenId,
        externalId: r.externalId,
        operation: r.operation,
        environment: r.environment,
        status: r.status,
        _count: { _all: r.count },
      })),
  );
}

const row = (over: Partial<FeedRow> = {}): FeedRow => ({
  solutionId: "sol1",
  interfaceId: "if1",
  connectionId: null,
  clientTokenId: "tok1",
  externalId: "API_BUSINESS_PARTNER",
  operation: "READ",
  environment: "PROD",
  status: 200,
  count: 1,
  dryRun: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  feed = [];
  mocks.groupBy.mockImplementation(groupFeed);
  mocks.solutions.mockResolvedValue([
    {
      id: "sol1",
      name: "Orders app",
      status: "ACTIVE",
      technicalOwnerId: "u1",
      businessOwnerId: "u2",
      supportOwnerId: "u3",
    },
  ]);
  mocks.interfaces.mockResolvedValue([
    {
      id: "if1",
      solutionId: "sol1",
      name: "BP read",
      externalId: "API_BUSINESS_PARTNER",
      operation: "READ",
      entitySet: "A_BusinessPartner",
      mode: "READ",
    },
    {
      id: "if_write",
      solutionId: "sol1",
      name: "BP create",
      externalId: "API_BUSINESS_PARTNER",
      operation: "CREATE",
      entitySet: "A_BusinessPartner",
      mode: "WRITE",
    },
  ]);
  mocks.grants.mockResolvedValue([
    {
      id: "g_read",
      solutionId: "sol1",
      externalId: "API_BUSINESS_PARTNER",
      operation: "READ",
      environment: "PROD",
      decision: "APPROVED",
      expiresAt: FUTURE,
      revokedAt: null,
      revokedReason: null,
    },
    {
      id: "g_write",
      solutionId: "sol1",
      externalId: "API_BUSINESS_PARTNER",
      operation: "CREATE",
      environment: "PROD",
      decision: "APPROVED",
      expiresAt: FUTURE,
      revokedAt: null,
      revokedReason: null,
    },
  ]);
  mocks.credentials.mockResolvedValue([
    {
      id: "tok1",
      solutionId: "sol1",
      label: "PROD key",
      environment: "PROD",
      isActive: true,
      expiresAt: FUTURE,
      revokedAt: null,
      lastUsedAt: null,
    },
  ]);
  mocks.connections.mockResolvedValue([]);
});

async function topology() {
  const res = await GET(new NextRequest("http://localhost/api/console/topology?lens=operations-center&hours=720"));
  const body = (await res.json()) as {
    data: {
      nodes: Array<{ id: string; state: string; ended: { carried: boolean | null } | null }>;
      edges: Array<{ from: string; to: string; calls: number }>;
    };
  };
  const node = (id: string) => body.data.nodes.find((n) => n.id === id);
  const edge = (from: string, to: string) => body.data.edges.find((e) => e.from === from && e.to === to);
  return { node, edge };
}

describe("GET /api/console/topology", () => {
  it("does not call a grant, solution or interface good when every call was refused", async () => {
    // A PROD credential, an approved grant, no connection serving PROD: every
    // deployed call is a 403 binding refusal.
    feed = [row({ status: 403, count: 40 })];
    const { node } = await topology();
    expect(node("grant:g_read")?.state).toBe("observed-bad");
    expect(node("sol:sol1")?.state).toBe("observed-bad");
    expect(node("iface:if1")?.state).toBe("observed-bad");
  });

  it("leaves a Test Console dry run out of the node states and the caller edge", async () => {
    // A never-deployed app: one rehearsal from Studio, nothing else.
    feed = [row({ dryRun: true, count: 1 })];
    const { node, edge } = await topology();
    expect(mocks.groupBy.mock.calls[0]?.[0]).toMatchObject({ where: { dryRun: false } });
    expect(node("grant:g_read")?.state).toBe("never-observed");
    expect(node("iface:if1")?.state).toBe("never-observed");
    expect(edge("caller", "cred:tok1")?.calls).toBe(0);
  });

  it("attributes production writes to the CREATE grant, and to its edge into the interface", async () => {
    feed = [row({ operation: "WRITE", interfaceId: "if_write", status: 201, count: 500 })];
    const { node, edge } = await topology();
    expect(node("grant:g_write")?.state).toBe("observed-good");
    expect(edge("grant:g_write", "iface:if_write")?.calls).toBe(500);
    expect(edge("sol:sol1", "grant:g_write")?.calls).toBe(500);
  });

  it("says a revoked write grant carried traffic, when it did", async () => {
    mocks.grants.mockResolvedValue([
      {
        id: "g_write",
        solutionId: "sol1",
        externalId: "API_BUSINESS_PARTNER",
        operation: "CREATE",
        environment: "PROD",
        decision: "APPROVED",
        expiresAt: FUTURE,
        // Revoked inside the window, so the window can answer `carried`.
        revokedAt: new Date(Date.now() - 60 * 60 * 1000),
        revokedReason: "suspected misuse",
      },
    ]);
    feed = [row({ operation: "WRITE", interfaceId: "if_write", status: 201, count: 500 })];
    const { node } = await topology();
    expect(node("grant:g_write")?.ended?.carried).toBe(true);
  });
});
