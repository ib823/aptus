"use client";

/**
 * Shared context for the affirm training layer. Kept in its own module so
 * the provider and its consumers (Term chips, toolbar, screen guide) can
 * import the hook without a circular dependency on the provider file.
 */

import { createContext, useContext } from "react";
import type { GlossaryKey } from "@/constants/affirm-glossary";

export interface AffirmLearnValue {
  /** Open the glossary drawer, optionally focused on a specific term. */
  openGlossary: (term?: GlossaryKey) => void;
  /** Start the coach-mark tour for the current screen. */
  startTour: () => void;
  /** Whether the current screen has a tour available. */
  hasTour: boolean;
}

export const AffirmLearnContext = createContext<AffirmLearnValue>({
  openGlossary: () => {},
  startTour: () => {},
  hasTour: false,
});

export function useAffirmLearn(): AffirmLearnValue {
  return useContext(AffirmLearnContext);
}
