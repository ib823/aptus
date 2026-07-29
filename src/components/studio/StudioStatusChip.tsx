/**
 * StudioStatusChip — the CoreEdge honest-status pill.
 *
 * HONEST STATUS IS PRODUCT LAW: a capability is ACTIVATED only where a live probe
 * returned 200. An empty result (200 + 0 rows) is "No records" and is visually and
 * semantically distinct from NEEDS_SETUP (401/403) and from an error. Nothing here
 * ever fabricates a status — the caller passes what the probe actually returned.
 *
 * Why this is not `components/ui/status-pill`: that pill's API is the presales
 * lifecycle (draft/sent/awaiting_signoff/signed/…). Overloading those names with
 * SAP probe meanings would make `signed` mean "SAP returned 200", which is a trap
 * for the next reader. This chip owns the honest-status vocabulary and reuses the
 * SAME underlying CSS tokens, so the two stay visually identical by construction.
 *
 * Rendered per the design tokens: pill radius, dot + label, 11.5/600.
 */

// The vocabulary itself lives in @/lib/studio/honest-status, not here: it is
// shared with server code and with the preview mapping, and a `"use client"`
// module is the wrong owner for anything both runtimes read.
import type { HonestStatus } from "@/lib/studio/honest-status";

export type { HonestStatus };

/** Honest status → the existing status token pair. No new colours. */
const TOKENS: Record<HonestStatus, { bg: string; fg: string }> = {
  ACTIVATED: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)" },
  NEEDS_SETUP: { bg: "var(--status-awaiting-bg)", fg: "var(--status-awaiting-fg)" },
  AVAILABLE: { bg: "var(--status-sent-bg)", fg: "var(--status-sent-fg)" },
  NOT_PROBEABLE: { bg: "var(--status-expired-bg)", fg: "var(--status-expired-fg)" },
  REFERENCE: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)" },
  NOT_CHECKED: { bg: "var(--status-nocheck-bg)", fg: "var(--status-nocheck-fg)" },
  NOT_FOUND: { bg: "var(--status-revoked-bg)", fg: "var(--status-revoked-fg)" },
};

const LABELS: Record<HonestStatus, string> = {
  ACTIVATED: "Activated",
  NEEDS_SETUP: "Needs setup",
  AVAILABLE: "Available",
  NOT_PROBEABLE: "Not probeable",
  REFERENCE: "Reference",
  NOT_CHECKED: "Not checked",
  NOT_FOUND: "Not found",
};

/** What each status MEANS — surfaced as the accessible description. */
const MEANINGS: Record<HonestStatus, string> = {
  ACTIVATED: "a live probe returned 200",
  NEEDS_SETUP: "401 or 403 — communication arrangement not set up",
  AVAILABLE: "event or subscribe-only; not pulled",
  NOT_PROBEABLE: "no OData endpoint to probe",
  REFERENCE: "design-time content",
  NOT_CHECKED: "not yet probed",
  NOT_FOUND: "404 — not in this tenant",
};

export function studioStatusLabel(status: HonestStatus): string {
  return LABELS[status];
}

export function StudioStatusChip({ status, label }: { status: HonestStatus; label?: string }) {
  const tone = TOKENS[status];
  const text = label ?? LABELS[status];
  return (
    <span
      role="status"
      aria-label={`${text} — ${MEANINGS[status]}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: "var(--radius-pill, 9999px)",
        fontSize: 11.5,
        fontWeight: 600,
        lineHeight: 1.4,
        background: tone.bg,
        color: tone.fg,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: "currentColor",
          flexShrink: 0,
        }}
      />
      {text}
    </span>
  );
}
