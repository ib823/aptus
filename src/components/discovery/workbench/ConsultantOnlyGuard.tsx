/**
 * ABeam Workbench — the consultant-only fence (brief §9.2, §6B.8).
 *
 * "Product-mapping (C6) and any product name: fenced with guard label +
 * banner-warn hairline + lock; never present on any client-facing view or
 * export-labelled-client."
 *
 * §6B.8: "This component must be visually impossible to mistake for a client
 * surface." §10: 'Guard copy is unambiguous: "Consultant only — never shared
 * with the client."'
 *
 * This component lives under components/discovery/workbench/ — a directory the
 * dependency-boundary test asserts is unreachable from every (external) entry
 * point. The visual fence is the human-facing half; the import wall is the half
 * that actually holds.
 *
 * The lock is inline stroke SVG per §12.4 ("no icon-library glyphs, no emoji").
 * The .dc uses `⚠` text glyphs elsewhere; the padlock is the one place it
 * already draws real strokes, and we follow that everywhere.
 */

import type { ReactNode } from "react";

/** §10's canonical guard copy, verbatim. Uppercased by CSS, not in the string. */
export const GUARD_LABEL = "Consultant only — never shared with the client";

function Padlock({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="5"
        y="11"
        width="14"
        height="9"
        rx="1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The full-bleed banner at the top of C6. `banner-warn` fill + a 2px
 * `decision-custom` hairline + the lock + the label.
 */
export function ConsultantOnlyBanner({ caption }: { caption?: string }) {
  return (
    <div
      role="note"
      aria-labelledby="consultant-guard-label"
      className="border-b-2 border-decision-custom bg-banner-warn px-6 py-3"
    >
      <p className="flex items-center gap-2.5 text-decision-custom">
        <Padlock />
        <span
          id="consultant-guard-label"
          className="text-xs font-bold uppercase tracking-[0.05em]"
        >
          {GUARD_LABEL}
        </span>
      </p>
      {caption ? <p className="mt-1.5 text-xs text-ink-soft">{caption}</p> : null}
    </div>
  );
}

/**
 * The inline strip used inside the C3 drawer, where the product map appears as
 * a shortcut rather than a full view. Same fence, smaller frame — a consultant
 * glancing at a drawer must read the same warning as on C6 itself.
 */
export function ConsultantOnlyStrip({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={`${title} — ${GUARD_LABEL}`}
      className="rounded-input border-t-2 border-decision-custom bg-banner-warn px-3.5 py-3"
    >
      <p className="mb-2 flex items-center gap-2 text-decision-custom">
        <Padlock className="size-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.05em]">
          {GUARD_LABEL}
        </span>
      </p>
      {children}
    </section>
  );
}
