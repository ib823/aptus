"use client";

/**
 * LearnToolbar — the always-available training controls, pinned bottom-
 * right on every affirm screen. "Guide me" replays the current screen's
 * coach tour; "Decode jargon" opens the glossary drawer.
 */

import { useAffirmLearn } from "./context";

export function LearnToolbar() {
  const { openGlossary, startTour, hasTour } = useAffirmLearn();

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 print:hidden"
      data-tour="learn-toolbar"
    >
      {hasTour && (
        <button
          type="button"
          onClick={startTour}
          className="inline-flex items-center gap-1.5 rounded-pill border border-border-default bg-paper px-3.5 py-2 text-sm font-semibold text-ink shadow-card transition hover:border-navy hover:text-navy"
        >
          <span aria-hidden>🧭</span> Guide me
        </button>
      )}
      <button
        type="button"
        onClick={() => openGlossary()}
        data-tour="learn-glossary"
        className="inline-flex items-center gap-1.5 rounded-pill bg-navy px-3.5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-navy-hover"
        aria-label="Decode the jargon — open glossary"
      >
        <span aria-hidden>?</span> Decode jargon
      </button>
    </div>
  );
}
