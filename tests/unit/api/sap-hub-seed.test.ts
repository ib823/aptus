import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  apiFindMany: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
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
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "a", email: "a@b.co", role: "platform_admin" } });
  mocks.apiFindMany.mockResolvedValue(API_ROWS);
  mocks.upsert.mockResolvedValue({});
  mocks.count.mockResolvedValue(API_ROWS.length);
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

  it("projects public SapApiReference rows into SapHubContent as contentType=API (idempotent)", async () => {
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ imported: 2, source: "SapApiReference" });

    // Only public references are queried.
    expect(mocks.apiFindMany.mock.calls[0]![0].where).toMatchObject({ appliesToPublic: true });
    // Upsert keyed by (contentType=API, externalId=apiId), projecting real fields.
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    const first = mocks.upsert.mock.calls[0]![0];
    expect(first.where.contentType_externalId).toEqual({ contentType: "API", externalId: "API_PURCHASEORDER_PROCESS_SRV" });
    expect(first.create).toMatchObject({ title: "Purchase Order", apiType: "ODATAV2", communicationScenarios: ["SAP_COM_0053"], scopeItemCodes: ["J60"], hubUrl: expect.stringContaining("api.sap.com") });

    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({ action: "SAP_HUB_SEED_IMPORTED", newValue: expect.objectContaining({ source: "SapApiReference" }) });
  });
});
