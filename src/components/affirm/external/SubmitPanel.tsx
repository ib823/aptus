"use client";

/**
 * <SubmitPanel> — S4 sticky submit bar + confirm modal. Submitting seals the
 * WHOLE bundle, so the modal states that plainly, lists per-stream progress,
 * and warns about unanswered questions ("submit anyway"). POSTs /a/submit, then
 * reloads into the sealed executive summary. Token-only; focus-trapped modal.
 */

import { useEffect, useRef, useState, useTransition } from "react";

interface StreamRow {
  name: string;
  answered: number;
  total: number;
}

interface Props {
  csrfNonce: string;
  total: number;
  answered: number;
  clientName: string;
  streams: StreamRow[];
}

export function SubmitPanel({ csrfNonce, total, answered, clientName, streams }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const unanswered = Math.max(0, total - answered);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          "button,[href],input,textarea",
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open]);

  function submit() {
    setError(null);
    start(async () => {
      const res = await fetch("/a/submit", { method: "POST", headers: { "x-affirm-csrf": csrfNonce } });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ? `Could not submit (${j.error}).` : "Could not submit.");
        return;
      }
      window.location.reload();
    });
  }

  return (
    <>
      {/* Sticky submit bar */}
      <div className="ax-no-print fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-paper px-[clamp(16px,4vw,32px)] py-3.5 shadow-pop">
        <div className="mx-auto flex max-w-[880px] items-center gap-4">
          <p className="min-w-0 flex-1 text-[13px] text-ink-soft" aria-live="polite">
            {answered} of {total} answered — you can still change answers until you submit.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ax-touch shrink-0 rounded-input bg-cta px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-cta-hover focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Submit your review
          </button>
        </div>
      </div>

      {open && (
        <div
          className="ax-no-print fixed inset-0 z-[60] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-ink)_40%,transparent)] px-5"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
            className="w-full max-w-[448px] rounded-card-warm border-2 border-cta bg-paper p-6 shadow-pop"
          >
            <h2 id="submit-title" className="font-serif text-[20px] font-medium text-ink">
              Submit your review?
            </h2>

            <div className="mt-3 space-y-1">
              {streams.map((s) => (
                <div key={s.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink">{s.name}</span>
                  <span className="font-mono text-[12px] text-ink-muted">
                    {s.answered} of {s.total} answered
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[13px] leading-[19px] text-ink-soft">
              This seals answers for everyone in {clientName}&apos;s review — done when your team is
              done.
            </p>

            {unanswered > 0 && (
              <p className="mt-3 rounded-input border border-[color-mix(in_srgb,var(--color-decision-custom)_30%,transparent)] bg-banner-warn px-3 py-2 text-[13px] leading-[18px] text-ink-soft">
                {unanswered} question{unanswered === 1 ? "" : "s"} still open — you can submit anyway
                (they&apos;ll be recorded as &ldquo;Adopt SAP standard&rdquo;).
              </p>
            )}
            {error && <p className="mt-2 text-[12px] text-status-revoked-fg" role="alert">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                data-autofocus
                onClick={() => setOpen(false)}
                className="ax-touch rounded-input border border-border-default bg-paper px-4 py-2 text-[14px] font-semibold text-ink-soft transition hover:bg-ink-tint focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                Keep reviewing
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="ax-touch rounded-input bg-cta px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-cta-hover disabled:opacity-60 focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                {pending ? "Submitting…" : "Submit review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
