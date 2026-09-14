import type { ReactNode } from "react";

import { whyExplanation, WHY_NEXT_STEP, WHY_NO_RECORDED_CALL, type WhyCase, type WhyFacts } from "@/lib/coreedge/copy";
import { OWNER_LABELS } from "@/lib/coreedge/status-vocabulary";

import { GateStrip, type GateHop } from "./GateStrip";

/**
 * WhyTrace — what broke, whose job it is, and the one thing to do.
 *
 * This is the component the whole console is arranged around: A1's fifth
 * principle is "every refusal routes to its fix". A refusal that shows a code
 * and stops has handed the user a research project.
 *
 * THE CORRELATION ID IS NOT DECORATION — and for that reason it is now OPTIONAL
 * and never invented. Its whole purpose is that someone can quote it to support
 * and support can find that call in 30 days of audit. The lane page used to
 * build one out of the lane's own slugs, which looks exactly like a real id,
 * matches nothing in `NorthboundAuditEvent`, and would send a person and a
 * support engineer hunting for a call that was never recorded under that name.
 * A lane with no recorded call now says so.
 *
 * IT SHOWS THE LANE'S OWN REASON, not only the case's general one — AS THE
 * HEADING, not under a heading that says something else. A6 writes a single
 * "Key" row covering missing, expired, revoked and retired; the derivation knows
 * WHICH of the four this lane is. The first attempt at this put the lane's
 * sentence in the BODY and left `why.headline` above it, so a lane reading
 * "Access is approved but no key has been collected" was introduced by "This key
 * isn't valid." — a heading contradicting the paragraph beneath it and the chip
 * beside it, with the real explanation then printed a second time by the page.
 *
 * So `because` replaces the headline AND the body: one explanation, once. The
 * deck's pair still renders for a caller with no verdict — the design system,
 * which demonstrates cases rather than lanes.
 *
 * A 401 and a 403 are never merged — different owners, different blast radii.
 * That distinction lives in `copy.ts` as separate Why cases; this component only
 * has to not flatten it, which it does by taking a case rather than a status.
 */

export interface WhyTraceProps {
  readonly whyCase: WhyCase;
  readonly facts?: WhyFacts;
  /**
   * The six hops with the break already resolved. It carries which hop broke,
   * which is why there is no separate `brokenAt`: that prop existed, was never
   * read, and claimed this component positioned a marker it does not position.
   */
  readonly hops: readonly GateHop[];
  /**
   * What the derivation established about THIS lane, in one sentence. When
   * given it IS the explanation — it replaces the case's headline and its body
   * both, so the trace says one thing rather than three. See the header.
   */
  readonly because?: string;
  /**
   * A real id from the audit trail, or omitted. Never a constructed one: see
   * the header.
   */
  readonly correlationId?: string;
  /**
   * The one action as a control, where the caller has somewhere for it to go.
   * Where it does not, A6's action still renders — as the named next step
   * below, not as a button that does nothing.
   */
  readonly action?: ReactNode;
}

export function WhyTrace({
  whyCase,
  facts = {},
  hops,
  because,
  correlationId,
  action,
}: WhyTraceProps): ReactNode {
  const why = whyExplanation(whyCase, facts);
  const headingId = `why-${whyCase}`;

  return (
    <section
      className="flex flex-col gap-4 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-5"
      // A refusal moves focus here rather than to a toast: a toast disappears
      // while the person is still reading it, and this is the explanation they
      // came for.
      tabIndex={-1}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-base font-medium text-ink">
        {because ?? why.headline}
      </h2>
      {because === undefined ? (
        <p className="max-w-prose text-sm text-ink-soft">{why.body}</p>
      ) : null}

      <GateStrip hops={hops} />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-xs text-ink-muted">{OWNER_LABELS[why.owner]} fixes this</span>
        {action !== undefined ? (
          <span>{action}</span>
        ) : why.action === null ? null : (
          /*
           * A6 GIVES EXACTLY ONE ACTION PER CASE AND THIS RENDERED NONE OF THEM
           * unless a caller passed a control. The lane page passes none, so the
           * one thing to do next was written down, typed, tested — and invisible
           * on the screen whose entire purpose is to name it.
           *
           * Text, not a button. A control here would have nowhere to go, and a
           * button that does nothing is worse than a sentence that says what to
           * do: the sentence can be acted on, the button can only be clicked.
           */
          <span className="text-xs text-ink-soft">
            {WHY_NEXT_STEP} <span className="font-medium text-ink">{why.action}</span>
          </span>
        )}
      </div>

      <p className="text-xs text-ink-muted">
        {correlationId === undefined ? (
          WHY_NO_RECORDED_CALL
        ) : (
          <>
            Reference <span className="font-mono select-all text-ink-soft">{correlationId}</span>
          </>
        )}
      </p>
    </section>
  );
}
