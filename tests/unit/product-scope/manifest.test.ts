import { describe, expect, it } from "vitest";
import { parseProductScopeManifest } from "@/lib/product-scope/manifest";

const base = {
  productKey: "ARIBA", solutionKey: "BUYING_INVOICING", release: "2608",
  scopeCode: "ARIBA-TEST", scopeKind: "PROCESS", title: "Invoice process",
  sourceUrl: "https://help.sap.com/example", sourceKind: "SAP_HELP",
  visibility: "PUBLIC",
  processSteps: [{ sequence: 1, title: "Create an invoice" }], configQuestions: [],
};

describe("product scope manifest", () => {
  it("rejects a skipped step so diagrams cannot imply a false sequence", () => {
    expect(() => parseProductScopeManifest([{ ...base, processSteps: [{ sequence: 2, title: "Create an invoice" }] }]))
      .toThrow("ordered and numbered");
  });

  it("rejects duplicate product/release/code identities", () => {
    expect(() => parseProductScopeManifest([base, base])).toThrow("Duplicate product scope identity");
  });

  it("requires a source URL on every discovery question", () => {
    expect(() => parseProductScopeManifest([{ ...base, configQuestions: [{ key: "Q1", question: "Who approves this invoice?" }] }])).toThrow();
  });

  it.each(["PARTNER_EXPORT", "PROCESS_NAVIGATOR"])("rejects %s material marked public", (sourceKind) => {
    expect(() => parseProductScopeManifest([{ ...base, sourceKind, visibility: "PUBLIC" }]))
      .toThrow("SAP for Me and partner source records must be visible only to ABeam admins");
  });

  it("requires an explicit audience for every source record", () => {
    const { visibility: _visibility, ...record } = base;
    expect(() => parseProductScopeManifest([record])).toThrow();
  });
});
