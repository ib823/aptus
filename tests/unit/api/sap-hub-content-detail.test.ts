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
  resolveSapConnection: vi.fn(),
  grantFindMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
// apiAccessGrant / northboundAuditEvent: the REAL console-read guard's grant read
// and audit write, which the live probe now goes through (audit A24).
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapHubContent: { findUnique: mocks.findUnique },
    scopeCatalogVersion: { findFirst: mocks.findFirst },
    scopeItem: { findMany: mocks.findMany },
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
  mocks.resolveSapConnection.mockResolvedValue(null);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
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

describe("the detail's live probe takes the console ceiling and leaves a row (A24)", () => {
  const CONSULTANT = { id: "u1", email: "a@b.co", role: "consultant", organizationId: "org-a" };
  const ORG_KEY = "org:org-a:s4hana:x5m-prod";
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
    // The organization's own stored verdict for this row on its PROD system.
    mocks.findUnique.mockResolvedValue({
      ...API_ITEM,
      rawMetadataJson: { probes: { [ORG_KEY]: { http: 200, at: new Date().toISOString(), read: true, write: false } } },
    });
  });

  it("refused on PROD with no grant: no live probe, the stored verdict renders, the refusal is recorded", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    const res = await GET(req("product=s4hana&tenant=x5m-prod"), ctx("1"));
    expect(res.status).toBe(200); // the browse is not failed
    const body = await res.json();
    expect(mocks.probeService).not.toHaveBeenCalled();
    expect(body.data.probeStatus).toBe(200); // from the stored probe
    expect(body.data.capability).toEqual({ read: true, write: false });
    expect(auditRows()).toEqual([
      expect.objectContaining({
        organizationId: "org-a",
        actorUserId: "u1",
        externalId: "API_PO",
        environment: "PROD",
        status: 403,
        rowCount: null,
        dryRun: true,
        connectionId: "conn-prod",
        connectionEnvironment: "PROD",
      }),
    ]);
  });

  it("probes a DEV connection without a grant and records what SAP answered", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("DEV"));
    mocks.probeService.mockResolvedValue({
      service: "API_PO", exposed: true, status: 200, ladder: "readable", entitySetCount: 3, entities: [],
    });
    const body = await (await GET(req("product=s4hana&tenant=x5m-prod"), ctx("1"))).json();
    expect(mocks.probeService).toHaveBeenCalledOnce();
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
    expect(body.data.status).toBe("ACTIVATED");
    expect(auditRows()).toEqual([
      expect.objectContaining({ externalId: "API_PO", status: 200, rowCount: 3, environment: "DEV" }),
    ]);
  });

  it("a credential CoreEdge could not obtain is not SAP's answer: the stored verdict stands, the row is a 403 (A26, A28)", async () => {
    /*
     * The probe's status 0 meant "never answered" and was audited 502 and
     * shown as this service's live status — for a request that was never
     * sent, because the connection's credential could not be built.
     */
    mocks.resolveSapConnection.mockResolvedValue(connection("DEV"));
    mocks.probeService.mockResolvedValue({
      service: "API_PO", exposed: false, status: 0, ladder: "unreachable", credentialError: "refused", error: "x",
    });
    const body = await (await GET(req("product=s4hana&tenant=x5m-prod"), ctx("1"))).json();
    expect(body.data.probeStatus).toBe(200); // the stored proof, not a live 0
    expect(body.data.status).toBe("ACTIVATED");
    expect(auditRows()).toEqual([expect.objectContaining({ externalId: "API_PO", status: 403, rowCount: null })]);
  });

  /*
   * SAP'S 429 IS NOT COREEDGE THROTTLING, here as on /preview and /operations.
   * Recorded as itself, ten expansions of a row on a tenant that rate-limits
   * $metadata raised the 'throttled' incident ("a credential is being rate
   * limited repeatedly") for a read no credential made.
   */
  it("SAP's own 429 on $metadata is recorded as 502 with HTTP_429", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("DEV"));
    mocks.probeService.mockResolvedValue({ service: "API_PO", exposed: false, status: 429, ladder: "unreachable" });
    await GET(req("product=s4hana&tenant=x5m-prod"), ctx("1"));
    expect(auditRows()).toEqual([
      expect.objectContaining({ externalId: "API_PO", status: 502, failureReason: "HTTP_429", rowCount: null }),
    ]);
  });

  it("records a deployment-tenant probe, a refusal SAP gave, and nothing for probe=0", async () => {
    mocks.getSapTenant.mockReturnValue(TENANT);
    await GET(req(), ctx("1")); // the default 404 mock
    expect(auditRows()).toEqual([
      expect.objectContaining({
        environment: "deployment:default",
        externalId: "API_PO",
        status: 404,
        failureReason: "HTTP_404",
        rowCount: null,
      }),
    ]);

    mocks.auditCreate.mockClear();
    await GET(req("product=s4hana&probe=0"), ctx("1"));
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
