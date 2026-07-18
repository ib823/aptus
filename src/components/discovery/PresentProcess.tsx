/**
 * ABeam Workbench — Present process flow-hero (brief §7 V5 (b)–(d), §6/23).
 *
 * The projected view: serif 44/52 H1, the flow at Present scale, an oversized
 * fit selector bound to 1–4, and the facilitator bar.
 *
 * KEYBOARD (brief §6/23, verbatim): "←/→ steps, ⇧←/⇧→ processes, Space reveal,
 * P park". The .dc binds ←/→ to processes and has no step navigation at all
 * (conflict #33) — brief wins, so ←/→ walk the steps and Shift walks processes.
 * 1–4 set the fit (§6/21). Every binding is suppressed inside a text field.
 *
 * "Never scroll inside a step — paginate" (§8): the flow shows ONE step at a
 * time here, full size, rather than a scrollable swimlane. That is what makes it
 * legible at 3m. The whole-flow swimlane is Explore's job.
 *
 * Park (§6/23) is its own ACTION but not a fifth state: §9 fixes the vocabulary
 * at four and says "never introduce a fifth colour". Park sets `discuss` — the
 * .dc aliases them too, so this resolves conflict #35 as: distinct action, same
 * state, and the button says what it does.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DIFFER_EXPECTATION_NOTE,
  FLOW_FOOTNOTE,
  NO_FLOW_FALLBACK,
  OPTIONAL_TAG,
  SUBSTEP_EMPTY,
} from "@/lib/discovery/copy";
import { FIT_CHIP_LABELS, FIT_STATUSES, type FitStatus } from "@/lib/discovery/fit";
import type { DiscoveryProcessView } from "@/lib/discovery/external/journey";
import { FacilitatorBar } from "./FacilitatorBar";

const CHIP_SELECTED: Record<FitStatus, string> = {
  standard: "border-decision-standard bg-decision-standard text-white",
  differ: "border-decision-custom bg-decision-custom text-white",
  discuss: "border-decision-configure bg-decision-configure text-white",
  na: "border-decision-open bg-decision-open text-white",
};

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!(
    el &&
    (el.isContentEditable ||
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT")
  );
}

export interface PresentProcessProps {
  view: DiscoveryProcessView;
  csrf: string;
  streamMix: { standard: number; differ: number; discuss: number; na: number; open: number };
}

export function PresentProcess({ view, csrf, streamMix }: PresentProcessProps) {
  const router = useRouter();
  const p = view.process;
  const [status, setStatus] = useState<FitStatus | null>(view.decision?.status ?? null);
  const [stepIndex, setStepIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [announce, setAnnounce] = useState("");
  const liveRef = useRef<HTMLParagraphElement | null>(null);

  const steps = p.flow;
  const step = steps[stepIndex];

  const persist = useCallback(
    async (next: FitStatus) => {
      setStatus(next);
      setAnnounce(`${FIT_CHIP_LABELS[next]} — saved`);
      try {
        await fetch("/d/decisions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processId: p.id, status: next, reason: "", csrf }),
        });
        router.refresh();
      } catch {
        setAnnounce("We couldn't save that — check your connection.");
      }
    },
    [p.id, csrf, router],
  );

  const go = useCallback(
    (id: string | null) => {
      if (id) router.push(`/d/process/${encodeURIComponent(id)}`);
    },
    [router],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      // 1–4 → fit state (§6/21).
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        if (!view.sealed) void persist(FIT_STATUSES[n - 1]!);
        return;
      }

      // ⇧←/⇧→ → processes; ←/→ → steps (§6/23). The .dc has this backwards.
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) go(view.nextId);
        else setStepIndex((i) => Math.min(i + 1, Math.max(steps.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) go(view.prevId);
        else setStepIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        setRevealed((r) => !r);
        return;
      }

      // P → park (= discuss). In Present, P is the facilitator's key, not the
      // mode switch's — we are already in Present.
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (!view.sealed) void persist("discuss");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [persist, go, view.nextId, view.prevId, view.sealed, steps.length]);

  // A new process resets the step cursor — otherwise step 9 of a 20-step flow
  // carries into a 3-step one.
  useEffect(() => {
    setStepIndex(0);
    setRevealed(false);
  }, [p.id]);

  return (
    <>
      <div className="mx-auto max-w-[1280px]">
        <p className="mb-3 font-mono text-[13px] uppercase tracking-[0.04em] text-ink-soft">
          {p.id} · {view.workflowName}
        </p>
        {/* Present H1 — serif 44/52 (§3). */}
        <h1 className="mb-8 font-serif text-[44px] font-medium leading-[52px] text-ink">{p.name}</h1>

        {!p.hasFlow || !step ? (
          <div className="rounded-card-warm border border-border-default bg-paper px-12 py-16 text-center">
            <p className="text-xl text-ink-soft">{NO_FLOW_FALLBACK}</p>
          </div>
        ) : (
          <div className="rounded-card-warm border border-navy-border bg-paper p-10">
            {/* One step, full size — never scroll within a step (§8). */}
            <div className="flex items-start gap-5">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-navy font-mono text-xl font-bold text-white"
                aria-hidden="true"
              >
                {stepIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-2 inline-flex items-center gap-3">
                  <span className="rounded-input border-l-[4px] border-navy bg-ink-tint px-3 py-1.5 text-base font-semibold text-ink">
                    {step.lane}
                  </span>
                  {step.optional && (
                    <span className="text-xs font-bold uppercase tracking-[0.04em] text-ink-soft">
                      {OPTIONAL_TAG}
                    </span>
                  )}
                </p>
                {/* Present prompt scale — 20/28 minimum on-screen type (§3, §11). */}
                <p className="text-[28px] font-semibold leading-[36px] text-ink">
                  <span className="sr-only">Step {stepIndex + 1} of {steps.length}: </span>
                  {step.step}
                </p>

                {revealed && (
                  <div className="mt-5 rounded-input bg-ink-tint px-5 py-4">
                    {step.substeps.length === 0 ? (
                      <p className="text-xl text-ink-soft">{SUBSTEP_EMPTY}</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {step.substeps.map((s, i) => (
                          <li key={i} className="text-xl leading-7 text-ink-soft">
                            {s.title}
                            <span className="text-ink-soft"> ({s.lane})</span>
                            {s.optional && (
                              <span className="ml-2 text-xs font-bold uppercase text-ink-soft">
                                {OPTIONAL_TAG}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            <p className="mt-6 text-sm text-ink-soft">{FLOW_FOOTNOTE}</p>
          </div>
        )}

        {/* Oversized selector — §6/21: "In Present the selector is oversized and
            keyboard-bound (1/2/3/4)". Still a real radiogroup. */}
        <section className="mt-8">
          <h2 id="present-fit" className="mb-4 text-xl font-semibold text-ink">
            How does this fit?{" "}
            <span className="text-sm font-normal text-ink-soft">(keys 1–4)</span>
          </h2>
          <div role="radiogroup" aria-labelledby="present-fit" className="flex flex-wrap gap-3">
            {FIT_STATUSES.map((s, i) => {
              const selected = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (status === null && i === 0) ? 0 : -1}
                  disabled={view.sealed}
                  onClick={() => !view.sealed && void persist(s)}
                  className={`ax-touch flex h-12 min-w-[220px] items-center gap-2 rounded-pill border px-5 text-[15px] font-semibold transition-colors duration-[var(--dur-snap)] focus-visible:shadow-focus-ring focus-visible:outline-none motion-reduce:transition-none ${
                    selected ? CHIP_SELECTED[s] : "border-border-default bg-paper text-ink"
                  }`}
                >
                  <span className="font-mono text-xs opacity-70" aria-hidden="true">
                    {i + 1}
                  </span>
                  {FIT_CHIP_LABELS[s]}
                </button>
              );
            })}
          </div>

          {status === "differ" && (
            <p className="mt-4 max-w-[900px] rounded-input border border-decision-custom/30 bg-banner-warn px-5 py-3.5 text-base leading-6 text-ink-soft">
              {DIFFER_EXPECTATION_NOTE}
            </p>
          )}
        </section>

        <p ref={liveRef} aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      <FacilitatorBar
        processId={p.id}
        prevId={view.prevId}
        nextId={view.nextId}
        stepIndex={stepIndex}
        stepCount={steps.length}
        streamMix={streamMix}
        status={status}
        sealed={view.sealed}
        csrf={csrf}
        onPark={() => !view.sealed && void persist("discuss")}
      />
    </>
  );
}
