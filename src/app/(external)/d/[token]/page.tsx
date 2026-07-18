/**
 * GET /d/[token] — Neutral Process Discovery invitation landing.
 *
 * Idempotent and scanner-safe: NO DB writes, NO cookie set. Fail-closed (404
 * unless NEUTRAL_DISCOVERY_ENABLED). Mirrors the Affirm landing's control flow
 * exactly, including the four-guard cascade that collapses to ONE terminal URL:
 * a landing that distinguished "revoked" from "never existed" would let an
 * attacker enumerate which tokens were ever valid.
 *
 * COPY NOTE (BUILD-LOG D9): the brief specifies no landing screen — its V1–V5
 * are the post-verify surfaces. The structure is Affirm's; the copy is this
 * surface's own, because Affirm's landing names a vendor product in its
 * headline and invariant 1 forbids that here. The two promises below are the
 * brief's §10 verbatim strings, used where they fit.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/affirm/external/tokens";
import { GuestShell, Wordmark } from "@/components/affirm/external/GuestShell";
import { issueRedeemNonce } from "@/lib/discovery/external/csrf";
import { DISCOVERY_PDPA_VERSION } from "@/lib/discovery/external/legal";
import { isClientFacingState } from "@/lib/discovery/external/session";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function DiscoveryLandingPage({ params }: PageProps) {
  if (!isNeutralDiscoveryEnabled()) notFound();
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const grant = await prisma.discoveryAccessGrant.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { engagement: { select: { client: true, state: true } } },
  });
  // Four guards, one destination. Never reveal which one applied.
  if (!grant) redirect("/d/expired");
  if (grant.revokedAt) redirect("/d/expired");
  if (grant.supersededByGrantId) redirect("/d/expired");
  if (!isClientFacingState(grant.engagement.state)) redirect("/d/expired");

  const nonce = issueRedeemNonce(token);
  const client = grant.engagement.client;

  return (
    <GuestShell clientName={client}>
      <main id="main" className="mx-auto max-w-[560px] px-[clamp(16px,4vw,32px)] pb-[72px] pt-14 text-center">
        <div className="mb-6 flex justify-center">
          <Wordmark size="lg" />
        </div>

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Process Discovery
        </p>
        <h1 className="mx-auto mb-6 text-balance font-serif text-[32px] font-medium leading-[38px] text-ink">
          Your business on one page — before you pick a system.
        </h1>

        <div className="mx-auto mb-7 max-w-[46ch] space-y-3 text-left text-[15px] leading-[1.55] text-ink-soft">
          <p>See how the standard runs your process, then tell us where you differ.</p>
          <p>About 20 minutes. You can pause and come back on the same link.</p>
          <p>
            <strong>Nothing is committed — this is discovery, not a decision.</strong>
          </p>
        </div>

        <form
          method="POST"
          action={`/d/${encodeURIComponent(token)}/redeem`}
          className="ax-input mx-auto rounded-card-warm border border-border-default bg-paper px-5 py-[22px] text-left shadow-card"
        >
          <input type="hidden" name="csrf" value={nonce} />

          <label className="mb-4 flex items-start gap-3">
            <input
              type="checkbox"
              name="acknowledge_legal"
              value="1"
              required
              className="ax-touch mt-0.5 size-5 shrink-0 accent-navy"
            />
            <span className="text-[14px] leading-5 text-ink-soft">
              I confirm I&apos;m the named recipient of this invitation and authorised to describe how{" "}
              {client} runs today.
            </span>
          </label>

          <label className="mb-5 flex items-start gap-3">
            <input
              type="checkbox"
              name="pdpa_consent"
              value="1"
              className="ax-touch mt-0.5 size-5 shrink-0 accent-navy"
            />
            <span className="text-[14px] leading-5 text-ink-soft">
              I consent to ABeam processing my responses for this review, including cross-border
              transfer to ABeam project systems, in line with the PDPA (version{" "}
              {DISCOVERY_PDPA_VERSION}).
            </span>
          </label>

          <button
            type="submit"
            className="ax-touch flex h-11 w-full items-center justify-center rounded-input bg-cta text-[14px] font-semibold text-white shadow-card transition hover:bg-cta-hover focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Begin
          </button>
        </form>

        <p className="mx-auto mt-5 max-w-[46ch] text-[11px] leading-4 text-ink-muted">
          Your link is personal. We&apos;ll verify your device with a one-time code.
        </p>
      </main>
    </GuestShell>
  );
}
