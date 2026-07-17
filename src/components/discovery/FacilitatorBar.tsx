/**
 * ABeam Workbench — facilitator bar (brief §6/23). Present only.
 *
 * "Sticky bottom bar (--shadow-pop, paper): ◀ Prev / Next ▶ (process), a slim
 * live tally (fit-bar for the current stream), a Park for workshop button
 * (blue), a jump-to search, and a step counter mono. High contrast, ≥56px tall,
 * keyboard-mirrored."
 *
 * "Keyboard-mirrored" is the important word: every control here has a key
 * binding owned by PresentProcess, so the bar is the visible affordance for
 * bindings that already work. It is not a second implementation.
 *
 * ICONS: the .dc uses ◀ ▶ ⚑ glyphs; §12.4 says hand-drawn inline stroke, no
 * emoji (conflict #28). These are inline SVG.
 *
 * NOTES: the note field writes to DiscoveryNote — consultant-visible only. It
 * is the facilitator's private red-line, typed while the room watches, and it
 * must never reach a client payload. The privacy is enforced server-side (the
 * client view models never select notes) and asserted by the walker test; this
 * component just says so on the label, so nobody in the room misreads it.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FitBar } from "./FitBar";
import type { FitMix, FitStatus } from "@/lib/discovery/fit";

export interface FacilitatorBarProps {
  processId: string;
  prevId: string | null;
  nextId: string | null;
  stepIndex: number;
  stepCount: number;
  streamMix: FitMix;
  status: FitStatus | null;
  sealed: boolean;
  csrf: string;
  onPark: () => void;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FacilitatorBar({
  processId,
  prevId,
  nextId,
  stepIndex,
  stepCount,
  streamMix,
  sealed,
  csrf,
  onPark,
}: FacilitatorBarProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNote("");
    setNoteState("idle");
  }, [processId]);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  const saveNote = useCallback(
    async (body: string) => {
      if (!body.trim()) return;
      setNoteState("saving");
      try {
        await fetch("/d/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processId, body, csrf }),
        });
        setNoteState("saved");
      } catch {
        setNoteState("idle");
      }
    },
    [processId, csrf],
  );

  function onNoteChange(next: string) {
    setNote(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void saveNote(next), 800);
  }

  return (
    <div className="ax-no-print fixed inset-x-0 bottom-0 z-30 flex min-h-[56px] flex-wrap items-center gap-4 border-t border-border-default bg-paper px-12 py-2.5 shadow-pop">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={!prevId}
          onClick={() => prevId && router.push(`/d/process/${encodeURIComponent(prevId)}`)}
          className="ax-touch flex size-9 items-center justify-center rounded-input border border-border-default bg-paper text-ink-soft disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          <Chevron dir="left" />
          <span className="sr-only">Previous process (Shift + Left arrow)</span>
        </button>
        <button
          type="button"
          disabled={!nextId}
          onClick={() => nextId && router.push(`/d/process/${encodeURIComponent(nextId)}`)}
          className="ax-touch flex size-9 items-center justify-center rounded-input border border-border-default bg-paper text-ink-soft disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          <Chevron dir="right" />
          <span className="sr-only">Next process (Shift + Right arrow)</span>
        </button>
      </div>

      {/* Step counter, mono (§6/23). */}
      <p className="font-mono text-[13px] text-ink-soft" aria-live="polite">
        {stepCount > 0 ? (
          <>
            Step {stepIndex + 1}
            <span className="text-ink-soft">/{stepCount}</span>
          </>
        ) : (
          <span className="text-ink-soft">No flow</span>
        )}
      </p>

      {/* Live tally — the fit bar for the current stream (§7 V5 (d)). */}
      <div className="min-w-[180px] flex-1">
        <FitBar mix={streamMix} showLegend={false} />
        <p className="sr-only">
          This stream: {streamMix.standard} run as standard, {streamMix.differ} differ,{" "}
          {streamMix.discuss} to discuss, {streamMix.na} not applicable, {streamMix.open} undecided.
        </p>
      </div>

      <button
        type="button"
        disabled={sealed}
        onClick={onPark}
        className="ax-touch flex h-9 items-center gap-2 rounded-input bg-decision-configure px-4 text-[13px] font-semibold text-white disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M3 1 V13 M3 2 H11 L9 5 L11 8 H3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Park for workshop
        <kbd className="font-mono text-[10px] opacity-70" aria-hidden="true">
          P
        </kbd>
      </button>

      {/* Facilitator's private note. Never reaches a client payload. */}
      <div className="ax-input flex min-w-[220px] flex-1 flex-col">
        <label htmlFor="facilitator-note" className="sr-only">
          Private facilitator note — not shared with the client
        </label>
        <input
          id="facilitator-note"
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Private note (not shared)"
          className="h-9 rounded-input border border-border-default bg-paper px-3 text-[13px] text-ink outline-none focus-visible:border-navy focus-visible:shadow-focus-ring"
        />
        <span aria-live="polite" className="sr-only">
          {noteState === "saved" ? "Note saved" : ""}
        </span>
      </div>
    </div>
  );
}
