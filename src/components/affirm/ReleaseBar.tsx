"use client";

/**
 * ReleaseBar — sticky-bottom CTA strip on the consultant review screen.
 * Mirrors the .release-bar pattern from the design (helper text on the
 * left, secondary + primary buttons on the right). Two-step confirm
 * dialog appears before the irreversible release is fired.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  bundleId: string;
  totals: { fastConfirm: number; discuss: number; deviations: number };
}

export function ReleaseBar({ bundleId, totals }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fire() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/affirm/bundles/${bundleId}/release`, {
          method: "POST",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          // Stale-click handling — same pattern as the editor Issue
          // CTA. A second click on Release after the first succeeded
          // returns 409 illegal_transition; route to the output where
          // the bundle actually lives.
          if (res.status === 409 && j.error === "illegal_transition") {
            router.replace(`/affirm/${bundleId}/output`);
            return;
          }
          throw new Error(
            j.error === "not_found"
              ? "Bundle no longer exists."
              : j.error ?? `Release failed (${res.status}).`,
          );
        }
        router.replace(`/affirm/${bundleId}/output`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Release failed");
      }
    });
  }

  return (
    <>
      {/* Sticky release-bar */}
      <div className="release-bar sticky bottom-4 mt-7 flex items-center gap-4 rounded-card-warm border border-border-default bg-paper px-[22px] py-4 shadow-card-warm-hover">
        <div className="info min-w-0 flex-1">
          <div className="t text-sm font-semibold text-ink">
            Ready to release back to the client?
          </div>
          <div className="s mt-0.5 text-xs text-ink-muted">
            Releasing produces the signed affirmation record and the pre-sorted
            Fit-to-Standard workshop agenda. Delivery is manual &mdash; the workbench
            never auto-sends.
          </div>
        </div>
        <div className="actions flex shrink-0 gap-2.5">
          <button
            type="button"
            className="btn secondary md inline-flex h-10 items-center rounded-input border border-border-default bg-paper px-4 text-sm font-semibold text-ink hover:bg-ink-tint"
          >
            Send back for clarification
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            className="btn primary md inline-flex h-10 items-center justify-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover disabled:opacity-60"
          >
            Release to client
          </button>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={() => !pending && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-card-warm border-2 border-cta bg-paper p-6 shadow-card-warm-hover"
          >
            <h3 className="font-serif text-xl text-ink">Confirm release</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li>
                <span className="font-semibold text-ink">{totals.fastConfirm}</span>{" "}
                fast-confirm items will land in the workshop&apos;s confirm queue.
              </li>
              <li>
                <span className="font-semibold text-ink">{totals.discuss}</span> discuss
                items will be opened in the workshop.
              </li>
              <li>
                <span className="font-semibold text-ink">{totals.deviations}</span>{" "}
                deviations will be carried as scoping work needing design.
              </li>
              <li>The signed record will be generated and held server-side.</li>
              <li>
                You will send to the client manually &mdash; there is no auto-send.
              </li>
            </ul>
            {error && (
              <p className="mt-3 rounded-md border border-cta/40 bg-cta/5 px-3 py-2 text-sm text-cta">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="inline-flex h-10 items-center rounded-input border border-border-default bg-paper px-4 text-sm font-semibold text-ink hover:bg-ink-tint"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={fire}
                disabled={pending}
                className="inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover disabled:opacity-60"
              >
                {pending ? "Releasing…" : "Release now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
