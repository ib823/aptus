"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ConfirmCopy } from "@/lib/coreedge/copy";
import { blockedControlProps } from "@/lib/coreedge/disabled";

/**
 * ConfirmDialog — the last step before something that cannot be taken back.
 *
 * NAME COLLISION, DELIBERATE. `src/components/shared/ConfirmDialog.tsx` exists
 * and is a different component for a different console. Neither imports the
 * other, and a test asserts it.
 *
 * WHAT MAKES THIS ONE DIFFERENT FROM AN "ARE YOU SURE": it states the IMPACT
 * before it asks. A6's deactivation dialog lists the lanes that will stop
 * reading, by name, because "4 lanes will stop" is a number and "Purchase
 * orders · Test" is a consequence. The impact list is a required prop for that
 * reason — a terminal dialog with nothing to say about what it will break has
 * not earned the confirmation it is asking for.
 *
 * `alreadyDone` is a real state, not an error. Two people can open the same
 * revoke dialog; the second one to submit should be told the key is already
 * revoked, which is not a failure and must not read like one.
 */

export type ConfirmTone = "reversible" | "terminal";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly copy: ConfirmCopy;
  readonly tone: ConfirmTone;
  /** What this will break, in words. Required for terminal dialogs. */
  readonly impact: readonly string[];
  /** Typed-to-confirm, for the most destructive actions only. */
  readonly confirmPhrase?: string;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
  readonly submitting?: boolean;
  /** Someone else already did this. Not an error. */
  readonly alreadyDone?: string;
  readonly id: string;
}

export function ConfirmDialog({
  open,
  copy,
  tone,
  impact,
  confirmPhrase,
  onConfirm,
  onCancel,
  submitting = false,
  alreadyDone,
  id,
}: ConfirmDialogProps): ReactNode {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const reasonMissing = copy.reasonRequired && reason.trim() === "";
  const phraseMissing = confirmPhrase !== undefined && typed !== confirmPhrase;
  const blockedBecause = reasonMissing
    ? "Give a reason first. It is recorded with the change."
    : phraseMissing
      ? `Type ${confirmPhrase} to confirm.`
      : null;

  const confirmLook =
    tone === "terminal"
      ? "bg-cta text-cream"
      : "bg-navy text-cream";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      className="flex max-w-lg flex-col gap-4 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-6 shadow-[var(--shadow-overlay)]"
    >
      <h2
        id={`${id}-title`}
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-medium text-ink"
      >
        {copy.title}
      </h2>

      <p className="max-w-prose text-sm text-ink-soft">{copy.body}</p>

      {impact.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-[var(--radius-input)] bg-ink-tint p-3 text-sm text-ink">
          {impact.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {alreadyDone === undefined ? null : (
        // Announced, and phrased as information rather than failure.
        <p role="status" className="text-sm text-ink-soft">
          {alreadyDone}
        </p>
      )}

      {copy.reasonRequired ? (
        <label className="flex flex-col gap-1 text-sm text-ink">
          Reason
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
          />
        </label>
      ) : null}

      {confirmPhrase === undefined ? null : (
        <label className="flex flex-col gap-1 text-sm text-ink">
          Type <span className="font-mono">{confirmPhrase}</span> to confirm
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-3 py-2 font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
          />
        </label>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <span className="flex flex-col items-start gap-1">
          <button
            type="button"
            // Blocked, not removed: the reason below has to be reachable by
            // keyboard, and `disabled` would take the tab stop away.
            {...(blockedBecause !== null || submitting
              ? blockedControlProps(blockedBecause === null ? null : `${id}-blocked`)
              : { onClick: () => onConfirm(reason) })}
            className={`rounded-[var(--radius-input)] px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy ${
              blockedBecause !== null || submitting
                ? "cursor-not-allowed border border-[color:var(--border-default)] text-ink-disabled"
                : confirmLook
            }`}
          >
            {copy.confirm}
          </button>
          {blockedBecause === null ? null : (
            <span id={`${id}-blocked`} className="text-xs text-ink-muted">
              {blockedBecause}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-[var(--radius-input)] border border-[color:var(--border-default)] px-4 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
        >
          {copy.cancel}
        </button>
      </div>
    </div>
  );
}
