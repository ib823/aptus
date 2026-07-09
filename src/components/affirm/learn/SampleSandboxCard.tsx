"use client";

/**
 * "Try it with sample data" — the sandbox entry card.
 *
 * Provisions (or resets) a ready-made demo affirm bundle for the current
 * user via POST /api/affirm/sample, then drops them into the client
 * affirm view where the guided tour auto-runs and every term is
 * decodable — the full journey with zero setup and nothing real to
 * break. A full-page navigation (not router.push) guarantees the landing
 * even if soft navigation stalls.
 *
 * Render only where the sandbox is enabled — the server page should gate
 * this behind the internal-test flag.
 */

import { useState } from "react";

export function SampleSandboxCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/affirm/sample", { method: "POST" });
      const data: { bundleId?: string; message?: string; error?: string } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.bundleId) {
        setError(data.message ?? data.error ?? "Couldn't start the sample. Please try again.");
        setLoading(false);
        return;
      }
      // Full navigation into the client affirm view; keep loading true so
      // the button stays disabled until the page unloads.
      window.location.assign(`/affirm/${data.bundleId}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-card-warm border border-dashed border-navy/40 bg-navy-soft/60 shadow-card">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-[640px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
            New here? Take the guided walk-through
          </p>
          <h2 className="mt-0.5 font-serif text-xl text-ink">Try it with sample data</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Walk the whole affirm flow on a pre-filled demo client — no SAP knowledge
            needed. Lands you in a ready-made bundle with the guided tour running and
            every term one tap from a plain-language definition. Resets each time you
            start it, so nothing real is affected.
          </p>
          {error && (
            <p className="mt-2 text-sm text-cta" role="alert">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={start}
          disabled={loading}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-input bg-navy px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-hover disabled:opacity-60"
        >
          {loading ? "Preparing…" : "Start the tour →"}
        </button>
      </div>
    </section>
  );
}
