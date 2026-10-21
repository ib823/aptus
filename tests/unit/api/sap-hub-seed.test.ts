import { beforeEach, describe, expect, it, vi } from "vitest";

import { mergeStoredProbe } from "@/lib/sap-public/hub-content";

const mocks = vi.hoisted(() => ({
  refreshApiProvenance: vi.fn(),
  requireAdmin: vi.fn(),
  apiFindMany: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  hubFindMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
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
    sapHubContent: { upsert: mocks.upsert, count: mocks.count, findUnique: mocks.findUnique, findMany: mocks.hubFindMany, create: mocks.create, update: mocks.update },
    scopeItem: { findMany: mocks.scopeItemFindMany },
    scopeCatalogVersion: { findFirst: mocks.catalogFindFirst },
  },
}));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));
// The provenance merge is one SQL statement on the rows' CURRENT values, proved
// against real PostgreSQL in tests/unit/sap-public/hub-probe-store.test.ts.
vi.mock("@/lib/sap-public/hub-probe-store", () => ({ refreshApiProvenance: mocks.refreshApiProvenance }));

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
  mocks.hubFindMany.mockResolvedValue([]); // no pre-existing hub rows by default
  mocks.refreshApiProvenance.mockResolvedValue(0);
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

  /*
   * P0.8 — the projection never copied SAP's lifecycle, so after a Rebuild
   * every API row's hubState was null and the deprecated ones read as live.
   */
  it("carries SAP's lifecycle onto the catalogue row, and never erases it from a reference that has none", async () => {
    const modified = new Date("2026-07-01T00:00:00.000Z");
    mocks.apiFindMany.mockResolvedValue([
      {
        ...API_ROWS[0],
        hubState: "DEPRECATED",
        hubVersion: "1.4.0",
        hubModifiedAt: modified,
        hubSubType: "ODATA",
        catalogueRelease: "2608",
        successorExternalId: "CE_PURCHASEORDER_0001",
      },
      // A reference imported before the lifecycle columns: nulls.
      { ...API_ROWS[1], hubState: null, hubVersion: null, hubModifiedAt: null, hubSubType: null, catalogueRelease: null, successorExternalId: null },
    ]);
    await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE" }));
    const byId = (externalId: string) =>
      mocks.upsert.mock.calls.find((c) => c![0].where.contentType_externalId.externalId === externalId)![0];

    const po = byId("API_PURCHASEORDER_PROCESS_SRV");
    for (const half of [po.create, po.update]) {
      expect(half).toMatchObject({
        hubState: "DEPRECATED",
        hubVersion: "1.4.0",
        hubModifiedAt: modified,
        catalogueRelease: "2608",
        successorExternalId: "CE_PURCHASEORDER_0001",
      });
    }
    const bp = byId("API_BUSINESS_PARTNER");
    for (const key of ["hubState", "hubVersion", "hubModifiedAt", "successorExternalId"]) {
      expect(key in bp.update, key).toBe(false);
    }
  });

  it("a rebuild PRESERVES a row's stored tenant probes (does not reset Activated)", async () => {
    /*
     * UPDATED FOR A23. This case used to assert that the upsert's update carried
     * `{ ...snapshot, source, apiId }` — the snapshot read at the start of the
     * Rebuild, `probes` included. That WAS the defect: written back minutes
     * later, the copy reverted every probe stored in between. The contract is
     * now that the update never writes rawMetadataJson, and source/apiId are
     * merged into each row's CURRENT value by refreshApiProvenance.
     */
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE" }));
    expect(res.status).toBe(200);

    const call = mocks.upsert.mock.calls.find(
      (c) => c![0].where.contentType_externalId.externalId === "API_PURCHASEORDER_PROCESS_SRV",
    )!;
    // An EXISTING row's column is left to the database — probes and all.
    expect("rawMetadataJson" in call[0].update).toBe(false);
    // A NEW row (create) has no stored probe to preserve — fresh raw is fine.
    expect(call[0].create.rawMetadataJson).toEqual({ source: "SapApiReference", apiId: "API_PURCHASEORDER_PROCESS_SRV" });
    // …and the provenance keys are merged for every projected row, once.
    expect(mocks.refreshApiProvenance).toHaveBeenCalledTimes(1);
    expect(mocks.refreshApiProvenance.mock.calls[0]![0]).toEqual(API_ROWS.map((a) => a.apiId));
    // No start-of-run copy of the column is taken at all.
    expect(mocks.hubFindMany).not.toHaveBeenCalled();
  });

  it("a probe stored WHILE the rebuild runs survives it (A23)", async () => {
    /*
     * The audit's trigger (4), on an in-memory row. The Rebuild starts; an
     * organization's Probe-all stores a fresh result on the PO row before the
     * Rebuild reaches it; the Rebuild then refreshes that row. Writing back its
     * start-of-run copy, it used to erase the fresh entry for everyone.
     */
    const PO = "API_PURCHASEORDER_PROCESS_SRV";
    const OLD = { http: 200, at: "2026-07-21T00:00:00Z" };
    const FRESH = { http: 403, at: "2026-10-19T00:00:00Z" };
    const rows = new Map<string, unknown>([[PO, { source: "SapApiReference", apiId: PO, probes: { customizing: OLD } }]]);
    mocks.hubFindMany.mockImplementation(async () =>
      [...rows].map(([externalId, rawMetadataJson]) => ({ externalId, rawMetadataJson: structuredClone(rawMetadataJson) })),
    );
    mocks.upsert.mockImplementation(
      async (args: {
        where: { contentType_externalId: { externalId: string } };
        create: { rawMetadataJson?: unknown };
        update: { rawMetadataJson?: unknown };
      }) => {
        const id = args.where.contentType_externalId.externalId;
        if (id === PO) {
          // Another organization's Probe-all lands on this row first…
          rows.set(PO, mergeStoredProbe(rows.get(PO), "org:org-b:s4hana:x5m-100", FRESH));
          // …and customizing's own re-probe answered 403 this time.
          rows.set(PO, mergeStoredProbe(rows.get(PO), "customizing", FRESH));
        }
        if (!rows.has(id)) rows.set(id, args.create.rawMetadataJson);
        else if ("rawMetadataJson" in args.update) rows.set(id, args.update.rawMetadataJson);
        return {};
      },
    );
    mocks.refreshApiProvenance.mockImplementation(async (ids: string[]) => {
      for (const id of ids) {
        const cur = rows.get(id);
        const base = cur && typeof cur === "object" && !Array.isArray(cur) ? cur : {};
        rows.set(id, { ...base, source: "SapApiReference", apiId: id });
      }
      return ids.length;
    });

    expect((await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE" }))).status).toBe(200);
    expect(rows.get(PO)).toEqual({
      source: "SapApiReference",
      apiId: PO,
      probes: { customizing: FRESH, "org:org-b:s4hana:x5m-100": FRESH },
    });
  });

  it("contentType=EVENT imports the bundled type WITHOUT touching the API slice", async () => {
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE", contentType: "EVENT" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.source).toBe("bundled:EVENT");
    expect(body.data.contentType).toBe("EVENT");
    // Bundled EVENT.json now ships the 151 real (147 Cloud Public + 4 Subscription Billing) S/4HANA Cloud Public business
    // events (sourced from api.sap.com; see EVENT.json). Each becomes a create.
    expect(body.data.inserted).toBe(151);
    // NEVER reads SapApiReference or upserts API rows for a non-API import —
    // events are created, and the API slice is untouched.
    expect(mocks.apiFindMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(151);
    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({ action: "SAP_HUB_TYPE_IMPORTED" });
  });

  it("contentType=CDS_VIEW is refused (count-only, never bundled)", async () => {
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE", contentType: "CDS_VIEW" }));
    expect(res.status).toBe(400);
    expect(mocks.apiFindMany).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("an unknown contentType is a 400", async () => {
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE", contentType: "WIDGET" }));
    expect(res.status).toBe(400);
    expect(mocks.apiFindMany).not.toHaveBeenCalled();
  });

  it("contentType=ALL runs the API slice AND the bundled non-API types", async () => {
    const res = await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE", contentType: "all" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mocks.apiFindMany).toHaveBeenCalled(); // API slice ran
    expect(body.data.api.source).toBe("SapApiReference");
    // Every bundled non-API type reported (all empty → 0 rows, honest).
    expect(Array.isArray(body.data.types)).toBe(true);
    expect(body.data.types.length).toBeGreaterThanOrEqual(9);
  });
});

describe("the Rebuild and the bundled imports stamp the import time (P0.3, A29)", () => {
  it("every API row the Rebuild projects or injects carries importedAt, on create and on update", async () => {
    await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE" }));
    expect(mocks.upsert.mock.calls.length).toBeGreaterThan(0);
    for (const [args] of mocks.upsert.mock.calls as [{ create: { importedAt?: unknown }; update: { importedAt?: unknown } }][]) {
      expect(args.create.importedAt).toBeInstanceOf(Date);
      expect(args.update.importedAt).toBeInstanceOf(Date);
    }
  });

  it("a bundled type's import stamps importedAt on every row it creates", async () => {
    await POST(makeRequest({ confirmation: "REBUILD SAP HUB CATALOGUE", contentType: "EVENT" }));
    expect(mocks.create.mock.calls.length).toBeGreaterThan(0);
    for (const [args] of mocks.create.mock.calls as [{ data: { importedAt?: unknown; rawMetadataJson: { importedAt: string } } }][]) {
      expect(args.data.importedAt).toBeInstanceOf(Date);
      expect((args.data.importedAt as Date).toISOString()).toBe(args.data.rawMetadataJson.importedAt);
    }
  });
});
