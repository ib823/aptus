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
  // real (pure) derivation — the route uses it to attach read/write to probed rows.
  deriveReadWrite: (entities: Array<{ readable: boolean; creatable: boolean | null; updatable: boolean | null; deletable: boolean | null }>) => ({
    read: entities.some((e) => e.readable),
    write: entities.some((e) => e.creatable === true || e.updatable === true || e.deletable === true),
  }),
}));
vi.mock("@/lib/sap-public/capability-probe", () => ({ probeTenantCapabilities: mocks.probeTenantCapabilities }));

const { GET } = await import("@/app/api/sap/tdd/hub-content/route");

const PRODUCT = { key: "s4hana", label: "S/4HANA Cloud", envPrefix: "S4_TDD", edition: "PUBLIC", services: [] };
const TENANT = { key: "default", label: "ABeam TDD", baseUrl: "https://x.example" };

// Status now derives from the PERSISTED probe on rawMetadataJson.probe, read for
// the whole catalogue (allRows). The live probe only runs as an opt-in overlay.
const stored = (http: number, read = false, write = false) => ({
  source: "s",
  probe: { http, at: "2026-02-02T00:00:00Z", read, write },
});
// Classification set (allRows): drives byStatus + the paged items' status.
const ALL_ROWS = [
  { externalId: "API_PO", contentType: "API", apiType: "ODATAV2", rawMetadataJson: stored(200, true, true) }, // → ACTIVATED
  { externalId: "C_VIEW", contentType: "CDS_VIEW", apiType: "ODATAV2", rawMetadataJson: { source: "s" } }, // probeable, no probe → NOT_CHECKED
  { externalId: "SOAP_IN", contentType: "API", apiType: "SOAP", rawMetadataJson: { source: "s" } }, // no OData → NOT_PROBEABLE
  { externalId: "CE_X", contentType: "EVENT", apiType: null, rawMetadataJson: null }, // → AVAILABLE
  { externalId: "BADI_X", contentType: "BADI", apiType: null, rawMetadataJson: null }, // → REFERENCE
  // 2608 WS3: SAP-deprecated and STILL answering 200 on the tenant → DEPRECATED, never ACTIVATED.
  { externalId: "API_OLD", contentType: "API", apiType: "ODATAV2", hubState: "DEPRECATED", successorExternalId: "API_NEW", rawMetadataJson: stored(200, true, true) },
];
const PAGE_ROWS = [
  { id: "1", contentType: "API", externalId: "API_PO", title: "PO", description: "", packageId: "Proc", apiType: "ODATAV2", communicationScenarios: ["SAP_COM_0053"], itemCount: null, hubUrl: "u" },
  { id: "2", contentType: "EVENT", externalId: "CE_X", title: "Ev", description: "", packageId: null, apiType: null, communicationScenarios: [], itemCount: null, hubUrl: "u" },
  { id: "3", contentType: "BADI", externalId: "BADI_X", title: "BAdI", description: "", packageId: null, apiType: null, communicationScenarios: [], itemCount: 1665, hubUrl: "u" },
  { id: "4", contentType: "API", externalId: "API_OLD", title: "Old", description: "", packageId: "Proc", apiType: "ODATAV2", communicationScenarios: [], itemCount: null, hubUrl: "u", hubState: "DEPRECATED", hubVersion: "2608", successorExternalId: "API_NEW", rawMetadataJson: stored(200, true, true) },
];
const GROUPED = [
  { contentType: "API", _count: { _all: 5 } },
  { contentType: "EVENT", _count: { _all: 5 } },
  { contentType: "BADI", _count: { _all: 1 } },
];

function makeRequest(query = "product=s4hana"): Parameters<typeof GET>[0] {
  return { nextUrl: { searchParams: new URLSearchParams(query) } } as Parameters<typeof GET>[0];
}

/** Set the persisted probe for a row in ALL_ROWS (drives status without a live probe). */
function setStored(externalId: string, raw: unknown): void {
  const row = ALL_ROWS.find((r) => r.externalId === externalId);
  if (row) (row as { rawMetadataJson: unknown }).rawMetadataJson = raw;
}

beforeEach(() => {
  vi.clearAllMocks();
  // reset the mutable stored fixtures each test
  setStored("API_PO", stored(200, true, true));
  mocks.getSapProduct.mockReturnValue(PRODUCT);
  mocks.isSapTddPublicAccessEnabled.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue({ email: "a@b.co", role: "consultant" });
  mocks.getConfiguredSapTenants.mockReturnValue([TENANT]);
  mocks.getSapTenant.mockReturnValue(TENANT);
  mocks.probeTenantCapabilities.mockResolvedValue([{ service: "API_PO", exposed: true, status: 200 }]);
  // totalRows (no AND) → 40; page total (AND filter) → PAGE_ROWS.length
  mocks.count.mockImplementation((args: { where?: { AND?: unknown } }) => Promise.resolve(args.where?.AND ? PAGE_ROWS.length : 40));
  // findMany routing: paged (AND) → items; apiType (dataProbe overlay) → V2/V4; else (allRows) → classification set.
  mocks.findMany.mockImplementation((args: { where?: { apiType?: string; AND?: unknown } }) => {
    if (args.where?.AND) return Promise.resolve(PAGE_ROWS);
    if (args.where?.apiType === "ODATAV2") return Promise.resolve([{ contentType: "API", apiType: "ODATAV2", externalId: "API_PO", title: "PO", packageId: "Proc", communicationScenarios: ["SAP_COM_0053"] }]);
    if (args.where?.apiType === "ODATAV4") return Promise.resolve([]);
    return Promise.resolve(ALL_ROWS);
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

  it("happy path: STORED probe drives honest badges + counts (incl. NOT_PROBEABLE)", async () => {
    const body = await (await GET(makeRequest())).json();
    const byId = Object.fromEntries(body.data.items.map((i: { externalId: string; status: string }) => [i.externalId, i.status]));
    expect(byId).toEqual({ API_PO: "ACTIVATED", CE_X: "AVAILABLE", BADI_X: "REFERENCE", API_OLD: "DEPRECATED" });
    // The deprecated row carries SAP's successor and its Hub State/Version for the badge tooltip.
    const old = body.data.items.find((i: { externalId: string }) => i.externalId === "API_OLD");
    expect(old).toMatchObject({ hubState: "DEPRECATED", hubVersion: "2608", successorExternalId: "API_NEW" });
    // Classified over the 6 allRows: 1 ACTIVATED (stored 200), 1 NOT_CHECKED
    // (probeable C_VIEW, no probe), 1 NOT_PROBEABLE (SOAP), 1 AVAILABLE (event),
    // 1 REFERENCE, 1 DEPRECATED (stored 200 but SAP-retired — not ACTIVATED).
    expect(body.data.counts.byStatus).toEqual({
      ACTIVATED: 1, NEEDS_SETUP: 0, NOT_FOUND: 0, NOT_CHECKED: 1, NOT_PROBEABLE: 1, AVAILABLE: 1, REFERENCE: 1, DEPRECATED: 1,
    });
    // Tiles: deprecated items per type, from the same rows.
    expect(body.data.counts.byTypeDeprecated.API).toBe(1);
    expect(body.data.counts.byTypeDeprecated.EVENT).toBe(0);
    // Sums to the full set.
    expect(Object.values(body.data.counts.byStatus).reduce((a: number, b) => a + (b as number), 0)).toBe(ALL_ROWS.length);
    // byType still emits all 12 keys from the groupBy.
    expect(Object.keys(body.data.counts.byType)).toHaveLength(12);
    expect(body.data.counts.byType.API).toBe(5);
    expect(body.data.counts.probed).toBe(2); // API_PO + API_OLD carry a stored http
    expect(body.data.counts.lastProbedAt).toBe("2026-02-02T00:00:00Z");
    expect(body.data.tenant).toBe("ABeam TDD");
  });

  it("default load reads STORED probe only — no per-request tenant hammering", async () => {
    await GET(makeRequest());
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
  });

  it("attaches STORED read/write to probed rows; un-probed rows carry none", async () => {
    const body = await (await GET(makeRequest())).json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.capability).toEqual({ read: true, write: true }); // from stored probe
    const ev = body.data.items.find((i: { externalId: string }) => i.externalId === "CE_X");
    expect(ev.capability).toBeNull();
  });

  it("stored 403 → NEEDS_SETUP; stored 404 → NOT_FOUND", async () => {
    setStored("API_PO", stored(403));
    let po = (await (await GET(makeRequest())).json()).data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NEEDS_SETUP");
    setStored("API_PO", stored(404));
    po = (await (await GET(makeRequest())).json()).data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NOT_FOUND");
  });

  it("probeable but no stored probe → NOT_CHECKED; SOAP/no-endpoint → NOT_PROBEABLE", async () => {
    const body = await (await GET(makeRequest())).json();
    // paged items include only API_PO/CE_X/BADI_X, so assert via the counts + a filtered fetch.
    expect(body.data.counts.byStatus.NOT_CHECKED).toBe(1); // C_VIEW
    expect(body.data.counts.byStatus.NOT_PROBEABLE).toBe(1); // SOAP_IN
  });

  it("dataProbe=1 runs the LIVE overlay (which wins) and data-confirms", async () => {
    setStored("API_PO", stored(403)); // stored says NEEDS_SETUP…
    mocks.probeTenantCapabilities.mockResolvedValue([
      { service: "API_PO", exposed: true, status: 200, dataConfirmed: true, entities: [{ name: "A", readable: true, creatable: true, updatable: null, deletable: null, pageable: null }] },
    ]);
    const body = await (await GET(makeRequest("product=s4hana&dataProbe=1"))).json();
    expect(mocks.probeTenantCapabilities).toHaveBeenCalled();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED"); // …but the live overlay (200) wins
    expect(po.dataConfirmed).toBe(true);
  });

  it("passes a contentType filter through to the query", async () => {
    await GET(makeRequest("product=s4hana&contentType=EVENT"));
    const pageCall = mocks.findMany.mock.calls.find((c) => (c[0] as { where?: { AND?: unknown } }).where?.AND);
    const and = (pageCall![0] as { where: { AND: Array<Record<string, unknown>> } }).where.AND;
    expect(and).toContainEqual({ contentType: "EVENT" });
  });

  it("status filter pre-filters the page by the classified externalId set", async () => {
    await GET(makeRequest("product=s4hana&status=REFERENCE"));
    const pageCall = mocks.findMany.mock.calls.find((c) => (c[0] as { where?: { AND?: unknown } }).where?.AND);
    const and = (pageCall![0] as { where: { AND: Array<{ externalId?: { in?: string[] } }> } }).where.AND;
    const clause = and.find((c) => c.externalId?.in);
    expect(clause!.externalId!.in).toContain("BADI_X"); // the only REFERENCE row
    expect(clause!.externalId!.in).not.toContain("API_PO");
  });

  it("the response is Cache-Control: no-store (never cached/stale)", async () => {
    const res = await GET(makeRequest());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("status is per REQUESTED tenant — one tenant's activation never leaks to another", async () => {
    // API_PO has a probe ONLY for 'customizing'; 'development' was never probed.
    setStored("API_PO", { source: "s", probes: { customizing: { http: 200, at: "2026-07-11T14:20:51Z", read: true, write: true } } });
    mocks.getConfiguredSapTenants.mockReturnValue([
      { key: "customizing", label: "Customizing X5M/100", baseUrl: "https://c.example" },
      { key: "development", label: "Development X5M/080", baseUrl: "https://d.example" },
    ]);
    mocks.getSapTenant.mockImplementation((_p: string, key: string) => ({ key, label: key, baseUrl: "https://x.example" }));

    // customizing → ACTIVATED (its own probe)
    let po = (await (await GET(makeRequest("product=s4hana&tenant=customizing"))).json()).data.items
      .find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED");

    // development → NOT_CHECKED (probeable but not probed for THIS tenant) — NOT ACTIVATED
    const devBody = (await (await GET(makeRequest("product=s4hana&tenant=development"))).json()).data;
    po = devBody.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NOT_CHECKED");
    expect(po.capability).toBeNull();
    expect(devBody.counts.byStatus.ACTIVATED).toBe(0);
    expect(devBody.counts.lastProbedAt).toBeNull();
  });

  it("legacy singular probe still resolves for the DEFAULT tenant (data preserved)", async () => {
    // A row migrated implicitly: legacy `probe`, no `probes` map. Default tenant sees it.
    setStored("API_PO", { source: "s", probe: { http: 200, at: "2026-07-11T14:20:51Z", read: true, write: true } });
    // default tenant = getConfiguredSapTenants[0] = "default" (from beforeEach)
    const po = (await (await GET(makeRequest())).json()).data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED");
  });
});
