/**
 * 2608 WS14 — ISO-3166-1 alpha-2 ↔ the country names SAP's restriction
 * register uses.
 *
 * Every other country-bearing table in the 2608 content model keys on the
 * alpha-2 code: SapProcessStep.countries, ScopeItem.country,
 * ConfigActivity.countrySpecific, SapCoMasterObject.country,
 * SapTaxCode.country. SapNotSupported is the exception — it carries the
 * English country name as SAP printed it on help.sap.com ("Malaysia",
 * "United Kingdom", "South Korea"), because that is what the page says and
 * WS13 stored the page rather than a normalisation of it.
 *
 * This map exists to join those two, and it is deliberately not a world
 * country list. It covers exactly the 38 names that appear in the register
 * as harvested, and nothing else. A name the register uses but this map
 * lacks would silently drop a restriction from a pack, so `NOT_SUPPORTED_
 * COUNTRY_NAMES` is asserted against the loaded data by a RECON fact rather
 * than trusted.
 *
 * The Philippines is NOT in this map, and that is the finding, not an
 * omission: the anonymous help.sap.com slice WS13 harvested names 38
 * countries and the Philippines is not among them. That is not evidence
 * that SAP publishes no Philippine restrictions — only that this source
 * does not carry any.
 */

/** ISO alpha-2 → the exact name SapNotSupported.country uses. */
export const NOT_SUPPORTED_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AT: "Austria",
  BE: "Belgium",
  BR: "Brazil",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  HR: "Croatia",
  CZ: "Czech Republic",
  DK: "Denmark",
  EG: "Egypt",
  FI: "Finland",
  FR: "France",
  GR: "Greece",
  HU: "Hungary",
  IN: "India",
  IE: "Ireland",
  IT: "Italy",
  KZ: "Kazakhstan",
  LU: "Luxembourg",
  MY: "Malaysia",
  MX: "Mexico",
  NL: "Netherlands",
  PE: "Peru",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SK: "Slovakia",
  SI: "Slovenia",
  KR: "South Korea",
  ES: "Spain",
  SE: "Sweden",
  CH: "Switzerland",
  TW: "Taiwan",
  TH: "Thailand",
  TR: "Turkey",
  UA: "Ukraine",
  GB: "United Kingdom",
  US: "United States",
};

/**
 * The register's country names for a footprint.
 *
 * This returns named countries only. The 264 rows whose country is NULL —
 * statements SAP makes about the product with no country qualifier — are not
 * expressible here and are added by the caller as a separate OR clause, so
 * that a footprint never loses the restrictions that apply everywhere.
 *
 * An ISO code with no entry in the map contributes nothing rather than
 * throwing: a footprint naming a country SAP publishes no restrictions for
 * is an ordinary situation, and it is reported through
 * `countriesWithoutRestrictionData` rather than as an error.
 */
export function restrictionCountryNames(countries: readonly string[]): string[] {
  const names = new Set<string>();
  for (const c of countries) {
    const name = NOT_SUPPORTED_COUNTRY_NAMES[c.toUpperCase()];
    if (name) names.add(name);
  }
  return [...names].sort();
}

/** Footprint countries the restriction register has no name for — reported, never hidden. */
export function countriesWithoutRestrictionData(countries: readonly string[]): string[] {
  return countries.filter((c) => !NOT_SUPPORTED_COUNTRY_NAMES[c.toUpperCase()]).sort();
}
