import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  getSapProduct: vi.fn(),
  getConfiguredSapTenants: vi.fn(),
  getSapTenant: vi.fn(),
  probeService: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { sapHubContent: { findMany: mocks.findMany, update: mocks.update } } }));
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

const { POST } = await import("@/app/api/sap/tdd/hub-content/probe-all/route");

function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const PRODUCT = { key: "s4hana", label: "S/4HANA Cloud", envPrefix: "S4_TDD", services: [] };
const TENANT = { key: "default", label: "ABeam TDD", baseUrl: "https://x.example" };
const PROBEABLE_ROWS = [
  { id: "1", externalId: "API_PO", contentType: "API", apiType: "ODATAV2", title: "PO", packageId: "Proc", communicationScenarios: [], rawMetadataJson: { source: "SapApiReference", apiId: "API_PO" } },
  { id: "2", externalId: "C_VIEW", contentType: "CDS_VIEW", apiType: "ODATAV2", title: "View", packageId: "Sales", communicationScenarios: [], rawMetadataJson: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "a", email: "a@b.co", role: "platform_admin" } });
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
  it("refuses a non-admin", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: 401 });
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(401);
    expect(mocks.probeService).not.toHaveBeenCalled();
  });

  it("400 without the confirmation phrase", async () => {
    const res = await POST(makeRequest({ confirmation: "nope" }));
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("probes every probeable row and PERSISTS the result by MERGING rawMetadataJson", async () => {
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.probed).toBe(2);
    expect(body.data.byOutcome).toMatchObject({ ACTIVATED: 1, NEEDS_SETUP: 1 });

    // API_PO update MERGES probe onto the existing keys (source/apiId preserved).
    const poCall = mocks.update.mock.calls.find((c) => c[0].where.id === "1")!;
    const raw = poCall[0].data.rawMetadataJson;
    expect(raw.source).toBe("SapApiReference"); // preserved
    expect(raw.apiId).toBe("API_PO"); // preserved
    expect(raw.probe.http).toBe(200);
    expect(raw.probe.read).toBe(true);
    expect(raw.probe.write).toBe(true); // creatable ⇒ write
    expect(typeof raw.probe.at).toBe("string");

    // C_VIEW (403) persisted with read/write false and a probe block even w/ null existing.
    const cvCall = mocks.update.mock.calls.find((c) => c[0].where.id === "2")!;
    expect(cvCall[0].data.rawMetadataJson.probe.http).toBe(403);

    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({ action: "SAP_HUB_PROBED_ALL" });
  });

  it("400 when no tenant is configured", async () => {
    mocks.getConfiguredSapTenants.mockReturnValue([]);
    mocks.getSapTenant.mockReturnValue(null);
    const res = await POST(makeRequest({ confirmation: "PROBE ALL SAP SERVICES" }));
    expect(res.status).toBe(400);
  });
});
