"use client";

/**
 * Consultant-side action: issue a DRAFT bundle to the client.
 *
 * Visual mirrors the "assembled" navy-soft card pattern from the
 * design — a soft-navy band over a serif title with the primary +
 * secondary CTAs underneath.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  bundleId: string;
  selectedScopeCount: number;
  estimatedQuestionCount: number;
}

export function IssueButton({
  bundleId,
  selectedScopeCount,
  estimatedQuestionCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fire() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/affirm/bundles/${bundleId}/issue`, {
          method: "POST",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `${res.status}`);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Issue failed");
      }
    });
  }

  return (
    <div className="rounded-card-warm border border-navy bg-navy-soft px-[22px] py-5 shadow-card">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
        Bundle assembled
      </p>
      <p className="font-serif text-lg leading-7 text-ink">
        Ready to issue · {selectedScopeCount} scope items · {estimatedQuestionCount}{" "}
        Level-2 affirm question{estimatedQuestionCount === 1 ? "" : "s"}
      </p>
      <p className="mt-1.5 text-sm text-ink-soft">
        Issuing freezes the scope and unlocks the client affirm view. Questions are
        generated from SAP&apos;s BDC questionnaires with full provenance.
      </p>
      {error && (
        <p className="mt-3 rounded-md border border-cta/40 bg-paper px-3 py-2 text-sm text-cta">
          {error}
        </p>
      )}
      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={fire}
          disabled={pending || selectedScopeCount === 0}
          className="inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover disabled:opacity-60"
        >
          {pending ? "Issuing…" : "Issue to client"}
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-input border border-border-default bg-paper px-4 text-sm font-semibold text-ink hover:bg-ink-tint"
        >
          Save as draft
        </button>
      </div>
    </div>
  );
}
