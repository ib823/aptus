"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { DecisionBar } from "@/components/coreedge/DecisionBar";
import { ACTIONS } from "@/lib/coreedge/copy";

import { useVerb } from "./useVerb";

/**
 * The four decisions, wired.
 *
 * A CLIENT ISLAND, AND ONLY THE BAR. The review screen stays a server
 * component: it loads the request, builds the checks and decides what is
 * blocked. This receives that verdict and owns exactly one thing — pressing.
 * Moving the whole page to the client to make four buttons work would put the
 * grant query in the browser.
 *
 * A REFUSED CONTROL KEEPS ITS REASON AND ITS TAB STOP. The screen's contract:
 * a control that cannot be used does not disappear, because a person who
 * cannot approve still needs to see that approval is the next step and who can
 * take it. `DecisionBar` renders that; this only supplies the reason.
 *
 * D2 — SANDBOX_ONLY IS NOT HERE, and its absence is deliberate rather than an
 * omission. The route refuses it as an input too, so neither half can
 * reintroduce it alone.
 */

/**
 * Request changes is NOT wired, and this is the reason shown when nothing else
 * blocks it. It returns a request to its raiser without settling it, and no row
 * or route in this repository expresses that state — a button that quietly
 * rejected instead would be worse than one that says so.
 */
const NOT_WIRED = "Requesting changes is not wired up yet, so nothing would happen.";

export interface ReviewDecisionProps {
  readonly requestId: string;
  /**
   * Why every decision is blocked, or null when this person may decide. One
   * reason for the whole bar, because the rules that block it — not your
   * request, no end date, no system — block all four equally.
   */
  readonly blockedBecause: string | null;
  /** Request changes and Reject have their own reason when only they are blocked. */
  readonly narrowerBlockedBecause: string | null;
}

export function ReviewDecision({
  requestId,
  blockedBecause,
  narrowerBlockedBecause,
}: ReviewDecisionProps): ReactNode {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const verb = useVerb(`/api/coreedge/requests/${requestId}/decide`, refresh);

  const decide = (decision: "APPROVED" | "READ_ONLY" | "REJECTED") => () => {
    verb.run({ decision });
  };

  /** A server refusal blocks the bar in the same slot the screen's own does. */
  const reason = verb.error ?? blockedBecause;
  const narrowerReason = verb.error ?? narrowerBlockedBecause ?? blockedBecause;

  return (
    <div className="flex flex-col gap-2">
      <DecisionBar
        idPrefix="review"
        submitting={verb.pending}
        primary={
          reason === null
            ? { label: ACTIONS.approve.button, onClick: decide("APPROVED") }
            : { label: ACTIONS.approve.button, disabledReason: reason }
        }
        narrower={[
          reason === null
            ? { label: ACTIONS.approveReadOnly.button, onClick: decide("READ_ONLY") }
            : { label: ACTIONS.approveReadOnly.button, disabledReason: reason },
          /*
           * Request changes is NOT wired: it returns a request to its raiser
           * without settling it, and no row or route in this repository
           * expresses that. Saying so is better than a button that rejects.
           */
          {
            label: ACTIONS.requestChanges.button,
            // Always blocked, so always a string: `reason` is null only when
            // this person may decide, and this one is never decidable.
            disabledReason: narrowerReason ?? NOT_WIRED,
          },
        ]}
        destructive={
          reason === null
            ? { label: ACTIONS.reject.button, onClick: decide("REJECTED") }
            : { label: ACTIONS.reject.button, disabledReason: reason }
        }
      />
      {verb.error === null ? null : (
        // role="status" rather than "alert": the person just pressed a button,
        // so they are already looking here.
        <p role="status" className="text-sm text-gate-bad-fg">
          {verb.error}
        </p>
      )}
    </div>
  );
}
