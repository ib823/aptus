/**
 * ProcessBlueprintView — a PROCESS_BLUEPRINT / SCENARIO item's steps as a
 * horizontal flow. Nodes on --surface-ink-tint, connectors --brand-navy.
 * Colour via var(--token) only. Empty-safe.
 */
export interface BlueprintStep {
  name: string;
  description?: string;
}

export function ProcessBlueprintView({ steps }: { steps: BlueprintStep[] }) {
  if (!steps || steps.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
        No process steps were recorded for this blueprint.
      </p>
    );
  }
  return (
    <ol className="flex items-stretch gap-0 overflow-x-auto pb-2" aria-label="Process steps">
      {steps.map((step, i) => (
        <li key={`${step.name}-${i}`} className="flex items-center">
          <div
            className="flex min-w-[9rem] max-w-[14rem] flex-col gap-1 rounded-[var(--radius-card-warm)] px-3 py-2"
            style={{ background: "var(--surface-ink-tint)", border: "1px solid var(--border-default)" }}
          >
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--brand-navy)" }}>
              STEP {i + 1}
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--ink-primary)" }}>
              {step.name}
            </span>
            {step.description && (
              <span className="text-xs" style={{ color: "var(--ink-secondary)" }}>
                {step.description}
              </span>
            )}
          </div>
          {i < steps.length - 1 && (
            <span aria-hidden className="mx-1 text-lg font-bold" style={{ color: "var(--brand-navy)" }}>
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
