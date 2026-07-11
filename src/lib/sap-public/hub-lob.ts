/**
 * Line-of-business derivation for Capability Catalogue rows.
 *
 * Real LoB source (in priority):
 *   1. ScopeItem.functionalArea — resolved from the row's scopeItemCodes
 *      (majority vote). ~51% of the API rows carry scope codes.
 *   2. Keyword classifier over the title — for rows without scope codes.
 *   3. "Other" — genuinely uncategorised.
 *
 * Pure + fully unit-testable. The route/rebuild supplies the functionalAreas
 * (from a single ScopeItem lookup) and the title.
 */

export const LOB_OTHER = "Other";

/** Canonical S/4 line-of-business names → ordered keyword patterns. */
const KEYWORD_RULES: Array<{ lob: string; re: RegExp }> = [
  // Master data first (bank / business partner / material master are master data,
  // not the finance/procurement domains those words also appear in).
  { lob: "Master Data", re: /\b(business partner|bp relationship|customer master|supplier master|material master|product master|bank|address|payment terms)\b/i },
  { lob: "Sourcing and Procurement", re: /\b(purchase|purchasing|procure|procurement|sourcing|requisition|rfq|supplier invoice|supplier)\b/i },
  { lob: "Finance", re: /\b(invoice|payable|receivable|journal|ledger|general ledger|gl account|accounting|\btax\b|payment|cost center|profit center|dunning|financial|treasury)\b/i },
  { lob: "Sales", re: /\b(sales|billing|customer return|quotation|pricing|condition contract)\b/i },
  { lob: "Manufacturing", re: /\b(production|manufacturing|bill of material|\bbom\b|routing|work center|process order|planned order)\b/i },
  { lob: "Supply Chain", re: /\b(inventory|warehouse|stock|delivery|logistics|handling unit|batch|goods movement|material document)\b/i },
  { lob: "Professional Services", re: /\b(project|engagement|service order|resource|timesheet|professional service)\b/i },
  { lob: "Asset Management", re: /\b(equipment|functional location|maintenance|technical object)\b/i },
  { lob: "Human Resources", re: /\b(employee|personnel|workforce|payroll|working time)\b/i },
  { lob: "R&D / Engineering", re: /\b(engineering|document management|change master|specification|recipe)\b/i },
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
 *   - functionalAreas present → majority vote (deterministic tie-break by name)
 *   - else keyword classification of the title
 *   - else "Other"
 */
export function resolveLineOfBusiness(functionalAreas: string[], title: string): string {
  const clean = functionalAreas.filter((f) => f && f.trim());
  if (clean.length > 0) {
    const counts = new Map<string, number>();
    for (const f of clean) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  }
  return classifyLoBByKeyword(title) ?? LOB_OTHER;
}
