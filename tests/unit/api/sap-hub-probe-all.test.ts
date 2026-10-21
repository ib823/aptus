import { beforeEach, describe, expect, it, vi } from "vitest";

import { mergeStoredProbe, type StoredProbe } from "@/lib/sap-public/hub-content";

const mocks = vi.hoisted(() => ({
  requireAuthenticated: vi.fn(),
  checkRateLimit: vi.fn(),
  connectionFindMany: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  getSapProduct: vi.fn(),
  getConfiguredSapTenants: vi.fn(),
  getSapTenant: vi.fn(),
  probeService: vi.fn(),
  logDecision: vi.fn(),
  persistStoredProbe: vi.fn(),
  resolveSapConnection: vi.fn(),
  grantFindMany: vi.fn(),
  auditCreate: vi.fn(),
  verificationUpsert: vi.fn(),
  verificationDeleteMany: vi.fn(),
}));

/*
 * The route now AUTHENTICATES first and decides the role rule once it knows
 * which kind of tenant was asked for — a builder may probe their own
 * organization's connection, only an admin may probe a deployment-wide tenant.
 * So the guard it calls is `requireAuthenticated`, and the role check that used
 * to live in `requireAdmin` lives in the route.
 *
 * EVERY TENANT IN THIS FILE IS A DEPLOYMENT TENANT: `getSapTenant` is mocked to
 * return one, so `resolveReadTenant` reports source "deployment". That is why
 * the admin-only expectations below are still the right ones here — they pin
 * the half of the rule that did NOT change.
 */
vi.mock("@/lib/auth/admin-guard", () => ({
  requireAuthenticated: mocks.requireAuthenticated,
  isAdminError: (r: unknown) => typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));
/*
 * `sapConnection` is here because the mocked user now carries an organization:
 * when `getSapTenant` finds no DEPLOYMENT tenant, `resolveReadTenant` falls
 * through to that organization's connections, and an absent model is a crash
 * rather than the "no such tenant" the case is about.
 */
/*
 * `apiAccessGrant` and `northboundAuditEvent` are the REAL console-read guard's
 * reads and writes (audit A24): the ceiling asks for this organization's grants
 * for the connection's landscape, and every run records one console row.
 */
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapHubContent: { findMany: mocks.findMany, update: mocks.update },
    sapConnection: { findMany: mocks.connectionFindMany },
    apiAccessGrant: { findMany: mocks.grantFindMany },
    northboundAuditEvent: { create: mocks.auditCreate },
    // The console's platform-scope row (P0.14b): one statement, not under test here.
    $executeRaw: async () => 1,
    // P0.8: a V4 address's proof on the probed tenant.
    catalogueAddressVerification: { upsert: mocks.verificationUpsert, deleteMany: mocks.verificationDeleteMany },
  },
}));
/*
 * A stored connection, resolved without decrypting anything: the projection
 * keeps what the route reads (key, label, host, landscape) and nothing else.
 */
vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnection: mocks.resolveSapConnection,
  // No org connection shadows a deployment tenant key in these cases (A41).
  hasActiveSapConnection: async () => false,
  toSapTenant: (c: { key: string; label: string; baseUrl: string; environment: string | null }) => ({
    key: c.key,
    label: c.label,
    baseUrl: c.baseUrl,
    ...(c.environment ? { environment: c.environment } : {}),
  }),
}));
/*
 * THE SHARED ROW, IN MEMORY (audit A23). `persistStoredProbe` is one SQL
 * statement that merges into the row's current value — proved against real
 * PostgreSQL in tests/unit/sap-public/hub-probe-store.test.ts. Here it is that
 * same merge on the same in-memory rows that `findMany` reads and the old
 * whole-column `update` wrote, so a route that writes from a snapshot loses
 * other runs' entries in this file exactly as it did in production.
 */
vi.mock("@/lib/sap-public/hub-probe-store", () => ({ persistStoredProbe: mocks.persistStoredProbe }));
vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapProduct: mocks.getSapProduct,
  getConfiguredSapTenants: mocks.getConfiguredSapTenants,
  getSapTenant: mocks.getSapTenant,
  deriveReadWrite: (entities: Array<{ readable: boolean; creatable: boolean | null; updatable: boolean | null; deletable: boolean | null }>) => ({
    read: entities.some((e) => e.readable),
    write: entities.some((e) => e.creatable === true || e.updatable === true || e.deletable === true),
  }),
}));
vi.mock("@/lib/sap-public/capability-probe", () => ({ probeService: mocks.probeService }));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));
/*
 * MOCKED, and its absence is what broke this file: the route limits a fleet
 * probe to one per tenant per ten minutes, these cases all probe the SAME
 * tenant, and the limiter keeps state across a process — so the third test
 * onwards got a 429 and never reached findMany. The limit's own behaviour is
 * asserted in tests/unit/sap/probe-all-gate.test.ts; here it must not couple
 * one case to the next.
 */
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));

const { POST } = await import("@/app/api/sap/tdd/hub-content/probe-all/route");

function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const PRODUCT = { key: "s4hana", label: "S/4HANA Cloud", envPrefix: "S4_TDD", edition: "PUBLIC", services: [] };
const TENANT = { key: "default", label: "ABeam TDD", baseUrl: "https://x.example" };
const PROBEABLE_ROWS = [
  { id: "1", externalId: "API_PO", contentType: "API", apiType: "ODATAV2", title: "PO", packageId: "Proc", communicationScenarios: [] },
  { id: "2", externalId: "C_VIEW", contentType: "CDS_VIEW", apiType: "ODATAV2", title: "View", packageId: "Sales", communicationScenarios: [] },
];
const INITIAL_RAW: Record<string, unknown> = { "1": { source: "SapApiReference", apiId: "API_PO" }, "2": null };

/** rawMetadataJson per row id — the shared SapHubContent column. */
let rowsRaw = new Map<string, unknown>();
const rawOf = (id: string) => rowsRaw.get(id) as { probes?: Record<string, StoredProbe> } & Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  rowsRaw = new Map(Object.entries(structuredClone(INITIAL_RAW)));
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 0, resetMs: 0 });
  mocks.connectionFindMany.mockResolvedValue([]); // no connections — deployment tenants only
  mocks.resolveSapConnection.mockResolvedValue(null);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
  mocks.requireAuthenticated.mockResolvedValue({
    user: { id: "a", email: "a@b.co", role: "platform_admin", organizationId: "org-a" },
  });
  mocks.getSapProduct.mockReturnValue(PRODUCT);
  mocks.getConfiguredSapTenants.mockReturnValue([TENANT]);
  mocks.getSapTenant.mockReturnValue(TENANT);
  // A read returns the column as it is NOW — a copy, as a query result is.
  mocks.findMany.mockImplementation(async () =>
    PROBEABLE_ROWS.map((r) => ({ ...r, rawMetadataJson: structuredClone(rowsRaw.get(r.id) ?? null) })),
  );
  // The old write path: the whole column, replaced.
  mocks.update.mockImplementation(async (args: { where: { id: string }; data: { rawMetadataJson: unknown } }) => {
    rowsRaw.set(args.where.id, args.data.rawMetadataJson);
    return {};
  });
  // The new write path: one key, merged into the CURRENT value.
  mocks.persistStoredProbe.mockImplementation(async (id: string, key: string, probe: StoredProbe) => {
    rowsRaw.set(id, mergeStoredProbe(rowsRaw.get(id), key, probe));
    return 1;
  });
  mocks.probeService.mockImplementation((_p: string, _t: unknown, svc: { key: string }) =>
    Promise.resolve(
      svc.key === "API_PO"
        ? { service: "API_PO", exposed: true, status: 200, entities: [{ name: "A", readable: true, creatable: true, updatable: null, deletable: null, pageable: null }] }
        : { service: "C_VIEW", exposed: false, status: 403, entities: [] },
    ),
  );
});

describe("POST /api/sap/tdd/hub-content/probe-all", () => {
  it("passes an unauthenticated caller's refusal through", async () => {
    mocks.requireAuthenticated.mockResolvedValue({ status: 401 });
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(401);
    expect(mocks.probeService).not.toHaveBeenCalled();
  });

  it("refuses a BUILDER on a deployment-wide tenant", async () => {
    /*
     * The half of the old rule that stands. A consultant may now probe their
     * own organization's connection — but a deployment tenant is shared by
     * every organization here and its results are filed under a bare key they
     * all read, so a builder writing there would rewrite everyone's view.
     */
    mocks.requireAuthenticated.mockResolvedValue({
      user: { id: "c", email: "c@b.co", role: "consultant", organizationId: "org-a" },
    });
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(403);
    expect(mocks.probeService).not.toHaveBeenCalled();
  });

  it("refuses a role that authors nothing, on any tenant", async () => {
    mocks.requireAuthenticated.mockResolvedValue({
      user: { id: "v", email: "v@b.co", role: "viewer", organizationId: "org-a" },
    });
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(403);
    expect(mocks.probeService).not.toHaveBeenCalled();
  });

  it("400 without the confirmation phrase", async () => {
    const res = await POST(makeRequest({ confirmation: "nope" }));
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.persistStoredProbe).not.toHaveBeenCalled();
  });

  it("probes every probeable row and PERSISTS under the tenant key, MERGING rawMetadataJson", async () => {
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.probed).toBe(2);
    expect(body.data.byOutcome).toMatchObject({ ACTIVATED: 1, NEEDS_SETUP: 1 });
    expect(body.data.tenantKey).toBe("default");

    // API_PO now carries probes.default on top of its existing keys (source/apiId preserved).
    const raw = rawOf("1");
    expect(raw.source).toBe("SapApiReference"); // preserved
    expect(raw.apiId).toBe("API_PO"); // preserved
    expect(raw.probe).toBeUndefined(); // no more singular slot
    expect(raw.probes!.default!.http).toBe(200);
    expect(raw.probes!.default!.read).toBe(true);
    expect(raw.probes!.default!.write).toBe(true); // creatable ⇒ write
    expect(typeof raw.probes!.default!.at).toBe("string");

    expect(rawOf("2").probes!.default!.http).toBe(403);

    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({ action: "SAP_HUB_PROBED_ALL" });
  });

  it("probing one tenant writes ONLY that tenant's key — preserves siblings + legacy probe", async () => {
    // API_PO already has a customizing result + a legacy singular probe.
    rowsRaw.set("1", { source: "SapApiReference", apiId: "API_PO", probe: { http: 999 }, probes: { customizing: { http: 200 } } });
    mocks.getConfiguredSapTenants.mockReturnValue([TENANT, { key: "development", label: "Dev X5M/080", baseUrl: "https://d.example" }]);
    mocks.getSapTenant.mockImplementation((_p: string, key: string) =>
      key === "development" ? { key: "development", label: "Dev X5M/080", baseUrl: "https://d.example" } : TENANT,
    );
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "development" }));
    expect(res.status).toBe(200);
    const raw = rawOf("1");
    expect(raw.probes!.development!.http).toBe(200); // wrote development
    expect(raw.probes!.customizing!.http).toBe(200); // sibling tenant untouched
    expect((raw.probe as StoredProbe).http).toBe(999); // legacy slot untouched
    expect(raw.source).toBe("SapApiReference");
    // And the write itself names one row, one key, one probe — never the column.
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.persistStoredProbe).toHaveBeenCalledWith("1", "development", expect.objectContaining({ http: 200 }));
  });

  it("two overlapping runs for different keys keep each other's entries — no revert, no drop (A23)", async () => {
    /*
     * The audit's trigger, reproduced. Run B (key "default") reads the rows and
     * starts probing; while it waits on the tenant, run A (key "development")
     * runs to completion and stores a FRESH 403 over an old 200 of its own.
     * Then B finishes and writes. Writing from its start-of-run copy, B used to
     * (a) drop A's entry from rows A had never touched before, and (b) restore
     * A's OLD 200 on the row where A had one — so the catalogue showed a
     * refused service as ACTIVATED with read/write chips.
     */
    const OLD_200 = { http: 200, at: "2026-10-10T00:00:00.000Z", read: true, write: true };
    rowsRaw.set("1", { source: "SapApiReference", apiId: "API_PO", probes: { development: OLD_200 } });
    const DEV = { key: "development", label: "Dev X5M/080", baseUrl: "https://d.example" };
    mocks.getConfiguredSapTenants.mockReturnValue([TENANT, DEV]);
    mocks.getSapTenant.mockImplementation((_p: string, key: string) => (key === "development" ? DEV : TENANT));

    let releaseB!: () => void;
    const gateB = new Promise<void>((resolve) => (releaseB = resolve));
    mocks.probeService.mockImplementation(async (_p: string, tenant: { key: string }, svc: { key: string }) => {
      if (tenant.key === "default") await gateB; // B is the slow run
      // On the development system the PO service now answers 403.
      const status = tenant.key === "development" ? 403 : 200;
      return { service: svc.key, exposed: status === 200, status, entities: [] };
    });

    const runB = POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "default" }));
    // B has read the rows once it is waiting on the tenant.
    await vi.waitFor(() => expect(mocks.probeService).toHaveBeenCalled());

    const resA = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "development" }));
    expect((await resA.json()).data.byOutcome.NEEDS_SETUP).toBe(2);

    releaseB();
    expect((await runB).status).toBe(200);

    // A's fresh verdict stands on the row where it replaced its own old one…
    expect(rawOf("1").probes!.development!.http).toBe(403);
    expect(rawOf("1").probes!.development!.at).not.toBe(OLD_200.at);
    // …A's entry survives on the row B wrote last…
    expect(rawOf("2").probes!.development!.http).toBe(403);
    // …and B's own entries landed beside them.
    expect(rawOf("1").probes!.default!.http).toBe(200);
    expect(rawOf("2").probes!.default!.http).toBe(200);
    expect(rawOf("1").source).toBe("SapApiReference");
  });

  it("never reads rawMetadataJson at the start of a run — there is no snapshot to go stale", async () => {
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(mocks.findMany.mock.calls[0]![0].select.rawMetadataJson).toBeUndefined();
  });

  it("skips SAP-deprecated rows by default and includes them only on includeDeprecated: true (2608 WS3)", async () => {
    // NULL hubState is "no lifecycle recorded", not deprecated: it must be
    // selected (SQL's NOT (x = 'DEPRECATED') drops NULLs — see the integration
    // test in catalogue-lifecycle-and-addresses).
    const SKIP_DEPRECATED = { OR: [{ hubState: null }, { NOT: { hubState: "DEPRECATED" } }] };
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    const where = mocks.findMany.mock.calls[0]![0].where;
    expect(where.AND).toContainEqual(SKIP_DEPRECATED);

    mocks.findMany.mockClear();
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", includeDeprecated: true }));
    expect(mocks.findMany.mock.calls[0]![0].where.AND).not.toContainEqual(SKIP_DEPRECATED);
    expect((await res.json()).data.includeDeprecated).toBe(true);

    // Anything but the literal boolean true stays opted OUT.
    mocks.findMany.mockClear();
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", includeDeprecated: "true" }));
    expect(mocks.findMany.mock.calls[0]![0].where.AND).toContainEqual(SKIP_DEPRECATED);
  });

  /*
   * P0.8 — 148 production `sap-s4-*` wrapper rows were probed at malformed
   * addresses. They are excluded at the query, deprecated or not, and a wrapper
   * that reaches the worker anyway is not probed.
   */
  it("never probes a `sap-s4-*` wrapper row, whatever the deprecation opt-in", async () => {
    const SKIP_WRAPPERS = { NOT: { externalId: { startsWith: "sap-s4-", mode: "insensitive" } } };
    for (const includeDeprecated of [false, true]) {
      mocks.findMany.mockClear();
      await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", includeDeprecated }));
      expect(mocks.findMany.mock.calls[0]![0].where.AND).toContainEqual(SKIP_WRAPPERS);
    }

    mocks.findMany.mockResolvedValue([
      { id: "w", externalId: "sap-s4-CE_RETAILSEASON_0001-v1", contentType: "API", apiType: "ODATAV4", title: "W", packageId: null, communicationScenarios: [] },
    ]);
    mocks.probeService.mockClear();
    const body = await (await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }))).json();
    expect(mocks.probeService).not.toHaveBeenCalled();
    expect(body.data.probed).toBe(0);
  });

  it("files a V4 address's 200 as its proof on this tenant, and only a V4 address's (P0.8)", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "v4", externalId: "CE_BANK_0003", contentType: "API", apiType: "ODATAV4", title: "Bank", packageId: null, communicationScenarios: [] },
      { id: "v2", externalId: "API_PO", contentType: "API", apiType: "ODATAV2", title: "PO", packageId: null, communicationScenarios: [] },
    ]);
    mocks.probeService.mockResolvedValue({ service: "x", exposed: true, status: 200, entities: [] });
    mocks.verificationUpsert.mockResolvedValue({});
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(mocks.verificationUpsert).toHaveBeenCalledOnce();
    const upsert = mocks.verificationUpsert.mock.calls[0]![0];
    // A deployment tenant has no organization: filed where its audit rows are.
    expect(upsert.where.organizationId_product_tenantKey_externalId).toEqual({
      organizationId: "-deployment-",
      product: "s4hana",
      tenantKey: "default",
      externalId: "CE_BANK_0003",
    });
    expect(upsert.create).toMatchObject({
      servicePath: "/sap/opu/odata4/sap/ce_bank/srvd_a2x/sap/ce_bank/0003",
      connectionId: null,
      baseUrl: "https://x.example",
      verifiedByUserId: "a",
      method: "probe-all",
    });
  });

  it("400 on an unknown tenant key", async () => {
    mocks.getSapTenant.mockReturnValue(null);
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "nope" }));
    expect(res.status).toBe(400);
  });

  it("400 when no tenant is configured", async () => {
    mocks.getConfiguredSapTenants.mockReturnValue([]);
    mocks.getSapTenant.mockReturnValue(null);
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(400);
  });
});

describe("Probe all on a stored connection takes the console ceiling and leaves a row (A24)", () => {
  const CONSULTANT = { id: "c", email: "c@b.co", role: "consultant", organizationId: "org-a" };
  const connection = (environment: string | null) => ({
    id: "conn-prod",
    key: "x5m-prod",
    label: "X5M PROD",
    baseUrl: "https://x5m.example",
    environment,
  });
  const auditRows = () => mocks.auditCreate.mock.calls.map((c) => c[0].data);

  beforeEach(() => {
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.getSapTenant.mockReturnValue(null); // not a deployment key…
    mocks.getConfiguredSapTenants.mockReturnValue([]);
  });

  it("refuses a PROD connection with no approved PROD grant — before any request leaves", async () => {
    // The audit's trigger: /entities refuses this organization's PROD system,
    // and Probe all fired 600-odd requests at the same host anyway.
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "x5m-prod" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("approved access grant");
    expect(body.error.correlationId).toBeTruthy();
    expect(mocks.probeService).not.toHaveBeenCalled();
    expect(mocks.persistStoredProbe).not.toHaveBeenCalled();
    // Refused before the limiter, so the refusal does not spend the window.
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.grantFindMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", environment: "PROD" });
    // The refusal is recorded — repeated 403s against one landscape are the row worth seeing.
    expect(auditRows()).toEqual([
      expect.objectContaining({
        organizationId: "org-a",
        actorUserId: "c",
        externalId: "-probe-all-",
        environment: "PROD",
        status: 403,
        rowCount: null,
        dryRun: true,
        connectionId: "conn-prod",
        connectionEnvironment: "PROD",
        correlationId: body.error.correlationId,
      }),
    ]);
  });

  it("refuses a connection that has not declared its landscape", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection(null));
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "x5m-prod" }));
    expect(res.status).toBe(403);
    expect(mocks.probeService).not.toHaveBeenCalled();
    expect(auditRows()[0]).toMatchObject({ status: 403, connectionEnvironment: null });
  });

  it("runs on PROD under a live approved grant, and records the whole fan-out as one row", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    mocks.grantFindMany.mockResolvedValue([{ decision: "APPROVED", expiresAt: null, revokedAt: null }]);
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "x5m-prod" }));
    expect(res.status).toBe(200);
    expect(mocks.probeService).toHaveBeenCalledTimes(2);
    expect(auditRows()).toEqual([
      expect.objectContaining({ externalId: "-probe-all-", status: 200, rowCount: 2, connectionEnvironment: "PROD" }),
    ]);
    // Filed under the owner-scoped key, as before.
    expect(rawOf("1").probes!["org:org-a:s4hana:x5m-prod"]!.http).toBe(200);
  });

  it("runs on a DEV connection without asking for a grant — and still records it", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("DEV"));
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "x5m-prod" }));
    expect(res.status).toBe(200);
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([expect.objectContaining({ status: 200, rowCount: 2, environment: "DEV" })]);
  });

  it("an admin's run on the deployment tenant is recorded too, with no ceiling to apply", async () => {
    mocks.requireAuthenticated.mockResolvedValue({
      user: { id: "a", email: "a@b.co", role: "platform_admin", organizationId: "org-a" },
    });
    mocks.getConfiguredSapTenants.mockReturnValue([TENANT]);
    mocks.getSapTenant.mockReturnValue(TENANT);
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(200);
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([
      expect.objectContaining({
        environment: "deployment:default",
        connectionId: null,
        status: 200,
        rowCount: 2,
        actorUserId: "a",
      }),
    ]);
  });
});

/*
 * AUDIT A28 — a credential that could not be obtained is never stored as a
 * service's outcome. The trigger: the deployment tenant loses S4_TDD_PASSWORD,
 * or a token URL is mistyped. Every service then failed the same way without
 * a request reaching SAP, and Probe all wrote PROBE_FAILED (or NOT_FOUND, for
 * the token endpoint's 404) over hundreds of rows' stored outcomes — so a
 * service proven ACTIVATED read as broken until somebody re-probed.
 */
describe("Probe all stops at the first credential failure and stores nothing for it (A28)", () => {
  const PROVEN = { http: 200, at: "2026-10-10T00:00:00.000Z", read: true, write: true };
  const unauthenticated = (credentialError: "refused" | "unavailable") =>
    mocks.probeService.mockImplementation(async (_p: string, _t: unknown, svc: { key: string }) => ({
      service: svc.key,
      exposed: false,
      status: 0,
      ladder: "unreachable",
      credentialError,
      error: "This connection is basic auth but is missing its username or password. Save it again with both filled in.",
    }));

  beforeEach(() => {
    rowsRaw.set("1", { source: "SapApiReference", apiId: "API_PO", probes: { default: PROVEN } });
    rowsRaw.set("2", { probes: { default: PROVEN } });
  });

  it("keeps every stored outcome, and says why it stopped", async () => {
    unauthenticated("refused");
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(mocks.persistStoredProbe).not.toHaveBeenCalled();
    expect(rawOf("1").probes!.default).toEqual(PROVEN);
    expect(rawOf("2").probes!.default).toEqual(PROVEN);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toMatch(/could not authenticate to this tenant/);
    expect(body.error.message).toMatch(/missing its username or password/);
  });

  it("starts nothing after the first failure", async () => {
    unauthenticated("refused");
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    // Two rows, a pool of up to CONCURRENCY workers: each worker that had
    // already started finishes, and none picks up another row after the flag.
    expect(mocks.probeService.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mocks.logDecision).not.toHaveBeenCalled();
  });

  it("is audited as the refusal it is, not a tenant 5xx — and no request is counted as load", async () => {
    unauthenticated("refused");
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    const rows = mocks.auditCreate.mock.calls.map((c) => c[0].data);
    expect(rows).toEqual([expect.objectContaining({ externalId: "-probe-all-", status: 403, rowCount: 0 })]);
  });

  it("a token endpoint that failed is a 502, and still stores nothing", async () => {
    unauthenticated("unavailable");
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(502);
    expect(mocks.persistStoredProbe).not.toHaveBeenCalled();
  });

  it("a real answer that finished first is still stored", async () => {
    mocks.probeService.mockImplementation(async (_p: string, _t: unknown, svc: { key: string }) =>
      svc.key === "API_PO"
        ? { service: "API_PO", exposed: false, status: 403, entities: [] }
        : { service: svc.key, exposed: false, status: 0, credentialError: "refused", error: "x" },
    );
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(mocks.persistStoredProbe).toHaveBeenCalledTimes(1);
    expect(mocks.persistStoredProbe).toHaveBeenCalledWith("1", "default", expect.objectContaining({ http: 403 }));
    expect(rawOf("2").probes!.default).toEqual(PROVEN);
  });
});
