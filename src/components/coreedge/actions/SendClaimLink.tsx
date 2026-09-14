"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { CLAIM_LINK_COPY } from "@/lib/coreedge/copy";

import { useVerb } from "./useVerb";

/**
 * "Send a link" — the control that makes a key collectable at all.
 *
 * WHY THIS IS THE WHOLE FIX FOR "No key". `createClaimLink` shipped complete in
 * PR-5 with no caller anywhere in the repository, so no claim link could be
 * created, and every lane read "No key · collect or renew the key" beside no
 * way to collect one. The library was never missing. This is.
 *
 * THE LINK IS SHOWN, NOT THE KEY. What comes back is a one-time `cec_` claim
 * path; the key is minted only when the recipient opens it, on a page that
 * shows it once. The path is rendered for copying because this product has no
 * mail sender — pretending to "send" it would be the console's own overclaim.
 */

export interface SendClaimLinkProps {
  readonly solutionId: string;
  readonly environment: string;
  /** Set when a link already exists and has run out — changes the label only. */
  readonly expired?: boolean;
  readonly blockedBecause?: string | undefined;
  readonly idPrefix: string;
}

export function SendClaimLink({
  solutionId,
  environment,
  expired = false,
  blockedBecause,
  idPrefix,
}: SendClaimLinkProps): ReactNode {
  const router = useRouter();
  const onDone = useCallback(() => router.refresh(), [router]);
  const verb = useVerb<{ claimPath: string }>("/api/coreedge/keys/claim-link", onDone);

  const label = expired ? CLAIM_LINK_COPY.sendAgain : CLAIM_LINK_COPY.send;
  const reasonId = `${idPrefix}-send-link-reason`;

  if (blockedBecause !== undefined) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          aria-disabled="true"
          aria-describedby={reasonId}
          className="text-left text-sm text-ink-disabled"
        >
          {label}
        </button>
        <span id={reasonId} className="text-xs text-ink-muted">
          {blockedBecause}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        aria-busy={verb.pending}
        onClick={() => verb.run({ solutionId, environment })}
        className="text-left text-sm text-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
      >
        {label}
      </button>
      {verb.error === null ? null : (
        <span role="status" className="text-xs text-gate-bad-fg">
          {verb.error}
        </span>
      )}
      {verb.data === null ? null : (
        /*
         * SHOWN ONCE, BECAUSE IT EXISTS ONCE. The link is never stored — the
         * row holds only its hash — so this render is the only chance to copy
         * it. Asking for it again issues a new link and revokes this one.
         */
        <span role="status" className="flex flex-col gap-1 text-xs text-ink-soft">
          {CLAIM_LINK_COPY.linkReady}
          <code className="font-mono break-all select-all text-ink">{verb.data.claimPath}</code>
        </span>
      )}
    </span>
  );
}
