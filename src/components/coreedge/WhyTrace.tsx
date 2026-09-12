import type { ReactNode } from "react";

import { whyExplanation, type WhyCase, type WhyFacts } from "@/lib/coreedge/copy";
import { OWNER_LABELS, type LaneHop } from "@/lib/coreedge/status-vocabulary";

import { GateStrip, type GateHop } from "./GateStrip";

/**
 * WhyTrace — what broke, whose job it is, and the one thing to do.
 *
 * This is the component the whole console is arranged around: A1's fifth
 * principle is "every refusal routes to its fix". A refusal that shows a code
 * and stops has handed the user a research project.
 *
 * THE CORRELATION ID IS NOT DECORATION. It is what lets a person quote this
 * exact failure to support, and what lets support find it in 30 days of audit
 * without asking for a screenshot. It renders in mono, selectable, always.
 *
 * A 401 and a 403 are never merged — different owners, different blast radii.
 * That distinction lives in `copy.ts` as separate Why cases; this component only
 * has to not flatten it, which it does by taking a case rather than a status.
 */

export interface WhyTraceProps {
  readonly whyCase: WhyCase;
  readonly facts?: WhyFacts;
  readonly hops: readonly GateHop[];
  readonly brokenAt: LaneHop;
  readonly correlationId: string;
  /** The one action, rendered by the caller. A6 gives exactly one per case. */
  readonly action?: ReactNode;
}

export function WhyTrace({
  whyCase,
  facts = {},
  hops,
  correlationId,
  action,
}: WhyTraceProps): ReactNode {
  const why = whyExplanation(whyCase, facts);

  return (
    <section
      className="flex flex-col gap-4 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-5"
      // A refusal moves focus here rather than to a toast: a toast disappears
      // while the person is still reading it, and this is the explanation they
      // came for.
      tabIndex={-1}
      aria-labelledby={`why-${correlationId}`}
    >
      <h2 id={`why-${correlationId}`} className="text-base font-medium text-ink">
        {why.headline}
      </h2>
      <p className="max-w-prose text-sm text-ink-soft">{why.body}</p>

      <GateStrip hops={hops} />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-xs text-ink-muted">{OWNER_LABELS[why.owner]} fixes this</span>
        {action === undefined ? null : <span>{action}</span>}
      </div>

      <p className="text-xs text-ink-muted">
        Reference{" "}
        <span className="font-mono select-all text-ink-soft">{correlationId}</span>
      </p>
    </section>
  );
}
