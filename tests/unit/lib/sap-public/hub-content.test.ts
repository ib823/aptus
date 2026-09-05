import { describe, expect, it } from "vitest";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  classifyApiTypeById,
  deriveV4Path,
  hubApiToService,
  hubAvailabilityQualifier,
  httpToRuntimeStatus,
  isProbeable,
  mergeStoredProbe,
  readStoredProbe,
  isHubContentType,
  isRuntimeType,
  pathToApiId,
  resolveHubStatus,
  type HubContentType,
  type HubStatus,
  HUB_STATUSES,
  deprecationTooltip,
} from "@/lib/sap-public/hub-content";

describe("classifyApiTypeById (honest, no broken-path types)", () => {
  it.each([
    ["CE_BILLINGDOCUMENT_0001", "ODATAV4"],
    ["API_BILLING_DOCUMENT_SRV", "ODATAV2"],
    ["API_ENTERPRISE_PROJECT_SRV_0002", "ODATAV2"],
    ["API_COSTCNTRACTIVITYTYPE_CRUD_SRV", "ODATAV2"],
    ["OP_API_PRODUCT_SRV_0001", "ODATAV2"],
    ["BILLINGDOCUMENTREQUEST_IN", "SOAP"],
    ["CO_SDBIL_ESR_BD_REF_CONF_OUT", "SOAP"],
    ["ALLOCATIONPOSTINGCREATEREQUEST", "SOAP"],
    ["SOMETHING_CDS_0001", "ODATAV4"],
  ])("%s → %s", (id, type) => {
    expect(classifyApiTypeById(id)).toBe(type);
  });

  it("leaves genuinely-unknown ids null (CamelCase, CO_ non-IN/OUT, sap-s4- wrappers)", () => {
    expect(classifyApiTypeById("AccountPlan")).toBeNull();
    expect(classifyApiTypeById("MaintenanceLookupTableDataService")).toBeNull();
    expect(classifyApiTypeById("CO_LOG_MDR_ACCT_ASS_CATEGORY")).toBeNull();
    expect(classifyApiTypeById("SLSPRCGACCESSSEQUENCE_0001")).toBeNull();
    // sap-s4-* would yield a broken /sap/opu/odata/sap/sap-s4-… path → never V2.
    expect(classifyApiTypeById("sap-s4-CE_BILLINGDOCUMENT_0001-v1")).toBeNull();
  });
});

describe("deriveV4Path (best-effort, flagged)", () => {
  it("strips the trailing version and builds the odata4 candidate path", () => {
    expect(deriveV4Path("CE_BILLINGDOCUMENT_0001")).toBe(
      "/sap/opu/odata4/sap/ce_billingdocument/srvd_a2x/sap/ce_billingdocument/0001",
    );
  });
  it("defaults the version to 0001 when the id has none", () => {
    expect(deriveV4Path("CE_BANK")).toBe("/sap/opu/odata4/sap/ce_bank/srvd_a2x/sap/ce_bank/0001");
  });
});

describe("pathToApiId (probe→row identity)", () => {
  it("is the last path segment — the apiId that == SapHubContent.externalId", () => {
    expect(pathToApiId("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV")).toBe("API_PURCHASEORDER_PROCESS_SRV");
    expect(pathToApiId("/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV")).toBe("SC_PROJ_ENGMT_CREATE_UPD_SRV");
  });
});

describe("hub-content type metadata", () => {
  it("classifies runtime vs reference correctly", () => {
    expect(HUB_CONTENT_TYPES.filter(isRuntimeType)).toEqual(["API", "EVENT", "CDS_VIEW"]);
    expect(isRuntimeType("BADI")).toBe(false);
    expect(isRuntimeType("INTEGRATION")).toBe(false);
  });

  it("has a why-it-matters blurb for every type", () => {
    for (const t of HUB_CONTENT_TYPES) {
      expect(HUB_CONTENT_TYPE_META[t].whyItMatters.length).toBeGreaterThan(10);
    }
  });

  it("validates content-type strings", () => {
    expect(isHubContentType("API")).toBe(true);
    expect(isHubContentType("CDS_VIEW")).toBe(true);
    expect(isHubContentType("nope")).toBe(false);
  });
});

describe("httpToRuntimeStatus (outcome → status)", () => {
  it("maps each probe HTTP outcome to its confirmed status", () => {
    expect(httpToRuntimeStatus(200)).toBe("ACTIVATED");
    expect(httpToRuntimeStatus(403)).toBe("NEEDS_SETUP");
    expect(httpToRuntimeStatus(401)).toBe("NEEDS_SETUP");
    expect(httpToRuntimeStatus(404)).toBe("NOT_FOUND");
  });

  it("un-probed (undefined) and inconclusive (0 / 5xx) → NOT_CHECKED, never a fake negative", () => {
    expect(httpToRuntimeStatus(undefined)).toBe("NOT_CHECKED");
    expect(httpToRuntimeStatus(0)).toBe("NOT_CHECKED");
    expect(httpToRuntimeStatus(500)).toBe("NOT_CHECKED");
    expect(httpToRuntimeStatus(503)).toBe("NOT_CHECKED");
  });
});

describe("resolveHubStatus (probe-outcome-driven, honest badges)", () => {
  const runtime = { contentType: "API" as const, apiType: "ODATAV2", externalId: "API_X" };
  const reference = { contentType: "BADI" as const, apiType: null, externalId: "BADI_X" };

  it("reference types are always REFERENCE", () => {
    expect(resolveHubStatus(reference, new Map([["BADI_X", 200]]))).toBe("REFERENCE");
    expect(resolveHubStatus(reference)).toBe("REFERENCE");
  });

  it("runtime, probed 200 → ACTIVATED", () => {
    expect(resolveHubStatus(runtime, new Map([["API_X", 200]]))).toBe("ACTIVATED");
  });

  it("runtime, probed 403 → NEEDS_SETUP (confirmed negative)", () => {
    expect(resolveHubStatus(runtime, new Map([["API_X", 403]]))).toBe("NEEDS_SETUP");
  });

  it("runtime, probed 404 → NOT_FOUND (distinct from 403)", () => {
    expect(resolveHubStatus(runtime, new Map([["API_X", 404]]))).toBe("NOT_FOUND");
  });

  it("PROBEABLE runtime, NOT probed → NOT_CHECKED — never NEEDS_SETUP (the list-vs-detail bug)", () => {
    expect(resolveHubStatus(runtime, new Map([["OTHER", 200]]))).toBe("NOT_CHECKED");
    expect(resolveHubStatus(runtime, new Map())).toBe("NOT_CHECKED");
    expect(resolveHubStatus(runtime)).toBe("NOT_CHECKED");
  });

  it("UN-PROBEABLE runtime (SOAP / null apiType), no outcome → NOT_PROBEABLE (distinct from NOT_CHECKED)", () => {
    expect(resolveHubStatus({ contentType: "API", apiType: "SOAP", externalId: "IN_X" })).toBe("NOT_PROBEABLE");
    expect(resolveHubStatus({ contentType: "API", apiType: null, externalId: "N_X" })).toBe("NOT_PROBEABLE");
    // but a real stored/live outcome still wins even for a SOAP row we somehow probed
    expect(resolveHubStatus({ contentType: "API", apiType: "SOAP", externalId: "IN_X" }, new Map([["IN_X", 200]]))).toBe("ACTIVATED");
  });

  it("a CDS view resolves by its own probe outcome", () => {
    const cds = { contentType: "CDS_VIEW" as const, apiType: "ODATAV2", externalId: "CDS_X" };
    expect(resolveHubStatus(cds, new Map([["CDS_X", 200]]))).toBe("ACTIVATED");
    expect(resolveHubStatus(cds, new Map([["CDS_X", 403]]))).toBe("NEEDS_SETUP");
    expect(resolveHubStatus(cds, new Map())).toBe("NOT_CHECKED");
  });

  it("hubState DEPRECATED wins over every probe outcome and every type (2608 WS3)", () => {
    const dep = { ...runtime, hubState: "DEPRECATED" };
    expect(resolveHubStatus(dep, new Map([["API_X", 200]]))).toBe("DEPRECATED"); // never ACTIVATED
    expect(resolveHubStatus(dep, new Map([["API_X", 403]]))).toBe("DEPRECATED");
    expect(resolveHubStatus(dep, new Map([["API_X", 404]]))).toBe("DEPRECATED");
    expect(resolveHubStatus(dep)).toBe("DEPRECATED");
    expect(resolveHubStatus({ ...reference, hubState: "DEPRECATED" })).toBe("DEPRECATED");
    expect(resolveHubStatus({ contentType: "EVENT", apiType: null, externalId: "CE_X", hubState: "DEPRECATED" })).toBe("DEPRECATED");
  });

  it("any other hubState (ACTIVE / null / unknown) leaves the probe-driven bucket untouched", () => {
    for (const hubState of ["ACTIVE", null, undefined, "RELEASED"]) {
      expect(resolveHubStatus({ ...runtime, hubState }, new Map([["API_X", 200]]))).toBe("ACTIVATED");
      expect(resolveHubStatus({ ...runtime, hubState })).toBe("NOT_CHECKED");
      expect(resolveHubStatus({ ...reference, hubState })).toBe("REFERENCE");
    }
  });

  it("deprecationTooltip names the successor or says none is named yet", () => {
    expect(deprecationTooltip("API_NEW")).toBe("Deprecated by SAP — successor: API_NEW");
    expect(deprecationTooltip(null)).toBe("Deprecated by SAP — no successor named yet");
    expect(deprecationTooltip(undefined)).toBe("Deprecated by SAP — no successor named yet");
    // HUB_STATUSES is the one display-order list every consumer iterates; DEPRECATED is its last bucket.
    expect(HUB_STATUSES).toHaveLength(8);
    expect(HUB_STATUSES[HUB_STATUSES.length - 1]).toBe("DEPRECATED");
    expect(new Set(HUB_STATUSES).size).toBe(8);
  });

  it("EVENT is subscribe-only → AVAILABLE, never ACTIVATED even if forced into the map", () => {
    const ev = { contentType: "EVENT" as const, apiType: null, externalId: "CE_X" };
    expect(resolveHubStatus(ev, new Map([["CE_X", 200]]))).toBe("AVAILABLE");
    expect(resolveHubStatus(ev)).toBe("AVAILABLE");
    expect(hubAvailabilityQualifier("EVENT")).toBe("subscribe");
    expect(hubAvailabilityQualifier("API")).toBeNull();
    expect(hubAvailabilityQualifier("CDS_VIEW")).toBeNull();
  });
});

describe("all 12 content types map to an honest un-probed status", () => {
  // With NO probe outcomes AND apiType null: reference → REFERENCE; EVENT →
  // AVAILABLE; API + CDS_VIEW → NOT_PROBEABLE (null apiType = no OData endpoint).
  const EXPECTED_NULL_APITYPE: Record<HubContentType, HubStatus> = {
    API: "NOT_PROBEABLE",
    EVENT: "AVAILABLE",
    CDS_VIEW: "NOT_PROBEABLE",
    BADI: "REFERENCE",
    BO_INTERFACE: "REFERENCE",
    INTEGRATION: "REFERENCE",
    BUILD: "REFERENCE",
    PROCESS_BLUEPRINT: "REFERENCE",
    LIVEPROCESS: "REFERENCE",
    SCENARIO: "REFERENCE",
    VPUC: "REFERENCE",
    ANALYTICS: "REFERENCE",
  };

  it("covers every enum member (no type left unbadged)", () => {
    expect(Object.keys(EXPECTED_NULL_APITYPE).sort()).toEqual([...HUB_CONTENT_TYPES].sort());
  });

  it.each(HUB_CONTENT_TYPES)("%s (un-probed, null apiType) → its honest status", (type) => {
    expect(resolveHubStatus({ contentType: type, apiType: null, externalId: `${type}_X` })).toBe(EXPECTED_NULL_APITYPE[type]);
  });

  it("API / CDS_VIEW with an OData apiType (un-probed) → NOT_CHECKED, not NOT_PROBEABLE", () => {
    expect(resolveHubStatus({ contentType: "API", apiType: "ODATAV2", externalId: "A" })).toBe("NOT_CHECKED");
    expect(resolveHubStatus({ contentType: "CDS_VIEW", apiType: "ODATAV4", externalId: "C" })).toBe("NOT_CHECKED");
  });
});

describe("isProbeable", () => {
  it("only API / CDS_VIEW on OData V2/V4 are probeable", () => {
    expect(isProbeable({ contentType: "API", apiType: "ODATAV2" })).toBe(true);
    expect(isProbeable({ contentType: "API", apiType: "ODATAV4" })).toBe(true);
    expect(isProbeable({ contentType: "CDS_VIEW", apiType: "ODATAV2" })).toBe(true);
    expect(isProbeable({ contentType: "API", apiType: "SOAP" })).toBe(false);
    expect(isProbeable({ contentType: "API", apiType: null })).toBe(false);
    expect(isProbeable({ contentType: "EVENT", apiType: "ODATAV2" })).toBe(false);
    expect(isProbeable({ contentType: "BADI", apiType: "ODATAV2" })).toBe(false);
  });
});

describe("readStoredProbe — tenant-scoped (no cross-tenant leak)", () => {
  const raw = { source: "x", probes: { customizing: { http: 200, at: "t1", read: true, write: false }, development: { http: 403 } } };

  it("returns only the requested tenant's probe", () => {
    expect(readStoredProbe(raw, "customizing")?.http).toBe(200);
    expect(readStoredProbe(raw, "development")?.http).toBe(403);
  });

  it("returns null for a tenant with no probe — never another tenant's data", () => {
    expect(readStoredProbe(raw, "production")).toBeNull();
    // even with a default key, an absent tenant in a populated probes map → null
    expect(readStoredProbe(raw, "production", "customizing")).toBeNull();
  });

  it("legacy singular `probe` is read as the DEFAULT tenant's result ONLY", () => {
    const legacy = { source: "x", probe: { http: 200, read: true } };
    expect(readStoredProbe(legacy, "customizing", "customizing")?.http).toBe(200); // default → legacy
    expect(readStoredProbe(legacy, "development", "customizing")).toBeNull(); // non-default → no leak
    expect(readStoredProbe(legacy, "customizing")).toBeNull(); // no default key given → no legacy read
  });

  it("null / non-probe raw → null", () => {
    expect(readStoredProbe(null, "customizing")).toBeNull();
    expect(readStoredProbe({ source: "x" }, "customizing", "customizing")).toBeNull();
  });
});

describe("mergeStoredProbe — write only the tenant's key, preserve everything else", () => {
  it("adds probes[tenant] while keeping siblings, other tenants, and the legacy probe", () => {
    const raw = { source: "s", apiId: "A", probe: { http: 999 }, probes: { customizing: { http: 200 } } };
    const merged = mergeStoredProbe(raw, "development", { http: 403, at: "t", read: false, write: false });
    const probes = merged.probes as { development: { http: number }; customizing: { http: number } };
    expect(probes.development.http).toBe(403);
    expect(probes.customizing.http).toBe(200); // untouched
    expect((merged.probe as { http: number }).http).toBe(999); // legacy untouched
    expect(merged.source).toBe("s");
    expect(merged.apiId).toBe("A");
  });

  it("starts a fresh probes map from null/empty raw", () => {
    const merged = mergeStoredProbe(null, "customizing", { http: 200 });
    expect((merged.probes as { customizing: { http: number } }).customizing.http).toBe(200);
  });
});

describe("hubApiToService", () => {
  const base = { title: "T", packageId: "Sales", communicationScenarios: ["SAP_COM_0053"] };

  it("maps an OData V2 API to its stable /sap/opu/odata/sap path", () => {
    const svc = hubApiToService({ ...base, contentType: "API", apiType: "ODATAV2", externalId: "API_X" });
    expect(svc).toMatchObject({ key: "API_X", path: "/sap/opu/odata/sap/API_X", scenario: "SAP_COM_0053" });
  });

  it("maps a CDS view exposed as OData V2 (so it can reach ACTIVATED)", () => {
    const svc = hubApiToService({ ...base, contentType: "CDS_VIEW", apiType: "ODATAV2", externalId: "C_View" });
    expect(svc).toMatchObject({ key: "C_View", path: "/sap/opu/odata/sap/C_View" });
  });

  it("maps an OData V4 API to a best-effort odata4 path (so it can reach ACTIVATED)", () => {
    const svc = hubApiToService({ ...base, contentType: "API", apiType: "ODATAV4", externalId: "CE_BANK_0003" });
    expect(svc!.path).toBe("/sap/opu/odata4/sap/ce_bank/srvd_a2x/sap/ce_bank/0003");
  });

  it("returns null for events, grouped CDS package rows (apiType CDS), SOAP, and null-type", () => {
    expect(hubApiToService({ ...base, contentType: "EVENT", apiType: null, externalId: "CE_X" })).toBeNull();
    expect(hubApiToService({ ...base, contentType: "CDS_VIEW", apiType: "CDS", externalId: "CDS_SALES" })).toBeNull();
    expect(hubApiToService({ ...base, contentType: "API", apiType: "SOAP", externalId: "X_IN" })).toBeNull();
    expect(hubApiToService({ ...base, contentType: "API", apiType: null, externalId: "AccountPlan" })).toBeNull();
  });
});
