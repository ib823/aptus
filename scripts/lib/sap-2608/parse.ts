/**
 * Parsers for the three 2608 catalogue workbooks (WS1). Pure: files in, records
 * out. Every derived value states which column it came from.
 */

import type { SapContentSources } from "../sap-content-sources";
import { countryColumns, readSheet } from "./xlsx";

// ---------------------------------------------------------------------------
// Availability & Dependencies
// ---------------------------------------------------------------------------

export type AdScopeItem = {
  code: string;
  name: string;
  /** Every (LOB, Business Area) pair the item is listed under, in file order. */
  lobs: string[];
  businessAreas: string[];
  cluster: string;
  component: string;
  licenseRequired: string;
  provisioning: string;
  selectableInScoping: string;
  requiredScopeCodes: string[];
  requiredMasterData: string;
  /** Country column → value ("2402", "No", "Can be added", …). */
  countries: Record<string, string>;
  /** The "MY" column verbatim. */
  myValue: string;
  availableInMy: boolean;
  /** The "MY" value when it is a release code (e.g. "2402"), else null. */
  myAvailableSince: string | null;
};

export type AdRetiredItem = { code: string; name: string };

export type AdParse = {
  items: Map<string, AdScopeItem>;
  retired: AdRetiredItem[];
  rowCount: number;
};

function splitCodes(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{2,4}$/.test(s));
}

export async function parseAvailabilityDependencies(sources: SapContentSources): Promise<AdParse> {
  if (!sources.scopeItems || !sources.retiredScopeItems)
    throw new Error(`release ${sources.release} has no A&D source`);
  const sheet = await readSheet(sources.scopeItems);
  const cc = countryColumns(sheet.headers);
  const items = new Map<string, AdScopeItem>();
  let rowCount = 0;
  for (const row of sheet.rows()) {
    const code = row.get("Scope Item ID");
    if (!code) continue;
    rowCount++;
    const lob = row.get("LOB");
    const area = row.get("Business Area");
    const existing = items.get(code);
    if (existing) {
      if (lob && !existing.lobs.includes(lob)) existing.lobs.push(lob);
      if (area && !existing.businessAreas.includes(area)) existing.businessAreas.push(area);
      continue;
    }
    const countries: Record<string, string> = {};
    for (const c of cc) countries[c] = row.get(c);
    const myValue = row.get("MY");
    items.set(code, {
      code,
      name: row.get("Description"),
      lobs: lob ? [lob] : [],
      businessAreas: area ? [area] : [],
      cluster: row.get("Cluster"),
      component: row.get("Component"),
      licenseRequired: row.get("Additional SAP S/4HANA Cloud Public Edition License Required"),
      provisioning: row.get("Provisioning"),
      selectableInScoping: row.get("SAP Central Business Configuration: Selectable in Scoping"),
      requiredScopeCodes: splitCodes(row.get("Required Scope Items and Business Conditions")),
      requiredMasterData: row.get("Required Master Data (See Master Data Scripts)"),
      countries,
      myValue,
      availableInMy: myValue !== "" && myValue !== "No",
      myAvailableSince: /^\d{4}$/.test(myValue) ? myValue : null,
    });
  }
  const retiredSheet = await readSheet(sources.retiredScopeItems);
  const retired: AdRetiredItem[] = [];
  for (const row of retiredSheet.rows()) {
    const raw = row.cells[1] ?? "";
    const m = /^([A-Z0-9]{2,4})\s*:\s*(.+)$/.exec(raw);
    if (m) retired.push({ code: m[1]!, name: m[2]!.trim() });
  }
  return { items, retired, rowCount };
}

// ---------------------------------------------------------------------------
// SSCUI list
// ---------------------------------------------------------------------------

export type SscuiRow = {
  applicationArea: string;
  applicationSubarea: string;
  configItemName: string;
  configItemId: string;
  activityDescription: string; // "Configuration Activity"
  selfService: boolean; // "Configuration Activity Available in Configuration Your Solution" === "Yes"
  configApproach: string;
  category: string;
  activityId: string; // "Configuration Activity ID" — the SSCUI id
  mainScopeItemIds: string; // raw "Main Scope Item ID" (e.g. "All" or "J14, J13")
  scopeItemId: string; // first id, or "All" — kept for the pre-WS9 consumers
  /**
   * 2608 WS9 — every id in "Main Scope Item ID", not just the first.
   *
   * `scopeItemId` was the only thing persisted in a queryable column, so an
   * activity naming hundreds of scope items was reachable from exactly one of
   * them. "All" stays a single element: expanding it would assert a per-item
   * claim SAP does not make.
   */
  mainScopeItemCodes: string[];
  scopeItemDescription: string;
  localizationScope: string;
  countrySpecific: string;
  alternateActivityId: string; // "Activity ID" (IMG activity)
  componentId: string; // "Application Component ID"
  redoInProduction: string;
  deleteCustomerRecords: string;
  additionalInfo: string;
  fileUploadEnabled: string;
};

/** Mirrors ingest-sap-zip.ts parseConfigScopeItemId: "All" passes through; else the first id. */
export function firstScopeItemId(raw: string): string {
  if (raw === "All" || raw === "") return raw || "All";
  return raw.split(/[,;]/)[0]!.trim();
}

/**
 * Every scope-item id in a raw "Main Scope Item ID" cell, de-duplicated and in
 * file order. An empty cell yields ["All"], matching `firstScopeItemId`, so the
 * two never disagree about what an unqualified activity applies to.
 */
export function scopeItemIdsFrom(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "All") return ["All"];
  const out: string[] = [];
  for (const part of trimmed.split(/[,;]/)) {
    const id = part.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out.length ? out : ["All"];
}

export async function parseSscuiList(sources: SapContentSources): Promise<SscuiRow[]> {
  if (!sources.sscui) throw new Error(`release ${sources.release} has no SSCUI source`);
  const sheet = await readSheet(sources.sscui);
  const out: SscuiRow[] = [];
  for (const row of sheet.rows()) {
    const activityId = row.get("Configuration Activity ID");
    const activity = row.get("Configuration Activity");
    if (!activityId && !activity) continue;
    const main = row.get("Main Scope Item ID");
    out.push({
      applicationArea: row.get("Application Area"),
      applicationSubarea: row.get("Application Subarea"),
      configItemName: row.get("Configuration Item Name"),
      configItemId: row.get("Configuration Item ID"),
      activityDescription: activity,
      selfService: row.get("Configuration Activity Available in Configuration Your Solution") === "Yes",
      configApproach: row.get("Configuration Approach"),
      category: row.get("Category"),
      activityId,
      mainScopeItemIds: main,
      scopeItemId: firstScopeItemId(main),
      mainScopeItemCodes: scopeItemIdsFrom(main),
      scopeItemDescription: row.get("Main Scope Item Descriptions"),
      localizationScope: row.get("Global, Country Dependent, or Localized"),
      countrySpecific: row.get("Specialized for Certain Countries"),
      alternateActivityId: row.get("Activity ID"),
      componentId: row.get("Application Component ID"),
      redoInProduction: row.get("Redo in P"),
      deleteCustomerRecords: row.get("Delete Customer Records"),
      additionalInfo: row.get("Additional Information"),
      fileUploadEnabled: row.get("File upload functionality enabled"),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Process Steps, Business Roles
// ---------------------------------------------------------------------------

export type ProcessStepRow = {
  scopeItemCode: string;
  scopeItemName: string;
  lob: string;
  businessArea: string;
  sequence: number; // 1-based within scope item, file order
  activity: string;
  fioriAppTitle: string;
  fioriAppId: string;
  fioriSemanticObject: string;
  fioriSemanticAction: string;
  businessRoleDescription: string;
  businessRoleId: string;
  countries: string[]; // country columns carrying "X"
  availableInMy: boolean;
  isGlobal: boolean;
};

export async function parseProcessSteps(sources: SapContentSources): Promise<ProcessStepRow[]> {
  if (!sources.processSteps) throw new Error(`release ${sources.release} has no Process-Steps source`);
  const sheet = await readSheet(sources.processSteps);
  const cc = countryColumns(sheet.headers);
  const hasGlobal = sheet.colOrNone("Global") > 0;
  const seq = new Map<string, number>();
  const out: ProcessStepRow[] = [];
  for (const row of sheet.rows()) {
    const code = row.get("Scope Item ID");
    if (!code) continue;
    const n = (seq.get(code) ?? 0) + 1;
    seq.set(code, n);
    const countries = cc.filter((c) => row.get(c) === "X");
    out.push({
      scopeItemCode: code,
      scopeItemName: row.get("Scope Item Description"),
      lob: row.get("LOB"),
      businessArea: row.get("Business Area"),
      sequence: n,
      activity: row.get("Solution Activity (Hierarchy)"),
      fioriAppTitle: row.get("Fiori App or Transaction Title"),
      fioriAppId: row.get("Fiori App or Transaction ID"),
      fioriSemanticObject: row.get("Fiori Semantic Object"),
      fioriSemanticAction: row.get("Fiori Semantic Action"),
      businessRoleDescription: row.get("Business Role Description"),
      businessRoleId: row.get("Business Role ID"),
      countries,
      availableInMy: countries.includes("MY"),
      isGlobal: hasGlobal && row.get("Global") === "X",
    });
  }
  return out;
}
