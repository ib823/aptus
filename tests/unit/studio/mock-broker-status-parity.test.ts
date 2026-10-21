// @vitest-environment node
/**
 * The offline mock answers every failure exactly as the broker does (P0.4, A56, A57).
 *
 * THE DEFECTS. A Test Console run the broker answers 404 NOT_FOUND ("the
 * requested entity set does not exist") was captured as the `error` fixture,
 * and the starter kit's `npm run mock` then served 502 UPSTREAM_ERROR "The
 * tenant could not be reached" — so the developer's suite exercised a retry
 * path for a configuration fault, and the broker's real 404 met an untested
 * branch in production (A57). A timeout or a 5xx could not be captured at all.
 * And the console's own audit row dropped `failureReason`, so the correlation
 * id it shows could not say whether a run failed on a credential or on SAP,
 * while the same failure through the deployed app could (A56).
 *
 * THE ACCEPTANCE, AS ONE TABLE. Every failure reason the read can produce is
 * driven through the REAL pipeline three ways, against one stubbed tenant:
 *   1. the northbound data route — what the deployed application receives;
 *   2. the Test Console's broker run — what the builder sees;
 *   3. Capture fixture, from that run — what the mock will serve.
 * The mock's status and error code must equal the broker's, and the console's
 * audit row must carry the same failure reason as the data route's.
 * The real data route, broker-run, capture-fixture and readEntitySet; identity,
 * grants and the connection row are stood in for.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";
import { OAuthTokenRequestError } from "@/lib/sap-public/upstream-failure";

const { mocks, IFACE, CONNECTION } = vi.hoisted(() => {
  const IFACE = {
    id: "if_1",
    name: "BP read",
    solutionId: "sol_1",
    externalId: "API_BUSINESS_PARTNER",
    sapProduct: "s4hana",
    operation: "READ",
    mode: "READ",
    entitySet: "A_BusinessPartner",
    version: 2,
    status: "ACTIVE",
    servicePath: null,
    odataVersion: null,
  };
  const CONNECTION = {
    id: "conn_1",
    key: "dev",
    label: "S/4 DEV",
    baseUrl: "https://tenant.example",
    client: null,
    environment: "DEV",
    writeEnabled: false,
    authType: "oauth2_client_credentials",
    timeoutMs: null,
  };
  return {
    IFACE,
    CONNECTION,
    mocks: {
      record: vi.fn(),
      authHeaders: vi.fn(),
      fixtures: [] as Record<string, unknown>[],
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a", authMethod: "session" }),
}));
vi.mock("@/lib/db/prisma", async () => {
  const { applyJsonTextUpdate, jsonTextUpdateTable } = await import("../../helpers/raw-sql-standin");
  const prisma: Record<string, unknown> = {
    // A fixture body written from its text (json-text.ts), in the row's own transaction.
    $executeRaw: async (q: unknown) => (jsonTextUpdateTable(q) === "MockFixture" ? applyJsonTextUpdate(mocks.fixtures, q) : 0),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    interface: { findFirst: async () => ({ ...IFACE }) },
    solutionClient: {
      findMany: async () => [{ id: "cl_1", environment: "DEV", sapClient: null, expiresAt: null }],
    },
    mockFixture: {
      findFirst: async ({ where }: { where: { scenario: string } }) =>
        mocks.fixtures.find((f) => f.scenario === where.scenario) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `fx_${mocks.fixtures.length}`, capturedAt: new Date(), ...data };
        mocks.fixtures.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = mocks.fixtures.find((f) => f.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  };
  return { prisma };
});
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: vi.fn() }));
vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "cl_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      environment: "DEV",
      sapClient: null,
      scope: { organizationId: "org_a" },
    },
  }),
  extractBearer: (h: string | null) => h?.replace(/^Bearer /, "") ?? null,
  touchClientLastUsed: vi.fn(),
  checkSolutionRuntime: async () => ({ ok: true }),
}));
vi.mock("@/lib/northbound/auth-failures", () => ({ noteFailedCredential: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: { limit: 60 } },
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.record }));
vi.mock("@/lib/northbound/access", () => ({
  resolveReadableInterface: async () => ({ ok: true, iface: { ...IFACE, draft: false } }),
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolverModule>()),
  resolveSapConnectionForEnvironment: async () => ({ ok: true, bindingUnverified: false, connection: CONNECTION }),
  buildAuthHeadersFromConnection: mocks.authHeaders,
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: async () => ({ path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" }),
}));

import { GET as dataRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as captureFixture } from "@/app/api/studio/interfaces/[id]/capture-fixture/route";
import { POST as brokerRun } from "@/app/api/studio/test/broker-run/route";
import { FIXTURE_SCENARIOS, READ_STATUSES } from "@/lib/studio/fixtures";

const abort = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
const refused = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Every way the read can end, as the tenant or the credential step produces it. */
const CASES: {
  name: string;
  /** What the credential step does: headers, or the error it throws. */
  credential?: () => Error;
  /** What the tenant answers, or throws. */
  tenant?: () => Response | Error;
}[] = [
  { name: "rows (OK)", tenant: () => json({ d: { results: [{ BusinessPartner: "1" }] } }, 200) },
  { name: "no rows (EMPTY)", tenant: () => json({ d: { results: [] } }, 200) },
  { name: "tenant 401 (NEEDS_SETUP)", tenant: () => json({ error: {} }, 401) },
  { name: "tenant 403 (NEEDS_SETUP)", tenant: () => json({ error: {} }, 403) },
  { name: "tenant 404 (NOT_FOUND) — A57", tenant: () => json({ error: {} }, 404) },
  { name: "tenant 500 (ERROR)", tenant: () => json({ error: {} }, 500) },
  { name: "tenant 503 (ERROR)", tenant: () => json({ error: {} }, 503) },
  { name: "invalid OData body (ERROR)", tenant: () => json({ unexpected: true }, 200) },
  { name: "tenant unreachable (ERROR)", tenant: refused },
  { name: "tenant timed out (TIMEOUT)", tenant: abort },
  { name: "token endpoint refused the credential (NEEDS_SETUP)", credential: () => new OAuthTokenRequestError("no", 401) },
  { name: "token endpoint unavailable (ERROR)", credential: () => new OAuthTokenRequestError("down", 503) },
  { name: "token endpoint timed out (TIMEOUT)", credential: abort },
];

function arrange(c: (typeof CASES)[number]) {
  mocks.authHeaders.mockImplementation(async () => {
    if (c.credential) throw c.credential();
    return { Authorization: "Bearer t" };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const answer = c.tenant!();
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  );
}

async function brokerAnswer() {
  const res = await dataRoute(
    new NextRequest("http://localhost/api/northbound/interfaces/if_1/data", { headers: { authorization: "Bearer ce_live_x" } }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
  const body = (await res.json()) as { data?: { records: unknown[]; empty: boolean }; error?: { code: string } };
  return { status: res.status, code: body.error?.code ?? null, body };
}

async function consoleRunAndCapture() {
  const run = (await (
    await brokerRun(
      new NextRequest("http://localhost/api/studio/test/broker-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interfaceId: "if_1" }),
      }),
    )
  ).json()) as {
    data: {
      outcome: string;
      status: string;
      httpStatus: number;
      records: Record<string, unknown>[];
      note: string;
      contract: { version: number; entitySet: string | null };
    };
  };
  expect(run.data.outcome).toBe("ran");
  // The capture exactly as the Test Console sends it (TestConsoleClient.captureFixture).
  const captured = await captureFixture(
    new NextRequest("http://localhost/api/studio/interfaces/if_1/capture-fixture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        readStatus: run.data.status,
        sourceStatus: run.data.httpStatus,
        detail: run.data.note,
        rows: run.data.records,
        interfaceVersion: run.data.contract.version,
        entitySet: run.data.contract.entitySet,
      }),
    }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
  expect(captured.status, "every broker outcome is a recordable scenario").toBe(200);
  const { scenario } = ((await captured.json()) as { data: { scenario: string } }).data;
  const fixture = mocks.fixtures.find((f) => f.scenario === scenario)!;
  return { run: run.data, fixture: fixture as { scenario: string; status: number; body: { error?: { code: string } } } };
}

/** The failureReason each audit row carried: [data route, console dry run]. */
function auditedReasons(): [unknown, unknown] {
  const rows = mocks.record.mock.calls.map((c) => c[0] as { dryRun?: boolean; failureReason?: string | null });
  const live = rows.find((r) => !r.dryRun);
  const dry = rows.find((r) => r.dryRun);
  return [live?.failureReason ?? null, dry?.failureReason ?? null];
}

beforeEach(() => {
  mocks.fixtures.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("mock and broker answer every failure reason alike", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    arrange(c);
    const broker = await brokerAnswer();
    const { run, fixture } = await consoleRunAndCapture();

    // The console reports the broker's own status for the run…
    expect(run.httpStatus).toBe(broker.status);
    // …and the mock serves it: same HTTP status, same error code.
    expect(fixture.status, `the mock must answer ${broker.status}, as the broker does`).toBe(broker.status);
    expect(fixture.body.error?.code ?? null).toBe(broker.code);
    if (broker.status === 200) {
      expect(fixture.scenario).toBe(broker.body.data!.empty ? "empty" : "data");
    }
    // A56: the dry run's audit row says why, as the data route's does.
    const [live, dry] = auditedReasons();
    expect(dry).toBe(live);
  });

  it("covers every broker outcome and every scenario", async () => {
    const outcomes = new Set<string>();
    const scenarios = new Set<string>();
    for (const c of CASES) {
      arrange(c);
      const { run, fixture } = await consoleRunAndCapture();
      outcomes.add(run.status);
      scenarios.add(fixture.scenario);
    }
    expect([...outcomes].sort()).toEqual([...READ_STATUSES].sort());
    expect([...scenarios].sort()).toEqual([...FIXTURE_SCENARIOS].sort());
  });

  it("records the run's own sentence, never a different one", async () => {
    arrange(CASES.find((c) => c.name.startsWith("tenant 404"))!);
    const broker = await brokerAnswer();
    const { fixture } = await consoleRunAndCapture();
    const message = (fixture.body as unknown as { error: { message: string } }).error.message;
    expect(message).toBe((broker.body as unknown as { error: { message: string } }).error.message);
    expect(message).not.toMatch(/could not be reached/);
  });
});

describe("a credential failure is findable by the console's correlation id (A56)", () => {
  it("the dry-run row carries the TOKEN_* reason, not a bare 403", async () => {
    arrange(CASES.find((c) => c.name.startsWith("token endpoint refused"))!);
    await consoleRunAndCapture();
    const dry = mocks.record.mock.calls.map((c) => c[0] as { dryRun?: boolean; failureReason?: string }).find((r) => r.dryRun)!;
    expect(dry.failureReason).toMatch(/^TOKEN_/);
  });
});
