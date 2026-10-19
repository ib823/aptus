import type { ReactNode } from "react";

import { StatusChip } from "@/components/coreedge/StatusChip";

/**
 * The one refusal the claim surface ever shows.
 *
 * EVERY REFUSAL READS THE SAME. A caller holding a wrong, expired, spent or
 * revoked token learns only that it did not work — distinguishing them would
 * let someone with a guessed token learn whether it was ever real. It is one
 * component because the refusal now has two moments, the page's read-only
 * check and the collect POST, and two copies of it would be two wordings the
 * day one of them is edited.
 *
 * No hooks and no server imports, so the page and the client island can both
 * render it.
 */
export function ClaimRefused(): ReactNode {
  return (
    <main className="coreedge mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <StatusChip status="noKey" />
      <h1 className="text-xl font-medium text-ink">This link can&apos;t be used.</h1>
      <p className="max-w-prose text-sm text-ink-soft">
        It may have expired, been used already, or been replaced by a newer one. Nothing was
        issued.
      </p>
      <p className="max-w-prose text-sm text-ink-muted">
        Ask whoever sent it to send a new link. Keys are never re-shown, so a replacement link is
        the only way to collect one.
      </p>
    </main>
  );
}
