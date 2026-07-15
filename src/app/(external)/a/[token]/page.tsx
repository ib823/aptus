/**
 * GET /a/[token] — Affirm external executive landing.
 *
 * Idempotent and scanner-safe: NO DB writes, NO cookie set. A crawler that
 * hits this URL leaves no audit trail and creates no state. All side effects
 * live in POST /a/[token]/redeem.
 *
 * Fail-closed: 404 unless AFFIRM_EXTERNAL_ENABLED === "true".
 *
 * Polymorphic terminal handling: an invalid / revoked / superseded token, or a
 * bundle that is no longer client-facing (issued | submitted), all render the
 * same generic "link no longer active" state via /a/expired — we never oracle
 * which condition applies.
 *
 * The rendered form is a single-action click-through gate: legal acknowledgement
 * + PDPA cross-border consent + hidden CSRF nonce, posting to /a/[token]/redeem.
 */

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/affirm/external/tokens";
import { issueRedeemNonce } from "@/lib/affirm/external/csrf";
import { isAffirmExternalEnabled } from "@/lib/affirm/external/guards";
import { isClientFacingState } from "@/lib/affirm/external/session";
import { AFFIRM_PDPA_VERSION, AFFIRM_TIME_EXPECTATION } from "@/lib/affirm/external/legal";

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
    include: { bundle: { select: { id: true, client: true, state: true } } },
  });

  // Polymorphic: every failure lands on the same generic terminal page.
  if (!grant) redirect("/a/expired");
  if (grant.revokedAt) redirect("/a/expired");
  if (grant.supersededByGrantId) redirect("/a/expired");
  if (!isClientFacingState(grant.bundle.state)) redirect("/a/expired");

  const nonce = issueRedeemNonce(token);

  return (
    <main style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px" }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "#5A5A5A", marginBottom: 8 }}>ABeam Workbench</div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: "#002B5C" }}>
          {grant.bundle.client}
        </h1>
        <p style={{ marginTop: 12, color: "#3A3A3A", fontSize: 15, lineHeight: 1.6 }}>
          Welcome{grant.displayName ? `, ${grant.displayName}` : ""}. You&apos;ll see how the
          standard approach works for your business, then tell us where your business differs.
          It takes {AFFIRM_TIME_EXPECTATION}, and your answers are saved as you go.
        </p>
      </header>

      <form
        method="POST"
        action={`/a/${encodeURIComponent(token)}/redeem`}
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E1D6",
          borderRadius: 12,
          padding: 24,
        }}
      >
        <input type="hidden" name="csrf" value={nonce} />

        <label style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-start" }}>
          <input type="checkbox" name="acknowledge_legal" value="1" required style={{ marginTop: 4 }} />
          <span style={{ fontSize: 14, lineHeight: 1.5 }}>
            I confirm I am {grant.displayName ? `${grant.displayName}, ` : ""}the named recipient
            ({grant.email}), and I&apos;m authorized to give input on behalf of{" "}
            {grant.bundle.client}.
          </span>
        </label>

        <label style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "flex-start" }}>
          <input type="checkbox" name="pdpa_consent" value="1" style={{ marginTop: 4 }} />
          <span style={{ fontSize: 14, lineHeight: 1.5 }}>
            I consent to my access and answers being processed on infrastructure that may sit
            outside Malaysia, in line with the PDPA cross-border notice (version{" "}
            {AFFIRM_PDPA_VERSION}).
          </span>
        </label>

        <button
          type="submit"
          style={{
            background: "#002B5C",
            color: "#FFFFFF",
            border: "none",
            padding: "13px 24px",
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 8,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Begin
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 12, color: "#8A8A8A", textAlign: "center" }}>
        This is a secure, personal link prepared for you. Please do not forward it.
      </p>
    </main>
  );
}
