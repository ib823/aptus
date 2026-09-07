/**
 * Country-localised APIs in SAP's published interface content.
 *
 * Two facts fell out of binding a real engagement's named interfaces to SAP
 * communication scenarios, and both are properties of SAP's content rather
 * than of any one engagement. They are here so the next bid does not have to
 * re-derive them.
 *
 *   1. SAP's eDocument connectors are per country, and the set is small.
 *      A bid in a country outside that set has no published e-invoicing
 *      scenario to bind to, whatever the product brochure implies.
 *
 *   2. A scenario SAP links to a scope item can still carry an API localised
 *      to a country the engagement is not in. `API_CN_BANK_RECONCILIAITON_SRV`
 *      (SAP's own spelling) is linked to Bank Integration with File Interface,
 *      which is in scope for plenty of non-China engagements. Counting that
 *      link as coverage is a mistake this module exists to prevent.
 *
 * Source: sap-references/comm-scenarios/comm-scenarios.tsv, itself harvested
 * from SAP's published "Available Interfaces for Your Selected Scope" page.
 */

/** `CO_EDO_<CC>_...` — SAP's naming for a country eDocument connector. */
const EDOCUMENT_API = /^CO_EDO_([A-Z]{2})_/;

/**
 * `API_<CC>_...` — SAP's naming for a country-localised OData service.
 *
 * Deliberately narrow. Only two-letter segments that are real ISO-3166 alpha-2
 * codes count, and only from a curated set: `API_CV_ATTACHMENT` must not read
 * as a "CV" (Cape Verde) localisation, and `API_HR_...` is a line of business,
 * not Croatia.
 */
const LOCALISED_API = /^API_([A-Z]{2})_/;

/**
 * Two-letter prefixes that look like country codes and are not. Kept explicit
 * because the failure is silent: a false positive here would mark a perfectly
 * usable API as out-of-country and quietly shrink a bid's coverage.
 */
const NOT_A_COUNTRY = new Set(["CV", "HR", "PO", "SD", "MM", "CO", "BR"]);

export interface LocalisedApi {
  api: string;
  country: string;
}

/** Country codes of every eDocument connector in the given API names. */
export function eDocumentCountries(apiNames: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const api of apiNames) {
    const m = EDOCUMENT_API.exec(api);
    if (m) out.add(m[1]!);
  }
  return [...out].sort();
}

/**
 * APIs localised to a country other than the engagement's footprint.
 *
 * `footprint` is ISO-3166-1 alpha-2. An empty footprint returns nothing: an
 * unstated footprint is not a filter, the same rule the To-Be step source uses.
 */
export function foreignLocalisedApis(
  apiNames: Iterable<string>,
  footprint: string[],
): LocalisedApi[] {
  if (footprint.length === 0) return [];
  const inScope = new Set(footprint.map((c) => c.toUpperCase()));
  const out: LocalisedApi[] = [];
  const seen = new Set<string>();
  for (const api of apiNames) {
    const m = EDOCUMENT_API.exec(api) ?? LOCALISED_API.exec(api);
    if (!m) continue;
    const cc = m[1]!;
    if (NOT_A_COUNTRY.has(cc) || inScope.has(cc)) continue;
    if (seen.has(api)) continue;
    seen.add(api);
    out.push({ api, country: cc });
  }
  return out.sort((a, b) => a.api.localeCompare(b.api));
}

/** Does SAP publish an eDocument connector for this country? */
export function hasEDocumentConnector(
  apiNames: Iterable<string>,
  country: string,
): boolean {
  return eDocumentCountries(apiNames).includes(country.toUpperCase());
}
