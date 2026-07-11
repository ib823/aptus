import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSapProduct: vi.fn(),
  isSapTddPublicAccessEnabled: vi.fn(),
  getConfiguredSapTenants: vi.fn(),
  getSapTenant: vi.fn(),
  probeTenantCapabilities: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapHubContent: { count: mocks.count, findMany: mocks.findMany, groupBy: mocks.groupBy } },
}));
vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapProduct: mocks.getSapProduct,
  isSapTddPublicAccessEnabled: mocks.isSapTddPublicAccessEnabled,
  getConfiguredSapTenants: mocks.getConfiguredSapTenants,
  getSapTenant: mocks.getSapTenant,
}));
vi.mock("@/lib/sap-public/capability-probe", () => ({ probeTenantCapabilities: mocks.probeTenantCapabilities }));

const { GET } = await import("@/app/api/sap/tdd/hub-content/route");

const PRODUCT = { key: "s4hana", label: "S/4HANA Cloud", envPrefix: "S4_TDD", services: [] };
const TENANT = { key: "default", label: "ABeam TDD", baseUrl: "https://x.example" };
const API_ROW = { contentType: "API", apiType: "ODATAV2", externalId: "API_PO", title: "PO", packageId: "Proc", communicationScenarios: ["SAP_COM_0053"] };
const CDS_ROW = { contentType: "CDS_VIEW", apiType: "ODATAV2", externalId: "C_VIEW", title: "View", packageId: "Sales", communicationScenarios: [] };
const PAGE_ROWS = [
  { id: "1", contentType: "API", externalId: "API_PO", title: "PO", description: "", packageId: "Proc", apiType: "ODATAV2", communicationScenarios: ["SAP_COM_0053"], itemCount: null, hubUrl: "u" },
  { id: "2", contentType: "EVENT", externalId: "CE_X", title: "Ev", description: "", packageId: null, apiType: null, communicationScenarios: [], itemCount: null, hubUrl: "u" },
  { id: "3", contentType: "BADI", externalId: "BADI_X", title: "BAdI", description: "", packageId: null, apiType: null, communicationScenarios: [], itemCount: 1665, hubUrl: "u" },
];
const GROUPED = [
  { contentType: "API", _count: { _all: 5 } },
  { contentType: "EVENT", _count: { _all: 5 } },
  { contentType: "BADI", _count: { _all: 1 } },
];

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
  mocks.probeTenantCapabilities.mockResolvedValue([{ service: "API_PO", exposed: true, status: 200 }]);
  // totalRows (no AND) → 40; page total (AND filter) → PAGE_ROWS.length
  mocks.count.mockImplementation((args: { where?: { AND?: unknown } }) => Promise.resolve(args.where?.AND ? PAGE_ROWS.length : 40));
  // probe queries: apiType V2 → V2 rows, apiType V4 → V4 rows; page query (AND) → page rows
  mocks.findMany.mockImplementation((args: { where?: { apiType?: string } }) => {
    if (args.where?.apiType === "ODATAV2") return Promise.resolve([API_ROW, CDS_ROW]);
    if (args.where?.apiType === "ODATAV4") return Promise.resolve([]);
    return Promise.resolve(PAGE_ROWS);
  });
  mocks.groupBy.mockResolvedValue(GROUPED);
});

describe("GET /api/sap/tdd/hub-content", () => {
  it("400 on an unknown product", async () => {
    mocks.getSapProduct.mockReturnValue(null);
    expect((await GET(makeRequest("product=nope"))).status).toBe(400);
  });

  it("401 when public access is off and there is no user", async () => {
    mocks.isSapTddPublicAccessEnabled.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(makeRequest())).status).toBe(401);
  });

  it("returns an import note when the catalogue is empty", async () => {
    mocks.count.mockResolvedValueOnce(0); // totalRows
    const body = await (await GET(makeRequest())).json();
    expect(body.data.note).toContain("sap:hub:import");
    expect(body.data.catalogueImported).toBe(false);
    expect(body.data.items).toEqual([]);
  });

  it("happy path: resolves honest badges (probed 200 → ACTIVATED) and counts", async () => {
    const body = await (await GET(makeRequest())).json();
    const byId = Object.fromEntries(body.data.items.map((i: { externalId: string; status: string }) => [i.externalId, i.status]));
    expect(byId).toEqual({ API_PO: "ACTIVATED", CE_X: "AVAILABLE", BADI_X: "REFERENCE" });
    // runtime 10 (API5+EVENT5); EVENTs(5)→AVAILABLE; probeable runtime 5, of which
    // 1 activated → 4 NOT_CHECKED (beyond the 2-target probe); reference 1.
    expect(body.data.counts.byStatus).toEqual({ ACTIVATED: 1, NEEDS_SETUP: 0, NOT_FOUND: 0, NOT_CHECKED: 4, AVAILABLE: 5, REFERENCE: 1 });
    expect(body.data.counts.byType).toEqual({ API: 5, EVENT: 5, BADI: 1 });
    expect(body.data.counts.probed).toBe(2); // API_PO + C_VIEW merged targets
    expect(body.data.tenant).toBe("ABeam TDD");
  });

  it("curated-first identity: a service exposed via the curated set marks its row ACTIVATED even when it's NOT in the alphabetical probe window", async () => {
    // Curated service (key 'purchase-orders') whose path → apiId API_PO.
    mocks.getSapProduct.mockReturnValue({
      ...PRODUCT,
      services: [{ key: "purchase-orders", label: "PO", scenario: "SAP_COM_0053", path: "/sap/opu/odata/sap/API_PO", domain: "Sourcing and Procurement" }],
    });
    // Dynamic window does NOT contain API_PO (alphabetically late) — only API_ZZZ.
    mocks.findMany.mockImplementation((args: { where?: { apiType?: string } }) => {
      if (args.where?.apiType === "ODATAV2")
        return Promise.resolve([{ contentType: "API", apiType: "ODATAV2", externalId: "API_ZZZ", title: "Z", packageId: null, communicationScenarios: [] }]);
      if (args.where?.apiType === "ODATAV4") return Promise.resolve([]);
      return Promise.resolve(PAGE_ROWS);
    });
    // The curated probe finds API_PO exposed (result.service == apiId).
    mocks.probeTenantCapabilities.mockResolvedValue([{ service: "API_PO", exposed: true, status: 200 }]);
    const body = await (await GET(makeRequest())).json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED"); // matched by externalId == apiId (last path segment)
    expect(body.data.counts.byStatus.ACTIVATED).toBe(1);
  });

  it("an active CDS view (probed 200) → ACTIVATED; an EVENT stays AVAILABLE(subscribe)", async () => {
    mocks.probeTenantCapabilities.mockResolvedValue([{ service: "C_VIEW", exposed: true, status: 200 }]);
    mocks.findMany.mockImplementation((args: { where?: { apiType?: string } }) => {
      if (args.where?.apiType === "ODATAV2") return Promise.resolve([API_ROW, CDS_ROW]);
      if (args.where?.apiType === "ODATAV4") return Promise.resolve([]);
      return Promise.resolve([
        { id: "c", contentType: "CDS_VIEW", externalId: "C_VIEW", title: "View", description: "", packageId: "Sales", apiType: "ODATAV2", communicationScenarios: [], itemCount: null, hubUrl: "u" },
        { id: "e", contentType: "EVENT", externalId: "CE_X", title: "Ev", description: "", packageId: null, apiType: null, communicationScenarios: [], itemCount: null, hubUrl: "u" },
      ]);
    });
    const body = await (await GET(makeRequest())).json();
    const byId = Object.fromEntries(body.data.items.map((i: { externalId: string; status: string }) => [i.externalId, i.status]));
    expect(byId).toEqual({ C_VIEW: "ACTIVATED", CE_X: "AVAILABLE" });
    const ev = body.data.items.find((i: { externalId: string }) => i.externalId === "CE_X");
    expect(ev.availabilityNote).toBe("subscribe");
  });

  it("a best-effort V4 service that returns a live 200 → ACTIVATED", async () => {
    mocks.findMany.mockImplementation((args: { where?: { apiType?: string } }) => {
      if (args.where?.apiType === "ODATAV2") return Promise.resolve([]);
      if (args.where?.apiType === "ODATAV4")
        return Promise.resolve([{ contentType: "API", apiType: "ODATAV4", externalId: "CE_BANK_0003", title: "Bank", packageId: "Master Data", communicationScenarios: [] }]);
      return Promise.resolve([
        { id: "v", contentType: "API", externalId: "CE_BANK_0003", title: "Bank", description: "", packageId: "Master Data", apiType: "ODATAV4", communicationScenarios: [], itemCount: null, hubUrl: "u" },
      ]);
    });
    mocks.probeTenantCapabilities.mockResolvedValue([{ service: "CE_BANK_0003", exposed: true, status: 200 }]);
    const body = await (await GET(makeRequest())).json();
    const v4 = body.data.items.find((i: { externalId: string }) => i.externalId === "CE_BANK_0003");
    expect(v4.status).toBe("ACTIVATED");
    expect(body.data.counts.byStatus.ACTIVATED).toBe(1);
  });

  it("probed 403 → NEEDS_SETUP (confirmed negative), never ACTIVATED", async () => {
    mocks.probeTenantCapabilities.mockResolvedValue([{ service: "API_PO", exposed: false, status: 403 }]);
    const body = await (await GET(makeRequest())).json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NEEDS_SETUP");
    expect(body.data.counts.byStatus.ACTIVATED).toBe(0);
    expect(body.data.counts.byStatus.NEEDS_SETUP).toBe(1);
  });

  it("a runtime service beyond the probe window → NOT_CHECKED (never a fabricated Needs setup)", async () => {
    // Only C_VIEW gets a live 200; API_PO is un-probed → must be NOT_CHECKED, not a
    // metadata-inferred 'Needs setup'. This is the list-vs-detail contradiction fix.
    mocks.probeTenantCapabilities.mockResolvedValue([{ service: "C_VIEW", exposed: true, status: 200 }]);
    const body = await (await GET(makeRequest())).json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NOT_CHECKED");
  });

  it("passes a contentType filter through to the query", async () => {
    await GET(makeRequest("product=s4hana&contentType=EVENT"));
    const pageCall = mocks.findMany.mock.calls.find((c) => (c[0] as { where?: { AND?: unknown } }).where?.AND);
    const and = (pageCall![0] as { where: { AND: Array<Record<string, unknown>> } }).where.AND;
    expect(and).toContainEqual({ contentType: "EVENT" });
  });

  it("status=REFERENCE filters to reference content types in SQL", async () => {
    await GET(makeRequest("product=s4hana&status=REFERENCE"));
    const pageCall = mocks.findMany.mock.calls.find((c) => (c[0] as { where?: { AND?: unknown } }).where?.AND);
    const and = (pageCall![0] as { where: { AND: Array<{ contentType?: { in?: string[] } }> } }).where.AND;
    const refClause = and.find((c) => c.contentType?.in);
    expect(refClause!.contentType!.in).toContain("BADI");
    expect(refClause!.contentType!.in).not.toContain("API");
  });
});
