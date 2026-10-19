"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

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

/**
 * Why Approve waits on a write. The route refuses a write approval without the
 * acknowledgement (WRITE_CHECKLIST_REQUIRED), and this bar used never to send
 * one — so Approve on a write could only ever fail after the click.
 */
const CONFIRM_CHECKLIST_FIRST = "Confirm the write checklist before approving a write.";

/**
 * Why read-only is not offered on a write (READ_ONLY_ON_WRITE in
 * `evaluateDecision`). A grant is matched on its operation, so a read-only
 * CREATE or UPDATE grant authorises no read and no write — the click stored a
 * grant that permitted nothing while the screens reported it as access.
 */
const READ_ONLY_NOT_FOR_WRITES =
  "Read-only can't narrow a write request: it would authorise neither the write nor any read. Approve the write, or reject it and ask for a read request.";

export interface ReviewDecisionProps {
  readonly requestId: string;
  /** CREATE or UPDATE: approving needs the write checklist, and read-only does not apply. */
  readonly isWrite: boolean;
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
  isWrite,
  blockedBecause,
  narrowerBlockedBecause,
}: ReviewDecisionProps): ReactNode {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const verb = useVerb(`/api/coreedge/requests/${requestId}/decide`, refresh);
  const [checklist, setChecklist] = useState(false);

  const decide = (decision: "APPROVED" | "READ_ONLY" | "REJECTED") => () => {
    verb.run({ decision, writeChecklistAcknowledged: isWrite && checklist });
  };

  /** A server refusal blocks the bar in the same slot the screen's own does. */
  const reason = verb.error ?? blockedBecause;
  const narrowerReason = verb.error ?? narrowerBlockedBecause ?? blockedBecause;
  const approveReason = reason ?? (isWrite && !checklist ? CONFIRM_CHECKLIST_FIRST : null);
  const readOnlyReason = reason ?? (isWrite ? READ_ONLY_NOT_FOR_WRITES : null);

  return (
    <div className="flex flex-col gap-2">
      {isWrite ? (
        <label className="flex max-w-prose items-start gap-2 text-sm text-ink">
          {/*
            Never `disabled`, even mid-submit (components.test.ts): the bar is
            what blocks while a decision is in flight, and ticking this then
            changes nothing already sent.
          */}
          <input
            type="checkbox"
            checked={checklist}
            onChange={(e) => setChecklist(e.target.checked)}
            className="mt-1"
          />
          <span>
            I have worked through the write checklist. This writes into the client&apos;s SAP
            system.
          </span>
        </label>
      ) : null}
      <DecisionBar
        idPrefix="review"
        submitting={verb.pending}
        primary={
          approveReason === null
            ? { label: ACTIONS.approve.button, onClick: decide("APPROVED") }
            : { label: ACTIONS.approve.button, disabledReason: approveReason }
        }
        narrower={[
          readOnlyReason === null
            ? { label: ACTIONS.approveReadOnly.button, onClick: decide("READ_ONLY") }
            : { label: ACTIONS.approveReadOnly.button, disabledReason: readOnlyReason },
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
