/**
 * ABeam Workbench — Neutral Process Discovery fit vocabulary.
 *
 * The four fit states a client reviewer can assign to a process, plus their
 * labels and token names. Shared by V1 (fit bars, heatmap), V2 (legend) and
 * V3's selector (PR-2b).
 *
 * Labels are the brief's §9 chip labels, verbatim. "We differ" (not "We do this
 * differently") — the brief's §9 table uses the long form once, but its own fit
 * bar legend, Appendix A wireframe, and the .dc all use "We differ", so the
 * short form is the settled label. Logged as conflict #15 in BUILD-LOG.
 *
 * Invariant 4 / brief §11: decisions never rely on colour alone. Every state
 * carries a text label everywhere it renders.
 */

export const FIT_STATUSES = ["standard", "differ", "discuss", "na"] as const;
export type FitStatus = (typeof FIT_STATUSES)[number];

/** Undecided is not a stored status — it is the absence of a decision. */
export type FitState = FitStatus | "open";

const FIT_STATUS_SET = new Set<string>(FIT_STATUSES);

export function isFitStatus(value: string): value is FitStatus {
  return FIT_STATUS_SET.has(value);
}

/** Chip / legend labels — brief §9, verbatim. */
export const FIT_LABELS: Record<FitState, string> = {
  standard: "Runs as standard",
  differ: "We differ",
  discuss: "Discuss in workshop",
  na: "Not applicable",
  open: "Undecided",
};

/**
 * Token class fragments per state. Tokens only — no hex anywhere in the
 * discovery surface (invariant 5, enforced by the no-stray-hex guard).
 */
export const FIT_TOKEN: Record<FitState, string> = {
  standard: "decision-standard",
  differ: "decision-custom",
  discuss: "decision-configure",
  na: "decision-open",
  open: "ink-disabled",
};

export interface FitMix {
  standard: number;
  differ: number;
  discuss: number;
  na: number;
  open: number;
}

export function emptyFitMix(): FitMix {
  return { standard: 0, differ: 0, discuss: 0, na: 0, open: 0 };
}

export function fitMixTotal(mix: FitMix): number {
  return mix.standard + mix.differ + mix.discuss + mix.na + mix.open;
}

/** Decided = anything the reviewer has actually chosen. */
export function fitMixDecided(mix: FitMix): number {
  return fitMixTotal(mix) - mix.open;
}

/**
 * The dominant state for a heatmap cell. Ties break in FIT_STATUSES order
 * (standard → differ → discuss → na), which is deterministic rather than
 * dependent on object key order. A cell with nothing decided is "open".
 */
export function dominantFit(mix: FitMix): FitState {
  let best: FitState = "open";
  let bestN = 0;
  for (const s of FIT_STATUSES) {
    if (mix[s] > bestN) {
      best = s;
      bestN = mix[s];
    }
  }
  return best;
}
