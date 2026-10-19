/**
 * One write retried N times under its Idempotency-Key is ONE write, wherever
 * the audit feed is counted (audit A03).
 *
 * A replay re-serves the stored outcome without calling SAP. Its audit row was
 * a WRITE with the stored status and no marker, so every consumer counted it
 * as a fresh call: the usage rollup billed one created record once per retry —
 * over-counting, the one direction its own header says it must never be wrong
 * in — five same-key retries of a stored 504 fired the upstream-errors incident
 * after a single SAP call, and the traffic board bucketed replayed 201s as
 * successes and replayed 504s as tenant errors.
 *
 * The audit table here is an in-memory array, and every count, groupBy and
 * findMany is evaluated against it with the route's own `where`. So each test
 * fails if the consumer's filter does not exclude the replays — the mock does
 * not know what a replay is.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db, mocks } = vi.hoisted(() => ({
  db: {
    audit: [] as Record<string, unknown>[],
    interfaces: [] as Record<string, unknown>[],
    connections: [] as Record<string, unknown>[],
  },
  mocks: { getCurrentUser: vi.fn(), rollupUpsert: vi.fn() },
}));

/** The subset of Prisma's where-language these consumers use. */
function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const v = row[key] as never;
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, never>;
      if ("gte" in c && !(v >= c.gte)) return false;
      if ("gt" in c && !(v > c.gt)) return false;
      if ("lt" in c && !(v < c.lt)) return false;
      if ("lte" in c && !(v <= c.lte)) return false;
      if ("not" in c && v === c.not) return false;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      return true;
    }
    return v === cond;
  });
}
const rowsWhere = (where?: Record<string, unknown>) => db.audit.filter((r) => matches(r, where));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/studio/tenants", () => ({ deploymentFallbackTenants: () => [] }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: {
      count: async ({ where }: { where?: Record<string, unknown> }) => rowsWhere(where).length,
      findMany: async ({ where }: { where?: Record<string, unknown> }) => rowsWhere(where),
      findFirst: async () => db.audit[0] ?? null,
      groupBy: async ({ by, where }: { by: string[]; where?: Record<string, unknown> }) => {
        const groups = new Map<string, Row & { _count: { _all: number } }>();
        for (const r of rowsWhere(where)) {
          const k = JSON.stringify(by.map((b) => r[b]));
          const g = groups.get(k) ?? { ...Object.fromEntries(by.map((b) => [b, r[b]])), _count: { _all: 0 } };
          g._count._all += 1;
          groups.set(k, g);
        }
        return [...groups.values()];
      },
    },
    northboundIdempotencyKey: { findMany: async () => [], count: async () => 0 },
    sapConnection: { count: async () => 0, findMany: async () => db.connections },
    solutionClient: { count: async () => 0, findMany: async () => [] },
    apiAccessGrant: { count: async () => 0, findMany: async () => [] },
    solution: { findMany: async () => [] },
    interface: { findMany: async () => db.interfaces },
    sapConnectionProbeEvent: { findMany: async () => [] },
    coreEdgeUsageRollup: { upsert: mocks.rollupUpsert, findMany: async () => [] },
    $transaction: async (ops: unknown[]) => Promise.all(ops),
  },
}));

import { GET as topology } from "@/app/api/console/topology/route";
import { GET as brokerTraffic } from "@/app/api/ops/broker-traffic/route";
import { GET as incidents } from "@/app/api/ops/incidents/route";
import { GET as writeLedger } from "@/app/api/ops/write-ledger/route";
import { rollupDay } from "@/lib/commercial/coreedge-usage";
import { listLaneTraffic } from "@/lib/coreedge/queries";

const SUPPORT = { id: "u_s", email: "support@abeam.test", role: "support", organizationId: "org_a" };

/** One audit row as the write route records it. */
function write(status: number, replayed: boolean, over: Row = {}): Row {
  return {
    id: `e${Math.random()}`,
    organizationId: "org_a",
    solutionId: "sol_1",
    interfaceId: "if_1",
    operation: "WRITE",
    externalId: "API_BUSINESS_PARTNER",
    environment: "SANDBOX",
    connectionId: "conn_1",
    connectionEnvironment: "SANDBOX",
    status,
    rowCount: null,
    // A replay made no upstream call, so it carries no duration.
    durationMs: replayed ? null : 180,
    correlationId: `c${Math.random()}`,
    clientTokenId: "client_1",
    bindingRefusal: null,
    failureReason: status >= 500 ? "TIMEOUT" : null,
    dryRun: false,
    replayed,
    at: new Date(),
    ...over,
  };
}
const times = (n: number, make: () => Row) => Array.from({ length: n }, make);

beforeEach(() => {
  db.audit = [];
  db.interfaces = [];
  db.connections = [];
  mocks.getCurrentUser.mockResolvedValue(SUPPORT);
  mocks.rollupUpsert.mockReset().mockResolvedValue({});
});

describe("the usage rollup bills a write once", () => {
  it("one 201 followed by three same-key retries rolls up as writes=1", async () => {
    const day = new Date("2026-10-18T09:00:00Z");
    db.audit = [write(201, false, { at: day }), ...times(3, () => write(201, true, { at: day }))];

    await rollupDay(day);
    const upsert = mocks.rollupUpsert.mock.calls[0]?.[0] as { create: Record<string, unknown> };
    expect(upsert.create.writes).toBe(1);
    // The retries are still calls the broker answered — they are not hidden.
    expect(upsert.create.calls).toBe(4);
  });
});

describe("the incident feed counts the tenant's answers, not their replays", () => {
  const observed = async (id: string) => {
    const body = await (await incidents(new NextRequest("https://x.test/api/ops/incidents"))).json();
    return (body.data.incidents as { id: string; observed: number }[]).find((i) => i.id === id)?.observed;
  };

  it("one SAP 504 retried five times does not fire upstream-errors", async () => {
    db.audit = [write(504, false), ...times(5, () => write(504, true))];
    expect(await observed("upstream-errors")).toBeUndefined();
  });

  it("still fires on five genuine 5xx answers, and counts exactly those", async () => {
    db.audit = [...times(5, () => write(504, false)), ...times(5, () => write(504, true))];
    expect(await observed("upstream-errors")).toBe(5);
  });
});

describe("the traffic board puts replays in their own bucket", () => {
  it("does not count a replayed 201 as a success or a replayed 504 as a tenant error", async () => {
    db.audit = [
      write(201, false),
      ...times(3, () => write(201, true)),
      write(504, false),
      ...times(2, () => write(504, true)),
    ];
    const body = await (await brokerTraffic(new NextRequest("https://x.test/api/ops/broker-traffic"))).json();
    expect(body.data.counts.total).toBe(7);
    expect(body.data.counts.byStatus).toEqual({ ok: 1, error: 1, replayed: 5 });
    const outcomes = (body.data.events as { outcome: string }[]).map((e) => e.outcome);
    expect(outcomes.filter((o) => o === "replayed")).toHaveLength(5);
    // A replay names its bound connection, so it is not a refusal before one.
    expect(body.data.environmentBinding.notApplicable).toBe(0);
  });
});

describe("the write ledger does not count a replayed failure as another refusal", () => {
  it("reports the replays as their own events", async () => {
    db.audit = [write(504, false), ...times(2, () => write(504, true)), write(201, true)];
    const body = await (await writeLedger(new NextRequest("https://x.test/api/ops/write-ledger"))).json();
    expect(body.data.fromAudit).toEqual({ blocked: 0, conflicts: 0, upstreamFailed: 0, outcomeUnknown: 1, replayed: 3 });
    expect(body.data.auditRows).toHaveLength(1);
    expect(body.data.provenance.why.join(" ")).not.toContain("nothing counts it");
  });

  /*
   * A FRESH SUCCESS IS NOT A REFUSAL. `blocked` spread the failed-write filter
   * and then set `status` again, which REPLACED its `gte: 400` — so it counted
   * every fresh write in the window that was not a 409, successes included,
   * and disagreed with the rows listed under it. The fixture above held only a
   * replayed 201, which the replay filter already excludes, so it could not
   * see this.
   */
  it("does not count a fresh 201 as blocked", async () => {
    db.audit = [write(201, false), write(504, false), write(504, false), write(409, false)];
    const body = await (await writeLedger(new NextRequest("https://x.test/api/ops/write-ledger"))).json();
    expect(body.data.fromAudit).toEqual({ blocked: 0, conflicts: 1, upstreamFailed: 0, outcomeUnknown: 2, replayed: 0 });
    // The counts and the page they summarise are drawn from the same rows.
    expect(body.data.auditRows).toHaveLength(3);
    expect(body.data.provenance.rowsAreAPage.auditRows).toMatchObject({ returned: 3, of: 3 });
    expect(body.data.truncated).toBe(false);
  });
});

/*
 * A REPLAY NAMES ITS BOUND CONNECTION (so it is not read as a refusal before
 * one), and the topology attributed every row with a connection to the
 * connection → SAP edge: one 201, one 504 and five same-key retries of the 504
 * drew seven calls and six failures through a connection SAP saw twice.
 */
describe("the topology does not route a replay through the connection", () => {
  it("counts SAP's two answers on the connection, not the five re-served ones", async () => {
    db.interfaces = [
      {
        id: "if_1",
        solutionId: "sol_1",
        name: "Create BP",
        externalId: "API_BUSINESS_PARTNER",
        operation: "CREATE",
        entitySet: "A_BusinessPartner",
        mode: "LIVE",
      },
    ];
    db.connections = [
      {
        id: "conn_1",
        label: "Sandbox",
        product: "s4hana",
        environment: "SANDBOX",
        isActive: true,
        lastValidatedAt: null,
        lastValidationStatus: null,
      },
    ];
    db.audit = [write(201, false), write(504, false), ...times(5, () => write(504, true))];

    const res = await topology(new NextRequest("https://x.test/api/console/topology?lens=operations-center"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        nodes: { id: string; provenance: { derived: string } }[];
        edges: { from: string; to: string; calls: number; failures: number }[];
      };
    };
    const edge = (from: string, to: string) => body.data.edges.find((e) => e.from === from && e.to === to);
    expect(edge("conn:conn_1", "sap:s4hana")).toMatchObject({ calls: 2, failures: 1 });
    expect(edge("iface:if_1", "conn:conn_1")).toMatchObject({ calls: 2, failures: 1 });
    expect(body.data.nodes.find((n) => n.id === "conn:conn_1")?.provenance.derived).toContain(
      "2 call(s) recorded through it",
    );
  });
});

describe("the lane board counts a write once", () => {
  it("one SAP 504 retried five times is one call and one error", async () => {
    db.audit = [write(504, false), ...times(5, () => write(504, true))];
    const traffic = await listLaneTraffic("org_a");
    expect(traffic.get("sol_1::if_1::SANDBOX")).toEqual({ calls: 1, errors: 1 });
  });

  it("a 201 retried three times is one call and no error", async () => {
    db.audit = [write(201, false), ...times(3, () => write(201, true))];
    const traffic = await listLaneTraffic("org_a");
    expect(traffic.get("sol_1::if_1::SANDBOX")).toEqual({ calls: 1, errors: 0 });
  });
});
