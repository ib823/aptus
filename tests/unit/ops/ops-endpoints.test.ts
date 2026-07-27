/**
 * The Operations Center read endpoints.
 *
 * Two invariants matter more than any payload shape here, because both fail
 * silently: who may read these feeds, and what the responses can never contain.
 *
 * Every one of these endpoints serves a view of live customer SAP activity. A
 * gate that is merely usually present, or a select that happens not to include a
 * secret today, is not a control — so both are asserted per route rather than
 * per module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  auditFindMany: vi.fn(),
  auditCount: vi.fn(),
  auditGroupBy: vi.fn(),
  keyFindMany: vi.fn(),
  keyCount: vi.fn(),
  connectionFindMany: vi.fn(),
  connectionCount: vi.fn(),
  clientFindMany: vi.fn(),
  clientCount: vi.fn(),
  solutionFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: {
      findMany: mocks.auditFindMany,
      count: mocks.auditCount,
      groupBy: mocks.auditGroupBy,
    },
    northboundIdempotencyKey: { findMany: mocks.keyFindMany, count: mocks.keyCount },
    sapConnection: { findMany: mocks.connectionFindMany, count: mocks.connectionCount },
    solution: { findMany: mocks.solutionFindMany },
    solutionClient: { findMany: mocks.clientFindMany, count: mocks.clientCount },
  },
}));

/**
 * `groupBy` is called several times per request with different `by` arrays.
 * Routing on `by` keeps each test's intent readable — a test about environment
 * bindings sets the binding groups and nothing else.
 */
function groupsBy(config: Record<string, unknown[]>) {
  mocks.auditGroupBy.mockImplementation((args: { by: string[] }) =>
    Promise.resolve(config[args.by.join(",")] ?? []),
  );
}

import { GET as brokerTraffic } from "@/app/api/ops/broker-traffic/route";
import { GET as connectionsHealth } from "@/app/api/ops/connections-health/route";
import { GET as tokens } from "@/app/api/ops/tokens/route";
import { GET as writeLedger } from "@/app/api/ops/write-ledger/route";

const SUPPORT = { id: "u_s", email: "support@abeam.test", role: "support", organizationId: "org_a" };
const CONSULTANT = { id: "u_c", email: "dev@abeam.test", role: "consultant", organizationId: "org_a" };
const ADMIN_NO_ORG = { id: "u_a", email: "admin@abeam.test", role: "platform_admin", organizationId: null };

/** A real NextRequest — the routes read `request.nextUrl.searchParams`. */
function req(url = "https://x.test/api/ops/broker-traffic") {
  return new NextRequest(url);
}

const ROUTES = [
  ["broker-traffic", () => brokerTraffic(req())],
  ["write-ledger", () => writeLedger(req("https://x.test/api/ops/write-ledger"))],
  ["connections-health", () => connectionsHealth()],
  ["tokens", () => tokens(req("https://x.test/api/ops/tokens"))],
] as const;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.auditFindMany.mockResolvedValue([]);
  mocks.auditCount.mockResolvedValue(0);
  mocks.auditGroupBy.mockResolvedValue([]);
  mocks.keyFindMany.mockResolvedValue([]);
  mocks.keyCount.mockResolvedValue(0);
  mocks.connectionFindMany.mockResolvedValue([]);
  mocks.connectionCount.mockResolvedValue(0);
  mocks.clientFindMany.mockResolvedValue([]);
  mocks.clientCount.mockResolvedValue(0);
  mocks.solutionFindMany.mockResolvedValue([]);
});

describe("every ops feed is gated the same way", () => {
  it("401s an unauthenticated caller on every route", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    for (const [name, call] of ROUTES) {
      expect((await call()).status, `${name} must refuse anonymous`).toBe(401);
    }
  });

  it("403s a role that is not entitled to Operations Center", async () => {
    // consultant owns Developer Studio, not this workspace.
    mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
    for (const [name, call] of ROUTES) {
      expect((await call()).status, `${name} must refuse consultant`).toBe(403);
    }
  });

  it("admits the support persona", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    for (const [name, call] of ROUTES) {
      expect((await call()).status, `${name} must admit support`).toBe(200);
    }
  });
});

describe("tenant scoping is applied, and widening is only ever an admin", () => {
  it("scopes every query to the caller's organization", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    for (const [, call] of ROUTES) await call();

    for (const [name, m] of [
      ["audit", mocks.auditFindMany],
      ["keys", mocks.keyFindMany],
      ["connections", mocks.connectionFindMany],
      ["clients", mocks.clientFindMany],
      ["solutions", mocks.solutionFindMany],
    ] as const) {
      for (const c of m.mock.calls) {
        expect(c[0]?.where?.organizationId, `${name} must be org-scoped`).toBe("org_a");
      }
    }
  });

  it("lets a global admin read across tenants, and labels the response as such", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN_NO_ORG);
    const res = await brokerTraffic(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.scope).toBe("global");
    // The widening is explicit — no organizationId in the filter at all.
    expect(mocks.auditFindMany.mock.calls[0]?.[0]?.where?.organizationId).toBeUndefined();
  });
});

describe("secret-safety is a property of the query, not of remembering to redact", () => {
  it("never selects a token hash or sealed secret", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    await tokens(req("https://x.test/api/ops/tokens"));

    const select = mocks.clientFindMany.mock.calls[0]?.[0]?.select ?? {};
    expect(select.tokenHash).toBeUndefined();
    expect(select.secretsCiphertext).toBeUndefined();
  });

  it("never selects a SAP host or the connection's sealed secret", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    await connectionsHealth();

    const select = mocks.connectionFindMany.mock.calls[0]?.[0]?.select ?? {};
    expect(select.secretsCiphertext).toBeUndefined();
    expect(select.baseUrl).toBeUndefined();
    expect(select.oauthTokenUrl).toBeUndefined();
  });

  it("never selects a written record's body from the idempotency table", async () => {
    // responseBody holds what was created in a customer's SAP system. An
    // operations console needs to know a write happened, never what was in it.
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    await writeLedger(req("https://x.test/api/ops/write-ledger"));

    const select = mocks.keyFindMany.mock.calls[0]?.[0]?.select ?? {};
    expect(select.responseBody).toBeUndefined();
    expect(select.requestHash).toBeUndefined();
  });
});

describe("broker traffic is honest about what it cannot see", () => {
  it("keeps empty distinct from every failure, and from ok", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    // Counted by the database over the window, not by looping the page. Two
    // 2xx rows, one of which read zero records.
    groupsBy({
      status: [
        { status: 200, _count: { _all: 2 } },
        { status: 403, _count: { _all: 1 } },
        { status: 429, _count: { _all: 1 } },
        { status: 502, _count: { _all: 1 } },
        { status: 404, _count: { _all: 1 } },
      ],
    });
    mocks.auditCount.mockImplementation((args: { where: { rowCount?: number } }) =>
      Promise.resolve(args.where?.rowCount === 0 ? 1 : 0),
    );

    const body = await (await brokerTraffic(req())).json();
    expect(body.data.counts.byStatus).toEqual({
      ok: 1,
      empty: 1,
      needs_setup: 1,
      throttled: 1,
      error: 1,
      not_found: 1,
    });
  });

  it("counts over the WINDOW, not over the page it returns", async () => {
    // The defect: every count was derived from `rows`, which is capped by
    // `limit`. A window holding 5,000 calls reported `total: 100`, and
    // `opsLimit`'s own comment says silent truncation is never acceptable.
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    mocks.auditFindMany.mockResolvedValue(Array.from({ length: 100 }, () => row({ status: 200 })));
    // The window total, and no empty reads / no refused-before-connection rows.
    mocks.auditCount.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve("rowCount" in args.where || "connectionId" in args.where ? 0 : 5000),
    );
    groupsBy({ status: [{ status: 200, _count: { _all: 5000 } }] });

    const body = await (await brokerTraffic(req())).json();
    expect(body.data.counts.total).toBe(5000);
    expect(body.data.counts.byStatus.ok).toBe(5000);
    expect(body.data.events).toHaveLength(100);
    expect(body.data.truncated).toBe(true);
    // And the page-ness is stated, not left to be inferred from `truncated`.
    expect(body.data.provenance.eventsAreAPage).toEqual({ returned: 100, limit: 100, of: 5000 });
    // Latency is the one number that is NOT window-wide, and says so.
    expect(body.data.latency.basis).toBe("returnedPage");
    expect(body.data.latency.sampleSize).toBe(100);
  });

  it("declares itself a floor rather than a census", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    const body = await (await brokerTraffic(req())).json();
    expect(body.data.provenance.floorNotCensus).toBe(true);
    expect(body.data.provenance.missing.length).toBeGreaterThanOrEqual(3);
  });

  it("reports a null median when nothing carried a duration, never zero", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    mocks.auditFindMany.mockResolvedValue([row({ status: 200, rowCount: 1, durationMs: null })]);
    const body = await (await brokerTraffic(req())).json();
    expect(body.data.latency.medianMs).toBeNull();
    expect(body.data.latency.unmeasured).toBe(1);
  });

  it("separates an unverified environment binding from a mismatched one", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    groupsBy({
      "environment,connectionEnvironment": [
        { environment: "SANDBOX", connectionEnvironment: "SANDBOX", _count: { _all: 1 } },
        { environment: "SANDBOX", connectionEnvironment: null, _count: { _all: 1 } },
        { environment: "SANDBOX", connectionEnvironment: "PROD", _count: { _all: 1 } },
      ],
    });
    const body = await (await brokerTraffic(req())).json();
    expect(body.data.environmentBinding).toEqual({
      agreed: 1,
      unverified: 1,
      mismatch: 1,
      notApplicable: 0,
    });
  });

  it("case-folds the comparison rather than calling PROD and prod a mismatch", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    groupsBy({
      "environment,connectionEnvironment": [
        { environment: "PROD", connectionEnvironment: "prod", _count: { _all: 4 } },
      ],
    });
    const body = await (await brokerTraffic(req())).json();
    expect(body.data.environmentBinding.agreed).toBe(4);
    expect(body.data.environmentBinding.mismatch).toBe(0);
  });

  it("does NOT count a call that never reached a connection as an agreed binding", async () => {
    // The defect, and it was wrong in the operator's favour. `agreed` was
    // `total - unverified - mismatch`, so every row with connectionId null —
    // refused at auth, at the throttle, or at the grant gate — landed in
    // `agreed`. A window of nothing but 401s, 403s and 429s reported a wall of
    // agreed environment bindings when zero bindings had occurred at all.
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    // Twelve real refusals in the window AND on the page. The page matters:
    // the old formula was `rows.length - unverified - mismatch`, so an empty
    // page would give 0 and this test would pass against the defect.
    mocks.auditFindMany.mockResolvedValue(
      Array.from({ length: 12 }, () => row({ status: 403, connectionId: null, connectionEnvironment: null })),
    );
    mocks.auditCount.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve("rowCount" in args.where ? 0 : 12),
    );
    // No pairs: the grouped query excludes connectionId null, so it returns
    // nothing when every call was refused before a connection was reached.
    groupsBy({ "environment,connectionEnvironment": [] });

    const body = await (await brokerTraffic(req())).json();
    expect(body.data.environmentBinding).toEqual({
      agreed: 0,
      unverified: 0,
      mismatch: 0,
      notApplicable: 12,
    });
  });
});

describe("caller-supplied window and limit are clamped", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(SUPPORT));

  const windowOf = async (qs: string) =>
    (await (await brokerTraffic(req(`https://x.test/api/ops/broker-traffic?${qs}`))).json()).data
      .windowHours;

  const takeOf = () => mocks.auditFindMany.mock.calls[0]?.[0]?.take as number;

  it("falls back to 24 hours for absent, zero, negative and non-numeric input", async () => {
    expect(await windowOf("")).toBe(24);
    expect(await windowOf("hours=0")).toBe(24);
    expect(await windowOf("hours=-1")).toBe(24);
    expect(await windowOf("hours=banana")).toBe(24);
  });

  it("ceilings the window at 30 days rather than accepting any number", async () => {
    expect(await windowOf("hours=99999")).toBe(24 * 30);
  });

  it("ceilings the row limit at 500 and floors nonsense to the default", async () => {
    await brokerTraffic(req("https://x.test/api/ops/broker-traffic?limit=99999"));
    expect(takeOf()).toBe(500);

    mocks.auditFindMany.mockClear();
    await brokerTraffic(req("https://x.test/api/ops/broker-traffic?limit=-4"));
    expect(takeOf()).toBe(100);
  });

  it("passes solutionId and environment through to the query, scoped", async () => {
    await brokerTraffic(
      req("https://x.test/api/ops/broker-traffic?solutionId=sol_9&environment=PROD"),
    );
    const where = mocks.auditFindMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.solutionId).toBe("sol_9");
    expect(where.environment).toBe("PROD");
    // The filters narrow within the tenant; they never replace it.
    expect(where.organizationId).toBe("org_a");
  });

  it("omits the filters entirely when they are absent, rather than matching on empty", async () => {
    await brokerTraffic(req());
    const where = mocks.auditFindMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect("solutionId" in where).toBe(false);
    expect("environment" in where).toBe(false);
  });
});

describe("connection health uses the real status vocabulary", () => {
  it("counts a never-tested connection separately from an observed outcome", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    mocks.connectionFindMany.mockResolvedValue([
      conn({ lastValidationStatus: null }),
      conn({ lastValidationStatus: "OK" }),
    ]);
    const body = await (await connectionsHealth()).json();
    expect(body.data.counts.neverTested).toBe(1);
    expect(body.data.counts.healthy).toBe(1);
    expect(body.data.counts.byStatus.NEVER_TESTED).toBe(1);
  });

  it("counts NO_PROBE_PATH as unknown, never as needing attention", async () => {
    // It means WE have no path to probe and refused to guess one. Nagging an
    // operator about a gap on our side teaches them to ignore the screen.
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    mocks.connectionFindMany.mockResolvedValue([conn({ lastValidationStatus: "NO_PROBE_PATH" })]);
    const body = await (await connectionsHealth()).json();
    expect(body.data.counts.unknown).toBe(1);
    expect(body.data.counts.needsAttention).toBe(0);
  });

  it("counts undeclared environments as a backlog with a remediation", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    mocks.connectionFindMany.mockResolvedValue([
      conn({ environment: null }),
      conn({ environment: "   " }),
      conn({ environment: "PROD" }),
    ]);
    const body = await (await connectionsHealth()).json();
    expect(body.data.bindingBacklog.undeclaredEnvironment).toBe(2);
    expect(body.data.bindingBacklog.remediation).toContain("Studio");
    expect(body.data.prodConnections).toBe(1);
  });
});

describe("the write ledger explains why its two sources disagree", () => {
  it("always states that the sources do not reconcile", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    const body = await (await writeLedger(req("https://x.test/api/ops/write-ledger"))).json();
    expect(body.data.provenance.sourcesDoNotReconcile).toBe(true);
    expect(body.data.provenance.why.length).toBeGreaterThanOrEqual(3);
  });

  it("names the empty state as designed rather than leaving it blank", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    const body = await (await writeLedger(req("https://x.test/api/ops/write-ledger"))).json();
    expect(body.data.provenance.emptyByDesign).toContain("write credential");
  });

  it("distinguishes a stale reservation from one still in flight", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    mocks.keyFindMany.mockResolvedValue([
      { id: "k1", solutionId: "s", interfaceId: "i", status: null, createdAt: past, expiresAt: future },
      { id: "k2", solutionId: "s", interfaceId: "i", status: null, createdAt: past, expiresAt: past },
      { id: "k3", solutionId: "s", interfaceId: "i", status: 201, createdAt: past, expiresAt: future },
    ]);
    // The four reservation states are counted by the database now, so each has
    // its own predicate rather than being tallied from the page.
    mocks.keyCount.mockImplementation((args: { where: Record<string, unknown> }) => {
      const w = args.where as { status?: unknown; expiresAt?: { lte?: Date; gt?: Date } };
      if (w.status === null && w.expiresAt?.lte) return Promise.resolve(1); // stale
      if (w.status === null && w.expiresAt?.gt) return Promise.resolve(1); // in flight
      if (typeof w.status === "object" && w.status !== null && "lt" in w.status) return Promise.resolve(1);
      if (typeof w.status === "object" && w.status !== null && "gte" in w.status) return Promise.resolve(0);
      return Promise.resolve(3); // total
    });
    const body = await (await writeLedger(req("https://x.test/api/ops/write-ledger"))).json();
    expect(body.data.reservations.inFlight).toBe(1);
    expect(body.data.reservations.staleReservation).toBe(1);
    expect(body.data.reservations.completed).toBe(1);
    expect(body.data.reservations.total).toBe(3);
  });
});

/* ── fixtures ─────────────────────────────────────────────────────────────── */

function row(over: Record<string, unknown> = {}) {
  return {
    id: `e${Math.random()}`,
    solutionId: "sol_1",
    interfaceId: "if_1",
    operation: "READ",
    externalId: "API_X",
    environment: "SANDBOX",
    connectionId: null,
    connectionEnvironment: null,
    status: 200,
    rowCount: 1,
    durationMs: 12,
    correlationId: "c",
    clientTokenId: "t1",
    at: new Date(),
    ...over,
  };
}

describe("the credential fleet reports revocation it can actually see", () => {
  it("counts revoked credentials even though the default view excludes them", async () => {
    // THE DEFECT: the list filters `isActive: true` unless includeRevoked=1,
    // while revokeClientToken sets BOTH isActive:false AND revokedAt. So the
    // revoked branch could only fire for a row that was revoked and still
    // active, which nothing produces. The tile rendered 0 and implied nothing
    // had ever been revoked — on the screen an operator consults to find out.
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    mocks.clientFindMany.mockResolvedValue([]); // the default view: no revoked rows come back
    mocks.clientCount.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve("OR" in args.where ? 7 : 0),
    );

    const body = await (await tokens(req("https://x.test/api/ops/tokens"))).json();
    expect(body.data.counts.revoked).toBe(7);
    expect(body.data.counts.listed).toBe(0);
    // And the response says why those two do not reconcile.
    expect(body.data.provenance.countBasis).toContain("includeRevoked");
  });

  it("counts the write-credential fleet by presence, never by reading it", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    mocks.clientCount.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve("secretsCiphertext" in args.where ? 3 : 0),
    );
    const body = await (await tokens(req("https://x.test/api/ops/tokens"))).json();
    expect(body.data.counts.withWriteCredential).toBe(3);

    // The filter names the column; no select ever does.
    const filters = mocks.clientCount.mock.calls.map((c) => c[0]?.where ?? {});
    expect(filters.some((w) => "secretsCiphertext" in w)).toBe(true);
    for (const call of mocks.clientFindMany.mock.calls) {
      expect(call[0]?.select?.secretsCiphertext).toBeUndefined();
      expect(call[0]?.select?.tokenHash).toBeUndefined();
    }
  });
});

function conn(over: Record<string, unknown> = {}) {
  return {
    id: `c${Math.random()}`,
    organizationId: "org_a",
    product: "s4hana",
    key: "k",
    label: "Acme",
    environment: "DEV",
    writeEnabled: false,
    lastValidationStatus: "OK",
    lastValidatedAt: new Date(),
    createdAt: new Date(),
    ...over,
  };
}
