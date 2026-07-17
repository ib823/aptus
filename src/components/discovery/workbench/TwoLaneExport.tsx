/**
 * ABeam Workbench — the two-lane export (brief §9.3).
 *
 * "two-lane export in C9: 'Client pack (neutral)' and 'Internal pack (with
 * product map)' — never one toggle that could ship the wrong thing; distinct
 * buttons, distinct confirm copy."
 *
 * So: two buttons that look nothing alike, two modals whose copy shares no
 * sentence, two endpoints. The dangerous one is amber-fenced and says what it
 * contains; the safe one says why it is safe. Nothing here is a toggle, a
 * dropdown, or a checkbox — a control with two states is a control that can be
 * in the wrong one.
 */

"use client";

import { useState } from "react";

type Lane = "client" | "internal" | null;

export interface TwoLaneExportProps {
  engagementId: string;
}

export function TwoLaneExport({ engagementId }: TwoLaneExportProps) {
  const [confirming, setConfirming] = useState<Lane>(null);

  function download(lane: "client" | "internal") {
    window.location.href = `/api/discovery/packs/${engagementId}?lane=${lane}`;
    setConfirming(null);
  }

  return (
    <>
      <p className="mb-3 text-xs text-ink-soft">
        Two lanes, never one toggle — a client export must never carry the product map.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Lane 1 — the safe one. Navy, calm, says why it is safe. */}
        <section className="rounded-input border border-navy-border bg-navy-soft p-4">
          <h3 className="mb-1 font-serif text-base font-medium text-navy">Client pack (neutral)</h3>
          <p className="mb-3 text-xs text-ink-soft">No product names. Safe to send.</p>
          <button
            type="button"
            onClick={() => setConfirming("client")}
            className="h-9 rounded-input bg-cta px-4 text-[13px] font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Export client pack
          </button>
        </section>

        {/* Lane 2 — the dangerous one. Fenced, amber, says what it contains. */}
        <section className="rounded-input border-t-2 border-decision-custom bg-banner-warn p-4">
          <h3 className="mb-1 flex items-center gap-2 font-serif text-base font-medium text-decision-custom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Internal pack (with product map)
          </h3>
          <p className="mb-3 text-xs text-status-awaiting-fg">
            Consultant only. Never send to the client.
          </p>
          <button
            type="button"
            onClick={() => setConfirming("internal")}
            className="h-9 rounded-input bg-decision-custom px-4 text-[13px] font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Export internal pack
          </button>
        </section>
      </div>

      {confirming !== null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[color-mix(in_srgb,var(--ink-primary)_40%,transparent)] p-4"
          onClick={() => setConfirming(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="export-confirm-title"
            aria-describedby="export-confirm-body"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-[440px] rounded-card-warm bg-paper p-5 shadow-pop ${
              confirming === "internal" ? "border-t-2 border-decision-custom" : ""
            }`}
          >
            {/* Distinct copy per lane — deliberately sharing no sentence, so a
                consultant reading fast cannot mistake one dialog for the other. */}
            {confirming === "client" ? (
              <>
                <h2 id="export-confirm-title" className="mb-2 font-serif text-lg font-medium text-navy">
                  Export client pack
                </h2>
                <p id="export-confirm-body" className="mb-4 text-[13px] leading-5 text-ink-soft">
                  This pack is fully product-neutral — no vendor names anywhere. Safe to send to the
                  client as their discovery record.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="h-9 rounded-input border border-border-default px-4 text-[13px] font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => download("client")}
                    className="ml-auto h-9 rounded-input bg-cta px-4 text-[13px] font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
                  >
                    Confirm client export
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2
                  id="export-confirm-title"
                  className="mb-2 font-serif text-lg font-medium text-decision-custom"
                >
                  Export internal pack
                </h2>
                <p id="export-confirm-body" className="mb-4 text-[13px] leading-5 text-ink-soft">
                  This pack includes the product-mapping table and the internal capture register,
                  with the client&apos;s own words and attribution. It is for internal ABeam use only
                  — never send this file to the client.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="h-9 rounded-input border border-border-default px-4 text-[13px] font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => download("internal")}
                    className="ml-auto h-9 rounded-input bg-decision-custom px-4 text-[13px] font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
                  >
                    Confirm internal export
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
