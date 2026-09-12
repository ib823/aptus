import type { ReactNode } from "react";

import { blockedControlProps, reasonIdFor } from "@/lib/coreedge/disabled";

/**
 * DecisionBar — the actions available on a screen, in one row, ranked.
 *
 * ONE primary, any number of narrower choices, at most one destructive. The
 * ranking is the point: a reviewer's screen offers Approve, Approve for Sandbox
 * only, Approve read-only, Request changes and Reject, and a bar that renders
 * them as five equal buttons has made the decision harder rather than easier.
 *
 * DISABLED ACTIONS KEEP THEIR REASON AND THEIR TAB STOP. `aria-disabled` rather
 * than `disabled`, the reason as a sibling string rather than a `title`, and the
 * click refused in the handler. See DisabledControl for the full argument; this
 * component applies it to the one place it matters most, since every rule in
 * A6's "Rules and disabled reasons" table lands on a button in this bar.
 */

export interface DecisionAction {
  readonly label: string;
  readonly onClick?: () => void;
  /** Present means the action cannot be taken, and says why. */
  readonly disabledReason?: string;
}

export interface DecisionBarProps {
  readonly primary: DecisionAction;
  readonly narrower?: readonly DecisionAction[];
  readonly destructive?: DecisionAction;
  /** Blocks every action while a decision is in flight. */
  readonly submitting?: boolean;
  readonly idPrefix: string;
}

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy";
const SHAPE = `rounded-[var(--radius-input)] px-4 py-2 text-sm ${FOCUS}`;

const LOOK = {
  primary: `${SHAPE} bg-navy text-cream font-medium`,
  narrower: `${SHAPE} border border-[color:var(--border-default)] text-ink`,
  destructive: `${SHAPE} border border-cta text-cta font-medium`,
  disabled: `${SHAPE} border border-[color:var(--border-default)] text-ink-disabled cursor-not-allowed`,
} as const;

function Action({
  action,
  look,
  id,
  submitting,
}: {
  action: DecisionAction;
  look: keyof typeof LOOK;
  id: string;
  submitting: boolean;
}): ReactNode {
  const reason = action.disabledReason;
  const blocked = reason !== undefined || submitting;
  const reasonId = reasonIdFor(id);

  if (!blocked) {
    return (
      <button type="button" onClick={action.onClick} className={LOOK[look]}>
        {action.label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        // The contract lives in one place: aria-disabled rather than `disabled`
        // (which would take the tab stop away), and the reason below as a
        // sibling string rather than a title attribute.
        {...blockedControlProps(reason === undefined ? null : reasonId)}
        className={LOOK.disabled}
      >
        {action.label}
      </button>
      {reason === undefined ? null : (
        // A sibling string. Visible, selectable, announced on focus — never a
        // `title` attribute, which a touch or keyboard user cannot reach.
        <span id={reasonId} className="max-w-prose text-xs text-ink-muted">
          {reason}
        </span>
      )}
    </span>
  );
}

export function DecisionBar({
  primary,
  narrower = [],
  destructive,
  submitting = false,
  idPrefix,
}: DecisionBarProps): ReactNode {
  return (
    <div className="flex flex-wrap items-start gap-3" aria-busy={submitting}>
      <Action action={primary} look="primary" id={`${idPrefix}-primary`} submitting={submitting} />
      {narrower.map((action, i) => (
        <Action
          key={action.label}
          action={action}
          look="narrower"
          id={`${idPrefix}-narrower-${i}`}
          submitting={submitting}
        />
      ))}
      {destructive === undefined ? null : (
        <span className="ml-auto">
          <Action
            action={destructive}
            look="destructive"
            id={`${idPrefix}-destructive`}
            submitting={submitting}
          />
        </span>
      )}
    </div>
  );
}
