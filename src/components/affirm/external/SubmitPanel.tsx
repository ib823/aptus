"use client";

/**
 * <SubmitPanel> — the external submit control on /a/home. Submit seals the
 * WHOLE bundle, so it opens a confirm dialog that states this plainly (and
 * warns about any unanswered questions) before POSTing /a/submit. On success
 * the page reloads into the sealed executive-summary view.
 */

import { useState, useTransition } from "react";

interface Props {
  csrfNonce: string;
  total: number;
  answered: number;
}

export function SubmitPanel({ csrfNonce, total, answered }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unanswered = Math.max(0, total - answered);

  function submit() {
    setError(null);
    start(async () => {
      const res = await fetch("/a/submit", {
        method: "POST",
        headers: { "x-affirm-csrf": csrfNonce },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ? `Could not submit (${j.error}).` : "Could not submit.");
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="rounded-card-warm border border-border-default bg-paper p-5 shadow-card">
      <h2 className="font-serif text-xl text-ink">Ready to submit?</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {answered} of {total} question{total === 1 ? "" : "s"} answered. Submitting seals everyone&apos;s
        answers for this engagement and hands them to your consultant. Nothing is committed — the
        workshop comes next.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-input bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover"
      >
        Submit my answers
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm submit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-card-warm border border-border-default bg-paper p-6 shadow-card-warm-hover">
            <h3 className="font-serif text-lg text-ink">Submit and seal your answers?</h3>
            <p className="mt-2 text-sm text-ink-soft">
              This seals the answers for the whole engagement and can&apos;t be undone here. Your
              consultant reviews everything before anything is finalised.
            </p>
            {unanswered > 0 && (
              <p className="mt-2 rounded-input bg-banner-warn px-3 py-2 text-[13px] text-ink-soft">
                {unanswered} question{unanswered === 1 ? "" : "s"} not yet answered will be recorded as
                &ldquo;Adopt SAP standard&rdquo;.
              </p>
            )}
            {error && <p className="mt-2 text-xs text-cta" role="alert">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-input border border-border-default px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-input bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover disabled:opacity-60"
              >
                {pending ? "Submitting…" : "Submit and seal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
