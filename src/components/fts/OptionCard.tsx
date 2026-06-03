"use client";

/**
 * <OptionCard> — one Standard / Configure / Custom choice sub-card.
 *
 * Extracted from the inline `ChoiceButton` that used to live in
 * DecisionCard.tsx (design brief §2.5). Rendered as its own sub-card with a
 * decision-color label chip at the top, the description as body copy, and a
 * tinted background + ring when `selected`. Pass `disabled` to render it
 * read-only (preview-as-client mode) — it then renders a non-interactive
 * element instead of a button.
 *
 * Colors come from the Pass-1 decision tokens (§1.1):
 *   std → --decision-standard (teal), cfg → --decision-configure (blue),
 *   cst → --decision-custom (amber). These mirror the repo DecisionChoice
 *   values ("std" | "cfg" | "cst"), not the brief's longhand.
 */

import type { CSSProperties } from "react";

export type OptionKind = "std" | "cfg" | "cst";

const KIND_COLOR: Record<OptionKind, string> = {
  std: "var(--decision-standard, #0F766E)",
  cfg: "var(--decision-configure, #1D4ED8)",
  cst: "var(--decision-custom, #B45309)",
};

const KIND_TINT: Record<OptionKind, string> = {
  std: "rgba(15, 118, 110, 0.10)",
  cfg: "rgba(29, 78, 216, 0.10)",
  cst: "rgba(180, 83, 9, 0.10)",
};

interface OptionCardProps {
  kind: OptionKind;
  /** Chip label, e.g. "Standard", "Configure (SSCUI)". */
  label: string;
  /** Body copy describing what this option means. */
  description: string;
  selected?: boolean;
  /** Read-only mode (preview-as-client) — no click handler, not a button. */
  disabled?: boolean;
  /** Optional mono effort hint, e.g. "+0 days" / "+7 days". */
  effortLabel?: string;
  onSelect?: () => void;
}

export function OptionCard({
  kind,
  label,
  description,
  selected = false,
  disabled = false,
  effortLabel,
  onSelect,
}: OptionCardProps) {
  const color = KIND_COLOR[kind];

  const containerStyle: CSSProperties = {
    appearance: "none",
    textAlign: "left",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    margin: 0,
    borderRadius: 12,
    border: `2px solid ${selected ? color : "var(--border-default, #E5E1D6)"}`,
    background: selected ? KIND_TINT[kind] : "var(--surface-paper, #FFFFFE)",
    boxShadow: selected ? `0 0 0 3px ${KIND_TINT[kind]}` : "none",
    color: "var(--ink-primary, #1A1A1A)",
    cursor: disabled ? "default" : "pointer",
    transition: "border-color 200ms, background 200ms, box-shadow 200ms",
    font: "inherit",
  };

  const body = (
    <>
      <span
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 10px",
          borderRadius: 9999,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.02em",
          color,
          background: KIND_TINT[kind],
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--ink-secondary, #4A4A4A)",
        }}
      >
        {description}
      </span>
      {effortLabel ? (
        <span
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            color,
          }}
        >
          {effortLabel}
        </span>
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <div aria-disabled style={containerStyle} data-selected={selected || undefined}>
        {body}
      </div>
    );
  }

  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} style={containerStyle}>
      {body}
    </button>
  );
}
