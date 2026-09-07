// @vitest-environment node
/**
 * 2608 WS11 — the seven workbooks that shipped in the drop and had no loader.
 *
 * Checked against the REAL committed workbooks, not fixtures. The defect these
 * parsers exist to fix is that nothing had ever opened these files, so a
 * fixture would prove only that the fixture parses. Every count below was read
 * off the source and is pinned in DB_FACTS_2608 as well; the two must agree.
 */
import { describe, expect, it } from "vitest";

import { DB_FACTS_2608 } from "../../../scripts/recon-2608";
import { sapContentSourcesFor } from "../../../scripts/lib/sap-content-sources";
import {
  formScopeCodesFrom,
  parseCoMasterObjects,
  parseFiscalYearVariants,
  parseForms,
  parseGlAccounts,
  parseOrgStructure,
  parseTaxAccountAssignments,
  parseTaxCodes,
  parseTaxRates,
} from "../../../scripts/lib/sap-2608/parse-content";
import { parseAvailabilityDependencies } from "../../../scripts/lib/sap-2608/parse";

const SOURCES = sapContentSourcesFor("2608");

describe("formScopeCodesFrom", () => {
  it("merges both source columns, splitting on commas and semicolons", () => {
    expect(formScopeCodesFrom("2B9", "55U;5IS;BD9")).toEqual(["2B9", "55U", "5IS", "BD9"]);
  });

  it("de-duplicates across the two columns while keeping source order", () => {
    expect(formScopeCodesFrom("BH1;BJ2", "BJ2;4HH")).toEqual(["BH1", "BJ2", "4HH"]);
  });

  it("returns nothing for empty cells rather than a placeholder code", () => {
    // Unlike SSCUI's "All", a form with no scope item makes no claim at all.
    expect(formScopeCodesFrom("", "")).toEqual([]);
  });
});

describe("forms", () => {
  it("parses every row of the committed 2608 forms list", async () => {
    const forms = await parseForms(SOURCES);
    expect(forms).toHaveLength(DB_FACTS_2608.forms);
  });

  it("finds a scope item on every form", async () => {
    const forms = await parseForms(SOURCES);
    const withScope = forms.filter((f) => f.scopeItemCodes.length > 0);
    expect(withScope).toHaveLength(DB_FACTS_2608.formsWithScopeCodes);
  });

  it("reaches 462 of the 822 scope items, and records the codes that resolve to none", async () => {
    const [forms, ad] = await Promise.all([parseForms(SOURCES), parseAvailabilityDependencies(SOURCES)]);
    const cited = new Set(forms.flatMap((f) => f.scopeItemCodes));
    const known = [...cited].filter((c) => ad.items.has(c));
    expect(known).toHaveLength(DB_FACTS_2608.scopeItemsWithForms);
    // The rest are kept, not dropped: they are what the source says, and
    // silently discarding them would hide a real mismatch between two SAP files.
    expect(cited.size).toBeGreaterThan(known.length);
  });

  it("keeps the Malaysia-specific forms distinguishable from the global ones", async () => {
    const forms = await parseForms(SOURCES);
    const my = forms.filter((f) => f.relevantFor === "MY");
    expect(my.length).toBeGreaterThan(0);
    expect(forms.every((f) => f.relevantFor === "All" || f.relevantFor === "MY")).toBe(true);
  });

  it("opens a workbook exceljs cannot read unaided", async () => {
    // The forms list ships its sheet as a declared Excel table with no style
    // block, which exceljs 4.4 throws on. If the workaround in xlsx.ts is ever
    // removed this test fails at the read, not at an assertion.
    const forms = await parseForms(SOURCES);
    expect(forms[0]?.name).toBeTruthy();
    expect(forms[0]?.adobeFormTemplate).toBeTruthy();
  });
});

describe("G/L accounts", () => {
  it("parses the Malaysia local chart and skips SAP's technical-name row", async () => {
    const accounts = await parseGlAccounts(SOURCES);
    expect(accounts).toHaveLength(DB_FACTS_2608.glAccounts);
    // I_SAKNR and friends sit directly under the labels and would otherwise
    // load as an account whose number is a field name.
    expect(accounts.some((a) => a.accountNumber.startsWith("I_"))).toBe(false);
    // Four rows carry an account number and company code with the chart of
    // accounts and long text left blank. That is what the sheet says, so it is
    // what is stored — the row is not dropped for being incomplete.
    expect(accounts.every((a) => a.accountNumber !== "" && a.companyCode !== "")).toBe(true);
  });
});

describe("controlling and financial master objects", () => {
  // Ten sheets across two workbooks; comfortably past vitest's 5s default.
  it("parses every object type the source ships", { timeout: 30_000 }, async () => {
    const objects = await parseCoMasterObjects(SOURCES);
    expect(objects).toHaveLength(DB_FACTS_2608.coMasterObjects);
    const types = new Set(objects.map((o) => o.objectType));
    for (const t of [
      "COST_CENTER",
      "SECONDARY_COST_ELEMENT",
      "ACTIVITY_TYPE",
      "ACTIVITY_TYPE_GROUP",
      "COST_CENTER_GROUP",
      "COST_ELEMENT_GROUP",
      "PROFIT_CENTER",
      "FUNCTIONAL_AREA",
      "SEGMENT",
      "STATISTICAL_KEY_FIGURE",
    ]) {
      expect(types.has(t), `${t} parsed to zero rows`).toBe(true);
    }
  });

  it("keeps the cost centre IDs SAP's own sheet lists twice", { timeout: 30_000 }, async () => {
    const objects = await parseCoMasterObjects(SOURCES);
    const byCode = new Map<string, number>();
    for (const o of objects) {
      const k = `${o.objectType}|${o.controllingArea}|${o.code}`;
      byCode.set(k, (byCode.get(k) ?? 0) + 1);
    }
    const extra = [...byCode.values()].reduce((n, c) => n + (c - 1), 0);
    // 17101601 is both "Marketing (US)" and "Transportation (US)". Keying on
    // the code alone kept one of each pair — the WS9.1 defect, again.
    expect(extra).toBe(DB_FACTS_2608.coMasterObjectDuplicateCodes);
    expect(new Set(objects.map((o) => `${o.objectType}|${o.controllingArea}|${o.code}|${o.sourceRow}`)).size).toBe(
      objects.length,
    );
  });
});

describe("tax", () => {
  it("parses the pre-configured codes, their rates and their account determination", async () => {
    const [codes, rates, assignments] = await Promise.all([
      parseTaxCodes(SOURCES),
      parseTaxRates(SOURCES),
      parseTaxAccountAssignments(SOURCES),
    ]);
    expect(codes).toHaveLength(DB_FACTS_2608.taxCodes);
    expect(rates).toHaveLength(DB_FACTS_2608.taxRates);
    expect(assignments).toHaveLength(DB_FACTS_2608.taxAccountAssignments);
    expect(codes.every((c) => c.country === "MY")).toBe(true);
  });

  it("melts the wide rate sheet into one row per populated condition", async () => {
    const rates = await parseTaxRates(SOURCES);
    // An empty cell means the condition does not apply — never a zero rate.
    expect(rates.every((r) => r.rate !== "")).toBe(true);
    expect(new Set(rates.map((r) => r.conditionType)).size).toBeGreaterThan(1);
  });

  it("skips the technical-name row in the account determination sheet", async () => {
    const assignments = await parseTaxAccountAssignments(SOURCES);
    expect(assignments.some((a) => a.taxCode.startsWith("I_"))).toBe(false);
  });
});

describe("fiscal year variants", () => {
  it("parses the pre-delivered variants and keeps the corporate-FYV flag", async () => {
    const fyvs = await parseFiscalYearVariants(SOURCES);
    expect(fyvs).toHaveLength(DB_FACTS_2608.fiscalYearVariants);
    // The flag constrains group-ledger design and is fixed at company-code
    // creation, so losing it is expensive and silent.
    expect(fyvs.some((f) => f.corporateFyvCapable === "Yes")).toBe(true);
    // The sheet ends with a footnote in the variant column; it carries no
    // periods and must not be loaded as a 27th variant.
    expect(fyvs.every((f) => f.postingPeriods !== "")).toBe(true);
    expect(fyvs.some((f) => f.variant.startsWith("*"))).toBe(false);
  });
});

describe("enterprise structure", () => {
  it("reads each column down on its own rather than across the row", async () => {
    const elements = await parseOrgStructure(SOURCES);
    expect(elements).toHaveLength(DB_FACTS_2608.orgStructureElements);
    // Purchasing groups outnumber company codes many times over: pairing them
    // across a row would invent a relationship the sheet does not state.
    const count = (t: string) => elements.filter((e) => e.elementType === t).length;
    expect(count("Purchasing Group")).toBeGreaterThan(count("Company Code"));
    expect(new Set(elements.map((e) => `${e.elementType}|${e.code}`)).size).toBe(elements.length);
  });
});
