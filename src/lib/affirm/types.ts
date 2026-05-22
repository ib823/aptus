/**
 * Shared types for the value-stream affirm-set workbench.
 *
 * `choice` mirrors the master prompt's Response model:
 *   - standard: client adopts the SAP standard (default).
 *   - discuss:  parked for the Fit-to-Standard workshop.
 *   - deviate:  client wants to do this differently — requires a reason.
 *
 * `state` is the AffirmBundle lifecycle. The order is monotonic; the API
 * layer never lets a bundle slide backwards.
 */

export type AffirmChoice = "standard" | "discuss" | "deviate";

export type AffirmBundleState =
  | "draft"
  | "issued"
  | "submitted"
  | "released";

export type AffirmQuestionStatus = "suggested" | "confirmed" | "excluded";

/** Caveat statuses surfaced in the UI but never to the client. */
export type AffirmQuestionFlag =
  | "config-how-to"
  | "no-question-source"
  | null;

export interface AgendaItem {
  questionId: string;
  sapVerbatim: string;
  consultantWording: string | null;
  plainLanguageSuggested: string | null;
  sapArea: string | null;
  sapTopic: string | null;
  subProcessName: string;
  streamName: string;
  reason: string | null;
}

export interface AgendaJson {
  fastConfirm: AgendaItem[];
  discuss: AgendaItem[];
  deviations: AgendaItem[];
}

export interface SignedRecordJson {
  client: string;
  releasedAt: string; // ISO
  releasedById: string | null;
  totals: {
    standard: number;
    discuss: number;
    deviate: number;
    excludedHidden: number;
  };
  decisions: Array<{
    questionId: string;
    promptShown: string;
    sapVerbatim: string;
    choice: AffirmChoice;
    reason: string | null;
  }>;
}
