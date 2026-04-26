/**
 * StatusPill — the canonical status pill (one component, used everywhere).
 * Source: docs/design/v1.2/components.jsx (the prototype).
 *
 * Spec: APTUS-DESIGN-SPEC.md §6.4 (status pill is reused for granularity,
 * mandatory/non-mandatory, gap-resolution-type, scope decisions, etc.).
 *
 * Tone resolution priority:
 *   1. Explicit `tone` prop wins (caller knows best)
 *   2. PILL_MAP lookup by status string (the prototype's defaults)
 *   3. Falls back to "neutral"
 */

import { ChevronDown } from "lucide-react";

export type StatusPillTone = "success" | "warning" | "info" | "danger" | "neutral";

interface StatusPillProps {
  /** The status text to display (also used for tone lookup if `tone` not given). */
  status: string;
  /** Override the tone — wins over the PILL_MAP lookup. */
  tone?: StatusPillTone;
  /** Show a chevron-down — used when the pill is also a status-changer. */
  withChevron?: boolean;
  /** Click handler — when present, the pill renders with a pointer cursor. */
  onClick?: () => void;
  /** Default ("md") is 24 px tall; "lg" is 28 px. */
  size?: "md" | "lg";
  /** Render a small filled dot to the left of the label (in addition to the pill bg). */
  leftDot?: boolean;
}

/**
 * Default tone mapping for common status strings — taken verbatim from the
 * prototype. Caller can override by passing the `tone` prop.
 */
const PILL_MAP: Record<string, StatusPillTone> = {
  // Coverage / classification
  OOTB: "success", FIT: "success", "Mostly FIT": "success", OK: "success", Coarse: "success",
  Configuration: "warning", "Mostly Configuration": "warning", "Has Gaps": "warning", Medium: "warning", Pending: "warning",
  "In progress": "info", Fine: "info", "In Analyze": "info", "In Adjust": "info", Active: "info", Information: "info",
  Gap: "danger", "Mandatory missing": "danger", Error: "danger", "Needs Workshop": "danger",
  NA: "neutral", "Out of Scope": "neutral", Inactive: "neutral", Optional: "neutral", Draft: "neutral", Done: "neutral",
  Mandatory: "warning",
  // Plain-language outcome labels (from glossary.ts)
  "Standard SAP": "success", "Configurable": "warning", "Adapt to SAP": "warning",
  "Trusted add-on": "info", "Power-user extension": "info", "Cloud add-on (BTP)": "info",
  "Custom build": "danger", "Out of scope": "neutral", "Needs work": "danger",
  "Not applicable": "neutral", "Not yet reviewed": "neutral", "Must-have": "warning", "Nice-to-have": "neutral",
};

export function StatusPill({
  status,
  tone,
  withChevron,
  onClick,
  size = "md",
  leftDot,
}: StatusPillProps) {
  const t = tone ?? PILL_MAP[status] ?? "neutral";
  const isLg = size === "lg";

  return (
    <span
      className={`a-pill a-pill-${t}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        cursor: onClick ? "pointer" : "default",
        height: isLg ? 28 : 24,
        padding: isLg ? "0 10px" : "0 8px",
        fontSize: isLg ? 13 : 12,
      }}
    >
      {leftDot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "currentColor",
            marginRight: 2,
          }}
        />
      )}
      {status}
      {withChevron && <ChevronDown size={12} />}
    </span>
  );
}
