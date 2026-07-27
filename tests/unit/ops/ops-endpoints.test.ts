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
  keyFindMany: vi.fn(),
  connectionFindMany: vi.fn(),
  clientFindMany: vi.fn(),
  clientCount: vi.fn(),
  solutionFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: { findMany: mocks.auditFindMany },
    northboundIdempotencyKey: { findMany: mocks.keyFindMany },
    sapConnection: { findMany: mocks.connectionFindMany },
    solution: { findMany: mocks.solutionFindMany },
    solutionClient: { findMany: mocks.clientFindMany, count: mocks.clientCount },
  },
}));

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
  mocks.keyFindMany.mockResolvedValue([]);
  mocks.connectionFindMany.mockResolvedValue([]);
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
    mocks.auditFindMany.mockResolvedValue([
      row({ status: 200, rowCount: 3 }),
      row({ status: 200, rowCount: 0 }),
      row({ status: 403 }),
      row({ status: 429 }),
      row({ status: 502 }),
      row({ status: 404 }),
    ]);

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
    mocks.auditFindMany.mockResolvedValue([
      row({ environment: "SANDBOX", connectionId: "c1", connectionEnvironment: "SANDBOX" }),
      row({ environment: "SANDBOX", connectionId: "c2", connectionEnvironment: null }),
      row({ environment: "SANDBOX", connectionId: "c3", connectionEnvironment: "PROD" }),
    ]);
    const body = await (await brokerTraffic(req())).json();
    expect(body.data.environmentBinding).toEqual({ agreed: 1, unverified: 1, mismatch: 1 });
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
    const body = await (await writeLedger(req("https://x.test/api/ops/write-ledger"))).json();
    expect(body.data.reservations.inFlight).toBe(1);
    expect(body.data.reservations.staleReservation).toBe(1);
    expect(body.data.reservations.completed).toBe(1);
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
