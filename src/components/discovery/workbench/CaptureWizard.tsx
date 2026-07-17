/**
 * ABeam Workbench — C5 the P4 capture wizard.
 *
 * Implements P4 §3's pipeline: triage → generalize → ANONYMIZE → REVIEW →
 * promote. The anonymization checklist and the second-reviewer sign-off are
 * explicit, required steps — the method doc's own build-note asks for exactly
 * that.
 *
 * The gates are duplicated here ONLY as affordance. The server refuses
 * regardless (capture.ts's checkPromotion is the same function), because a
 * disabled button is a courtesy and a refused write is a control.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAPTURE_TYPE_LABELS, CAPTURE_TYPES, type CaptureType } from "@/lib/discovery/workbench/capture";

export interface CaptureRow {
  id: string;
  type: string;
  rawText: string;
  linkedProcessId: string | null;
  linkedProcessName: string | null;
  status: string;
  promotedAs: string | null;
}

export interface Reviewer {
  id: string;
  name: string;
}

export interface CaptureWizardProps {
  captures: CaptureRow[];
  reviewers: Reviewer[];
  currentUserId: string;
  engagementId: string | null;
}

/** P4 §5 items 1–2, as a checklist a consultant must actually read. */
const ANONYMIZATION_CHECKS = [
  "No client name, brand, location, system, volume, price, or named role/org unit appears in the text below.",
  "No unusual combination of detail could identify the client.",
  "This describes the practice in general terms — it is not a copy of the client's instance.",
];

export function CaptureWizard({ captures, reviewers, currentUserId, engagementId }: CaptureWizardProps) {
  const router = useRouter();
  const [active, setActive] = useState<CaptureRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Wizard state
  const [type, setType] = useState<CaptureType>("T1-variant");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(ANONYMIZATION_CHECKS.map(() => false));
  const [reviewer, setReviewer] = useState("");

  const allChecked = checked.every(Boolean);
  const reviewerValid = reviewer !== "" && reviewer !== currentUserId;
  const canPromote = allChecked && reviewerValid && name.trim() && description.trim() && industry.trim();

  function open(c: CaptureRow) {
    setActive(c);
    setType((CAPTURE_TYPES as readonly string[]).includes(c.type) ? (c.type as CaptureType) : "T1-variant");
    setName("");
    setDescription("");
    setIndustry("");
    setSensitive(false);
    setChecked(ANONYMIZATION_CHECKS.map(() => false));
    setReviewer("");
    setError("");
  }

  async function harvest() {
    if (!engagementId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/discovery/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "harvest", engagementId }),
      });
      const json = (await res.json()) as { harvested?: number };
      setMessage(
        res.ok
          ? json.harvested === 0
            ? "Nothing new to harvest — every explained difference is already in the register."
            : `Harvested ${json.harvested} ${json.harvested === 1 ? "candidate" : "candidates"}.`
          : "Could not harvest.",
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function triage(captureId: string, status: string) {
    setBusy(true);
    try {
      await fetch("/api/discovery/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "triage", captureId, status }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/discovery/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote",
          captureId: active.id,
          type,
          name,
          description,
          linkedProcessId: type === "T3-process" ? null : active.linkedProcessId,
          observedIndustry: industry,
          sensitive,
          reviewedById: reviewer,
          anonymizationConfirmed: allChecked,
        }),
      });
      const json = (await res.json()) as { message?: string; scopeId?: string; sharedVisible?: boolean };
      if (!res.ok) {
        setError(json.message ?? "Could not promote this capture.");
        return;
      }
      setMessage(
        json.sharedVisible
          ? `Promoted as ${json.scopeId} — now in the shared library.`
          : `Promoted as ${json.scopeId} — held in the internal register until a second client shows the same pattern.`,
      );
      setActive(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const candidates = captures.filter((c) => c.status === "candidate");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !engagementId}
          onClick={() => void harvest()}
          className="h-9 rounded-input bg-cta px-4 text-[13px] font-semibold text-white disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          Harvest from this engagement
        </button>
        <p className="text-xs text-ink-soft">
          Pulls every explained “we differ” out of the session. Run at engagement close — the
          workshop stays a discovery, not a data-entry exercise.
        </p>
      </div>
      <p aria-live="polite" className="mb-3 min-h-[16px] text-xs text-ink-soft">{message}</p>

      {captures.length === 0 ? (
        <p className="rounded-input border border-border-default bg-paper px-6 py-10 text-center text-[13px] text-ink-soft">
          No captures yet. Harvest an engagement once its decisions are in.
        </p>
      ) : (
        <div className="overflow-auto rounded-input border border-border-default bg-paper">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <caption className="sr-only">
              The internal capture register for this engagement. The client&apos;s own words stay
              here; only the generalized entry reaches the shared library.
            </caption>
            <thead className="bg-ink-tint">
              <tr>
                {["Type", "Captured text (internal only)", "Process", "Status", "Action"].map((h) => (
                  <th key={h} scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {captures.map((c) => (
                <tr key={c.id} className="border-b border-ink-tint">
                  <td className="px-3.5 py-3 font-mono text-[11px] text-ink-soft">{c.type}</td>
                  <td className="px-3.5 py-3 text-xs text-ink">{c.rawText}</td>
                  <td className="px-3.5 py-3 text-[11px] text-ink-soft">
                    {c.linkedProcessId ? (
                      <>
                        <span className="font-mono font-bold text-navy">{c.linkedProcessId}</span>{" "}
                        {c.linkedProcessName}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className="inline-flex h-5 items-center rounded-pill bg-ink-tint px-2 text-[10px] font-bold uppercase text-ink-soft">
                      {c.status}
                      {c.promotedAs ? ` · ${c.promotedAs}` : ""}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    {c.status === "candidate" ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => open(c)}
                          className="h-7 rounded-input border border-navy bg-navy px-2 text-[11px] font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
                        >
                          Promote
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void triage(c.id, "merged")}
                          className="h-7 rounded-input border border-border-default px-2 text-[11px] font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                        >
                          Merge
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void triage(c.id, "dropped")}
                          className="h-7 rounded-input border border-border-default px-2 text-[11px] font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                        >
                          Drop
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {candidates.length === 0 && captures.length > 0 && (
        <p className="mt-3 text-xs text-ink-soft">
          Every capture has been triaged. P4 expects roughly 30–50% promoted — 100% means triage
          isn&apos;t filtering.
        </p>
      )}

      {active && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[color-mix(in_srgb,var(--ink-primary)_40%,transparent)] p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wizard-title"
            className="max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-card-warm bg-paper p-5 shadow-pop"
          >
            <h2 id="wizard-title" className="mb-1 font-serif text-lg font-medium text-navy">
              Promote to the library
            </h2>
            <p className="mb-4 text-xs text-ink-soft">
              Generalize, anonymize, get a second pair of eyes, then commit.
            </p>

            {/* 1 · Triage */}
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-[11px] font-semibold uppercase text-ink-soft">
                1 · Classify
              </legend>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CaptureType)}
                aria-label="Capture type"
                className="h-9 w-full rounded-input border border-navy-border bg-navy-soft px-2 text-xs text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                {CAPTURE_TYPES.map((t) => (
                  <option key={t} value={t}>{CAPTURE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </fieldset>

            {/* The client's raw words, shown for reference and never promoted. */}
            <div className="mb-4 rounded-input border-t-2 border-decision-custom bg-banner-warn p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.05em] text-decision-custom">
                What the client said — internal only, never promoted
              </p>
              <p className="text-xs italic text-ink-soft">“{active.rawText}”</p>
            </div>

            {/* 2 · Generalize */}
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-[11px] font-semibold uppercase text-ink-soft">
                2 · Generalize
              </legend>
              <label htmlFor="w-name" className="sr-only">Generalized name</label>
              <input
                id="w-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Milestone-based staged invoicing (variant)"
                className="mb-2 h-9 w-full rounded-input border border-navy-border bg-navy-soft px-2 text-xs text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
              />
              <label htmlFor="w-desc" className="sr-only">Generalized description</label>
              <textarea
                id="w-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe the practice, not this client's instance."
                className="w-full resize-y rounded-input border border-navy-border bg-navy-soft px-2 py-1.5 text-xs text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
              />
              <label htmlFor="w-industry" className="mt-2 block text-[11px] text-ink-soft">
                Observed in — sector level only, never narrower
              </label>
              <input
                id="w-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="FMCG distribution"
                className="h-9 w-full rounded-input border border-navy-border bg-navy-soft px-2 text-xs text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
              />
            </fieldset>

            {/* 3 · Anonymization checklist — required, explicit */}
            <fieldset className="mb-4 rounded-input border border-decision-custom/30 bg-banner-warn p-3">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.05em] text-decision-custom">
                3 · Anonymization checklist
              </legend>
              <ul className="flex flex-col gap-2">
                {ANONYMIZATION_CHECKS.map((c, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 text-[11px] leading-4 text-ink-soft">
                      <input
                        type="checkbox"
                        checked={checked[i]}
                        onChange={(e) => {
                          const next = [...checked];
                          next[i] = e.target.checked;
                          setChecked(next);
                        }}
                        className="mt-0.5 size-4 shrink-0 accent-navy"
                      />
                      {c}
                    </label>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2 border-t border-decision-custom/20 pt-2.5 text-[11px] leading-4 text-ink-soft">
                <input
                  type="checkbox"
                  checked={sensitive}
                  onChange={(e) => setSensitive(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-navy"
                />
                This encodes competitively distinctive practice. Hold it in the internal register
                until a second client shows the same pattern.
              </label>
            </fieldset>

            {/* 4 · Second-reviewer sign-off — required, and must be someone else */}
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-[11px] font-semibold uppercase text-ink-soft">
                4 · Second-consultant review
              </legend>
              <label htmlFor="w-reviewer" className="mb-1 block text-[11px] text-ink-soft">
                Who reviewed this? The author of a capture is the worst judge of whether it still
                identifies the client.
              </label>
              <select
                id="w-reviewer"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className="h-9 w-full rounded-input border border-navy-border bg-navy-soft px-2 text-xs text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                <option value="">Select a reviewer…</option>
                {reviewers
                  .filter((r) => r.id !== currentUserId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
              </select>
              {reviewers.filter((r) => r.id !== currentUserId).length === 0 && (
                <p className="mt-1 text-[11px] text-decision-custom">
                  No other consultant is available to review. A promotion cannot proceed without one.
                </p>
              )}
            </fieldset>

            {error && (
              <p role="alert" className="mb-3 rounded-input border border-decision-custom/30 bg-banner-warn px-3 py-2 text-[11px] text-decision-custom">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="h-9 rounded-input border border-border-default px-4 text-[13px] font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !canPromote}
                onClick={() => void promote()}
                className="ml-auto h-9 rounded-input bg-cta px-4 text-[13px] font-semibold text-white disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                Promote
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
