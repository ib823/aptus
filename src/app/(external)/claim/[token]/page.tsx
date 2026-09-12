import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MaskedKey } from "@/components/coreedge/MaskedKey";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { CLIENT_TOKEN_PREFIX, claimKey } from "@/lib/northbound/claim-link";

/**
 * `/claim/:token` — the screen that mints a key, once.
 *
 * THIS PAGE HAS A SIDE EFFECT, which is unusual and deliberate: opening the URL
 * IS the claim. That is the guarantee the whole key-handling model rests on —
 * the key does not exist until someone opens the link, so an expired link has
 * nothing behind it to leak.
 *
 * IT LIVES IN `(external)`, NOT `(coreedge)`, and that is load-bearing. The
 * `(coreedge)` layout redirects any caller without a session — correct for every
 * console route and fatal for this one, since the app owner who receives the
 * link may have no console account at all. Putting it there would have made the
 * link undeliverable to exactly the person it is for. `(external)` is the
 * repo's existing TOKEN group (the presales and affirm guest surfaces under
 * `/c/` and `/a/`), classified as such in route-group-gating.test.ts: the secret
 * in the path IS the credential, and requiring a session would defeat the
 * surface's purpose.
 *
 * The `.coreedge` class is therefore applied on this page's own root, because
 * the group layout that normally carries it is not above this route.
 *
 * THE KEY IS SHOWN IN FULL HERE AND NOWHERE ELSE. This is the one surface with
 * that guarantee behind it, which is why `MaskedKey` — a component that has no
 * code path to render a whole key — is used for the reference AFTERWARDS while
 * the full value is printed by this page directly. Keeping them apart is what
 * lets MaskedKey be audited by reading its props.
 *
 * EVERY REFUSAL READS THE SAME. A caller holding a wrong, expired, spent or
 * revoked token learns only that it did not work — distinguishing them would let
 * someone with a guessed token learn whether it was ever real.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Collect your key",
  // A claim URL must never reach an index or a referrer log.
  robots: { index: false, follow: false },
};

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<ReactNode> {
  const { token } = await params;
  const result = await claimKey(token);

  if (!result.ok) {
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

  return (
    <main className="coreedge mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 p-6">
      <StatusChip status="live" />
      <h1 className="text-xl font-medium text-ink">
        Your key for {result.solutionName} · {result.environment}
      </h1>

      <p className="max-w-prose text-sm text-ink-soft">
        Copy it now. It is shown once and cannot be shown again — not by support, not from a backup.
        The system genuinely does not hold it.
      </p>

      {/*
        Printed directly rather than through MaskedKey, which has no code path
        that renders a whole key. `select-all` so one click takes the value, and
        `font-mono` so an O and a 0 are distinguishable.
      */}
      <code className="select-all break-all rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-ink-tint p-4 font-mono text-sm text-ink">
        {result.rawToken}
      </code>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-ink-muted">
          From now on your lane shows only the reference:
        </p>
        <MaskedKey prefix={CLIENT_TOKEN_PREFIX.replace(/_$/, "")} tail={result.tail} />
      </div>

      <p className="max-w-prose text-xs text-ink-muted">
        This link is now spent. Opening it again issues nothing.
      </p>
    </main>
  );
}
