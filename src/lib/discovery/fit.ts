/**
 * ABeam Workbench — Neutral Process Discovery fit vocabulary.
 *
 * The four fit states a client reviewer can assign to a process, plus their
 * labels and token names. Shared by V1 (fit bars, heatmap), V2 (legend) and
 * V3's selector (PR-2b).
 *
 * TWO label sets, because the brief specifies two (corrects conflict #15, which
 * had collapsed them):
 *
 *   - FIT_CHIP_LABELS — the §9 table's "Chip label" column, verbatim. §9 is the
 *     fit selector's spec, so it is authoritative for the chips: differ reads
 *     "We do this differently".
 *   - FIT_LABELS — the legend / bucket / heatmap label. §6/17's fit-bar legend,
 *     Appendix A, and V4's bucket all read "We differ".
 *
 * That is not a contradiction: a 140px chip a reviewer clicks and a compact
 * legend row have different jobs. Using the long form in a legend would wrap;
 * using the short form on the chip would drop the brief's deliberate first-person
 * framing at the exact moment the reviewer commits to it.
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

/** Legend / bucket / heatmap labels — brief §6/17 + V4, verbatim. */
export const FIT_LABELS: Record<FitState, string> = {
  standard: "Runs as standard",
  differ: "We differ",
  discuss: "Discuss in workshop",
  na: "Not applicable",
  open: "Undecided",
};

/** Selector chip labels — brief §9 "Chip label" column, verbatim. */
export const FIT_CHIP_LABELS: Record<FitStatus, string> = {
  standard: "Runs as standard",
  differ: "We do this differently",
  discuss: "Discuss in workshop",
  na: "Not applicable",
};

/** Selector helper captions — brief §9 "Helper caption" column, verbatim. */
export const FIT_CHIP_CAPTIONS: Record<FitStatus, string> = {
  standard: "The standard flow fits how we work.",
  differ: "We have a specific requirement here.",
  discuss: "Unsure — raise it in the workshop.",
  na: "We don't run this process.",
};

/**
 * Brief §9: "'we differ' requires a reason before summary counts it as complete
 * (honest gap capture)."
 *
 * This is a COMPLETENESS rule, not a validation rule. A differ with no reason is
 * still stored and still selected — refusing the write would lose the reviewer's
 * click, which is worse than an incomplete record. It simply does not count as
 * complete, and V4 says so.
 */
export function isDecisionComplete(status: FitStatus, reason: string | null): boolean {
  if (status !== "differ") return true;
  return (reason ?? "").trim().length > 0;
}

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
