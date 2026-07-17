/**
 * ABeam Workbench — C3 process / flow editor drawer.
 *
 * READ-FIRST, per the logged decision. Full inspection ships; every edit
 * affordance renders disabled with honest copy. The library is committed JSON
 * and read-only until PR-6's P4 capture pipeline — so an enabled field here
 * would be a control that silently discards what a consultant types, which is
 * what the .dc does ("Saved (session only — persistence ships with the backing
 * service)") and worse than no field at all.
 *
 * FOCUS (brief §11: "drawers trap focus"): focus moves to the drawer on open,
 * cycles inside it, Escape closes, and focus returns to whatever opened it. The
 * .dc has no trap at all, and its backdrop click discards edits silently.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ConsultantOnlyStrip } from "./ConsultantOnlyGuard";
import type { LibraryRow } from "@/lib/discovery/workbench/library";
import type { ProductMapRow } from "@/lib/discovery/workbench/product-map";

const EDIT_DISABLED_NOTE = "Editing arrives with the capture pipeline";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ProcessDrawerProps {
  row: LibraryRow;
  map: ProductMapRow | null;
}

export function ProcessDrawer({ row, map }: ProcessDrawerProps) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  const close = useCallback(() => router.push("/discovery/library"), [router]);

  useEffect(() => {
    opener.current = document.activeElement;
    panel.current?.focus();
    const returnTo = opener.current;
    return () => {
      // Return focus to whatever opened the drawer, not to <body>.
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) returnTo.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const prov = row.provenance as
    | { source?: string; main_steps?: number; sub_steps?: number; total_activities?: number }
    | null
    | undefined;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[color-mix(in_srgb,var(--ink-primary)_30%,transparent)]" onClick={close} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[640px] flex-col bg-paper shadow-pop focus-visible:outline-none"
      >
        <header className="flex items-center gap-2.5 border-b border-border-default px-5 py-4">
          <span className="inline-flex h-[22px] items-center rounded-input bg-navy px-[7px] font-mono text-[11px] font-bold text-white">
            {row.scope_id}
          </span>
          <h2 id="drawer-title" className="min-w-0 flex-1 truncate font-serif text-base font-medium text-ink">
            {row.name}
          </h2>
          <button
            type="button"
            onClick={close}
            className="flex size-8 items-center justify-center rounded-input text-ink-soft hover:bg-ink-tint focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Close</span>
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
          <p className="rounded-input border border-border-default bg-ink-tint px-3 py-2 text-[11px] text-ink-soft">
            Read-only. {EDIT_DISABLED_NOTE}.
          </p>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-ink-soft">Name</p>
            <p className="rounded-input border border-border-default bg-paper px-2.5 py-2 text-[13px] text-ink">{row.name}</p>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            {[
              ["Stream", row.streamName],
              ["Workflow", row.workflowName],
              ["APQC", row.apqcCode ? `${row.apqcCode} ${row.apqcCategory}` : "—"],
              ["Tier", row.tier === "core" ? "Core" : "Generalized"],
              ["Industry", row.industry ?? "—"],
              ["Origin", row.origin === "sap-base" ? "Base catalogue" : "ABeam overlay"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="mb-1 text-[11px] font-semibold uppercase text-ink-soft">{k}</dt>
                <dd className="rounded-input border border-border-default bg-paper px-2.5 py-2 text-xs text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-ink-soft">Description</p>
            <p className="rounded-input border border-border-default bg-paper px-2.5 py-2 text-[13px] text-ink-soft">{row.description}</p>
          </div>

          {/* Provenance — per-process, from the data. The .dc hardcodes one
              source string on every row, including the 88 overlay processes it
              did not come from. */}
          <section className="rounded-input border border-border-default bg-cream p-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Provenance</h3>
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs text-ink-soft">
              <dt className="font-semibold">Source</dt>
              <dd>{prov?.source ?? "Not recorded"}</dd>
              <dt className="font-semibold">Completeness</dt>
              <dd>{row.completeness ?? "No flow catalogued"}</dd>
              <dt className="font-semibold">Main steps</dt>
              <dd>{row.mainSteps}</dd>
              <dt className="font-semibold">Sub-steps</dt>
              <dd>{row.subSteps}</dd>
              {prov?.total_activities !== undefined && (
                <>
                  <dt className="font-semibold">Activities available</dt>
                  <dd>{prov.total_activities}</dd>
                </>
              )}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Flow</h3>
            {!row.hasFlow ? (
              <p className="rounded-input border border-border-default px-5 py-5 text-center text-[13px] text-ink-soft">
                No step flow catalogued for this process yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {(row.flow ?? []).map((s, i) => (
                  <li key={i} className="rounded-input border border-navy-border bg-paper p-2.5">
                    <p className="mb-1 flex items-center gap-2">
                      <span className="flex size-[18px] items-center justify-center rounded-pill bg-navy font-mono text-[10px] font-bold text-white" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className="rounded-input border-l-[3px] border-navy bg-ink-tint px-2 py-0.5 text-[11px] font-semibold text-ink">
                        {s.role.trim() || "System / Automatic"}
                      </span>
                    </p>
                    <p className="text-[11.5px] font-semibold leading-[15px] text-ink">{s.step}</p>
                    {(s.substeps?.length ?? 0) > 0 && (
                      <ul className="mt-1.5 rounded-input bg-ink-tint px-2.5 py-2 text-[11px] text-ink-soft">
                        {s.substeps!.map((b, j) => (
                          <li key={j}>
                            {b.t}
                            {b.r ? <span className="text-ink-soft"> ({b.r})</span> : null}
                            {b.o ? <span className="ml-1.5 text-[9px] font-bold uppercase text-decision-custom">optional</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-2 text-[11px] text-ink-soft">Roles indicative.</p>
          </section>

          {/* The fence, inside the drawer — same guard treatment as C6 itself. */}
          <ConsultantOnlyStrip title="Product map">
            <ul className="flex flex-wrap gap-2">
              {[
                ["SAP", map?.cells.sap.ref ?? null],
                ["Oracle", map?.cells.oracle.ref ?? null],
                ["NetSuite", map?.cells.netsuite.ref ?? null],
                ["Other", map?.cells.other.ref ?? null],
              ].map(([label, ref]) => (
                <li key={label}>
                  <span
                    className={`inline-flex h-[22px] items-center rounded-pill px-2.5 text-[11px] font-bold ${
                      ref
                        ? "bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] text-decision-standard"
                        : "bg-ink-tint text-ink-soft"
                    }`}
                  >
                    {ref ? `${label} ✓ ${ref}` : `${label} · to map`}
                  </span>
                </li>
              ))}
            </ul>
          </ConsultantOnlyStrip>
        </div>

        <footer className="flex items-center gap-2.5 border-t border-border-default px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            className="h-[38px] rounded-input border border-border-default bg-paper px-4 text-[13px] font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Close
          </button>
          {/* Disabled with an honest reason, not hidden: a consultant should see
              that editing is coming and why it is not here. */}
          <button
            type="button"
            disabled
            aria-describedby="edit-note"
            className="ml-auto h-[38px] rounded-input bg-cta px-4 text-[13px] font-semibold text-white opacity-40"
          >
            Edit process
          </button>
          <p id="edit-note" className="text-[11px] text-ink-soft">
            {EDIT_DISABLED_NOTE}
          </p>
        </footer>
      </div>
    </>
  );
}
