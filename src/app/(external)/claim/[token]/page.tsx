import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CLIENT_TOKEN_PREFIX, inspectClaimLink } from "@/lib/northbound/claim-link";

import { ClaimRefused } from "./ClaimRefused";
import { CollectKey } from "./CollectKey";

/**
 * `/claim/:token` — the screen from which a key is collected, once.
 *
 * OPENING THE URL CHANGES NOTHING. This page used to mint the key during the
 * GET — "opening the URL IS the claim" — and that made the first GET the
 * claim, whoever sent it. Corporate mail scanners (Defender Safe Links) and
 * chat unfurlers (Slack, Teams) GET every URL in a message before a person
 * does, and this product has no mail sender, so every link travels through
 * exactly those channels. The scanner received the only copy of the key and
 * the recipient was told the link could not be used. The magic-link confirm
 * page and the /a/ and /d/ landings already defend against this; this page
 * did not.
 *
 * So the GET only READS: is the link live, and would a claim succeed. It then
 * offers a button, and the key is minted by the POST that the person's click
 * sends to `./collect` — which scanners do not send. The guarantee the
 * key-handling model rests on is unchanged: the key does not exist until
 * someone collects it, so an expired link still has nothing behind it.
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
 * THE KEY IS SHOWN IN FULL BY `CollectKey` AND NOWHERE ELSE. This page never
 * holds it: it renders before any key exists.
 *
 * EVERY REFUSAL READS THE SAME — `ClaimRefused`, here and after the POST.
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
  const preview = await inspectClaimLink(token);

  if (!preview.ok) return <ClaimRefused />;

  return (
    <CollectKey
      collectPath={`/claim/${encodeURIComponent(token)}/collect`}
      keyPrefix={CLIENT_TOKEN_PREFIX.replace(/_$/, "")}
      solutionName={preview.solutionName}
      environment={preview.environment}
    />
  );
}
