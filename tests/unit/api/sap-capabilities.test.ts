import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapProduct: mocks.getSapProduct,
  isSapTddPublicAccessEnabled: mocks.isSapTddPublicAccessEnabled,
  getConfiguredSapTenants: mocks.getConfiguredSapTenants,
  getSapTenant: mocks.getSapTenant,
}));
vi.mock("@/lib/sap-public/dynamic-catalog", () => ({
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

const PRODUCT = { key: "s4hana", label: "S/4HANA Cloud", envPrefix: "S4_TDD" };
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
  mocks.summarize.mockReturnValue({ tenant: "ABeam TDD", published: 1, exposed: 1, notActivated: 0, rows: [] });
  mocks.auditCapabilityProbe.mockResolvedValue(undefined);
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

  it("returns a note (not a probe) when the catalogue is empty", async () => {
    mocks.getDynamicOdataServices.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary).toBeNull();
    expect(body.data.note).toContain("import the catalogue");
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
    expect(mocks.auditCapabilityProbe).not.toHaveBeenCalled();
  });

  it("happy path: probes, returns the summary, and writes an audit entry", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ tenant: "ABeam TDD", published: 1, exposed: 1 });
    expect(mocks.probeTenantCapabilities).toHaveBeenCalledOnce();
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
