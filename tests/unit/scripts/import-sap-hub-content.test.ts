import { describe, expect, it } from "vitest";

// Pure mappers now live in the shared lib (no Prisma), used by both the local
// script and the admin Rebuild endpoint.
import {
  normalizeHubRow,
  normalizeHubRowForType,
  normalizeHubApiType,
  parseHubJson,
} from "@/lib/sap-public/hub-import";

describe("normalizeHubRow", () => {
  it("maps an API row (runtime, with apiType + scenario)", () => {
    const n = normalizeHubRow({
      contentType: "API",
      externalId: "API_PURCHASEORDER_PROCESS_SRV",
      title: "Purchase Order",
      apiType: "ODATAV2",
      packageId: "Sourcing and Procurement",
      status: "Active",
      communicationScenarios: ["SAP_COM_0053"],
      description: "Create/read POs",
    })!;
    expect(n.contentType).toBe("API");
    expect(n.apiType).toBe("ODATAV2");
    expect(n.communicationScenarios).toEqual(["SAP_COM_0053"]);
    expect(n.appliesToPublic).toBe(true);
    expect(n.itemCount).toBeNull();
  });

  it("maps a grouped CDS package row with itemCount", () => {
    const n = normalizeHubRow({ contentType: "CDS_VIEW", externalId: "CDS_SALES", title: "Sales CDS", itemCount: 1255, apiType: "CDS" })!;
    expect(n.contentType).toBe("CDS_VIEW");
    expect(n.itemCount).toBe(1255);
    expect(n.apiType).toBe("CDS");
  });

  it("maps a reference row (no apiType)", () => {
    const n = normalizeHubRow({ contentType: "INTEGRATION", externalId: "IFLOW_ARIBA", title: "Ariba iFlow" })!;
    expect(n.contentType).toBe("INTEGRATION");
    expect(n.apiType).toBeNull();
    expect(n.status).toBe("Released"); // default
    expect(n.hubUrl).toContain("api.sap.com");
  });

  it("normalizes a spaced/lowercased content type", () => {
    expect(normalizeHubRow({ contentType: "bo interface", externalId: "X" })!.contentType).toBe("BO_INTERFACE");
  });

  it("skips rows with an unknown content type or no externalId", () => {
    expect(normalizeHubRow({ contentType: "WIDGET", externalId: "X" })).toBeNull();
    expect(normalizeHubRow({ contentType: "API" })).toBeNull();
  });
});

describe("normalizeHubRowForType (contentType stamped from the filename)", () => {
  it("stamps the given type — the row needs no contentType field", () => {
    const n = normalizeHubRowForType({ externalId: "CE_BUPA_CHANGED", title: "Business Partner Changed" }, "EVENT")!;
    expect(n.contentType).toBe("EVENT");
    expect(n.externalId).toBe("CE_BUPA_CHANGED");
    expect(n.appliesToPublic).toBe(true);
    // No hubUrl in the row → synthesized content deep-link (not an /api/ link).
    expect(n.hubUrl).toContain("/content/");
  });

  it("still returns null without a usable externalId", () => {
    expect(normalizeHubRowForType({ title: "no id" }, "CDS_VIEW")).toBeNull();
  });

  it("does not fabricate — an empty file yields no rows", () => {
    expect(parseHubJson("[]")).toEqual([]);
  });
});

describe("normalizeHubApiType", () => {
  it.each([
    ["ODataV2", "ODATAV2"],
    ["odata v4", "ODATAV4"],
    ["CDS", "CDS"],
    ["SOAP", "SOAP"],
    ["", null],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeHubApiType(input)).toBe(expected);
  });
});

describe("parseHubJson", () => {
  const one = [{ contentType: "API", externalId: "X" }];
  it("accepts array / value / items / d.results shapes", () => {
    expect(parseHubJson(JSON.stringify(one))).toHaveLength(1);
    expect(parseHubJson(JSON.stringify({ value: one }))).toHaveLength(1);
    expect(parseHubJson(JSON.stringify({ items: one }))).toHaveLength(1);
    expect(parseHubJson(JSON.stringify({ d: { results: one } }))).toHaveLength(1);
  });
  it("throws on an unrecognized shape", () => {
    expect(() => parseHubJson(JSON.stringify({ nope: 1 }))).toThrow();
  });
});
