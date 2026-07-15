/**
 * GET /a/home — Affirm external authenticated home.
 *
 * PR-1 PLACEHOLDER. Proves the full session pipeline (token → ack → session →
 * OTP → authenticated page). The real executive journey (value-chain ribbon,
 * stream index, process stories, in-context questions) replaces this in PR-3.
 *
 * Guards: fail-closed session, and a per-device OTP gate — a device that holds
 * a session cookie but has NOT cleared OTP is bounced to /a/verify (never
 * served content). Denials write external_action_denied.
 */

import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { writeGuestEvent } from "@/lib/affirm/external/audit";
import { issueSessionNonce } from "@/lib/affirm/external/csrf";
import { getAffirmSetForGrant } from "@/lib/affirm/external/serializers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AffirmHomePage() {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/a/expired");

  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) {
    await writeGuestEvent({
      bundleId: ctx.bundle.id,
      type: "external_action_denied",
      grantId: ctx.grant.id,
      payload: { reason: "otp_required", path: "/a/home" },
    });
    redirect("/a/verify");
  }

  // Best-effort idle refresh.
  void touchGuestSession(ctx.session.id);

  const set = await getAffirmSetForGrant(ctx.grant.id);
  const questionCount = set?.questions.length ?? 0;
  const streamCount = new Set(set?.questions.map((q) => q.streamId)).size;

  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: "0 16px" }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "#5A5A5A", marginBottom: 8 }}>ABeam Workbench</div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: "#002B5C" }}>
          You&apos;re in{ctx.grant.displayName ? `, ${ctx.grant.displayName}` : ""}
        </h1>
        <p style={{ marginTop: 12, color: "#3A3A3A", fontSize: 15, lineHeight: 1.6 }}>
          Your secure session for <strong>{ctx.bundle.client}</strong> is active. The guided
          executive journey ships next — for now this confirms your access is working.
        </p>
      </header>

      <section
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E1D6",
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: "#8A8A8A", marginBottom: 6 }}>Prepared for you</div>
        <div style={{ fontSize: 15, color: "#1A1A1A" }}>
          {questionCount} question{questionCount === 1 ? "" : "s"} across {streamCount} value
          stream{streamCount === 1 ? "" : "s"}
          {ctx.grant.roleLabel ? ` · ${ctx.grant.roleLabel}` : ""}.
        </div>
      </section>

      <form method="POST" action="/a/end" style={{ textAlign: "center" }}>
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
          Sign out
        </button>
      </form>
    </main>
  );
}
