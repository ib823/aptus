/**
 * AffirmBundle state-machine and pure helpers.
 *
 * Lifecycle: draft -> issued -> submitted -> released. Every transition
 * is one-way; the API layer rejects anything else. The release step is
 * THE GATE — Screen 3 in the master prompt — and is the only path that
 * produces a signed record + workshop agenda.
 */

import type { AffirmBundleState, AffirmChoice } from "@/lib/affirm/types";

const TRANSITIONS: Record<AffirmBundleState, AffirmBundleState[]> = {
  draft: ["issued"],
  issued: ["submitted"],
  submitted: ["released"],
  released: [],
};

export function canTransition(
  from: AffirmBundleState,
  to: AffirmBundleState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: AffirmBundleState,
  to: AffirmBundleState,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `[affirm] illegal state transition: ${from} -> ${to}`,
    );
  }
}

export function isClientFacing(state: AffirmBundleState): boolean {
  // While issued, the client view is live. While submitted, the client
  // has sealed their answers — read-only. Draft is consultant-only.
  return state === "issued" || state === "submitted";
}

export function isReleased(state: AffirmBundleState): boolean {
  return state === "released";
}

/**
 * Default choice for every affirm question is "standard". The master
 * prompt requires deviations to be explicit; we never auto-default to
 * discuss or deviate.
 */
export const DEFAULT_CHOICE: AffirmChoice = "standard";

/**
 * A deviation requires a reason. Empty / whitespace-only is rejected.
 * Mirrors the master prompt's "must capture a reason" requirement.
 */
export function validateChoiceReason(
  choice: AffirmChoice,
  reason: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (choice === "deviate") {
    if (!reason || !reason.trim()) {
      return { ok: false, error: "A deviation requires a short business reason." };
    }
    if (reason.trim().length > 2000) {
      return { ok: false, error: "Reason must be 2,000 characters or fewer." };
    }
  }
  return { ok: true };
}
