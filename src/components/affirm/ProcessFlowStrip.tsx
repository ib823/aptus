/**
 * ProcessFlowStrip — "Where this sits" step strip for an affirm card.
 *
 * Built to the aligned design (design-aligned/Process Flow.html).
 *
 * Two variants:
 *   - <ProcessFlowStrip variant="standalone" />  — full card surface
 *     with sid-chip, title, and meta line (raw activity count,
 *     mandatory MY, optional). Used on a card-per-scope-item display.
 *   - <ProcessFlowStrip variant="embedded" />    — compact embedded
 *     inside an affirm card. Smaller step boxes (168×); ink-tint
 *     surface; "Where this sits · {scopeId} {description}" eyebrow.
 *
 * Empty state: if no flow is provided, renders a single muted line —
 * "no Malaysia-mandatory process flow for this scope item." 17 of 672
 * scope items land here. The strip never invents steps and never
 * invents a step-level highlight (prompt §9 "HONEST LIMIT": question
 * → scope-item flow is the only join the data supports).
 */

import type { ProcessFlow } from "@/lib/affirm/process-flow";

interface Props {
  flow: ProcessFlow | null;
  /** SAP scope id — used for the chip + eyebrow. */
  scopeItemId: string;
  /** Scope item description — used for the standalone title + eyebrow tail. */
  scopeItemDescription?: string | null;
  variant: "standalone" | "embedded";
}

export function ProcessFlowStrip({
  flow,
  scopeItemId,
  scopeItemDescription,
  variant,
}: Props) {
  if (!flow || flow.steps.length === 0) {
    return variant === "embedded" ? (
      <div className="mb-3 rounded-input bg-ink-tint px-4 py-3 text-xs">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          Where this sits ·{" "}
          <span className="font-bold text-navy">{scopeItemId}</span>
          {scopeItemDescription ? ` ${scopeItemDescription}` : ""}
        </p>
        <p className="mt-1.5 text-ink-muted">
          No Malaysia-mandatory process flow on file for this scope item.
        </p>
      </div>
    ) : (
      <div className="rounded-card-warm border border-border-default bg-paper p-5 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <ScopeChip id={scopeItemId} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Process flow
          </span>
        </div>
        {scopeItemDescription && (
          <h3 className="mb-3 font-serif text-lg text-ink">
            {scopeItemDescription}
          </h3>
        )}
        <p className="text-sm text-ink-muted">
          No Malaysia-mandatory process flow on file for this scope item.
        </p>
      </div>
    );
  }

  if (variant === "embedded") {
    return (
      <div className="mb-3 rounded-input bg-ink-tint px-4 py-3.5">
        <p className="mb-2.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          <ListIcon className="text-ink-muted" />
          Where this sits ·{" "}
          <span className="font-bold text-navy">{scopeItemId}</span>
          {scopeItemDescription ? ` ${scopeItemDescription}` : ""}
        </p>
        <Strip steps={flow.steps} compact />
      </div>
    );
  }

  return (
    <div className="rounded-card-warm border border-border-default bg-paper p-5 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <ScopeChip id={scopeItemId} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              Process flow
            </span>
          </div>
          {scopeItemDescription && (
            <h3 className="font-serif text-lg text-ink">{scopeItemDescription}</h3>
          )}
        </div>
        <span className="font-mono text-[11px] text-ink-muted">
          {flow.activityCount} activities in source · {flow.myStepCount}{" "}
          mandatory MY · {flow.optionalCount} optional
        </span>
      </div>
      <Strip steps={flow.steps} />
    </div>
  );
}

// ─── Strip ─────────────────────────────────────────────────────────

function Strip({
  steps,
  compact,
}: {
  steps: ProcessFlow["steps"];
  compact?: boolean;
}) {
  return (
    <ol
      className="flex flex-wrap items-stretch gap-y-2 gap-x-0"
      aria-label="Mandatory Malaysia process steps in SAP order"
    >
      {steps.map((s, idx) => (
        <li
          key={s.stepNumber}
          className="flex shrink-0 items-center"
        >
          <div
            className={`flex shrink-0 flex-col gap-1.5 rounded-[10px] border border-[var(--brand-navy-border,#CFD7E0)] bg-paper p-3 ${
              compact ? "w-[168px] px-3 py-2.5" : "w-[184px] px-3.5 py-3"
            }`}
          >
            <span
              className="inline-flex size-[22px] items-center justify-center rounded-full bg-navy font-mono text-[11px] font-bold text-white"
              aria-hidden="true"
            >
              {s.stepNumber}
            </span>
            <span
              className={`font-semibold text-ink ${
                compact ? "text-xs leading-4" : "text-[13px] leading-[18px]"
              }`}
            >
              {s.activity}
            </span>
            {s.fioriApps.length > 0 && (
              <span
                className={`mt-auto font-mono text-ink-muted ${
                  compact ? "text-[10px] leading-[14px]" : "text-[11px] leading-[15px]"
                }`}
                title={s.fioriApps.join(" · ")}
              >
                {s.fioriApps.join(" / ")}
              </span>
            )}
          </div>
          {idx < steps.length - 1 && (
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center px-2 text-border-strong"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

// ─── Atoms ─────────────────────────────────────────────────────────

function ScopeChip({ id }: { id: string }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-2 rounded-[5px] bg-navy px-2.5 font-mono text-[11px] font-bold tracking-[0.04em] text-white">
      {id}
    </span>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 4h13M9 12h13M9 20h13" />
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="4" cy="20" r="1.5" />
    </svg>
  );
}
