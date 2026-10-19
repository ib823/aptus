import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DynamicCatalogModule from "@/lib/sap-public/dynamic-catalog";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSapProduct: vi.fn(),
  isSapTddPublicAccessEnabled: vi.fn(),
  getConfiguredSapTenants: vi.fn(),
  getSapTenant: vi.fn(),
  getDynamicOdataServices: vi.fn(),
  probeTenantCapabilities: vi.fn(),
  summarize: vi.fn(),
  auditCapabilityProbe: vi.fn(),
  resolveSapConnection: vi.fn(),
  grantFindMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
/*
 * The REAL console-read guard runs (audit A24): its grant read and its audit
 * write are the two client calls mocked here.
 */
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    apiAccessGrant: { findMany: mocks.grantFindMany },
    northboundAuditEvent: { create: mocks.auditCreate },
  },
}));
// A stored connection, resolved without decrypting anything.
vi.mock("@/lib/sap-public/connection-resolver", () => ({
  resolveSapConnection: mocks.resolveSapConnection,
  // No org connection shadows a deployment tenant key in these cases (A41).
  hasActiveSapConnection: async () => false,
  toSapTenant: (c: { key: string; label: string; baseUrl: string }) => ({ key: c.key, label: c.label, baseUrl: c.baseUrl }),
}));
vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapProduct: mocks.getSapProduct,
  // 2608 WS4: routes resolve services through getSapServices (PO legacy flag); the mock passes the product's list through.
  getSapServices: (p: { services: unknown[] }) => p.services,
  isSapTddPublicAccessEnabled: mocks.isSapTddPublicAccessEnabled,
  getConfiguredSapTenants: mocks.getConfiguredSapTenants,
  getSapTenant: mocks.getSapTenant,
}));
// Keep the real mergeProbeTargets (pure logic worth exercising); mock only the DB read.
vi.mock("@/lib/sap-public/dynamic-catalog", async (importActual) => ({
  ...(await importActual<typeof DynamicCatalogModule>()),
  getDynamicOdataServices: mocks.getDynamicOdataServices,
}));
vi.mock("@/lib/sap-public/capability-probe", () => ({
  probeTenantCapabilities: mocks.probeTenantCapabilities,
  summarize: mocks.summarize,
}));
vi.mock("@/lib/sap-public/capability-audit", () => ({
  auditCapabilityProbe: mocks.auditCapabilityProbe,
}));

const { GET } = await import("@/app/api/sap/tdd/capabilities/route");

const CURATED = { key: "po", label: "Purchase Orders", scenario: "SAP_COM_0053", path: "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV", domain: "" };
const PRODUCT = { key: "s4hana", label: "S/4HANA Cloud", envPrefix: "S4_TDD", edition: "PUBLIC", services: [CURATED] };
const TENANT = { key: "default", label: "ABeam TDD", baseUrl: "https://x.example" };

function makeRequest(query = "product=s4hana"): Parameters<typeof GET>[0] {
  return { nextUrl: { searchParams: new URLSearchParams(query) } } as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSapProduct.mockReturnValue(PRODUCT);
  mocks.isSapTddPublicAccessEnabled.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue({ email: "a@b.co", role: "consultant" });
  mocks.getConfiguredSapTenants.mockReturnValue([TENANT]);
  mocks.getSapTenant.mockReturnValue(TENANT);
  mocks.getDynamicOdataServices.mockResolvedValue([{ key: "svc", label: "S", scenario: "", path: "/p", domain: "" }]);
  mocks.probeTenantCapabilities.mockResolvedValue([{ service: "svc", exposed: true, status: 200 }]);
  mocks.summarize.mockReturnValue({ tenant: "ABeam TDD", published: 2, exposed: 1, notActivated: 1, byStatus: { "200": 1, "403": 1 }, rows: [] });
  mocks.auditCapabilityProbe.mockResolvedValue(undefined);
  mocks.resolveSapConnection.mockResolvedValue(null);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
});

describe("GET /api/sap/tdd/capabilities", () => {
  it("400 on an unknown product", async () => {
    mocks.getSapProduct.mockReturnValue(null);
    const res = await GET(makeRequest("product=nope"));
    expect(res.status).toBe(400);
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
  });

  it("401 when public access is off and there is no user", async () => {
    mocks.isSapTddPublicAccessEnabled.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mocks.getDynamicOdataServices).not.toHaveBeenCalled();
  });

  it("400 when no tenant is configured", async () => {
    mocks.getConfiguredSapTenants.mockReturnValue([]);
    mocks.getSapTenant.mockReturnValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns a note only when there are NO probeable services (curated + catalogue both empty)", async () => {
    mocks.getSapProduct.mockReturnValue({ ...PRODUCT, services: [] });
    mocks.getDynamicOdataServices.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary).toBeNull();
    expect(body.data.note).toContain("import the catalogue");
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
    expect(mocks.auditCapabilityProbe).not.toHaveBeenCalled();
  });

  it("still probes the curated set (catalogueImported=false) when the catalogue is empty", async () => {
    mocks.getDynamicOdataServices.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.catalogueImported).toBe(false);
    expect(mocks.probeTenantCapabilities).toHaveBeenCalledOnce();
    // Probed the curated service (real mergeProbeTargets was used).
    const probed = mocks.probeTenantCapabilities.mock.calls[0]![2];
    expect(probed[0].path).toBe(CURATED.path);
  });

  it("happy path: probes curated-first, returns the summary, and writes an audit entry", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ tenant: "ABeam TDD", exposed: 1, catalogueImported: true });
    expect(body.data.byStatus).toEqual({ "200": 1, "403": 1 });
    // Curated service is probed first, then the catalogue top-up.
    const probed = mocks.probeTenantCapabilities.mock.calls[0]![2];
    expect(probed[0].path).toBe(CURATED.path);
    expect(probed.map((s: { path: string }) => s.path)).toContain("/p");
    expect(mocks.auditCapabilityProbe).toHaveBeenCalledOnce();
    const [prod, summary, actor] = mocks.auditCapabilityProbe.mock.calls[0]!;
    expect(prod).toMatchObject({ key: "s4hana" });
    expect(summary.tenant).toBe("ABeam TDD");
    expect(actor).toMatchObject({ email: "a@b.co", role: "consultant" });
  });

  it("still returns 200 if the audit write fails (best-effort)", async () => {
    mocks.auditCapabilityProbe.mockRejectedValue(new Error("audit sink down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.exposed).toBe(1);
  });
});

describe("GET /api/sap/tdd/capabilities — the console ceiling and the console row (A24)", () => {
  const CONSULTANT = { id: "u1", email: "a@b.co", role: "consultant", organizationId: "org-a" };
  const connection = (environment: string | null) => ({
    id: "conn-prod",
    key: "x5m-prod",
    label: "X5M PROD",
    baseUrl: "https://x5m.example",
    environment,
  });
  const auditRows = () => mocks.auditCreate.mock.calls.map((c) => c[0].data);

  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
    mocks.getSapTenant.mockReturnValue(null); // "x5m-prod" is not a deployment key
  });

  it("refuses an organization's PROD connection with no approved PROD grant — no probe leaves", async () => {
    // The audit's trigger: /entities answers 403 NO_APPROVED_GRANT here, and
    // this route returned the same system's service list and CRUD map.
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    const res = await GET(makeRequest("product=s4hana&tenant=x5m-prod"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("declared PROD");
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
    expect(mocks.grantFindMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", environment: "PROD" });
    expect(auditRows()).toEqual([
      expect.objectContaining({
        organizationId: "org-a",
        actorUserId: "u1",
        externalId: "-capabilities-",
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
    const res = await GET(makeRequest("product=s4hana&tenant=x5m-prod"));
    expect(res.status).toBe(403);
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
  });

  it("reads PROD under a live approved grant, recording the fan-out as one row", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    mocks.grantFindMany.mockResolvedValue([{ decision: "APPROVED", expiresAt: null, revokedAt: null }]);
    mocks.probeTenantCapabilities.mockResolvedValue([
      { service: "po", exposed: true, status: 200 },
      { service: "svc", exposed: false, status: 403 },
    ]);
    const res = await GET(makeRequest("product=s4hana&tenant=x5m-prod"));
    expect(res.status).toBe(200);
    expect(auditRows()).toEqual([
      expect.objectContaining({ externalId: "-capabilities-", status: 200, rowCount: 2, connectionEnvironment: "PROD" }),
    ]);
  });

  it("reads a DEV connection without a grant, and still records it", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("DEV"));
    const res = await GET(makeRequest("product=s4hana&tenant=x5m-prod"));
    expect(res.status).toBe(200);
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([expect.objectContaining({ status: 200, rowCount: 1, environment: "DEV" })]);
  });

  it("records a read of the deployment tenant, which has no landscape to cap", async () => {
    mocks.getSapTenant.mockReturnValue(TENANT);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([
      expect.objectContaining({ environment: "deployment:default", connectionId: null, status: 200, rowCount: 1 }),
    ]);
  });
});
