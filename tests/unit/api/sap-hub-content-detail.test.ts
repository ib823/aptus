import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSapProduct: vi.fn(),
  isSapTddPublicAccessEnabled: vi.fn(),
  getConfiguredSapTenants: vi.fn(),
  getSapTenant: vi.fn(),
  probeService: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapHubContent: { findUnique: mocks.findUnique },
    scopeCatalogVersion: { findFirst: mocks.findFirst },
    scopeItem: { findMany: mocks.findMany },
  },
}));
vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapProduct: mocks.getSapProduct,
  isSapTddPublicAccessEnabled: mocks.isSapTddPublicAccessEnabled,
  getConfiguredSapTenants: mocks.getConfiguredSapTenants,
  getSapTenant: mocks.getSapTenant,
  deriveReadWrite: (entities: Array<{ readable: boolean; creatable: boolean | null; updatable: boolean | null; deletable: boolean | null }>) => ({
    read: entities.some((e) => e.readable),
    write: entities.some((e) => e.creatable === true || e.updatable === true || e.deletable === true),
  }),
}));
vi.mock("@/lib/sap-public/capability-probe", () => ({ probeService: mocks.probeService }));

const { GET } = await import("@/app/api/sap/tdd/hub-content/[id]/route");

const PRODUCT = { key: "s4hana", label: "S/4", envPrefix: "S4_TDD" };
const TENANT = { key: "default", label: "ABeam TDD", baseUrl: "https://x.example" };
const API_ITEM = {
  id: "1", contentType: "API", externalId: "API_PO", title: "PO", description: "", packageId: "Proc",
  apiType: "ODATAV2", communicationScenarios: ["SAP_COM_0053"], scopeItemCodes: [], itemCount: null, hubUrl: "u",
};
const REF_ITEM = { ...API_ITEM, id: "2", contentType: "BADI", externalId: "BADI_X", apiType: null };

function req(query = "product=s4hana"): Parameters<typeof GET>[0] {
  return { nextUrl: { searchParams: new URLSearchParams(query) } } as Parameters<typeof GET>[0];
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSapProduct.mockReturnValue(PRODUCT);
  mocks.isSapTddPublicAccessEnabled.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue({ email: "a@b.co", role: "consultant" });
  mocks.getConfiguredSapTenants.mockReturnValue([TENANT]);
  mocks.getSapTenant.mockReturnValue(TENANT);
  mocks.findUnique.mockResolvedValue(API_ITEM);
  mocks.probeService.mockResolvedValue({ service: "API_PO", exposed: false, status: 404, ladder: "unreachable" });
});

describe("GET /api/sap/tdd/hub-content/[id]", () => {
  it("400 on unknown product", async () => {
    mocks.getSapProduct.mockReturnValue(null);
    expect((await GET(req("product=nope"), ctx("1"))).status).toBe(400);
  });

  it("401 when public access off and no user", async () => {
    mocks.isSapTddPublicAccessEnabled.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(req(), ctx("1"))).status).toBe(401);
  });

  it("404 when the item does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect((await GET(req(), ctx("999"))).status).toBe(404);
  });

  it("probed 404 → NOT_FOUND with an honest dual-cause debug hint", async () => {
    const body = await (await GET(req(), ctx("1"))).json();
    expect(body.data.status).toBe("NOT_FOUND");
    expect(body.data.probeStatus).toBe(404);
    const hint = body.data.dependencies.debugHint.toLowerCase();
    expect(hint).toContain("not activated");
    expect(hint).toContain("path");
    expect(hint).toContain("both");
  });

  it("probed 200 → ACTIVATED with the capability ladder", async () => {
    mocks.probeService.mockResolvedValue({ service: "API_PO", exposed: true, status: 200, ladder: "writable", entities: [], metadataFlavor: "v2" });
    const body = await (await GET(req(), ctx("1"))).json();
    expect(body.data.status).toBe("ACTIVATED");
    expect(body.data.ladder).toBe("writable");
    expect(body.data.metadataFlavor).toBe("v2");
  });

  it("returns capability {read,write} from the SAME derivation the list uses", async () => {
    mocks.probeService.mockResolvedValue({
      service: "API_PO", exposed: true, status: 200, ladder: "readable", metadataFlavor: "v2",
      entities: [{ name: "A", readable: true, creatable: false, updatable: true, deletable: false, pageable: null }],
    });
    const body = await (await GET(req(), ctx("1"))).json();
    expect(body.data.capability).toEqual({ read: true, write: true }); // update-only ⇒ write
  });

  it("probed 403 → NEEDS_SETUP (matches the list badge — no contradiction)", async () => {
    mocks.probeService.mockResolvedValue({ service: "API_PO", exposed: false, status: 403, ladder: "unreachable" });
    const body = await (await GET(req(), ctx("1"))).json();
    expect(body.data.status).toBe("NEEDS_SETUP");
    expect(body.data.probeStatus).toBe(403);
  });

  it("reference item → not probed, reference debug hint, REFERENCE status", async () => {
    mocks.findUnique.mockResolvedValue(REF_ITEM);
    const body = await (await GET(req(), ctx("2"))).json();
    expect(body.data.status).toBe("REFERENCE");
    expect(body.data.probeStatus).toBeNull();
    expect(mocks.probeService).not.toHaveBeenCalled();
    expect(body.data.dependencies.debugHint.toLowerCase()).toContain("reference content");
  });
});
