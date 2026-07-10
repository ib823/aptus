import { describe, expect, it } from "vitest";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  hubApiToService,
  isHubContentType,
  isRuntimeType,
  resolveHubStatus,
} from "@/lib/sap-public/hub-content";

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
});

describe("hubApiToService", () => {
  const base = { title: "T", packageId: "Sales", communicationScenarios: ["SAP_COM_0053"] };

  it("maps an OData V2 API to its stable /sap/opu/odata/sap path", () => {
    const svc = hubApiToService({ ...base, contentType: "API", apiType: "ODATAV2", externalId: "API_X" });
    expect(svc).toMatchObject({ key: "API_X", path: "/sap/opu/odata/sap/API_X", scenario: "SAP_COM_0053" });
  });

  it("returns null for non-V2 APIs and non-API content (not reliably probeable)", () => {
    expect(hubApiToService({ ...base, contentType: "API", apiType: "ODATAV4", externalId: "X" })).toBeNull();
    expect(hubApiToService({ ...base, contentType: "EVENT", apiType: null, externalId: "CE_X" })).toBeNull();
    expect(hubApiToService({ ...base, contentType: "CDS_VIEW", apiType: "CDS", externalId: "CDS_SALES" })).toBeNull();
  });
});
