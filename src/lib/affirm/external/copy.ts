/**
 * ABeam Workbench — Affirm external journey copy (calibrated, qualitative).
 *
 * Per locked decision §3.3: the executive surface uses calibrated PROSE only —
 * no effort numbers, complexity scores, or quantitative signals. These are the
 * exact notes from the master prompt §8.
 */

import type { AffirmChoice } from "@/lib/affirm/types";

export const CALIBRATED_NOTES: Partial<Record<AffirmChoice, string>> = {
  deviate:
    "Noted — a difference here usually means extension work and longer testing. Your consultant will size it with you in the workshop. Nothing is committed yet.",
  discuss: "Parked for the workshop agenda. No commitment implied.",
};

export const JOURNEY_PROMISE =
  "See how the standard works, then tell us where your business differs.";

/** The "what happens next" strip stages. */
export const WHAT_HAPPENS_NEXT = ["Affirm", "Workshop", "Sizing", "Decision"] as const;

/** Meaning of each submit bucket, shown on the executive summary. */
export const BUCKET_MEANING: Record<"standard" | "discuss" | "deviate", string> = {
  standard: "You're happy to adopt SAP's standard way of working here.",
  discuss: "You'd like to talk these through in the workshop before deciding.",
  deviate: "Your business does these differently — your consultant will size the change with you.",
};
