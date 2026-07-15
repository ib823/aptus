/**
 * GET /a/home — Affirm external executive journey (L0, the hero moment).
 *
 * Greeting + a value-chain ribbon (the grant's streams as connected segments,
 * sub-processes lit within each, a progress ring per stream), the one-line
 * promise, and the "what happens next" strip. When the bundle is submitted, the
 * whole journey is sealed and this renders the executive summary instead.
 *
 * Fail-closed session + per-device OTP gate (a session that hasn't cleared OTP
 * is bounced to /a/verify, never served content).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { writeGuestEvent } from "@/lib/affirm/external/audit";
import { issueSessionNonce } from "@/lib/affirm/external/csrf";
import { getGuestJourney, getGuestSummary } from "@/lib/affirm/external/journey";
import { JOURNEY_PROMISE, WHAT_HAPPENS_NEXT, BUCKET_MEANING } from "@/lib/affirm/external/copy";
import { ProgressRing } from "@/components/affirm/external/ProgressRing";
import { SubmitPanel } from "@/components/affirm/external/SubmitPanel";
import { GuestGuide } from "@/components/affirm/external/GuestGuide";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function WhatHappensNext({ activeIndex = 0 }: { activeIndex?: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="What happens next">
      {WHAT_HAPPENS_NEXT.map((stage, i) => (
        <li key={stage} className="flex items-center gap-2">
          <span
            className={`rounded-pill px-2.5 py-1 font-semibold ${
              i <= activeIndex ? "bg-navy text-white" : "bg-ink-tint text-ink-muted"
            }`}
          >
            {stage}
          </span>
          {i < WHAT_HAPPENS_NEXT.length - 1 && <span className="text-ink-disabled" aria-hidden="true">→</span>}
        </li>
      ))}
    </ol>
  );
}

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
  void touchGuestSession(ctx.session.id);

  const sealed = ctx.bundle.state !== "issued";

  // ── Sealed: executive summary ──
  if (sealed) {
    const summary = await getGuestSummary(ctx.grant.id);
    if (!summary) redirect("/a/expired");
    const { buckets } = summary;
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <header className="mb-8">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {summary.bundle.client} · Submitted
          </p>
          <h1 className="font-serif text-3xl text-ink">
            Thank you{summary.grant.displayName ? `, ${summary.grant.displayName}` : ""}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Your answers are sealed and with your consultant. Here&apos;s what you told us.
          </p>
        </header>

        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          {(["standard", "discuss", "deviate"] as const).map((b) => (
            <div key={b} className="rounded-card-warm border border-border-default bg-paper p-4">
              <p className="font-serif text-3xl text-ink">{buckets[b]}</p>
              <p className="mt-1 text-[13px] font-semibold text-ink">
                {b === "standard" ? "Adopt standard" : b === "discuss" ? "Discuss" : "We differ"}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{BUCKET_MEANING[b]}</p>
            </div>
          ))}
        </section>

        <section className="rounded-card-warm border border-border-default bg-paper p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            What happens next
          </p>
          <WhatHappensNext activeIndex={1} />
          <p className="mt-3 text-sm text-ink-soft">
            Your consultant reviews every answer, then the workshop turns the &ldquo;discuss&rdquo; and
            &ldquo;we differ&rdquo; items into a plan. Nothing is committed yet.
          </p>
        </section>
      </main>
    );
  }

  // ── Live: the journey home ──
  const journey = await getGuestJourney(ctx.grant.id);
  if (!journey) redirect("/a/expired");
  const csrf = issueSessionNonce(ctx.session.id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-8">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {journey.bundle.client}
        </p>
        <h1 className="font-serif text-3xl text-ink">
          Welcome{journey.grant.displayName ? `, ${journey.grant.displayName}` : ""}
          {journey.grant.roleLabel ? (
            <span className="ml-2 align-middle rounded-pill bg-navy-soft px-2.5 py-1 text-xs font-medium text-navy">
              {journey.grant.roleLabel}
            </span>
          ) : null}
        </h1>
        <p className="mt-2 max-w-[640px] text-[15px] leading-6 text-ink-soft">{JOURNEY_PROMISE}</p>
      </header>

      <GuestGuide id="affirm-exec-home" />

      {/* Value-chain ribbon */}
      <section className="mb-8" aria-label="Your value streams">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
          {journey.streams.map((s) => (
            <Link
              key={s.streamId}
              href={`/a/stream/${encodeURIComponent(s.streamId)}`}
              className="group flex flex-1 items-center gap-4 rounded-card-warm border border-border-default bg-paper p-4 shadow-card transition hover:border-navy/40"
            >
              <ProgressRing value={s.answered} max={s.total} label={`${s.answered} of ${s.total} answered in ${s.streamName}`} />
              <div className="min-w-0">
                <p className="truncate font-serif text-lg text-ink group-hover:text-navy">{s.streamName}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {s.subProcesses.length} area{s.subProcesses.length === 1 ? "" : "s"} · {s.answered}/{s.total} answered
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* What happens next */}
      <section className="mb-8 rounded-card-warm border border-border-default bg-cream p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          What happens next
        </p>
        <WhatHappensNext activeIndex={0} />
      </section>

      {/* Submit */}
      <SubmitPanel csrfNonce={csrf} total={journey.totals.total} answered={journey.totals.answered} />
    </main>
  );
}
