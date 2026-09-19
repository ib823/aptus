import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapHubContent: { findMany: mocks.findMany, update: mocks.update },
    sapConnection: { findMany: mocks.connectionFindMany },
  },
}));
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
  { id: "1", externalId: "API_PO", contentType: "API", apiType: "ODATAV2", title: "PO", packageId: "Proc", communicationScenarios: [], rawMetadataJson: { source: "SapApiReference", apiId: "API_PO" } },
  { id: "2", externalId: "C_VIEW", contentType: "CDS_VIEW", apiType: "ODATAV2", title: "View", packageId: "Sales", communicationScenarios: [], rawMetadataJson: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 0, resetMs: 0 });
  mocks.connectionFindMany.mockResolvedValue([]); // no connections — deployment tenants only
  mocks.requireAuthenticated.mockResolvedValue({
    user: { id: "a", email: "a@b.co", role: "platform_admin", organizationId: "org-a" },
  });
  mocks.getSapProduct.mockReturnValue(PRODUCT);
  mocks.getConfiguredSapTenants.mockReturnValue([TENANT]);
  mocks.getSapTenant.mockReturnValue(TENANT);
  mocks.findMany.mockResolvedValue(PROBEABLE_ROWS);
  mocks.update.mockResolvedValue({});
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
  });

  it("probes every probeable row and PERSISTS under the tenant key, MERGING rawMetadataJson", async () => {
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.probed).toBe(2);
    expect(body.data.byOutcome).toMatchObject({ ACTIVATED: 1, NEEDS_SETUP: 1 });
    expect(body.data.tenantKey).toBe("default");

    // API_PO update MERGES probes.default onto the existing keys (source/apiId preserved).
    const poCall = mocks.update.mock.calls.find((c) => c[0].where.id === "1")!;
    const raw = poCall[0].data.rawMetadataJson;
    expect(raw.source).toBe("SapApiReference"); // preserved
    expect(raw.apiId).toBe("API_PO"); // preserved
    expect(raw.probe).toBeUndefined(); // no more singular slot
    expect(raw.probes.default.http).toBe(200);
    expect(raw.probes.default.read).toBe(true);
    expect(raw.probes.default.write).toBe(true); // creatable ⇒ write
    expect(typeof raw.probes.default.at).toBe("string");

    const cvCall = mocks.update.mock.calls.find((c) => c[0].where.id === "2")!;
    expect(cvCall[0].data.rawMetadataJson.probes.default.http).toBe(403);

    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({ action: "SAP_HUB_PROBED_ALL" });
  });

  it("probing one tenant writes ONLY that tenant's key — preserves siblings + legacy probe", async () => {
    // API_PO already has a customizing result + a legacy singular probe.
    mocks.findMany.mockResolvedValue([
      { ...PROBEABLE_ROWS[0], rawMetadataJson: { source: "SapApiReference", apiId: "API_PO", probe: { http: 999 }, probes: { customizing: { http: 200 } } } },
    ]);
    mocks.getConfiguredSapTenants.mockReturnValue([TENANT, { key: "development", label: "Dev X5M/080", baseUrl: "https://d.example" }]);
    mocks.getSapTenant.mockImplementation((_p: string, key: string) =>
      key === "development" ? { key: "development", label: "Dev X5M/080", baseUrl: "https://d.example" } : TENANT,
    );
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", tenant: "development" }));
    expect(res.status).toBe(200);
    const raw = mocks.update.mock.calls.find((c) => c[0].where.id === "1")![0].data.rawMetadataJson;
    expect(raw.probes.development.http).toBe(200); // wrote development
    expect(raw.probes.customizing.http).toBe(200); // sibling tenant untouched
    expect(raw.probe.http).toBe(999); // legacy slot untouched
    expect(raw.source).toBe("SapApiReference");
  });

  it("skips SAP-deprecated rows by default and includes them only on includeDeprecated: true (2608 WS3)", async () => {
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    const where = mocks.findMany.mock.calls[0]![0].where;
    expect(where.NOT).toEqual({ hubState: "DEPRECATED" });

    mocks.findMany.mockClear();
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", includeDeprecated: true }));
    expect(mocks.findMany.mock.calls[0]![0].where.NOT).toBeUndefined();
    expect((await res.json()).data.includeDeprecated).toBe(true);

    // Anything but the literal boolean true stays opted OUT.
    mocks.findMany.mockClear();
    await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES", includeDeprecated: "true" }));
    expect(mocks.findMany.mock.calls[0]![0].where.NOT).toEqual({ hubState: "DEPRECATED" });
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
