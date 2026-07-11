import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  apiFindMany: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
  scopeItemFindMany: vi.fn(),
  catalogFindFirst: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapApiReference: { findMany: mocks.apiFindMany },
    sapHubContent: { upsert: mocks.upsert, count: mocks.count },
    scopeItem: { findMany: mocks.scopeItemFindMany },
    scopeCatalogVersion: { findFirst: mocks.catalogFindFirst },
  },
}));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));

const { POST } = await import("@/app/api/sap/tdd/hub-content/seed/route");

function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const API_ROWS = [
  { apiId: "API_PURCHASEORDER_PROCESS_SRV", apiName: "Purchase Order", description: "POs", status: "Active", category: "Procurement", apiType: "ODATAV2", communicationScenarios: ["SAP_COM_0053"], scopeItemCodes: ["J60"], apiHubUrl: "https://api.sap.com/api/API_PURCHASEORDER_PROCESS_SRV" },
  { apiId: "API_BUSINESS_PARTNER", apiName: "Business Partner", description: "BP", status: "Active", category: "Master Data", apiType: "ODATAV2", communicationScenarios: [], scopeItemCodes: [], apiHubUrl: "https://api.sap.com/api/API_BUSINESS_PARTNER" },
  // apiType null in the source → backfilled from the id convention (_SRV → V2).
  { apiId: "API_BILLING_DOCUMENT_SRV", apiName: "Billing Document", description: "", status: "Active", category: null, apiType: null, communicationScenarios: [], scopeItemCodes: [], apiHubUrl: "https://api.sap.com/api/API_BILLING_DOCUMENT_SRV" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "a", email: "a@b.co", role: "platform_admin" } });
  mocks.apiFindMany.mockResolvedValue(API_ROWS);
  mocks.upsert.mockResolvedValue({});
  mocks.count.mockResolvedValue(API_ROWS.length);
  mocks.catalogFindFirst.mockResolvedValue({ id: "cv-public" });
  mocks.scopeItemFindMany.mockResolvedValue([{ scopeCode: "J60", functionalArea: "Sourcing and Procurement" }]);
});

describe("POST /api/sap/tdd/hub-content/seed (rebuild from SapApiReference)", () => {
  it("refuses a non-admin", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: 401 });
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE" }));
    expect(res.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.apiFindMany).not.toHaveBeenCalled();
  });

  it("400 without the confirmation phrase", async () => {
    const res = await POST(makeRequest({ confirmation: "nope" }));
    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("projects public SapApiReference rows + injects curated services, with real LoB", async () => {
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ imported: 3, source: "SapApiReference" });
    // Curated S4HANA_SERVICES (real getSapProduct) injected on top.
    expect(body.data.injected).toBeGreaterThanOrEqual(5);
    expect(mocks.upsert.mock.calls.length).toBeGreaterThanOrEqual(3 + 5);

    // Real LoB derived: PO row has scope J60 → functionalArea "Sourcing and Procurement".
    const poCreate = mocks.upsert.mock.calls[0]![0].create;
    expect(mocks.upsert.mock.calls[0]![0].where.contentType_externalId).toEqual({ contentType: "API", externalId: "API_PURCHASEORDER_PROCESS_SRV" });
    expect(poCreate.packageId).toBe("Sourcing and Procurement");
    // BP row has no scope codes → keyword classifier → Master Data.
    const bpCreate = mocks.upsert.mock.calls[1]![0].create;
    expect(bpCreate.packageId).toBe("Master Data");
    // Billing row: apiType null in source → backfilled to ODATAV2 (_SRV); LoB → Sales.
    const billingCreate = mocks.upsert.mock.calls[2]![0].create;
    expect(billingCreate.apiType).toBe("ODATAV2");
    expect(billingCreate.packageId).toBe("Sales");
    expect(body.data.apiTypeBackfilled).toBe(1);

    expect(body.data.byLob).toBeTruthy();
    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({ action: "SAP_HUB_SEED_IMPORTED" });
  });
});
