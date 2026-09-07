/**
 * 2608 WS14 — the step source and the pre-award reading.
 *
 * These test the two decisions that changed what a pack contains: where a
 * scope item's steps come from, and which of them we can assert on SAP's
 * authority. Both have a failure mode that is silent rather than loud — a
 * dropped step and an over-claimed one look identical to a passing build — so
 * the assertions here are about what the code REFUSES to do as much as what it
 * produces.
 */
import { describe, expect, it } from "vitest";

import { countriesWithoutRestrictionData, restrictionCountryNames } from "@/lib/tobe/countries";
import { citationFor, generateTobePack, stepDisposition } from "@/lib/tobe/engine";
import { formatApp, keepForCountries, masterContent, resolveContents, sourceCounts } from "@/lib/tobe/step-source";
import type { ProcessStepRow } from "@/lib/tobe/step-source";

import { fixtureInput } from "./fixtures";

const row = (over: Partial<ProcessStepRow> = {}): ProcessStepRow => ({
  scopeItemCode: "J59",
  scopeItemName: "Accounts Receivable",
  sequence: 10,
  activity: "Post Incoming Payment",
  fioriAppTitle: "Manage Incoming Payments",
  fioriAppId: "F1345",
  businessRoleDescription: "Accounts Receivable Accountant",
  businessRoleId: "SAP_BR_AR_ACCOUNTANT",
  countries: ["MY", "PH"],
  isGlobal: false,
  ...over,
});

describe("keepForCountries — an unstated footprint is not a filter", () => {
  it("keeps everything when the engagement states no countries", () => {
    // The WS9.1 failure was filtering on a field nobody had filled in. A bundle
    // with no footprint gets the whole published process, not an empty pack.
    expect(keepForCountries({ countries: ["BR"], isGlobal: false }, [])).toBe(true);
  });

  it("keeps a step SAP marks country-independent whatever the footprint", () => {
    expect(keepForCountries({ countries: [], isGlobal: true }, ["MY"])).toBe(true);
    expect(keepForCountries({ countries: ["BR"], isGlobal: true }, ["MY"])).toBe(true);
  });

  it("keeps a step SAP names no country for — 'not stated' is not 'nowhere'", () => {
    expect(keepForCountries({ countries: [], isGlobal: false }, ["MY"])).toBe(true);
  });

  it("keeps a step whose country list meets the footprint, drops one that does not", () => {
    expect(keepForCountries({ countries: ["MY", "SG"], isGlobal: false }, ["PH", "MY"])).toBe(true);
    expect(keepForCountries({ countries: ["BR", "MX"], isGlobal: false }, ["PH", "MY"])).toBe(false);
  });
});

describe("formatApp — never a guess", () => {
  it("pairs title and id, and falls back to whichever exists", () => {
    expect(formatApp("Manage Checkbooks", "F1577")).toBe("Manage Checkbooks (F1577)");
    expect(formatApp("Manage Checkbooks", null)).toBe("Manage Checkbooks");
    expect(formatApp(null, "F1577")).toBe("F1577");
  });

  it("returns empty rather than a placeholder when SAP publishes neither", () => {
    // 5,290 of 19,158 master steps publish no app. An em dash or "N/A" here
    // would be indistinguishable from an app actually called that.
    expect(formatApp(null, null)).toBe("");
    expect(formatApp("  ", "")).toBe("");
  });
});

describe("masterContent — the process-step master has no expected result", () => {
  it("flags every step as expectedUnpublished and leaves the text empty", () => {
    const c = masterContent("J59", [row(), row({ sequence: 20, activity: "Clear Open Item" })], "2608")!;
    expect(c.source).toBe("PROCESS_STEP_MASTER");
    expect(c.process_steps).toHaveLength(2);
    for (const s of c.process_steps) {
      expect(s.expected).toBe("");
      expect(s.expectedUnpublished).toBe(true);
    }
  });

  it("derives the role list in first-appearance order, without duplicates", () => {
    const c = masterContent(
      "J59",
      [
        row({ sequence: 10 }),
        row({ sequence: 20, businessRoleDescription: "Billing Clerk", businessRoleId: "SAP_BR_BILLING_CLERK" }),
        row({ sequence: 30 }),
      ],
      "2608",
    )!;
    expect(c.business_roles.map((r) => r.id)).toEqual(["SAP_BR_AR_ACCOUNTANT", "SAP_BR_BILLING_CLERK"]);
  });

  it("skips a row that names no role at all rather than inventing one", () => {
    const c = masterContent("J59", [row({ businessRoleDescription: null, businessRoleId: null })], "2608")!;
    expect(c.business_roles).toEqual([]);
    expect(c.process_steps[0]!.role).toBe("");
  });

  it("returns null for a scope code with no rows", () => {
    expect(masterContent("ZZZ", [], "2608")).toBeNull();
  });
});

describe("resolveContents — BPD first, master second, neither is a placeholder", () => {
  it("prefers the BPD file, because only it publishes expected results", () => {
    // J59 has both a data file and master rows. The BPD must win.
    const out = resolveContents(["J59"], [row()], "2608", []);
    expect(out.J59!.source).toBe("BPD");
    expect(out.J59!.process_steps.some((s) => s.expected !== "")).toBe(true);
  });

  it("falls back to the master for a code with no data file", () => {
    const out = resolveContents(["ZZZ"], [row({ scopeItemCode: "ZZZ", scopeItemName: "Synthetic" })], "2608", []);
    expect(out.ZZZ!.source).toBe("PROCESS_STEP_MASTER");
    expect(sourceCounts(out)).toEqual({ BPD: 0, PROCESS_STEP_MASTER: 1 });
  });

  it("omits a code with neither source, so the engine renders a placeholder", () => {
    expect(resolveContents(["QQQ"], [], "2608", [])).toEqual({});
  });

  it("keeps an item whose every step the footprint excluded, and counts what it lost", () => {
    // Dropping the item would report a scope item the client bought as absent.
    // It stays, with zero steps and the exclusion count.
    const out = resolveContents(
      ["ZZZ"],
      [row({ scopeItemCode: "ZZZ", countries: ["BR"] }), row({ scopeItemCode: "ZZZ", sequence: 20, countries: ["MX"] })],
      "2608",
      ["MY"],
    );
    expect(out.ZZZ).toBeDefined();
    expect(out.ZZZ!.process_steps).toEqual([]);
    expect(out.ZZZ!.stepsExcludedByCountry).toBe(2);
  });

  it("reports a partial country exclusion rather than silently shortening the flow", () => {
    const out = resolveContents(
      ["ZZZ"],
      [
        row({ scopeItemCode: "ZZZ", sequence: 10, countries: ["MY"] }),
        row({ scopeItemCode: "ZZZ", sequence: 20, countries: ["BR"] }),
      ],
      "2608",
      ["MY"],
    );
    expect(out.ZZZ!.process_steps).toHaveLength(1);
    expect(out.ZZZ!.stepsExcludedByCountry).toBe(1);
  });
});

describe("citationFor — names the publication, not the scope code", () => {
  it("distinguishes the two sources and reduces a verbose release string", () => {
    expect(citationFor("BPD", "S/4HANA Cloud Public Edition 2608 — MY")).toBe("BPD 2608");
    expect(citationFor("PROCESS_STEP_MASTER", "2608")).toBe("SAP process-step master 2608");
  });
});

describe("stepDisposition — SAP_STANDARD_CITED is the narrow case", () => {
  const std = { state: "STANDARD" as const, confirmInWorkshop: false };

  it("cites a standard step of an item with nothing outstanding", () => {
    expect(stepDisposition(std, false)).toBe("SAP_STANDARD_CITED");
  });

  it("will not cite a step of an item with unanswered or discuss questions", () => {
    expect(stepDisposition(std, true)).toBe("CONFIRM_WITH_CLIENT");
  });

  it("will not cite an optional step, because SAP publishing an option is not a choice", () => {
    expect(stepDisposition({ state: "STANDARD", confirmInWorkshop: true }, false)).toBe("CONFIRM_WITH_CLIENT");
  });

  it("will not cite a step an answer has already moved off standard", () => {
    for (const state of ["CONFIGURED", "VARIANT", "GAP"] as const) {
      expect(stepDisposition({ state, confirmInWorkshop: false }, false)).toBe("CONFIRM_WITH_CLIENT");
    }
  });

  it("labels an out-of-scope step neither, rather than claiming one about it", () => {
    expect(stepDisposition({ state: "NOT_IN_SCOPE", confirmInWorkshop: false }, true)).toBe("NOT_IN_SCOPE");
  });
});

describe("restriction country names", () => {
  it("maps ISO codes to the names the register actually uses", () => {
    expect(restrictionCountryNames(["MY", "gb"])).toEqual(["Malaysia", "United Kingdom"]);
  });

  it("contributes nothing for a country the register does not name, and reports it", () => {
    // The Philippines is absent from the register's 38 countries. That is a
    // fact about the harvested source, and the pack has to be able to say so.
    expect(restrictionCountryNames(["PH"])).toEqual([]);
    expect(countriesWithoutRestrictionData(["MY", "PH"])).toEqual(["PH"]);
    expect(countriesWithoutRestrictionData(["MY"])).toEqual([]);
  });
});

describe("the pack document carries the new sections", () => {
  it("counts dispositions across every step and never leaves one unset", () => {
    const doc = generateTobePack(fixtureInput());
    const total = Object.values(doc.summary.byDisposition).reduce((a, b) => a + b, 0);
    expect(total).toBe(doc.summary.steps);
    for (const item of doc.scopeItems) {
      for (const step of item.steps) expect(step.disposition).not.toBeUndefined();
    }
  });

  it("gives an out-of-scope item's steps the NOT_IN_SCOPE reading", () => {
    const doc = generateTobePack(fixtureInput());
    const out = doc.scopeItems.find((i) => !i.inScope);
    expect(out).toBeDefined();
    for (const step of out!.steps) expect(step.disposition).toBe("NOT_IN_SCOPE");
  });

  it("attaches forms and integrations to in-scope items only", () => {
    const doc = generateTobePack(
      fixtureInput({
        forms: {
          AAA: [
            {
              name: "Sales Quotation",
              applicationArea: "SD",
              applicationObject: "Quotation",
              outputType: "PDF",
              adobeFormTemplate: "SD_QUOTATION",
            },
          ],
          CCC: [
            {
              name: "Invoice",
              applicationArea: "SD",
              applicationObject: "Billing",
              outputType: "PDF",
              adobeFormTemplate: "SD_INVOICE",
            },
          ],
        },
        integrations: {
          AAA: [
            {
              commScenarioId: "SAP_COM_0008",
              name: null,
              direction: null,
              mandatory: null,
              inboundServices: [],
              outboundServices: [],
              apiIds: ["API_SALES_ORDER_SRV"],
              sourceUrl: "https://help.sap.com/x",
            },
          ],
        },
      }),
    );
    const aaa = doc.scopeItems.find((i) => i.code === "AAA")!;
    const ccc = doc.scopeItems.find((i) => i.code === "CCC")!;
    expect(aaa.forms).toHaveLength(1);
    expect(aaa.integrations).toHaveLength(1);
    // CCC is a chain item outside the scope set. Listing forms against
    // something nobody is buying is noise, not completeness.
    expect(ccc.inScope).toBe(false);
    expect(ccc.forms).toEqual([]);
    expect(doc.summary.forms).toBe(1);
    expect(doc.summary.integrations).toBe(1);
  });

  it("carries restrictions at pack level and sorts the footprint", () => {
    const doc = generateTobePack(
      fixtureInput({
        countries: ["PH", "MY"],
        restrictions: [
          {
            capability: "Electronic invoicing",
            country: "Malaysia",
            whatIsNotSupported: "Cross-border invoices on the Peppol network",
            statementVerbatim: "Cross-border electronic invoices are not supported on the Peppol network.",
            sourceUrl: "https://help.sap.com/y",
            futureSupportStated: null,
          },
        ],
      }),
    );
    expect(doc.countries).toEqual(["MY", "PH"]);
    expect(doc.restrictions).toHaveLength(1);
    expect(doc.summary.restrictions).toBe(1);
  });
});
