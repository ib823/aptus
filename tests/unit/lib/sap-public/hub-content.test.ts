import { describe, expect, it } from "vitest";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  hubApiToService,
  hubAvailabilityQualifier,
  isHubContentType,
  isRuntimeType,
  pathToApiId,
  resolveHubStatus,
} from "@/lib/sap-public/hub-content";

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

describe("resolveHubStatus (honest badges)", () => {
  const runtime = { contentType: "API" as const, apiType: "ODATAV2", externalId: "API_X" };
  const reference = { contentType: "BADI" as const, apiType: null, externalId: "BADI_X" };

  it("reference types are always REFERENCE", () => {
    expect(resolveHubStatus(reference, new Set(["BADI_X"]))).toBe("REFERENCE");
    expect(resolveHubStatus(reference)).toBe("REFERENCE");
  });

  it("runtime + live 200 (in activated set) → ACTIVATED", () => {
    expect(resolveHubStatus(runtime, new Set(["API_X"]))).toBe("ACTIVATED");
  });

  it("runtime not in activated set → AVAILABLE (never inferred)", () => {
    expect(resolveHubStatus(runtime, new Set(["OTHER"]))).toBe("AVAILABLE");
    expect(resolveHubStatus(runtime, new Set())).toBe("AVAILABLE");
    expect(resolveHubStatus(runtime)).toBe("AVAILABLE");
  });

  it("an active CDS view (probed 200) → ACTIVATED", () => {
    const cds = { contentType: "CDS_VIEW" as const, apiType: "ODATAV2", externalId: "CDS_X" };
    expect(resolveHubStatus(cds, new Set(["CDS_X"]))).toBe("ACTIVATED");
    expect(resolveHubStatus(cds, new Set())).toBe("AVAILABLE");
  });

  it("EVENT is subscribe-only → AVAILABLE, never ACTIVATED even if forced into the set", () => {
    const ev = { contentType: "EVENT" as const, apiType: null, externalId: "CE_X" };
    expect(resolveHubStatus(ev, new Set(["CE_X"]))).toBe("AVAILABLE");
    expect(resolveHubStatus(ev)).toBe("AVAILABLE");
    expect(hubAvailabilityQualifier("EVENT")).toBe("subscribe");
    expect(hubAvailabilityQualifier("API")).toBeNull();
    expect(hubAvailabilityQualifier("CDS_VIEW")).toBeNull();
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

  it("returns null for non-V2, events, and grouped CDS package rows (apiType CDS)", () => {
    expect(hubApiToService({ ...base, contentType: "API", apiType: "ODATAV4", externalId: "X" })).toBeNull();
    expect(hubApiToService({ ...base, contentType: "EVENT", apiType: null, externalId: "CE_X" })).toBeNull();
    expect(hubApiToService({ ...base, contentType: "CDS_VIEW", apiType: "CDS", externalId: "CDS_SALES" })).toBeNull();
  });
});
