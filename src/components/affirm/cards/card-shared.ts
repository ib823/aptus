/**
 * ABeam Workbench — Shared Affirm card types.
 *
 * DecisionCard + InfoCard were lifted out of AffirmCardList (Screen 3, internal
 * client surface) so the external executive journey (/a/*) can render the same
 * cards without forking 880 lines. The cards are fully controlled (props +
 * callbacks, no fetch): each surface supplies its own persistence handler.
 *
 * CardQuestion is a NARROW shape both surfaces can satisfy. sscuiRef and
 * isCustom are OPTIONAL — the external surface never provides them (they are
 * consultant-facing metadata / provenance), so their badges/source-suffix
 * simply don't render externally. This keeps the leak boundary intact by
 * construction.
 */

import type { AffirmChoice } from "@/lib/affirm/types";

export interface CardQuestion {
  id: string;
  sapTopic: string | null;
  sapArea: string | null;
  aboutText: string | null;
  standardMeans: string | null;
  sapVerbatim: string | null;
  /** Consultant-facing config ref — omitted on the external surface. */
  sscuiRef?: string | null;
  /** Consultant-added provenance — omitted on the external surface. */
  isCustom?: boolean;
}

export interface CardAnswerState {
  choice: AffirmChoice;
  reason: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
}

export const DECISION_LABELS: Record<AffirmChoice, string> = {
  standard: "Adopt SAP standard",
  discuss: "Discuss in workshop",
  deviate: "We do this differently",
};

export const DECISION_HELP: Record<AffirmChoice, string> = {
  standard: "Keep SAP's pre-delivered setup.",
  discuss: "Unsure — raise it in the workshop.",
  deviate: "You have a specific requirement.",
};
