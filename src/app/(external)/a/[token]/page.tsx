/**
 * GET /a/[token] — S1 Invitation Landing.
 *
 * Idempotent, scanner-safe: NO DB writes, NO cookie set. Fail-closed (404
 * unless AFFIRM_EXTERNAL_ENABLED). Polymorphic terminal on any invalid/revoked/
 * superseded/non-client-facing grant. Restyled to the Executive Surface design
 * (token-only); behavior + the redeem POST contract are unchanged.
 */

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/affirm/external/tokens";
import { issueRedeemNonce } from "@/lib/affirm/external/csrf";
import { isAffirmExternalEnabled } from "@/lib/affirm/external/guards";
import { isClientFacingState } from "@/lib/affirm/external/session";
import { AFFIRM_PDPA_VERSION } from "@/lib/affirm/external/legal";
import { GuestShell, Wordmark } from "@/components/affirm/external/GuestShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function AffirmLandingPage({ params }: PageProps) {
  if (!isAffirmExternalEnabled()) notFound();
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const grant = await prisma.affirmAccessGrant.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { bundle: { select: { client: true, state: true } } },
  });
  if (!grant) redirect("/a/expired");
  if (grant.revokedAt) redirect("/a/expired");
  if (grant.supersededByGrantId) redirect("/a/expired");
  if (!isClientFacingState(grant.bundle.state)) redirect("/a/expired");

  const nonce = issueRedeemNonce(token);
  const client = grant.bundle.client;

  return (
    <GuestShell clientName={client}>
      <main className="mx-auto max-w-[560px] px-[clamp(16px,4vw,32px)] pb-[72px] pt-14 text-center">
        <div className="mb-6 flex justify-center">
          <Wordmark size="lg" />
        </div>

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Executive scope review
        </p>
        <h1 className="mx-auto mb-6 text-balance font-serif text-[32px] font-medium leading-[38px] text-ink">
          {client}: see how the SAP standard runs your processes — and tell us where you differ.
        </h1>

        <div className="mx-auto mb-7 max-w-[46ch] space-y-3 text-left text-[15px] leading-[1.55] text-ink-soft">
          <p>
            A guided look at how SAP&apos;s standard processes would run your business — in plain
            language, no SAP knowledge needed.
          </p>
          <p>About 20 minutes. You can pause and come back on the same link.</p>
          <p>
            Every answer stays open until the workshop — <strong>nothing is committed yet.</strong>
          </p>
        </div>

        <form
          method="POST"
          action={`/a/${encodeURIComponent(token)}/redeem`}
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
              I confirm I&apos;m authorised to review scope decisions on behalf of {client}.
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
              transfer to ABeam project systems, in line with the PDPA (version {AFFIRM_PDPA_VERSION}
              ).
            </span>
          </label>

          <button
            type="submit"
            className="ax-touch flex h-11 w-full items-center justify-center rounded-input bg-cta text-[14px] font-semibold text-white shadow-card transition hover:bg-cta-hover focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Begin review
          </button>
        </form>

        <p className="mx-auto mt-5 max-w-[46ch] text-[11px] leading-4 text-ink-muted">
          Your link is personal. We&apos;ll verify your device with a one-time code.
        </p>
      </main>
    </GuestShell>
  );
}
