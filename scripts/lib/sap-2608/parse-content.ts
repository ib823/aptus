/**
 * Parsers for the 2608 workbooks that shipped in the drop and had no loader
 * (WS11). Pure: files in, records out. Same discipline as parse.ts — columns are
 * resolved by header name, nothing is inferred, and a value the source does not
 * carry stays empty rather than being filled with a plausible one.
 */

import type { SapContentSources, SheetSource } from "../sap-content-sources";
import { readSheet } from "./xlsx";

/** Collapse the newlines SAP wraps header labels with, so a prefix test works. */
function normaliseHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim();
}

/**
 * SAP puts its technical field names (I_KTOPL, I_SAKNR, I_MWSKZ, …) on the row
 * directly below the human labels in the Account_Master_Data sheets. It reads as
 * a data row and would load as an account whose number is "I_SAKNR".
 */
function isTechnicalNameRow(cells: string[]): boolean {
  const filled = cells.filter((c) => c !== "");
  return filled.length > 0 && filled.every((c) => /^I_[A-Z0-9_]+$/.test(c));
}

// ---------------------------------------------------------------------------
// Forms — BP_CLD_ENTPR_<release>_Forms_List_EN_<country>.xlsx
// ---------------------------------------------------------------------------

export type FormRow = {
  applicationArea: string;
  name: string;
  applicationObject: string;
  adobeFormTemplate: string;
  outputType: string;
  callbackClass: string;
  relevantFor: string;
  /** Every code named by `Use` and `Used in SI`, de-duplicated, source order. */
  scopeItemCodes: string[];
  rawUse: string;
  rawUsedInSi: string;
};

/**
 * Split a form's scope-item cells. Same shape as SSCUI's Main Scope Item ID —
 * comma or semicolon separated — so it is split the same way. Codes are kept
 * verbatim: 62 of the 524 the 2608 file cites do not resolve against the 2608
 * catalogue, and dropping them would hide that rather than record it.
 */
export function formScopeCodesFrom(rawUse: string, rawUsedInSi: string): string[] {
  const out: string[] = [];
  for (const raw of [rawUse, rawUsedInSi]) {
    for (const part of raw.split(/[,;]/)) {
      const code = part.trim();
      if (code && !out.includes(code)) out.push(code);
    }
  }
  return out;
}

export async function parseForms(sources: SapContentSources): Promise<FormRow[]> {
  if (!sources.forms) throw new Error(`release ${sources.release} has no forms source`);
  const sheet = await readSheet(sources.forms);
  const out: FormRow[] = [];
  for (const row of sheet.rows()) {
    const name = row.get("Name");
    if (!name) continue;
    const rawUse = row.get("Use");
    const rawUsedInSi = row.get("Used in SI");
    out.push({
      applicationArea: row.get("Application Area"),
      name,
      applicationObject: row.get("Application Object"),
      adobeFormTemplate: row.get("Used Adobe Form Template"),
      outputType: row.get("Output Type"),
      callbackClass: row.get("Callback Class"),
      relevantFor: row.get("Relevant for") || "All",
      scopeItemCodes: formScopeCodesFrom(rawUse, rawUsedInSi),
      rawUse,
      rawUsedInSi,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// G/L accounts — BP_CLD_ENTPR_<release>_Account_Master_Data_for_YCOA[_MY].xlsx
// ---------------------------------------------------------------------------

export type GlAccountRow = {
  chartOfAccounts: string;
  companyCode: string;
  accountNumber: string;
  longTextEn: string;
  glAccountType: string;
  balanceSheetAccount: string;
  groupAccountNumber: string;
  plStatementAcctType: string;
  accountGroup: string;
  tradingPartner: string;
  functionalArea: string;
  planningGroup: string;
};

export async function parseGlAccounts(sources: SapContentSources): Promise<GlAccountRow[]> {
  if (!sources.glAccounts) throw new Error(`release ${sources.release} has no G/L account source`);
  const sheet = await readSheet(sources.glAccounts);
  const out: GlAccountRow[] = [];
  for (const row of sheet.rows()) {
    if (isTechnicalNameRow(row.cells)) continue;
    const accountNumber = row.get("G/L Account Number");
    if (!accountNumber) continue;
    out.push({
      chartOfAccounts: row.get("Chart of Accounts"),
      companyCode: row.get("Company Code"),
      accountNumber,
      longTextEn: row.get("Long Text EN"),
      glAccountType: row.get("G/L Account Type"),
      balanceSheetAccount: row.get("Balance Sheet Account"),
      groupAccountNumber: row.get("Group account Number"),
      plStatementAcctType: row.get("P&L Statement Acct Type"),
      accountGroup: row.get("Account Group"),
      tradingPartner: row.get("Trading Partner"),
      functionalArea: row.get("Functional Area"),
      planningGroup: row.get("Planning group"),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tax — 2608_Pre-configured_Tax_Codes_EN_<country>.xlsx + the T030K sheet
// ---------------------------------------------------------------------------

export type TaxCodeRow = {
  country: string;
  taxCode: string;
  description: string;
  descriptionLocal: string;
  taxType: string;
  euCode: string;
  errorIndicator: string;
};

export async function parseTaxCodes(sources: SapContentSources): Promise<TaxCodeRow[]> {
  if (!sources.taxCodes) throw new Error(`release ${sources.release} has no tax-code source`);
  const sheet = await readSheet(sources.taxCodes);
  const localCol = sheet.headers.find((h) => normaliseHeader(h).startsWith("Description in local")) ?? "";
  const out: TaxCodeRow[] = [];
  for (const row of sheet.rows()) {
    const taxCode = row.get("Tax code");
    if (!taxCode) continue;
    out.push({
      country: row.get("Country"),
      taxCode,
      description: row.get("Description"),
      descriptionLocal: localCol ? row.get(localCol) : "",
      taxType: row.get("Tax Type"),
      euCode: row.get("EU Code"),
      errorIndicator: row.get("Error Indicator"),
    });
  }
  return out;
}

export type TaxRateRow = { country: string; taxCode: string; validFrom: string; conditionType: string; rate: string };

/**
 * The rates sheet is wide: the condition types are COLUMNS (MWVS for input tax,
 * MWAS for output tax), so a row carries a rate under whichever applies. This
 * melts it into one row per populated condition, which is what a rate IS — an
 * empty cell means the condition does not apply, not that the rate is zero.
 */
export async function parseTaxRates(sources: SapContentSources): Promise<TaxRateRow[]> {
  if (!sources.taxRates) throw new Error(`release ${sources.release} has no tax-rate source`);
  const sheet = await readSheet(sources.taxRates);
  const validFromCol = sheet.headers.find((h) => normaliseHeader(h).startsWith("Tax Rate Valid From")) ?? "";
  const fixed = new Set([validFromCol, "Tax Code", "Country"]);
  const conditionCols = sheet.headers.filter((h) => h && !fixed.has(h));
  const out: TaxRateRow[] = [];
  for (const row of sheet.rows()) {
    const taxCode = row.get("Tax Code");
    if (!taxCode) continue;
    for (const conditionType of conditionCols) {
      const rate = row.get(conditionType);
      if (rate === "") continue;
      out.push({
        country: row.get("Country"),
        taxCode,
        validFrom: validFromCol ? row.get(validFromCol) : "",
        conditionType,
        rate,
      });
    }
  }
  return out;
}

export type TaxAccountAssignmentRow = {
  taxCode: string;
  description: string;
  transactionKey: string;
  glAccount: string;
};

export async function parseTaxAccountAssignments(sources: SapContentSources): Promise<TaxAccountAssignmentRow[]> {
  if (!sources.taxAccountAssignment) throw new Error(`release ${sources.release} has no T030K source`);
  const sheet = await readSheet(sources.taxAccountAssignment);
  const out: TaxAccountAssignmentRow[] = [];
  for (const row of sheet.rows()) {
    if (isTechnicalNameRow(row.cells)) continue;
    const taxCode = row.get("Tax Codes");
    const glAccount = row.get("G/L Account D/C");
    if (!taxCode || !glAccount) continue;
    out.push({
      taxCode,
      description: row.get("Description"),
      transactionKey: row.get("Transaction Key"),
      glAccount,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fiscal year variants — <release>_predelivered_FYV.xlsx
// ---------------------------------------------------------------------------

export type FiscalYearVariantRow = {
  variant: string;
  description: string;
  postingPeriods: string;
  specialPeriods: string;
  calendarYearDependent: string;
  corporateFyvCapable: string;
  origin: string;
  remarks: string;
};

export async function parseFiscalYearVariants(sources: SapContentSources): Promise<FiscalYearVariantRow[]> {
  if (!sources.fiscalYearVariants) throw new Error(`release ${sources.release} has no FYV source`);
  const sheet = await readSheet(sources.fiscalYearVariants);
  const find = (prefix: string) => sheet.headers.find((h) => normaliseHeader(h).startsWith(prefix)) ?? "";
  const cVariant = find("Fiscal Year Variant Name");
  const cDesc = find("Fiscal Year Variant Descri");
  const cPosting = find("Number of posting periods");
  const cSpecial = find("Number of special periods");
  const cCalendar = find("Calendar year dependent");
  const cCorporate = find("Can be used as corporate");
  const cOrigin = find("Origin of Fiscal year");
  const cRemarks = find("Brief Remarks");
  const out: FiscalYearVariantRow[] = [];
  for (const row of sheet.rows()) {
    const variant = cVariant ? row.get(cVariant) : "";
    if (!variant) continue;
    const postingPeriods = cPosting ? row.get(cPosting) : "";
    /*
     * The sheet ends with a footnote sitting in the variant column ("*** Special
     * periods represent an extension of the last normal posting period…"). It
     * has no periods, and every real variant has them, so that is the test —
     * loading it would have made the delivered-variant count one too many.
     */
    if (postingPeriods === "") continue;
    out.push({
      variant,
      description: cDesc ? row.get(cDesc) : "",
      postingPeriods,
      specialPeriods: cSpecial ? row.get(cSpecial) : "",
      calendarYearDependent: cCalendar ? row.get(cCalendar) : "",
      corporateFyvCapable: cCorporate ? row.get(cCorporate) : "",
      origin: cOrigin ? row.get(cOrigin) : "",
      remarks: cRemarks ? row.get(cRemarks) : "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Enterprise structure — <release>_Org_Data_Overview_EN_XX.xlsx
// ---------------------------------------------------------------------------

export type OrgElementRow = { elementType: string; code: string; areaLabel: string; sheetName: string };

/**
 * The sheet is COLUMN-WISE, not row-wise. Each column independently enumerates
 * the org units of one type — two company codes beside a dozen purchasing
 * groups — so reading across a row would assert a relationship the file does
 * not state. Every column is read down on its own and nothing is paired.
 */
export async function parseOrgStructure(sources: SapContentSources): Promise<OrgElementRow[]> {
  if (!sources.orgStructure) throw new Error(`release ${sources.release} has no org-structure source`);
  const src: SheetSource = sources.orgStructure;
  const sheet = await readSheet(src);
  // The row above the headers carries the area banner ("CO/FI", "MM", "LO"),
  // which labels its whole group of columns; carry the last seen value right.
  const bannerRow = sheet.ws.getRow(src.headerRow - 1).values as unknown[];
  const bannerCells = Array.from(bannerRow, (v) => (v === null || v === undefined ? "" : String(v).trim()));
  const banners: string[] = [];
  let current = "";
  for (let i = 0; i < sheet.headers.length; i++) {
    const cell = bannerCells[i] ?? "";
    if (cell) current = cell;
    banners[i] = current;
  }
  const seen = new Set<string>();
  const out: OrgElementRow[] = [];
  for (const row of sheet.rows()) {
    for (let i = 0; i < sheet.headers.length; i++) {
      const elementType = sheet.headers[i];
      const code = row.cells[i] ?? "";
      if (!elementType || !code) continue;
      const key = `${elementType} ${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ elementType, code, areaLabel: banners[i] ?? "", sheetName: src.sheet });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Controlling / financial master objects
// ---------------------------------------------------------------------------

export type CoMasterObjectRow = {
  objectType: string;
  controllingArea: string;
  code: string;
  name: string;
  category: string;
  hierarchy: string;
  functionalArea: string;
  country: string;
  level: number | null;
  /** 1-based row in the source sheet — see SapCoMasterObject.sourceRow. */
  sourceRow: number;
};

/**
 * The group sheets are an indented layout: a row's depth is which level column
 * holds its value. The level columns are declared by POSITION in the source map
 * — "Activity Type Group" appears twice as a header, once per level, so a name
 * lookup cannot tell them apart, and the Profit Centers sheet carries SAP's own
 * typo ("Leve1" for level 1).
 *
 * Only the group NODES are taken, plus the leaf members of a sheet that
 * declares a `memberColumn` because those leaves appear on no flat sheet of
 * their own. Everything else beside a ladder repeats data already loaded in
 * full, and loading it twice would inflate every count that follows.
 */
function parseHierarchySheet(
  objectType: string,
  levelColumns: number[],
  nameColumn: number | undefined,
  memberColumn: number | undefined,
  rows: { rowNumber: number; cells: string[] }[],
): CoMasterObjectRow[] {
  const out: CoMasterObjectRow[] = [];
  const seen = new Set<string>();
  const push = (code: string, name: string, hierarchy: string, level: number | null, sourceRow: number) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({
      objectType,
      controllingArea: "",
      code,
      name,
      category: "",
      hierarchy,
      functionalArea: "",
      country: "",
      level,
      sourceRow,
    });
  };
  for (const row of rows) {
    const name = nameColumn === undefined ? "" : (row.cells[nameColumn] ?? "");
    let placed = false;
    for (let depth = 0; depth < levelColumns.length; depth++) {
      const col = levelColumns[depth];
      if (col === undefined) continue;
      const code = row.cells[col] ?? "";
      if (!code) continue;
      const parentCol = depth > 0 ? levelColumns[depth - 1] : undefined;
      const parent = parentCol === undefined ? "" : (row.cells[parentCol] ?? "");
      push(code, name, parent, depth, row.rowNumber);
      placed = true;
      break; // one row names one node, at one depth
    }
    if (!placed && memberColumn !== undefined) push(row.cells[memberColumn] ?? "", name, "", null, row.rowNumber);
  }
  return out;
}

export async function parseCoMasterObjects(sources: SapContentSources): Promise<CoMasterObjectRow[]> {
  const out: CoMasterObjectRow[] = [];
  for (const entry of sources.coMasterObjects) {
    const sheet = await readSheet(entry.source);
    const rows = [...sheet.rows()];
    if (entry.levelColumns && entry.levelColumns.length > 0) {
      out.push(...parseHierarchySheet(entry.objectType, entry.levelColumns, entry.nameColumn, entry.memberColumn, rows));
      continue;
    }
    const has = (h: string) => sheet.colOrNone(h) >= 0;
    const codeHeader =
      ["Cost Center ID", "Cost Element", "Activity Type", "Key", "Functional Area", "Segment"].find(has) ?? "";
    if (!codeHeader) throw new Error(`${entry.source.file}/${entry.source.sheet}: no code column found`);
    const nameHeader = ["Name", "Description"].find(has) ?? "";
    for (const row of rows) {
      const code = row.get(codeHeader);
      if (!code) continue;
      out.push({
        objectType: entry.objectType,
        controllingArea: has("Controlling Area") ? row.get("Controlling Area") : "",
        code,
        name: nameHeader ? row.get(nameHeader) : "",
        category: has("Category")
          ? row.get("Category")
          : has("Cost Element Category")
            ? row.get("Cost Element Category")
            : "",
        hierarchy: has("Standard Hierarchy") ? row.get("Standard Hierarchy") : "",
        functionalArea: has("Functional Area") && codeHeader !== "Functional Area" ? row.get("Functional Area") : "",
        country: has("Country") ? row.get("Country") : "",
        level: null,
        sourceRow: row.rowNumber,
      });
    }
  }
  return out;
}
