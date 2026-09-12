"use client";

import { useState, type ReactNode } from "react";

/**
 * MaskedKey — a key reference, never a key.
 *
 * THE CONTRACT: this component renders a prefix and the last four characters and
 * has no code path that renders anything else. There is no `full` prop and no
 * `reveal` prop, because a component that CAN render a secret will eventually be
 * asked to.
 *
 * The one-time reveal, where the whole key really is shown once at creation, is
 * a different surface with a different guarantee behind it (the claim link,
 * PR-5 item 4) — and it is not this component. Keeping them apart is what lets
 * this one be audited by reading its props.
 *
 * `value` is therefore typed as the two halves, not as a key with a formatter
 * applied. A caller cannot hand this component a secret even by mistake, because
 * the type has nowhere to put one.
 */

export interface MaskedKeyProps {
  /** The non-secret prefix, e.g. "ce_live". */
  readonly prefix: string;
  /** The last four characters, and only ever four. */
  readonly tail: string;
  /** Copies the masked reference — never the key, which we do not hold. */
  readonly copyable?: boolean;
  readonly label?: string;
}

const MASK = "••••••••";

export function MaskedKey({ prefix, tail, copyable = false, label }: MaskedKeyProps): ReactNode {
  const [copied, setCopied] = useState(false);

  /*
   * Four is the contract, not a default. A caller that has more than four
   * characters of the key in hand is holding more of a secret than it should,
   * and silently trimming would hide that; taking the last four is the same
   * rendering either way, and the test asserts nothing longer ever appears.
   */
  const shown = tail.slice(-4);
  const reference = `${prefix}…${shown}`;

  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm">
      {label === undefined ? null : <span className="font-sans text-ink-muted">{label}</span>}
      <span className="rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-ink-tint px-2 py-[0.125em] text-ink">
        <span aria-hidden="true">
          {prefix}
          {MASK}
          {shown}
        </span>
        {/* Read as a reference, not as a string of bullets. */}
        <span className="sr-only">Key {prefix}, ending {shown.split("").join(" ")}</span>
      </span>
      {copyable ? (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(reference).then(() => setCopied(true));
          }}
          className="text-xs text-ink-soft underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
        >
          {copied ? "Reference copied" : "Copy reference"}
        </button>
      ) : null}
    </span>
  );
}
