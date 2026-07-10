import { describe, expect, it, vi } from "vitest";

// The importer instantiates a PrismaClient at module load. We never touch the
// DB here (only the pure field-mapping functions), so stub the client out.
vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  Prisma: { JsonNull: null },
}));

import {
  normalizeRow,
  normalizeApiType,
  normalizeStatus,
  mapEditionFromProductTags,
  parseJson,
} from "../../../scripts/import-sap-api-catalog";

// A tiny fixture mirroring the api.sap.com export shape (see api-hub-catalog.json).
const FIXTURE = [
  {
    apiId: "API_SUPPLIERINVOICE_PROCESS_SRV",
    apiName: "Supplier Invoice",
    status: "Active",
    productCategory: "SAP S/4HANA Cloud Public Edition",
    apiType: "ODATAV2",
    communicationScenarios: ["SAP_COM_0057"],
    scopeItemCodes: ["j60", "bj8"],
    description: "Create/read/cancel supplier invoices (AP)",
    apiHubUrl: "https://api.sap.com/package/x",
  },
];

describe("import-sap-api-catalog field mapping", () => {
  it("maps a seed row into the normalized shape", () => {
    const norm = normalizeRow(FIXTURE[0]!);
    expect(norm).not.toBeNull();
    expect(norm!.apiId).toBe("API_SUPPLIERINVOICE_PROCESS_SRV");
    expect(norm!.apiName).toBe("Supplier Invoice");
    expect(norm!.status).toBe("Active"); // "Active" is preserved, not coerced
    expect(norm!.apiType).toBe("ODATAV2"); // captured from the file
    expect(norm!.communicationScenarios).toEqual(["SAP_COM_0057"]);
    expect(norm!.scopeItemCodes).toEqual(["J60", "BJ8"]); // upper-cased
    expect(norm!.apiHubUrl).toBe("https://api.sap.com/package/x");
  });

  it("tags the edition from the product category", () => {
    const norm = normalizeRow(FIXTURE[0]!)!;
    const editions = mapEditionFromProductTags(norm.productTags);
    expect(editions.appliesToPublic).toBe(true);
    expect(editions.appliesToPrivate).toBe(false);
    expect(editions.appliesToOnPrem).toBe(false);
  });

  it("returns null when no apiId can be found", () => {
    expect(normalizeRow({ apiName: "Orphan", status: "Active" })).toBeNull();
  });

  it("falls back apiName to apiId when the name is absent", () => {
    const norm = normalizeRow({ apiId: "API_X" })!;
    expect(norm.apiName).toBe("API_X");
  });

  describe("normalizeApiType", () => {
    it.each([
      ["ODataV2", "ODATAV2"],
      ["odata v4", "ODATAV4"],
      ["OData", "ODATAV2"],
      ["SOAP", "SOAP"],
      ["rest", "REST"],
      ["events", "EVENT"],
    ])("%s -> %s", (input, expected) => {
      expect(normalizeApiType(input)).toBe(expected);
    });

    it("returns null for empty input (leaves refresh-api-types to fill it)", () => {
      expect(normalizeApiType("")).toBeNull();
    });
  });

  describe("normalizeStatus", () => {
    it.each([
      ["Released to Customer", "Released"],
      ["beta", "Beta"],
      ["Deprecated", "Deprecated"],
      ["Active", "Active"],
    ])("%s -> %s", (input, expected) => {
      expect(normalizeStatus(input)).toBe(expected);
    });
  });

  describe("parseJson", () => {
    it("accepts a top-level array", () => {
      expect(parseJson(JSON.stringify(FIXTURE))).toHaveLength(1);
    });
    it("accepts an OData v4 { value: [] } envelope", () => {
      expect(parseJson(JSON.stringify({ value: FIXTURE }))).toHaveLength(1);
    });
    it("accepts an OData v2 { d: { results: [] } } envelope", () => {
      expect(parseJson(JSON.stringify({ d: { results: FIXTURE } }))).toHaveLength(1);
    });
    it("throws on an unrecognized shape", () => {
      expect(() => parseJson(JSON.stringify({ nope: true }))).toThrow();
    });
  });
});
