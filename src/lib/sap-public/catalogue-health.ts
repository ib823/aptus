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
 * Judge one content type's freshness from its newest IMPORT (P0.3, A29).
 *
 * `newestImportAt` is `MAX(importedAt)` over the type's rows: when an import
 * last wrote them. NOT `updatedAt`. This module used to say "rows are only
 * written by imports, so the newest write IS the last import", and that was
 * false: every capability probe (probe-all, the explorer's own probe) merges
 * its result into `rawMetadataJson`, which stamps `updatedAt`. One "Probe all"
 * on any tenant made a catalogue last imported years ago read CURRENT, with
 * the probe time printed as its newest import. Only importers write
 * `importedAt` (the seed and its Rebuild, the harvest import, the import
 * script and the Hub OAuth ingest).
 *
 * Null means the type holds no imported rows at all, which is its own state:
 * an empty catalogue is not a stale one, and rendering it as either CURRENT or
 * STALE would be a claim about an import that never happened.
 */
export function catalogueFreshness(newestImportAt: Date | null, now: Date): CatalogueFreshness {
  if (newestImportAt === null) return "NEVER_IMPORTED";
  const ageDays = (now.getTime() - newestImportAt.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > CATALOGUE_STALE_AFTER_DAYS ? "STALE" : "CURRENT";
}
