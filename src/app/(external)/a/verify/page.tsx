/**
 * GET /a/verify — Affirm external OTP entry.
 *
 * Resolves the guest session (fail-closed via requireGuestSession). Renders a
 * 6-digit code input. POST → /a/verify/submit. On lockout the grant is revoked,
 * so requireGuestSession returns null on the next load and the user lands on
 * the polymorphic /a/expired.
 */

import { redirect } from "next/navigation";
import { OtpInput } from "@/components/external/OtpInput";
import { requireGuestSession } from "@/lib/affirm/external/guards";
import { issueSessionNonce } from "@/lib/affirm/external/csrf";
import { OTP_MAX_ATTEMPTS } from "@/lib/affirm/external/otp";

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

  const errorMessage =
    error === "invalid"
      ? `Code did not match. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before access locks.`
      : error === "expired"
        ? "Code expired — request a new one below."
        : error === "resend_rate_limited"
          ? "Please wait at least 30 seconds before requesting another code."
          : error === "resend_exhausted"
            ? "You've requested the maximum number of codes. Contact your ABeam consultant."
            : null;

  return (
    <main style={{ maxWidth: 480, margin: "64px auto", padding: "0 16px" }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "#5A5A5A", marginBottom: 8 }}>ABeam Workbench</div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0, color: "#002B5C" }}>
          Confirm it&apos;s you
        </h1>
        <p style={{ marginTop: 12, color: "#3A3A3A", fontSize: 15, lineHeight: 1.6 }}>
          We sent a 6-digit code to {ctx.grant.email}. Enter it below to continue.
        </p>
        {attempts > 0 ? (
          <p style={{ marginTop: 8, fontSize: 13, color: "#8A8A8A" }}>
            {remaining} attempt{remaining === 1 ? "" : "s"} remaining before access locks.
          </p>
        ) : null}
      </header>

      {errorMessage ? (
        <div
          role="alert"
          style={{
            background: "#FCEBEB",
            color: "#791F1F",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <form
        method="POST"
        action="/a/verify/submit"
        style={{ background: "#FFFFFF", border: "1px solid #E5E1D6", borderRadius: 12, padding: 24 }}
      >
        <input type="hidden" name="csrf" value={issueSessionNonce(ctx.session.id)} />
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Verification code</div>
        <div style={{ marginBottom: 24 }}>
          <OtpInput name="otp" length={6} />
        </div>
        <button
          type="submit"
          style={{
            background: "#002B5C",
            color: "#FFFFFF",
            border: "none",
            padding: "12px 24px",
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 8,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Verify
        </button>
      </form>

      <form method="POST" action="/a/verify/resend" style={{ marginTop: 16, textAlign: "center" }}>
        <input type="hidden" name="csrf" value={issueSessionNonce(ctx.session.id)} />
        <button
          type="submit"
          style={{
            background: "transparent",
            color: "#5A5A5A",
            border: "none",
            padding: "8px 12px",
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Resend code
        </button>
      </form>
    </main>
  );
}
