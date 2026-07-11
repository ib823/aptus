/**
 * Line-of-business derivation for Capability Catalogue rows.
 *
 * Real LoB source (in priority):
 *   1. ScopeItem.functionalArea — resolved from the row's scopeItemCodes,
 *      TRIMMED (the values are fixed-width space-padded in the data, which
 *      otherwise creates duplicate "Finance" vs "Finance␠␠…" groups) and with
 *      GENERIC buckets ("Application Platform and Infrastructure",
 *      "Uncategorized", "Cross-Application") skipped as low-confidence.
 *   2. Keyword classifier over the title — for rows without a confident area.
 *   3. "Other" — genuinely uncategorised.
 *
 * Pure + fully unit-testable.
 */

export const LOB_OTHER = "Other";

/** functionalArea values too generic to be a real LoB → defer to the keyword map. */
const GENERIC_FUNCTIONAL_AREAS = new Set([
  "application platform and infrastructure",
  "uncategorized",
  "uncategorised",
  "cross-application",
  "cross application",
  "not assigned",
]);

export function isGenericFunctionalArea(area: string): boolean {
  return GENERIC_FUNCTIONAL_AREAS.has(area.trim().toLowerCase());
}

/** Canonical S/4 line-of-business names → ordered keyword patterns (specific first). */
const KEYWORD_RULES: Array<{ lob: string; re: RegExp }> = [
  { lob: "Master Data", re: /\b(business partner|bp relationship|customer master|supplier master|material master|product master|bank|address|payment terms|central master data)\b/i },
  { lob: "Sourcing and Procurement", re: /\b(purchase|purchasing|procure|procurement|sourcing|requisition|rfq|request for quotation|supplier invoice|supplier|scheduling agreement|service entry sheet|source list|central procurement)\b/i },
  { lob: "Finance", re: /\b(invoice|payable|receivable|journal|ledger|general ledger|gl account|g\/l|accounting|accounting document|\btax\b|payment|cost cent(er|re)|profit cent(er|re)|dunning|financial|treasury|fixed asset|asset accounting|bank statement|cash|clearing|house bank|chart of accounts|fiscal|funds|credit management|reconciliation)\b/i },
  { lob: "Sales", re: /\b(sales|billing|customer return|quotation|pricing|condition contract|credit memo|debit memo|rebate|incentive|inquiry)\b/i },
  { lob: "Manufacturing", re: /\b(production|manufacturing|bill of material|\bbom\b|routing|work cent(er|re)|process order|planned order|inspection|quality|\bmrp\b|demand)\b/i },
  { lob: "Supply Chain", re: /\b(inventory|warehouse|stock|delivery|logistics|handling unit|batch|goods movement|material document|transportation|freight|shipment|physical inventory|available to promise|advanced)\b/i },
  { lob: "Professional Services", re: /\b(project|engagement|service order|resource|timesheet|professional service|\bwbs\b)\b/i },
  { lob: "Asset Management", re: /\b(equipment|functional location|maintenance|technical object|measuring point|measurement|notification)\b/i },
  { lob: "Human Resources", re: /\b(employee|personnel|workforce|payroll|working time|time sheet|org(anizational)? unit|position)\b/i },
  { lob: "R&D / Engineering", re: /\b(engineering|document management|change master|specification|recipe|product structure|bill of design)\b/i },
];

/** Classify a title into a LoB by keyword, or null if nothing matches. */
export function classifyLoBByKeyword(text: string): string | null {
  for (const { lob, re } of KEYWORD_RULES) {
    if (re.test(text)) return lob;
  }
  return null;
}

/**
 * Resolve the line of business for a row.
 *   - confident functionalArea(s) → majority vote (trimmed; generic buckets dropped)
 *   - else keyword classification of the title
 *   - else "Other"
 */
export function resolveLineOfBusiness(functionalAreas: string[], title: string): string {
  const clean = functionalAreas
    .map((f) => (f ?? "").trim())
    .filter((f) => f.length > 0 && !isGenericFunctionalArea(f));
  if (clean.length > 0) {
    const counts = new Map<string, number>();
    for (const f of clean) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  }
  return classifyLoBByKeyword(title) ?? LOB_OTHER;
}
