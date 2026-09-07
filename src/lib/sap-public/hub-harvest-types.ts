/**
 * The harvested content types — constants only, safe on the client.
 *
 * SPLIT OUT OF hub-harvest-remote.ts ON PURPOSE. That module resolves the
 * source commit from `process.env`, which makes it a server module; importing
 * it from a client component to reach this one list would pull an environment
 * reader into the browser bundle, where `process` may not exist.
 *
 * The alternative — retyping the five names in the component — is the "one fact
 * in two places" shape this codebase keeps finding defects in: the list would
 * drift from what the endpoint accepts, and the failure would be a button that
 * imports four types out of five with nothing reporting the fifth as missing.
 */

/**
 * The types the harvest emits as INDIVIDUAL rows.
 *
 * CDS_VIEW and BUILD are absent, and NOT for a bundling reason: the harvest
 * deliberately keeps them as counts only (12,100 and 6,755, recorded in
 * hub-artifact-counts.json), because they are 59% of Hub volume and the least
 * individually actionable. This module cannot serve rows that were never written.
 *
 * BADI *is* here though hub-content-bundled.ts lists it count-only. No
 * contradiction: that list governs what may be BAKED INTO a serverless
 * function, and this path bakes in nothing — 1,000 BAdIs cost a fetch.
 */
export const HARVEST_TYPES = [
  "BADI",
  "BO_INTERFACE",
  "EVENT",
  "INTEGRATION",
  "SCENARIO",
  // 2608 WS13 — the two types docs/2608/DATA-ACQUISITION-BRIEF.md target 6 named.
  // They were counted and refused before (_provenance.unmappedArtifactTypes:
  // DataProduct 334, IntegrationAdapter 91); HUB_TYPE_MAP now carries them and
  // the files are committed beside the other five. The sibling assertion in
  // tests/unit/sap/hub-harvest-remote.test.ts caught this list not being
  // updated with them — which is the whole reason it exists.
  "DATA_PRODUCT",
  "INTEGRATION_ADAPTER",
] as const;

export type HarvestType = (typeof HARVEST_TYPES)[number];

export function isHarvestType(value: string): value is HarvestType {
  return (HARVEST_TYPES as readonly string[]).includes(value);
}

/** Where the harvested files live in the repository. Kept in one place. */
export const HARVEST_REPO_PATH = "sap-references/hub-harvest";

/** Default rows processed per call. Bounded so one call cannot outrun the runtime. */
export const HARVEST_CHUNK_DEFAULT = 400;
export const HARVEST_CHUNK_MAX = 1000;
