/**
 * Catalogue freshness — the one staleness judgement, as a named constant.
 *
 * The same discipline as the incident rules: a verdict a reader cannot trace
 * to a line in the source is a fabricated judgement dressed as a measurement.
 * The Catalogue Health screen prints this constant beside every verdict it
 * renders, so "STALE" always answers "stale against what?".
 */

export type CatalogueFreshness = "CURRENT" | "STALE" | "NEVER_IMPORTED";

/**
 * SAP ships S/4HANA Cloud Public Edition in half-yearly releases, and the
 * Business Accelerator Hub's published counts move with each one. A catalogue
 * snapshot older than one release cycle is therefore at least one release
 * behind by construction — not possibly, definitionally. 183 days ≈ half a
 * year, rounded up so a snapshot taken the day of a release does not flap on
 * the anniversary.
 */
export const CATALOGUE_STALE_AFTER_DAYS = 183;

/**
 * Judge one content type's freshness from the newest row write it holds.
 *
 * `newestRowAt` is `MAX(updatedAt)` — rows are only written by imports, so the
 * newest write IS the last time an import touched the type. Null means the
 * type holds no rows at all, which is its own state: an empty catalogue is not
 * a stale one, and rendering it as either CURRENT or STALE would be a claim
 * about an import that never happened.
 */
export function catalogueFreshness(newestRowAt: Date | null, now: Date): CatalogueFreshness {
  if (newestRowAt === null) return "NEVER_IMPORTED";
  const ageDays = (now.getTime() - newestRowAt.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > CATALOGUE_STALE_AFTER_DAYS ? "STALE" : "CURRENT";
}
