/**
 * <ProcessTimeline> — vertical numbered timeline of BPD process steps
 * (design brief §3.4).
 *
 * Each step renders as a navy number circle joined by a vertical connector,
 * with the step title, a role · app/T-code caption (app in mono), and the
 * expected outcome below. Presentational only — safe to render from a server
 * component (no client JS).
 */

import type { ProcessStep } from "@/lib/fts/types";

interface ProcessTimelineProps {
  steps: ProcessStep[];
}

export function ProcessTimeline({ steps }: ProcessTimelineProps) {
  if (!steps || steps.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-muted, #8A8A8A)", margin: 0 }}>
        No process steps available for this scope item.
      </p>
    );
  }

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li
            key={`${step.name}-${i}`}
            style={{ display: "flex", gap: 16, alignItems: "stretch" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9999,
                  background: "var(--brand-navy-soft, #E6EBF1)",
                  color: "var(--brand-navy, #002B5C)",
                  fontSize: 13,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              {!isLast ? (
                <span
                  aria-hidden
                  style={{
                    flex: 1,
                    width: 2,
                    minHeight: 16,
                    background: "var(--border-default, #E5E1D6)",
                    marginTop: 4,
                  }}
                />
              ) : null}
            </div>

            <div style={{ paddingBottom: isLast ? 0 : 20, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink-primary, #1A1A1A)",
                }}
              >
                {step.name}
              </div>
              {step.role || step.app ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-muted, #8A8A8A)",
                    marginTop: 2,
                  }}
                >
                  {step.role ? <span>{step.role}</span> : null}
                  {step.role && step.app ? <span>{" · "}</span> : null}
                  {step.app ? (
                    <span
                      style={{
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                      }}
                    >
                      {step.app}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {step.expected ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink-secondary, #4A4A4A)",
                    marginTop: 6,
                  }}
                >
                  {step.expected}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
