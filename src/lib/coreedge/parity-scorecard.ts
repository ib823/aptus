/**
 * The parity scorecard Control Tower renders (roadmap P1.9).
 *
 * WHERE THE FIGURES COME FROM. `pnpm coreedge:figures` writes
 * docs/coreedge/parity-scorecard.json from the same gap-simulator run as the
 * roadmap's figures (scripts/coreedge/render-roadmap-figures.mjs). CI's
 * `pnpm coreedge:check` fails when the committed file is not what the
 * simulator gives for the commit, and `vercel-build` re-checks it before it
 * touches the database. So "the page matches the CI JSON" reduces to "the page
 * renders the committed file", which is all this module does: a static
 * import, bundled into the server function, with no simulation at request
 * time (about 1.5 s of CPU) and no file read that a function trace could miss.
 *
 * SERVER-ONLY ON PURPOSE. The scorecard is gated to platform administrators.
 * Imported by a client component, the JSON would ship in a public static chunk
 * that anybody could read without signing in; this import makes that a build
 * error instead.
 *
 * THE TYPES ARE WRITTEN OUT rather than inferred from the JSON: an inferred
 * literal type follows the file's current values (a `null` that one commit
 * holds and the next does not), and the page should be checked against the
 * shape the generator promises, not against today's numbers.
 */
import "server-only";

import SCORECARD_JSON from "../../../docs/coreedge/parity-scorecard.json";

export type CellLevel = "none" | "partial" | "full";

/** Coverage over the valid scenarios, for one platform at one step. */
export interface ScorecardFigures {
  fullySupported: number;
  atLeastPartial: number;
  fullPct: number;
  partialPct: number;
  lifecycleFull: number;
}

export interface ScorecardBlocker {
  cell: string;
  /** The roadmap's wording of the cell (`prettyCell`). */
  label: string;
  leveragePct: number;
  soleBlocker: number;
}

/** Today, then each roadmap phase in matrix order. */
export interface ScorecardStep extends ScorecardFigures {
  id: string;
  name: string;
  behindIntegrationSuite: { fullPoints: number; partialPoints: number };
  /** The phase's matrix upgrades and how many the code already credits; null for Today. */
  upgrades: { total: number; creditedToday: number } | null;
  topBlockers: ScorecardBlocker[];
}

export interface ScorecardRankedBlocker extends ScorecardBlocker {
  rank: number;
  level: CellLevel;
  leverage: number;
  /** The roadmap's "Raised in" wording: "Full in P4", "Partial today; never full", "Never raised". */
  raisedIn: string;
  /** The capability registry's note on the cell. */
  note: string | null;
}

export interface ParityScorecard {
  generatedBy: string;
  schemaVersion: 1;
  inputs: {
    matrix: { path: string; sha256: string; revisedOn: string | null };
    registry: { path: string; sha256: string };
  };
  model: {
    totalPermutations: number;
    validScenarios: number;
    lifecycleStages: number;
    headlineHosting: string;
    networks: string[];
  };
  integrationSuite: ScorecardFigures;
  steps: ScorecardStep[];
  blockersToday: ScorecardRankedBlocker[];
  lifecycle: {
    stage: string;
    meaning: string;
    integrationSuite: CellLevel;
    today: CellLevel;
    /** A phase id, "Today", or the roadmap's "Never" wording. */
    reachesFullIn: string;
  }[];
  hosting: {
    hosting: string;
    headline: boolean;
    network: Record<string, CellLevel>;
    fullySupported: number;
    atLeastPartial: number;
    fullPct: number;
    partialPct: number;
  }[];
  fullToday: { cell: string; label: string; note: string | null }[];
  problems: string[];
}

export const PARITY_SCORECARD = SCORECARD_JSON as unknown as ParityScorecard;

/*
 * The roadmap's own formatting (render-roadmap-figures.mjs `n` and `p`), so a
 * figure reads the same on the page and in the document. Kept here rather
 * than taken from useOpsFeed.tsx: that is a "use client" module, and a server
 * component importing a value from it gets a client reference, not a function.
 */
export const formatCount = (n: number): string => n.toLocaleString("en");
export const formatPct = (x: number): string => `${x.toFixed(1)}%`;
/** Percentage points behind Integration Suite; negative once CoreEdge is ahead. */
export const formatPoints = (x: number): string => `${x.toFixed(1)} pts`;
