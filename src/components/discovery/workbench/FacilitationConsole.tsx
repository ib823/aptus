/**
 * ABeam Workbench — C8 facilitation console (brief §7-C8, §8, §9.4).
 *
 * §8: "the consultant drives C8 (private console — tally, park, notes, jump)
 * while the client sees the projected client Present view. The consultant screen
 * shows control + notes the client never sees; the projected screen shows only
 * the calm client view."
 *
 * §9.4: "Notes in C8 are private by construction; the console never mirrors them
 * to the projection."
 *
 * "By construction" is doing real work here. The notes below reach this
 * component because it is a workbench component; there is no toggle, no
 * "share this note" affordance, and no code path that could put one on the
 * seam — the seam's payload is {live, processId} and nothing else. The privacy
 * is structural, not a setting someone could get wrong at 4pm in a workshop.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FitBar } from "@/components/discovery/FitBar";
import type { ConsoleView } from "@/lib/discovery/workbench/session";

export interface FacilitationConsoleProps {
  view: ConsoleView;
}

/** How often the console re-reads decisions so the tally moves with the room. */
const TALLY_REFRESH_MS = 4_000;

export function FacilitationConsole({ view }: FacilitationConsoleProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [jump, setJump] = useState("");
  const [status, setStatus] = useState("");

  const current = view.order.findIndex((p) => p.id === view.session.drivenProcessId);
  const prev = current > 0 ? view.order[current - 1] : null;
  const next = current >= 0 && current < view.order.length - 1 ? view.order[current + 1] : null;

  // The tally is the thing the room watches move. Poll it — a client decision
  // lands in the DB, not in this component's memory.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), TALLY_REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  const drive = useCallback(
    async (action: "start" | "goto" | "end", processId?: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/discovery/sessions/${view.session.id}/drive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...(processId ? { processId } : {}) }),
        });
        setStatus(res.ok ? "" : "Could not update the projection.");
        router.refresh();
      } catch {
        setStatus("Could not update the projection.");
      } finally {
        setBusy(false);
      }
    },
    [view.session.id, router],
  );

  async function saveNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/discovery/sessions/${view.session.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note, processId: view.session.drivenProcessId }),
      });
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const matches = jump.trim()
    ? view.order
        .filter(
          (p) =>
            p.name.toLowerCase().includes(jump.toLowerCase()) ||
            p.id.toLowerCase().includes(jump.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        {/* LIVE banner — §8: "the console's 'LIVE — projecting' banner mirrors
            exactly what the room sees". */}
        {view.session.live ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-input bg-cta px-4 py-2.5 text-white">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.05em]">
              <span className="size-2 rounded-pill bg-white" aria-hidden="true" />
              <span aria-live="polite">LIVE — projecting to {view.session.client}</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void drive("end")}
              className="ml-auto h-8 rounded-input border border-white/50 px-3 text-xs font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
            >
              End session
            </button>
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-input border border-border-default bg-paper px-4 py-2.5">
            <p className="text-xs text-ink-soft">
              Not projecting. Reviewers can still explore on their own.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void drive("start")}
              className="ml-auto h-8 rounded-input bg-cta px-3 text-xs font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
            >
              Start projecting
            </button>
          </div>
        )}

        {/* Current process + drive controls. */}
        <section className="mb-5 rounded-input border border-border-default bg-paper p-4">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            The room is looking at
          </h2>
          {current >= 0 ? (
            <p className="font-serif text-lg font-medium text-ink">
              <span className="mr-2 font-mono text-xs text-navy">{view.order[current]!.id}</span>
              {view.order[current]!.name}
              <span className="ml-2 text-xs text-ink-soft">{view.order[current]!.streamName}</span>
            </p>
          ) : (
            <p className="text-[13px] text-ink-soft">
              Nothing yet — jump to a process to put it on the projector.
            </p>
          )}

          <p className="mt-2 font-mono text-[11px] text-ink-soft" aria-live="polite">
            {current >= 0 ? `Process ${current + 1} of ${view.order.length}` : `${view.order.length} in scope`}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !prev}
              onClick={() => prev && void drive("goto", prev.id)}
              className="h-8 rounded-input border border-border-default bg-paper px-3 text-xs font-semibold text-ink-soft disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={busy || !next}
              onClick={() => next && void drive("goto", next.id)}
              className="h-8 rounded-input border border-navy bg-navy px-3 text-xs font-semibold text-white disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
            >
              Next
            </button>
          </div>
        </section>

        {/* Jump-to (§6B.23 — replaces the search bar Present hides). */}
        <section className="mb-5">
          <label htmlFor="jump" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            Jump to
          </label>
          <input
            id="jump"
            type="search"
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            placeholder="Find a process…"
            className="h-9 w-full max-w-[360px] rounded-input border border-border-default bg-paper px-3 text-[13px] text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
          />
          {matches.length > 0 && (
            <ul className="mt-1.5 max-w-[360px] overflow-hidden rounded-input border border-border-default bg-paper">
              {matches.map((m) => (
                <li key={m.id} className="border-b border-ink-tint last:border-b-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void drive("goto", m.id);
                      setJump("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-navy-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                  >
                    <span className="font-mono text-[11px] font-bold text-navy">{m.id}</span>
                    <span className="text-ink">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The live tally — real decisions, refreshed as the room decides. */}
        <section className="rounded-input border border-border-default bg-paper p-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            Live tally
          </h2>
          <p className="mb-2 text-[13px] text-ink-soft" aria-live="polite">
            {view.decided} of {view.session.processCount} processes decided
          </p>
          <FitBar mix={view.mix} />
        </section>
      </div>

      <aside className="flex flex-col gap-5">
        {/* Park list — the discuss decisions, from either surface. */}
        <section className="rounded-input border border-border-default bg-paper p-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            Parked for the workshop ({view.parked.length})
          </h2>
          {view.parked.length === 0 ? (
            <p className="text-xs text-ink-soft">Nothing parked yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {view.parked.map((p) => (
                <li key={p.id} className="flex items-start gap-1.5 text-xs">
                  <span className="font-mono text-[10px] font-bold text-navy">{p.id}</span>
                  <span className="text-ink-soft">{p.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ⚠ Private notes. §9.4: private by construction — there is no share
            control here because there is no code path to share them. */}
        <section className="rounded-input border-t-2 border-decision-custom bg-banner-warn p-4">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-decision-custom">
            Notes (private — never shown to the client)
          </h2>
          <label htmlFor="console-note" className="sr-only">
            Private facilitator note
          </label>
          <textarea
            id="console-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What you noticed…"
            className="w-full resize-y rounded-input border border-border-default bg-paper px-2 py-1.5 text-xs text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
          />
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={() => void saveNote()}
            className="mt-2 h-8 rounded-input border border-decision-custom px-3 text-xs font-semibold text-decision-custom disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Save note
          </button>

          {view.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2 border-t border-decision-custom/20 pt-3">
              {view.notes.map((n) => (
                <li key={n.id} className="text-[11px] leading-4 text-ink-soft">
                  {n.processId ? (
                    <span className="mr-1.5 font-mono text-[10px] font-bold text-navy">{n.processId}</span>
                  ) : null}
                  {n.body}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p aria-live="polite" className="min-h-[16px] text-[11px] text-decision-custom">{status}</p>
      </aside>
    </div>
  );
}
