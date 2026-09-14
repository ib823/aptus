"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/coreedge/ConfirmDialog";
import { ACTIONS, CONFIRMATIONS, DISABLED_REASONS } from "@/lib/coreedge/copy";

import { useVerb } from "./useVerb";

/**
 * Revoke a key — D4, and ConfirmDialog's first real caller.
 *
 * AN OPERATOR SEES NOTHING HERE. Not a disabled control: no control. A
 * destructive action that this person may never take under any condition is
 * not "unavailable to you right now", it is not theirs — and rendering it
 * greyed invites them to ask for it. They flag and notify, which the screen
 * already says elsewhere. The ROUTE refuses them in the same words regardless,
 * because a screen that hides a button is not a gate.
 *
 * AN ALREADY-REVOKED KEY KEEPS ITS CONTROL, disabled, with its reason. That is
 * the opposite case and the opposite rule: the action is this person's, it has
 * simply already happened.
 *
 * THE REASON IS REQUIRED AND RECORDED. Revocation cannot be undone and the
 * calls that start failing afterwards will need explaining. The dialog demands
 * it before the button works; so does the route.
 */

export interface RevokeKeyProps {
  readonly clientId: string;
  /** What this key is, for the dialog's impact list. */
  readonly describes: string;
  /** False for an operator: the control does not render at all. */
  readonly mayRevoke: boolean;
  readonly alreadyRevoked: boolean;
  readonly idPrefix: string;
}

export function RevokeKey({
  clientId,
  describes,
  mayRevoke,
  alreadyRevoked,
  idPrefix,
}: RevokeKeyProps): ReactNode {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const onDone = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);
  const verb = useVerb("/api/coreedge/keys/" + clientId + "/revoke", onDone);

  // D4: not this person's control, so it is not on their screen.
  if (!mayRevoke) return null;

  const reasonId = `${idPrefix}-revoke-reason`;

  if (alreadyRevoked) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          aria-disabled="true"
          aria-describedby={reasonId}
          className="text-left text-sm text-ink-disabled"
        >
          {ACTIONS.revokeKey.button}
        </button>
        <span id={reasonId} className="text-xs text-ink-muted">
          {DISABLED_REASONS.alreadyRevoked}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-sm text-cta underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
      >
        {ACTIONS.revokeKey.button}
      </button>
      {verb.error === null ? null : (
        <span role="status" className="text-xs text-gate-bad-fg">
          {verb.error}
        </span>
      )}
      <ConfirmDialog
        open={open}
        copy={CONFIRMATIONS.revokeKey}
        tone="terminal"
        impact={[describes, "Calls using this key start failing immediately."]}
        onConfirm={(reason) => verb.run({ reason })}
        onCancel={() => setOpen(false)}
        submitting={verb.pending}
        id={`${idPrefix}-revoke`}
      />
    </span>
  );
}
