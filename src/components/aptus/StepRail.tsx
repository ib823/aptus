/**
 * StepRail — the canonical 5-step navigation for the assessment flow.
 * Source: docs/design/v1.2/components.jsx (the prototype).
 *
 * Spec: APTUS-DESIGN-SPEC.md §3 (the 5-step JTBD spine: Profile → Scope →
 * Analyze → Adjust → Export). The 5 steps are the product's spine and are
 * exposed as the exported `STEPS` const so any other surface can reference
 * the same canonical labels.
 *
 * Three render variants:
 *   - "rail" (default): vertical list with markers + connector lines (sidebar use)
 *   - "progress": horizontal segmented bar (top-of-content slim indicator)
 *   - "breadcrumb": horizontal pill chain with chevrons (top-of-content nav)
 */

import { Fragment } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";

export interface AptusStep {
  /** Step number (1-indexed). */
  n: number;
  /** Stable key for routing/state. */
  key: "profile" | "scope" | "analyze" | "adjust" | "export";
  /** Display label. */
  label: string;
  /** Sub-label shown only in "rail" variant. */
  sub: string;
}

/** The canonical 5 steps. Single source of truth — referenced by spec §3. */
export const STEPS: ReadonlyArray<AptusStep> = [
  { n: 1, key: "profile", label: "Profile", sub: "Engagement basics" },
  { n: 2, key: "scope", label: "Scope", sub: "Bring requirements" },
  { n: 3, key: "analyze", label: "Analyze", sub: "Classify FIT/Config/Gap" },
  { n: 4, key: "adjust", label: "Adjust", sub: "Refine & override" },
  { n: 5, key: "export", label: "Export", sub: "Download bundle" },
];

interface StepRailProps {
  /** Current step number (1–5). */
  current: number;
  /** Step numbers that are already complete. */
  completed?: number[];
  /** Click handler for a step (no-op for locked steps). */
  onSelect?: (n: number) => void;
  /** Render variant. Defaults to "rail". */
  variant?: "rail" | "progress" | "breadcrumb";
}

export function StepRail({
  current,
  completed = [],
  onSelect,
  variant = "rail",
}: StepRailProps) {
  if (variant === "progress") {
    return (
      <div className="a-step-progress" style={{ width: "100%", display: "flex", height: 4, borderRadius: 999, overflow: "hidden", background: "var(--aptus-surface-2)", marginBottom: 24 }}>
        {STEPS.map((s) => {
          const isComplete = completed.includes(s.n);
          const isCurrent = current === s.n;
          return (
            <div
              key={s.key}
              style={{
                flex: 1,
                background: isComplete ? "var(--aptus-brand)" : isCurrent ? "var(--aptus-brand)" : "var(--aptus-border)",
                opacity: isCurrent && !isComplete ? 0.5 : 1,
                borderRight: "2px solid var(--aptus-bg)",
              }}
            />
          );
        })}
      </div>
    );
  }

  if (variant === "breadcrumb") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
        {STEPS.map((s, i) => {
          const isComplete = completed.includes(s.n);
          const isCurrent = current === s.n;
          const isLocked = !isComplete && !isCurrent && s.n > Math.max(current, ...completed) + 1;
          return (
            <Fragment key={s.key}>
              <button
                disabled={isLocked}
                onClick={() => !isLocked && onSelect?.(s.n)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: isCurrent ? "var(--aptus-surface-2)" : "transparent",
                  color: isLocked ? "var(--aptus-text-subtle)" : isCurrent ? "var(--aptus-text)" : "var(--aptus-text-muted)",
                  fontSize: 13,
                  fontWeight: isCurrent ? 600 : 500,
                  cursor: isLocked ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isComplete ? "var(--aptus-brand)" : "var(--aptus-surface-2)",
                    border: `1.5px solid ${isComplete ? "var(--aptus-brand)" : isCurrent ? "var(--aptus-brand)" : "var(--aptus-border-strong)"}`,
                    color: isComplete ? "var(--aptus-brand-text)" : "var(--aptus-text-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {isComplete ? <Check size={12} /> : s.n}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={14} style={{ color: "var(--aptus-text-subtle)" }} />}
            </Fragment>
          );
        })}
      </div>
    );
  }

  // default: "rail"
  return (
    <div className="a-step-rail">
      {STEPS.map((s, i) => {
        const isComplete = completed.includes(s.n);
        const isCurrent = current === s.n;
        const isLocked = !isComplete && !isCurrent && s.n > Math.max(current, ...completed) + 1;
        const cls = [
          "a-step-item",
          isCurrent && "a-active",
          isComplete && "a-complete",
          isLocked && "a-locked",
        ].filter(Boolean).join(" ");
        return (
          <div
            key={s.key}
            className={cls}
            onClick={() => !isLocked && onSelect?.(s.n)}
            role={isLocked ? undefined : "button"}
            tabIndex={isLocked ? -1 : 0}
            style={{ position: "relative" }}
          >
            <div className="a-step-marker">
              {isLocked ? <Lock size={11} /> : isComplete ? <Check size={12} /> : s.n}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {s.label}
              <small style={{ display: "block", fontWeight: 400, color: "var(--aptus-text-muted)", fontSize: 11 }}>
                {s.sub}
              </small>
            </div>
            {i < STEPS.length - 1 && (
              <span
                style={{
                  position: "absolute",
                  left: 24,
                  top: 36,
                  bottom: -10,
                  width: 1.5,
                  background: "var(--aptus-border-strong)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
