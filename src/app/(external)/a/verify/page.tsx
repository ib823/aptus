/**
 * GET /a/verify — S2 Device Verification.
 *
 * Fail-closed session (requireGuestSession → null → /a/expired). On lockout the
 * grant is revoked, so the next load lands on the polymorphic terminal.
 * Restyled to the Executive Surface design; OTP semantics unchanged.
 */

import { redirect } from "next/navigation";
import { OtpInput } from "@/components/external/OtpInput";
import { requireGuestSession } from "@/lib/affirm/external/guards";
import { issueSessionNonce } from "@/lib/affirm/external/csrf";
import { OTP_MAX_ATTEMPTS } from "@/lib/affirm/external/otp";
import { GuestShell } from "@/components/affirm/external/GuestShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AffirmVerifyPage({ searchParams }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/a/expired");

  const { error } = await searchParams;
  const attempts = ctx.grant.otpAttemptCount;
  const remaining = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
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
    <GuestShell clientName={ctx.bundle.client}>
      <main className="mx-auto max-w-[560px] px-[clamp(16px,4vw,32px)] pb-[72px] pt-16 text-center">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Device verification
        </p>
        <h1 className="mb-3 font-serif text-[32px] font-medium leading-[38px] text-ink">
          Enter the 6-digit code we emailed you
        </h1>
        <p className="mb-7 text-[13px] text-ink-muted">
          We sent a code to <span className="font-mono text-ink-soft">{ctx.grant.email}</span>.
        </p>

        <form method="POST" action="/a/verify/submit" className="ax-input">
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

        <form method="POST" action="/a/verify/resend" className="mt-4">
          <input type="hidden" name="csrf" value={issueSessionNonce(ctx.session.id)} />
          <button
            type="submit"
            className="text-[11px] text-ink-muted underline transition hover:text-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Resend code
          </button>
        </form>
      </main>
    </GuestShell>
  );
}
