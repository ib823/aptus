/**
 * ABeam Workbench — fit / scope selector (brief §6/21 + §9). The decision point.
 *
 * This is where the a11y debt closes. The .dc renders four plain <button>s with
 * no grouping, no selected state exposed, no arrow keys, and `outline:none`
 * (conflict #26). Brief §11 requires "choice/fit chips are real radiogroup
 * semantics", "visible focus on every interactive element", and
 * "aria-live=polite on autosave".
 *
 * Radiogroup semantics, done properly:
 *  - role="radiogroup" labelled by the prompt; role="radio" + aria-checked on each chip.
 *  - ROVING TABINDEX: exactly one chip is tabbable, so Tab moves past the group
 *    rather than through four stops; arrows move within it. This is the WAI-ARIA
 *    radiogroup pattern, and it is why the chips are buttons with managed
 *    tabIndex rather than native <input type=radio> — native radios cannot carry
 *    the two-line chip content the brief specifies without label gymnastics.
 *  - Arrow keys wrap, and select on move (the pattern's default for radios).
 *  - Home/End jump to the ends.
 *
 * Autosave: every change POSTs and announces via aria-live=polite. The reason
 * textarea debounces so a sentence is one save, not thirty.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DIFFER_BOX_LABEL,
  DIFFER_EXPECTATION_NOTE,
  DIFFER_PLACEHOLDER,
  DISCUSS_PARKED_NOTE,
  FIT_PROMPT,
  PROMISE_NOT_COMMITTED,
  STANDARD_BOX_BODY,
  STANDARD_BOX_LABEL,
} from "@/lib/discovery/copy";
import {
  FIT_CHIP_CAPTIONS,
  FIT_CHIP_LABELS,
  FIT_STATUSES,
  isDecisionComplete,
  type FitStatus,
} from "@/lib/discovery/fit";

const CHIP_SELECTED: Record<FitStatus, string> = {
  standard: "border-decision-standard bg-decision-standard text-white",
  differ: "border-decision-custom bg-decision-custom text-white",
  discuss: "border-decision-configure bg-decision-configure text-white",
  na: "border-decision-open bg-decision-open text-white",
};

type SaveState = "idle" | "saving" | "saved" | "error";

export interface FitSelectorProps {
  processId: string;
  initialStatus: FitStatus | null;
  initialReason: string | null;
  sealed: boolean;
  csrf: string;
}

export function FitSelector({
  processId,
  initialStatus,
  initialReason,
  sealed,
  csrf,
}: FitSelectorProps) {
  const [status, setStatus] = useState<FitStatus | null>(initialStatus);
  const [reason, setReason] = useState(initialReason ?? "");
  const [save, setSave] = useState<SaveState>("idle");
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    async (next: FitStatus, nextReason: string) => {
      setSave("saving");
      try {
        const res = await fetch("/d/decisions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processId, status: next, reason: nextReason, csrf }),
        });
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    },
    [processId, csrf],
  );

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function select(next: FitStatus) {
    if (sealed) return;
    setStatus(next);
    void persist(next, next === "differ" ? reason : "");
  }

  function onReasonChange(next: string) {
    if (sealed) return;
    setReason(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (status) void persist(status, next);
    }, 600);
  }

  /** WAI-ARIA radiogroup keyboard: arrows move + select, wrapping; Home/End jump. */
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (sealed) return;
    const last = FIT_STATUSES.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    select(FIT_STATUSES[next]!);
    chipRefs.current[next]?.focus();
  }

  // Roving tabindex: the selected chip is the tab stop; with nothing selected the
  // first chip is, so the group is always reachable in exactly one Tab.
  const tabIndexFor = (i: number) =>
    status === null ? (i === 0 ? 0 : -1) : FIT_STATUSES[i] === status ? 0 : -1;

  const incompleteDiffer = status === "differ" && !isDecisionComplete("differ", reason);

  return (
    <section className="border-t border-border-default pt-6">
      <h2 id={`fit-prompt-${processId}`} className="mb-1 text-[15px] font-semibold text-ink">
        {FIT_PROMPT}
      </h2>
      <p className="mb-3.5 text-[13px] text-ink-soft">{PROMISE_NOT_COMMITTED}</p>

      <div
        role="radiogroup"
        aria-labelledby={`fit-prompt-${processId}`}
        aria-disabled={sealed || undefined}
        className="mb-4 flex flex-wrap gap-2"
      >
        {FIT_STATUSES.map((s, i) => {
          const selected = status === s;
          return (
            <button
              key={s}
              ref={(el) => { chipRefs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={tabIndexFor(i)}
              disabled={sealed}
              onClick={() => select(s)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`ax-touch flex min-w-[160px] flex-1 flex-col items-start gap-0.5 rounded-card-warm border px-4 py-2.5 text-left transition-colors duration-[var(--dur-snap)] focus-visible:shadow-focus-ring focus-visible:outline-none disabled:cursor-default motion-reduce:transition-none ${
                selected ? CHIP_SELECTED[s] : "border-border-default bg-paper text-ink"
              } ${sealed && !selected ? "opacity-50" : ""}`}
            >
              <span className="text-xs font-semibold">{FIT_CHIP_LABELS[s]}</span>
              {/* Helper caption — brief §9. The .dc renders none (conflict #14). */}
              <span className={`text-[11px] leading-4 ${selected ? "text-white/80" : "text-ink-soft"}`}>
                {FIT_CHIP_CAPTIONS[s]}
              </span>
            </button>
          );
        })}
      </div>

      {status === "standard" && (
        <div className="rounded-input border border-decision-standard/30 bg-[color-mix(in_srgb,var(--decision-standard)_5%,transparent)] px-4 py-3.5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-decision-standard">
            {STANDARD_BOX_LABEL}
          </p>
          <p className="text-[13px] leading-[19px] text-ink-soft">{STANDARD_BOX_BODY}</p>
        </div>
      )}

      {status === "differ" && (
        <div className="rounded-input border border-decision-custom/30 bg-banner-warn px-4 py-3.5">
          <label
            htmlFor={`reason-${processId}`}
            className="mb-2 block text-[11px] font-bold uppercase tracking-[0.06em] text-decision-custom"
          >
            {DIFFER_BOX_LABEL}
          </label>
          <textarea
            id={`reason-${processId}`}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            readOnly={sealed}
            placeholder={sealed ? undefined : DIFFER_PLACEHOLDER}
            aria-describedby={`reason-note-${processId}`}
            className="ax-input min-h-[70px] w-full resize-y border-0 bg-transparent text-[13px] leading-[19px] text-ink outline-none focus-visible:shadow-focus-ring"
          />
          {/* Brief §9: a differ needs a reason before the summary counts it
              complete. It is a completeness rule, not a validation gate — the
              selection is saved either way, and V4 reports the gap honestly. */}
          {incompleteDiffer && !sealed && (
            <p className="mt-1 text-[11px] font-semibold text-decision-custom">
              Add a reason so we can size this properly — until then it counts as
              incomplete on your summary.
            </p>
          )}
          <p
            id={`reason-note-${processId}`}
            className="mt-2.5 border-t border-decision-custom/20 pt-2.5 text-xs leading-[17px] text-ink-soft"
          >
            {DIFFER_EXPECTATION_NOTE}
          </p>
        </div>
      )}

      {status === "discuss" && (
        <div className="rounded-input bg-navy-soft px-4 py-3.5 text-[13px] text-ink-soft">
          {DISCUSS_PARKED_NOTE}
        </div>
      )}

      {/* Autosave tick — brief §6/21 + §11 aria-live=polite. */}
      <p aria-live="polite" className="mt-3 min-h-[16px] text-[11px] text-ink-soft">
        {sealed
          ? null
          : save === "saving"
            ? "Saving…"
            : save === "saved"
              ? "Saved"
              : save === "error"
                ? "We couldn't save that — check your connection and try again."
                : null}
      </p>
    </section>
  );
}
