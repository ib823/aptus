/**
 * Country-localised APIs.
 *
 * The bug this guards against is a quiet one. SAP links
 * `API_CN_BANK_RECONCILIAITON_SRV_0001` (SAP's own spelling) to Bank
 * Integration with File Interface, a scope item that sits in plenty of
 * non-China engagements. Counting that link as integration coverage overstates
 * what a bid can actually do, and nothing else in the pipeline would notice.
 */
import { describe, expect, it } from "vitest";

import {
  eDocumentCountries,
  foreignLocalisedApis,
  hasEDocumentConnector,
} from "@/lib/sap/localised-apis";

describe("eDocumentCountries", () => {
  it("reads the country out of SAP's connector naming", () => {
    expect(
      eDocumentCountries([
        "CO_EDO_PL_KSEF_TRANS_SERV_V1",
        "CO_EDO_SA_SEND_INVOICE_V2_0",
        "CO_EDO_RO_E_DOCUMENT_RO",
        "API_JOURNALENTRY_SRV_0001",
      ]),
    ).toEqual(["PL", "RO", "SA"]);
  });

  it("de-duplicates a country that ships several connectors", () => {
    expect(
      eDocumentCountries(["CO_EDO_RS_CANCEL", "CO_EDO_RS_SEND_CREDIT_NOTE", "CO_EDO_RS_GET_STATUS"]),
    ).toEqual(["RS"]);
  });

  it("returns nothing when no connector is present, rather than guessing", () => {
    expect(eDocumentCountries(["API_BILLINGDOCUMENT_0001_G4BA"])).toEqual([]);
  });
});

describe("hasEDocumentConnector", () => {
  const apis = ["CO_EDO_PL_KSEF_TRANS_SERV_V1", "CO_EDO_TH_SEND", "CO_EDO_IN_EINV"];

  it("is true only for a country SAP actually publishes", () => {
    expect(hasEDocumentConnector(apis, "PL")).toBe(true);
    expect(hasEDocumentConnector(apis, "th")).toBe(true);
    expect(hasEDocumentConnector(apis, "MY")).toBe(false);
  });
});

describe("foreignLocalisedApis", () => {
  it("flags an API localised to a country outside the footprint", () => {
    // The real case: SAP links this to a scope item that is in scope for a
    // Malaysian engagement, but the API is China's.
    const hits = foreignLocalisedApis(["API_CN_BANK_RECONCILIAITON_SRV_0001"], ["MY", "SG"]);
    expect(hits).toEqual([{ api: "API_CN_BANK_RECONCILIAITON_SRV_0001", country: "CN" }]);
  });

  it("does not flag an API localised to a country IN the footprint", () => {
    expect(foreignLocalisedApis(["API_CN_BANK_RECONCILIAITON_SRV_0001"], ["CN"])).toEqual([]);
  });

  it("treats an unstated footprint as no filter, never as 'nowhere'", () => {
    expect(foreignLocalisedApis(["API_CN_BANK_RECON_SRV"], [])).toEqual([]);
  });

  it("does not mistake a line-of-business or object prefix for a country", () => {
    // API_CV_ATTACHMENT is a content-version attachment service, not Cape
    // Verde; API_HR_... is Human Resources, not Croatia. A false positive here
    // would quietly shrink a bid's coverage.
    expect(
      foreignLocalisedApis(
        ["API_CV_ATTACHMENT_SRV_0001", "API_HR_EMPLOYEEEXPENSE_G4BA", "API_BR_CTR_SERVICE"],
        ["MY"],
      ),
    ).toEqual([]);
  });

  it("catches eDocument connectors as well as OData services", () => {
    const hits = foreignLocalisedApis(["CO_EDO_ES_SII_SEND", "API_JOURNALENTRY_SRV"], ["MY"]);
    expect(hits.map((h) => h.country)).toEqual(["ES"]);
  });

  it("reports each API once, sorted, however often it appears", () => {
    const hits = foreignLocalisedApis(
      ["CO_EDO_TR_X", "CO_EDO_ES_A", "CO_EDO_TR_X"],
      ["MY"],
    );
    expect(hits.map((h) => h.api)).toEqual(["CO_EDO_ES_A", "CO_EDO_TR_X"]);
  });
});

describe("against the shipped 2608 interface content", () => {
  it("finds the nineteen eDocument countries SAP publishes, and Malaysia is not one", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const raw = readFileSync(
      path.join(process.cwd(), "sap-references", "comm-scenarios", "comm-scenarios.tsv"),
      "utf-8",
    );
    const apis: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#") || line.startsWith("comm_scenario_id")) continue;
      const cols = line.split("\t");
      for (const a of (cols[6] ?? "").split("|")) if (a.trim()) apis.push(a.trim());
    }
    const countries = eDocumentCountries(apis);
    expect(countries).toEqual([
      "AR", "CH", "CL", "EG", "ES", "GR", "HU", "IN", "IT", "MX",
      "PE", "PL", "PT", "RO", "RS", "SA", "SK", "TH", "TR",
    ]);
    // The finding that matters for a Malaysian bid. If a later content release
    // adds MY, this test fails and that is the point: it is news.
    expect(hasEDocumentConnector(apis, "MY")).toBe(false);
  });
});
