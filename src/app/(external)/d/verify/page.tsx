/**
 * GET /d/verify — Neutral Process Discovery device verification.
 *
 * Fail-closed session (requireGuestSession → null → /d/expired). On lockout the
 * grant is revoked inside the cascade, so the next load lands on the
 * polymorphic terminal rather than announcing the lockout.
 *
 * OtpInput is reused unchanged — it is already surface-neutral.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GuestShell } from "@/components/affirm/external/GuestShell";
import { OtpInput } from "@/components/external/OtpInput";
import { issueSessionNonce } from "@/lib/discovery/external/csrf";
import { requireGuestSession } from "@/lib/discovery/external/guards";
import { OTP_MAX_ATTEMPTS } from "@/lib/discovery/external/otp";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function DiscoveryVerifyPage({ searchParams }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/d/expired");

  const { error } = await searchParams;
  const remaining = Math.max(0, OTP_MAX_ATTEMPTS - ctx.grant.otpAttemptCount);
  const shake = error === "invalid";

  const errorMessage =
    error === "invalid"
      ? `That code didn't match — ${remaining} attempt${remaining === 1 ? "" : "s"} remaining`
      : error === "expired"
        ? "That code has expired — request a new one below."
        : error === "resend_rate_limited"
          ? "Please wait a moment before requesting another code."
          : error === "resend_exhausted"
            ? "You've requested the maximum number of codes. Contact your ABeam consultant."
            : null;

  return (
    <GuestShell clientName={ctx.engagement.client}>
      <main id="main" className="mx-auto max-w-[560px] px-[clamp(16px,4vw,32px)] pb-[72px] pt-16 text-center">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
          Device verification
        </p>
        <h1 className="mb-3 font-serif text-[32px] font-medium leading-[38px] text-ink">
          Enter the 6-digit code we emailed you
        </h1>
        <p className="mb-7 text-[13px] text-ink-soft">
          We sent a code to <span className="font-mono text-ink-soft">{ctx.grant.email}</span>.
        </p>

        <form method="POST" action="/d/verify/submit" className="ax-input">
          <input type="hidden" name="csrf" value={issueSessionNonce(ctx.session.id)} />
          <div className={`mb-3 flex justify-center ${shake ? "ax-shake" : ""}`}>
            <OtpInput name="otp" length={6} />
          </div>

          {errorMessage ? (
            <p className="mb-3 text-[13px] text-status-revoked-fg" role="alert" aria-live="assertive">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="ax-touch mx-auto flex h-11 w-full max-w-[320px] items-center justify-center rounded-input bg-cta text-[14px] font-semibold text-white shadow-card transition hover:bg-cta-hover focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Verify
          </button>
        </form>

        <form method="POST" action="/d/verify/resend" className="mt-4">
          <input type="hidden" name="csrf" value={issueSessionNonce(ctx.session.id)} />
          <button
            type="submit"
            className="ax-touch text-[11px] text-ink-soft underline transition hover:text-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Resend code
          </button>
        </form>
      </main>
    </GuestShell>
  );
}
