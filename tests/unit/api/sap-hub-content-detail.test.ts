import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // SAP's communication scenario table (P1.2): no rows unless a test gives some.
  queryRaw: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
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
  verificationFindMany: vi.fn(),
  verificationUpsert: vi.fn(),
  verificationDeleteMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
// apiAccessGrant / northboundAuditEvent: the REAL console-read guard's grant read
// and audit write, which the live probe now goes through (audit A24).
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    sapHubContent: { findUnique: mocks.findUnique },
    scopeCatalogVersion: { findFirst: mocks.findFirst },
    scopeItem: { findMany: mocks.findMany },
    apiAccessGrant: { findMany: mocks.grantFindMany },
    northboundAuditEvent: { create: mocks.auditCreate },
    // P0.8: the V4 address record (a V2 item never reads or writes it).
    catalogueAddressVerification: { findMany: mocks.verificationFindMany, upsert: mocks.verificationUpsert, deleteMany: mocks.verificationDeleteMany },
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

// The edition is what makes the S/4 address rules apply (catalogueAddressFamily,
// P0.8); the real s4hana product carries it.
const PRODUCT = { key: "s4hana", label: "S/4", envPrefix: "S4_TDD", edition: "PUBLIC" };
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
  mocks.verificationFindMany.mockResolvedValue([]);
  mocks.verificationUpsert.mockResolvedValue({});
  mocks.verificationDeleteMany.mockResolvedValue({ count: 0 });
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

/*
 * P0.8 — the detail probes a row only at an address of its own, under its own
 * product's rules, and records what a V4 address answered on THIS system.
 */
describe("the detail and the catalogue's addresses (P0.8)", () => {
  const CONSULTANT = { id: "u1", email: "a@b.co", role: "consultant", organizationId: "org-a" };
  const DEV_CONNECTION = { id: "conn-dev", key: "x5m-dev", label: "X5M DEV", baseUrl: "https://x5m.example/", environment: "DEV" };
  const V4_ITEM = { ...API_ITEM, id: "4", externalId: "CE_BANK_0003", apiType: "ODATAV4", rawMetadataJson: null };
  const DERIVED = "/sap/opu/odata4/sap/ce_bank/srvd_a2x/sap/ce_bank/0003";
  const onDev = "product=s4hana&tenant=x5m-dev";

  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
    mocks.getSapTenant.mockReturnValue(null);
    mocks.resolveSapConnection.mockResolvedValue(DEV_CONNECTION);
    mocks.findUnique.mockResolvedValue(V4_ITEM);
  });

  it("a derived V4 address is 'unverified' (verifiedAt null) until a 200 is recorded", async () => {
    mocks.probeService.mockResolvedValue({ service: "CE_BANK_0003", exposed: false, status: 403, ladder: "unreachable" });
    const body = await (await GET(req(onDev), ctx("4"))).json();
    expect(body.data.address).toEqual({ path: DERIVED, protocol: "ODATAV4", basis: "derived", verifiedAt: null });
    // A 403 says nothing about whether the path exists: nothing written, nothing removed.
    expect(mocks.verificationUpsert).not.toHaveBeenCalled();
    expect(mocks.verificationDeleteMany).not.toHaveBeenCalled();
  });

  it("a live 200 records the proof for this organization's connection, and the address reads verified", async () => {
    mocks.probeService.mockResolvedValue({ service: "CE_BANK_0003", exposed: true, status: 200, ladder: "readable", entities: [] });
    const at = new Date("2026-10-20T10:00:00.000Z");
    mocks.verificationFindMany.mockResolvedValue([
      { externalId: "CE_BANK_0003", servicePath: DERIVED, verifiedAt: at, connectionId: "conn-dev", baseUrl: "https://x5m.example" },
    ]);
    const body = await (await GET(req(onDev), ctx("4"))).json();
    expect(mocks.verificationUpsert).toHaveBeenCalledOnce();
    const upsert = mocks.verificationUpsert.mock.calls[0]![0];
    expect(upsert.where).toEqual({
      organizationId_product_tenantKey_externalId: {
        organizationId: "org-a",
        product: "s4hana",
        tenantKey: "x5m-dev",
        externalId: "CE_BANK_0003",
      },
    });
    expect(upsert.create).toMatchObject({
      servicePath: DERIVED,
      connectionId: "conn-dev",
      baseUrl: "https://x5m.example", // normalized
      verifiedByUserId: "u1",
      method: "detail-probe",
    });
    expect(body.data.address).toEqual({ path: DERIVED, protocol: "ODATAV4", basis: "derived", verifiedAt: at.toISOString() });
  });

  it("a recorded 200 for another path, connection or host does not verify this address", async () => {
    mocks.probeService.mockResolvedValue({ service: "CE_BANK_0003", exposed: false, status: 403, ladder: "unreachable" });
    const at = new Date("2026-10-01T00:00:00.000Z");
    for (const stale of [
      { servicePath: "/sap/opu/odata4/sap/ce_bank_0003/srvd_a2x/sap/ce_bank_0003/0001", connectionId: "conn-dev", baseUrl: "https://x5m.example" },
      { servicePath: DERIVED, connectionId: "conn-other", baseUrl: "https://x5m.example" },
      { servicePath: DERIVED, connectionId: "conn-dev", baseUrl: "https://elsewhere.example" },
    ]) {
      mocks.verificationFindMany.mockResolvedValue([{ externalId: "CE_BANK_0003", verifiedAt: at, ...stale }]);
      const body = await (await GET(req(onDev), ctx("4"))).json();
      expect(body.data.address.verifiedAt).toBeNull();
    }
  });

  it("a live 404 at the same path withdraws an earlier proof", async () => {
    mocks.probeService.mockResolvedValue({ service: "CE_BANK_0003", exposed: false, status: 404, ladder: "unreachable" });
    await GET(req(onDev), ctx("4"));
    expect(mocks.verificationDeleteMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", product: "s4hana", tenantKey: "x5m-dev", externalId: "CE_BANK_0003", servicePath: DERIVED },
    });
  });

  it("an anonymous viewer gets the address and no verification at all", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getSapTenant.mockReturnValue(TENANT);
    const body = await (await GET(req(), ctx("4"))).json();
    expect(body.data.address).toMatchObject({ basis: "derived", verifiedAt: null });
    expect(mocks.verificationFindMany).not.toHaveBeenCalled();
  });

  it("a `sap-s4-*` wrapper row is never probed and has no address", async () => {
    mocks.findUnique.mockResolvedValue({ ...V4_ITEM, externalId: "sap-s4-CE_RETAILSEASON_0001-v1" });
    const body = await (await GET(req(onDev), ctx("4"))).json();
    expect(mocks.probeService).not.toHaveBeenCalled();
    expect(body.data.status).toBe("NOT_PROBEABLE");
    expect(body.data.address).toBeNull();
  });

  it("a SuccessFactors API is not probed at an S/4 path: its address is the /odata/v2 root", async () => {
    mocks.getSapProduct.mockReturnValue({ key: "successfactors", label: "SuccessFactors", envPrefix: "SF_TDD", edition: null });
    mocks.findUnique.mockResolvedValue({ ...API_ITEM, externalId: "PLTUserManagement", apiType: "ODATAV2" });
    const body = await (await GET(req("product=successfactors&tenant=x5m-dev"), ctx("1"))).json();
    expect(mocks.probeService).not.toHaveBeenCalled();
    expect(body.data.status).toBe("NOT_PROBEABLE");
    expect(body.data.address).toEqual({ path: "/odata/v2", protocol: "ODATAV2", basis: "product-root", verifiedAt: null });
  });
});

describe("Ask Basis for the scenario that enables the service (P1.2)", () => {
  const SCENARIO = { id: "SAP_COM_0053", name: null, direction: "Inbound", interfaceCount: 12, matched: ["API_PO_0001"], release: "2608" };

  it("a service not shown as activated gets the call to action, every scenario named", async () => {
    mocks.queryRaw.mockResolvedValueOnce([SCENARIO]);
    const body = await (await GET(req(), ctx("1"))).json();
    expect(body.data.status).toBe("NOT_FOUND");
    expect(body.data.askBasis).toMatchObject({
      action: true,
      technicalId: "API_PO_0001",
      release: "2608",
      scenarios: [{ id: "SAP_COM_0053", name: null, interfaceCount: 12 }],
    });
  });

  it("an activated one is told which scenario enables it, as information", async () => {
    mocks.probeService.mockResolvedValue({ service: "API_PO", exposed: true, status: 200, ladder: "readable", entities: [], metadataFlavor: "v2" });
    mocks.queryRaw.mockResolvedValueOnce([SCENARIO]);
    const body = await (await GET(req(), ctx("1"))).json();
    expect(body.data.askBasis.action).toBe(false);
  });

  it("a service the table does not name gets no panel, never a guess", async () => {
    const body = await (await GET(req(), ctx("1"))).json();
    expect(body.data.askBasis).toBeNull();
  });
});
