import { beforeEach, describe, expect, it, vi } from "vitest";

import { HUB_CONTENT_TYPES, PROBE_MAX_AGE_DAYS } from "@/lib/sap-public/hub-content";

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
  resolveSapConnection: vi.fn(),
  grantFindMany: vi.fn(),
  auditCreate: vi.fn(),
  verificationFindMany: vi.fn(),
  verificationUpsert: vi.fn(),
  verificationDeleteMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
// apiAccessGrant / northboundAuditEvent: the REAL console-read guard's grant read
// and audit write, which the live overlay now goes through (audit A24).
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapHubContent: { count: mocks.count, findMany: mocks.findMany, groupBy: mocks.groupBy },
    apiAccessGrant: { findMany: mocks.grantFindMany },
    northboundAuditEvent: { create: mocks.auditCreate },
    // P0.8: the per-tenant V4 address proofs the list reads (and the overlay writes).
    catalogueAddressVerification: {
      findMany: mocks.verificationFindMany,
      upsert: mocks.verificationUpsert,
      deleteMany: mocks.verificationDeleteMany,
    },
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
//
// FRESH, BY CONSTRUCTION. A stored probe older than PROBE_MAX_AGE_DAYS no
// longer sets a badge (isProbeStale), so a fixture pinned to a calendar date
// would silently turn every ACTIVATED expectation below into NOT_CHECKED the
// day it aged out. The fixtures are an hour old; the stale case is its own test.
const FRESH_AT = new Date(Date.now() - 3_600_000).toISOString();
const STALE_AT = new Date(Date.now() - (PROBE_MAX_AGE_DAYS + 14) * 86_400_000).toISOString();
const stored = (http: number, read = false, write = false) => ({
  source: "s",
  probe: { http, at: FRESH_AT, read, write },
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
  mocks.resolveSapConnection.mockResolvedValue(null);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
  mocks.verificationFindMany.mockResolvedValue([]);
  mocks.verificationUpsert.mockResolvedValue({});
  mocks.verificationDeleteMany.mockResolvedValue({ count: 0 });
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
      ACTIVATED: 1, NEEDS_SETUP: 0, NOT_FOUND: 0, NOT_CHECKED: 1, PROBE_FAILED: 0, NOT_PROBEABLE: 1, AVAILABLE: 1, REFERENCE: 1, DEPRECATED: 1,
    });
    // Tiles: deprecated items per type, from the same rows.
    expect(body.data.counts.byTypeDeprecated.API).toBe(1);
    expect(body.data.counts.byTypeDeprecated.EVENT).toBe(0);
    // Sums to the full set.
    expect(Object.values(body.data.counts.byStatus).reduce((a: number, b) => a + (b as number), 0)).toBe(ALL_ROWS.length);
    // byType still emits a key for every content type, whatever the rows hold.
    // 14 since 2608 WS13 added DATA_PRODUCT and INTEGRATION_ADAPTER; asserted
    // against the list rather than a literal so the next addition cannot drift.
    expect(Object.keys(body.data.counts.byType).sort()).toEqual([...HUB_CONTENT_TYPES].sort());
    expect(body.data.counts.byType.API).toBe(5);
    expect(body.data.counts.probed).toBe(2); // API_PO + API_OLD carry a stored http
    expect(body.data.counts.lastProbedAt).toBe(FRESH_AT);
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

  it("a live overlay that could not authenticate does not override the stored verdict (A28)", async () => {
    // Stored: ACTIVATED. The overlay's credential could not be obtained, so the
    // tenant was never asked; its status 0 used to win as PROBE_FAILED.
    mocks.probeTenantCapabilities.mockResolvedValue([
      { service: "API_PO", exposed: false, status: 0, ladder: "unreachable", credentialError: "refused", error: "x" },
    ]);
    const body = await (await GET(makeRequest("product=s4hana&dataProbe=1"))).json();
    expect(mocks.probeTenantCapabilities).toHaveBeenCalled();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED");
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
    setStored("API_PO", { source: "s", probes: { customizing: { http: 200, at: FRESH_AT, read: true, write: true } } });
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
    setStored("API_PO", { source: "s", probe: { http: 200, at: FRESH_AT, read: true, write: true } });
    // default tenant = getConfiguredSapTenants[0] = "default" (from beforeEach)
    const po = (await (await GET(makeRequest())).json()).data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED");
  });
});

describe("a stored probe ages out — a memory, not a status", () => {
  it("older than PROBE_MAX_AGE_DAYS: the row is NOT_CHECKED, the date travels, and the count says so", async () => {
    // Discover showed a 403 recorded on 29 July as "Needs setup" on 11
    // September, while the same service answered 200 to a data read that day.
    setStored("API_PO", { source: "s", probe: { http: 403, at: STALE_AT, read: false, write: false } });
    const res = await GET(makeRequest());
    const body = await res.json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NOT_CHECKED");
    expect(po.probeStale).toBe(true);
    expect(po.probedAt).toBe(STALE_AT);
    expect(body.data.counts.byStatus.NEEDS_SETUP).toBe(0);
    expect(body.data.counts.stale).toBe(1);
    // The header's "last probed" is the newest across the catalogue — API_OLD's
    // fresh probe here — and is unaffected by one row's memory ageing out.
    expect(body.data.counts.lastProbedAt).toBe(FRESH_AT);
  });

  it("a fresh probe carries its date and is not stale", async () => {
    setStored("API_PO", stored(200, true, true));
    const res = await GET(makeRequest());
    const body = await res.json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED");
    expect(po.probeStale).toBe(false);
    expect(po.probedAt).toBe(FRESH_AT);
    expect(body.data.counts.stale).toBe(0);
  });

  /*
   * The capability chips came from the SAME probe as the status badge, and were
   * left out of the staleness check: a row rendered NOT_CHECKED — the page
   * having just declared the memory too old to classify — beside "Read · Write"
   * asserted from that very memory. The louder half of the claim survived the
   * quieter one. Either the probe is current enough to say something, or it
   * says nothing.
   */
  it("a stale probe sets no capability chip either", async () => {
    setStored("API_PO", { source: "s", probe: { http: 200, at: STALE_AT, read: true, write: true } });
    const res = await GET(makeRequest());
    const body = await res.json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NOT_CHECKED");
    expect(po.probeStale).toBe(true);
    expect(po.capability).toBeNull();
  });

  it("…and a fresh one still sets it", async () => {
    setStored("API_PO", stored(200, true, false));
    const res = await GET(makeRequest());
    const body = await res.json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.capability).toEqual({ read: true, write: false });
  });

  it("an UNDATED probe cannot be aged and keeps its verdict", async () => {
    setStored("API_PO", { source: "s", probe: { http: 200 } });
    const res = await GET(makeRequest());
    const body = await res.json();
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("ACTIVATED");
    expect(po.probeStale).toBe(false);
    expect(po.probedAt).toBeNull();
  });
});

describe("the dataProbe overlay takes the console ceiling and leaves a row (A24)", () => {
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
    // This organization's own stored verdict for its PROD system.
    setStored("API_PO", { source: "s", probes: { [ORG_KEY]: { http: 403, at: FRESH_AT, read: false, write: false } } });
  });

  it("refused on a PROD connection with no grant: no live read, the stored browse stands, and the refusal is recorded", async () => {
    // The audit's trigger: up to sixty $metadata probes plus a $top=1 data GET
    // each, against a production host /entities refuses this organization.
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    const res = await GET(makeRequest("product=s4hana&tenant=x5m-prod&dataProbe=1"));
    expect(res.status).toBe(200); // the browse is not failed
    const body = await res.json();
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
    // The stored verdict is what renders.
    const po = body.data.items.find((i: { externalId: string }) => i.externalId === "API_PO");
    expect(po.status).toBe("NEEDS_SETUP");
    expect(po.dataConfirmed).toBe(false);
    // And the response does not claim a live read happened.
    expect(body.data.counts.dataProbe).toBe(false);
    expect(body.data.counts.dataProbeRefusal).toContain("declared PROD");
    expect(auditRows()).toEqual([
      expect.objectContaining({
        organizationId: "org-a",
        actorUserId: "u1",
        externalId: "-hub-overlay-",
        environment: "PROD",
        status: 403,
        rowCount: null,
        dryRun: true,
        connectionId: "conn-prod",
        connectionEnvironment: "PROD",
      }),
    ]);
  });

  it("runs on PROD under a live grant and counts the data GETs in the row", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    mocks.grantFindMany.mockResolvedValue([{ decision: "APPROVED", expiresAt: null, revokedAt: null }]);
    mocks.probeTenantCapabilities.mockResolvedValue([
      // exposed, data GET answered
      { service: "API_PO", exposed: true, status: 200, dataStatus: 200, dataConfirmed: true, entities: [] },
    ]);
    const body = await (await GET(makeRequest("product=s4hana&tenant=x5m-prod&dataProbe=1"))).json();
    expect(mocks.probeTenantCapabilities).toHaveBeenCalledOnce();
    expect(body.data.counts.dataProbe).toBe(true);
    expect(body.data.counts.dataProbeRefusal).toBeNull();
    // One $metadata probe (the one target sampled) + one data GET.
    expect(auditRows()).toEqual([
      expect.objectContaining({ externalId: "-hub-overlay-", status: 200, rowCount: 2, connectionEnvironment: "PROD" }),
    ]);
  });

  it("a default load reaches no tenant, so it records nothing", async () => {
    mocks.resolveSapConnection.mockResolvedValue(connection("PROD"));
    await GET(makeRequest("product=s4hana&tenant=x5m-prod"));
    expect(mocks.probeTenantCapabilities).not.toHaveBeenCalled();
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("an overlay on the deployment tenant is recorded too", async () => {
    mocks.getSapTenant.mockReturnValue(TENANT);
    mocks.probeTenantCapabilities.mockResolvedValue([{ service: "API_PO", exposed: true, status: 200 }]);
    const body = await (await GET(makeRequest("product=s4hana&dataProbe=1"))).json();
    expect(body.data.counts.dataProbe).toBe(true);
    expect(mocks.grantFindMany).not.toHaveBeenCalled();
    // No data GET was made (no dataStatus), so the row counts the one probe.
    expect(auditRows()).toEqual([
      expect.objectContaining({ environment: "deployment:default", connectionId: null, status: 200, rowCount: 1 }),
    ]);
  });
});

/*
 * P0.8 — wrappers are not callable, the "callable" count is what Probe all
 * would probe, the Deprecated facet filters, and a V4 address says whether it
 * has answered 200 on this tenant.
 */
describe("catalogue addresses and lifecycle on the list (P0.8)", () => {
  const DERIVED = "/sap/opu/odata4/sap/ce_bank/srvd_a2x/sap/ce_bank/0003";
  const rows = [
    { externalId: "API_PO", contentType: "API", apiType: "ODATAV2", hubState: "ACTIVE", rawMetadataJson: null },
    { externalId: "CE_BANK_0003", contentType: "API", apiType: "ODATAV4", hubState: "ACTIVE", rawMetadataJson: null },
    // A wrapper row an earlier Probe all reached (a stored 404 from its malformed address).
    {
      externalId: "sap-s4-CE_RETAILSEASON_0001-v1",
      contentType: "API",
      apiType: "ODATAV4",
      hubState: "ACTIVE",
      rawMetadataJson: { probes: { default: { http: 404, at: FRESH_AT } } },
    },
    { externalId: "sap-s4-API_CLOUD_PRINT_PULL_SRV-v1", contentType: "API", apiType: "ODATAV2", hubState: null, rawMetadataJson: null },
    // SAP-deprecated: not callable, and Probe all skips it.
    { externalId: "API_OLD_SRV", contentType: "API", apiType: "ODATAV2", hubState: "DEPRECATED", rawMetadataJson: null },
  ];
  const page = rows.map((r, i) => ({
    id: String(i),
    title: r.externalId,
    description: "",
    packageId: "Proc",
    communicationScenarios: [],
    itemCount: null,
    hubUrl: "u",
    hubVersion: null,
    successorExternalId: null,
    ...r,
  }));
  type Where = { where?: { apiType?: string; AND?: unknown[]; NOT?: unknown } };
  const item = (body: { data: { items: Array<{ externalId: string }> } }, id: string) =>
    body.data.items.find((i) => i.externalId === id) as unknown as Record<string, unknown> & {
      address: Record<string, unknown> | null;
    };

  beforeEach(() => {
    mocks.findMany.mockImplementation((args: Where) => Promise.resolve(args.where?.AND ? page : rows));
  });

  it("counts only non-wrapper, non-deprecated OData rows as probeable, and badges wrappers NOT_PROBEABLE", async () => {
    const body = await (await GET(makeRequest())).json();
    expect(body.data.counts.probeableRuntime).toBe(2); // API_PO + CE_BANK_0003
    expect(body.data.counts.probeableV4).toBe(1);
    expect(body.data.counts.probeableV4Verified).toBe(0);
    expect(item(body, "sap-s4-CE_RETAILSEASON_0001-v1").status).toBe("NOT_PROBEABLE"); // its stored 404 is ignored
    expect(item(body, "sap-s4-API_CLOUD_PRINT_PULL_SRV-v1").status).toBe("NOT_PROBEABLE");
    expect(item(body, "API_OLD_SRV").status).toBe("DEPRECATED");
    expect(body.data.counts.byStatus.NOT_PROBEABLE).toBe(2);
  });

  it("each row carries its address; a V4 address is unverified until this tenant has a recorded 200", async () => {
    let body = await (await GET(makeRequest())).json();
    expect(item(body, "API_PO").address).toEqual({
      path: "/sap/opu/odata/sap/API_PO",
      protocol: "ODATAV2",
      basis: "convention",
      verifiedAt: null,
    });
    expect(item(body, "CE_BANK_0003").address).toEqual({ path: DERIVED, protocol: "ODATAV4", basis: "derived", verifiedAt: null });
    expect(item(body, "sap-s4-CE_RETAILSEASON_0001-v1").address).toBeNull();

    // The deployment tenant's proof, filed under "-deployment-".
    const at = new Date("2026-10-20T09:00:00.000Z");
    mocks.verificationFindMany.mockResolvedValue([
      { externalId: "CE_BANK_0003", servicePath: DERIVED, verifiedAt: at, connectionId: null, baseUrl: "https://x.example" },
    ]);
    body = await (await GET(makeRequest())).json();
    expect(mocks.verificationFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { organizationId: "-deployment-", product: "s4hana", tenantKey: "default" } }),
    );
    expect(item(body, "CE_BANK_0003").address?.verifiedAt).toBe(at.toISOString());
    expect(body.data.counts.probeableV4Verified).toBe(1);
  });

  it("an anonymous caller reads no proofs: every V4 address is unverified to them", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const body = await (await GET(makeRequest())).json();
    expect(mocks.verificationFindMany).not.toHaveBeenCalled();
    expect(item(body, "CE_BANK_0003").address?.verifiedAt).toBeNull();
  });

  it("the overlay files a V4 200 as this tenant's proof, and never samples a wrapper", async () => {
    mocks.findMany.mockImplementation((args: Where) => {
      if (args.where?.AND) return Promise.resolve(page);
      if (args.where?.apiType === "ODATAV4") {
        return Promise.resolve([
          { contentType: "API", apiType: "ODATAV4", externalId: "CE_BANK_0003", title: "Bank", packageId: null, communicationScenarios: [] },
        ]);
      }
      if (args.where?.apiType === "ODATAV2") return Promise.resolve([]);
      return Promise.resolve(rows);
    });
    mocks.getCurrentUser.mockResolvedValue({ id: "u-admin", email: "a@b.co", role: "platform_admin" });
    mocks.probeTenantCapabilities.mockResolvedValue([{ service: "CE_BANK_0003", exposed: true, status: 200 }]);
    await GET(makeRequest("product=s4hana&dataProbe=1"));
    expect(mocks.verificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          externalId: "CE_BANK_0003",
          servicePath: DERIVED,
          method: "catalogue-overlay",
          verifiedByUserId: "u-admin",
        }),
      }),
    );
    for (const [args] of mocks.findMany.mock.calls as Array<[Where]>) {
      if (args.where?.apiType) expect(args.where.NOT).toEqual({ externalId: { startsWith: "sap-s4-", mode: "insensitive" } });
    }
  });

  it("the Deprecated facet filters to the deprecated rows (it fell back to ALL)", async () => {
    await GET(makeRequest("product=s4hana&status=DEPRECATED"));
    const paged = (mocks.findMany.mock.calls as Array<[Where]>).map((c) => c[0]).find((a) => a.where?.AND);
    expect(paged?.where?.AND).toContainEqual({ externalId: { in: ["API_OLD_SRV"] } });
  });
});
