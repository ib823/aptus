/**
 * The Operations Center's shared primitives — where the four design decisions
 * live, so three screens cannot each interpret them differently.
 *
 * WHY THESE ARE COMPONENTS AND NOT PATTERNS. Every one of them exists to stop a
 * screen claiming more than its payload supports, and a rule that has to be
 * remembered at each call site is a rule that eventually is not. `Stat` cannot
 * render a number without being told what it is over. `Unobservable` cannot be
 * mistaken for zero. `ProvenanceStrip` is part of the card rather than a
 * decoration on it.
 *
 * NO NEW COLOURS. Everything below uses the `--status-*` token pairs the console
 * already ships — the same pairs `StudioStatusChip` uses — so the Operations
 * Center is visually indistinguishable in family from Developer Studio.
 */

import type { ReactNode } from "react";

/** The token pairs, named for what they signal rather than for their hue. */
export type OpsTone = "good" | "attention" | "bad" | "neutral" | "info" | "muted";

const TONE: Record<OpsTone, { bg: string; fg: string }> = {
  good: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)" },
  attention: { bg: "var(--status-awaiting-bg)", fg: "var(--status-awaiting-fg)" },
  bad: { bg: "var(--status-revoked-bg)", fg: "var(--status-revoked-fg)" },
  neutral: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)" },
  info: { bg: "var(--status-sent-bg)", fg: "var(--status-sent-fg)" },
  muted: { bg: "var(--status-expired-bg)", fg: "var(--status-expired-fg)" },
};

/**
 * A filled status pill: dot plus label, always both.
 *
 * The label is never optional. Status conveyed by colour alone fails AA, and the
 * three states most at risk of it here — unverified, mismatch, not-applicable —
 * are exactly the ones an operator must not confuse.
 */
export function OpsChip({
  tone,
  label,
  meaning,
}: {
  tone: OpsTone;
  label: string;
  /** Read to assistive tech, so the colour is never the only carrier. */
  meaning?: string | undefined;
}) {
  const t = TONE[tone];
  return (
    <span
      role="status"
      aria-label={meaning ? `${label} — ${meaning}` : label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 9999,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: t.bg,
        color: t.fg,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
      {label}
    </span>
  );
}

/**
 * ABSENCE, NOT A STATE — the dashed pill.
 *
 * The product's rule is that an unknown environment renders no chip at all,
 * never a guessed one. Correct, and it leaves a blank cell that reads as a
 * rendering fault. This holds the chip's position, says what is missing, and
 * introduces no new colour — an absence is not a status, so it does not get one.
 *
 * Used for exactly two things, deliberately: an undeclared environment, and a
 * connection that has never been probed. One device, one meaning.
 */
export function AbsencePill({ label, meaning }: { label: string; meaning?: string | undefined }) {
  return (
    <span
      role="status"
      aria-label={meaning ? `${label} — ${meaning}` : label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 9px",
        borderRadius: 9999,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: "transparent",
        border: "1px dashed var(--border-strong)",
        color: "var(--ink-muted)",
      }}
    >
      {label}
    </span>
  );
}

/** The card every Ops panel is built on. */
export function OpsCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface-paper)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

/**
 * THE PROVENANCE STRIP — the highest-leverage component in this workspace.
 *
 * Three decisions, each load-bearing:
 *
 *  1. IT IS FURNITURE, NOT AN ALARM. Rendered on the same fill as a table header
 *     (`--surface-ink-tint`). These notes appear on every visit; in amber they
 *     would read as unresolved warnings and be mentally dismissed within a week.
 *     They are permanent properties of the data, not conditions to clear.
 *
 *  2. THE CLAIM IS THE HEADLINE. Each strip opens with its assertion in caption
 *     type — "Floor, not census" — not the word "note" and not an icon.
 *     Scannable, specific, and impossible to read as decoration.
 *
 *  3. IT LIVES INSIDE THE CARD IT QUALIFIES. A page-level banner gets scrolled
 *     past; a strip attached to the thing it describes cannot be read apart
 *     from it.
 *
 * Never dismissible, never a tooltip, never conditional on a threshold.
 */
export function ProvenanceStrip({
  claim,
  children,
}: {
  /** The assertion itself. Written as a claim, not as a label. */
  claim: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface-ink-tint)",
        borderTop: "1px solid var(--border-default)",
        padding: "11px 16px 13px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          fontWeight: 600,
          color: "var(--ink-secondary)",
        }}
      >
        {claim}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-secondary)" }}>{children}</div>
    </div>
  );
}

/** The causes list inside a strip — a floor's reasons, an unreconciled pair's. */
export function ProvenanceReasons({ reasons }: { reasons: readonly string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 15, display: "flex", flexDirection: "column", gap: 2 }}>
      {reasons.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
}

/**
 * A number, and what it is over.
 *
 * `basis` IS NOT OPTIONAL DECORATION. Where a figure is computed over a sample
 * rather than the whole window, the line beneath it says so — and keeps saying
 * so when the sample happens to be complete. A caveat that appears only
 * sometimes is one people stop looking for, which is worse than one that is
 * always there and occasionally redundant.
 */
export function Stat({
  label,
  value,
  unit,
  basis,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  basis?: string;
  tone?: "default" | "attention";
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "var(--ink-muted)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          margin: "8px 0 2px",
          fontVariantNumeric: "tabular-nums",
          color: tone === "attention" ? "var(--warning)" : "var(--ink-primary)",
        }}
      >
        {value}
        {unit ? (
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-muted)" }}> {unit}</span>
        ) : null}
      </div>
      {basis ? (
        <div
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 11.5,
            color: "var(--ink-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {basis}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A number that cannot exist, holding its slot at full size.
 *
 * A greyed zero reads as "throttled". A spinner reads as "loading". An empty box
 * reads as broken. An em-dash at the same size and weight as a real figure says
 * the slot is genuine and the value is not — permanently, not pending.
 */
export function Unobservable({ label, why }: { label: string; why: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "var(--ink-muted)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        aria-hidden="true"
        style={{ fontSize: 26, fontWeight: 600, margin: "8px 0 2px", color: "var(--ink-disabled)" }}
      >
        —
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-secondary)", lineHeight: 1.4 }}>
        <span className="sr-only">Not observable. </span>
        {why}
      </div>
    </div>
  );
}

/** The table shell — header and rows at the console's exact metrics. */
export function OpsTable({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  color: "var(--ink-muted)",
                  fontWeight: 600,
                  padding: "9px 12px",
                  background: "var(--surface-ink-tint)",
                  borderBottom: "1px solid var(--border-default)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const opsCellStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid var(--border-default)",
  fontSize: 13,
  verticalAlign: "top",
};

export const opsMonoStyle: React.CSSProperties = {
  ...opsCellStyle,
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 12.5,
  color: "var(--ink-secondary)",
  whiteSpace: "nowrap",
};

/**
 * The three states a feed can be in before it has rows, kept distinct.
 *
 * `empty`, `needs-setup` and `error` never collapse into one another — that
 * separation is the console's oldest rule and the one most often lost when a
 * screen is written quickly.
 */
export function OpsPlaceholder({
  kind,
  title,
  detail,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  detail: string;
}) {
  return (
    <div style={{ padding: "34px 20px 30px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-primary)" }}>
        {kind === "loading" ? "Loading…" : title}
      </div>
      {kind !== "loading" ? (
        <div
          style={{
            fontSize: 13,
            color: "var(--ink-secondary)",
            marginTop: 6,
            maxWidth: "44ch",
            marginInline: "auto",
            lineHeight: 1.5,
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}

/** The page heading every Ops screen opens with. */
export function OpsHeading({ title, lede }: { title: string; lede: string }) {
  return (
    <div>
      <h1
        style={{
          margin: 0,
          fontSize: 24,
          lineHeight: "32px",
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h1>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 14,
          lineHeight: "22px",
          color: "var(--ink-secondary)",
          maxWidth: "68ch",
        }}
      >
        {lede}
      </p>
    </div>
  );
}
