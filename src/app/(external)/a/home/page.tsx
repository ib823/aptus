/**
 * GET /a/home — S4 Executive home (live) and S8 Executive summary (sealed).
 *
 * Fail-closed session + per-device OTP gate. While issued: the value-chain
 * ribbon + what-happens-next + sticky submit. Once submitted: the sealed
 * executive summary (stat strip + three buckets), print-clean. Restyled to the
 * Executive Surface design; behavior unchanged.
 */

import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { writeGuestEvent } from "@/lib/affirm/external/audit";
import { issueSessionNonce } from "@/lib/affirm/external/csrf";
import { getGuestJourney, getGuestSummary } from "@/lib/affirm/external/journey";
import { GuestShell } from "@/components/affirm/external/GuestShell";
import { ValueChainRibbon } from "@/components/affirm/external/ValueChainRibbon";
import { WhatHappensNext } from "@/components/affirm/external/WhatHappensNext";
import { SubmitPanel } from "@/components/affirm/external/SubmitPanel";
import { GuestGuide } from "@/components/affirm/external/GuestGuide";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET_META = {
  standard: {
    label: "Adopted standard",
    headerBg: "bg-[color-mix(in_srgb,var(--color-decision-standard)_15%,transparent)]",
    text: "text-decision-standard",
  },
  discuss: {
    label: "To discuss",
    headerBg: "bg-[color-mix(in_srgb,var(--color-decision-configure)_15%,transparent)]",
    text: "text-decision-configure",
  },
  deviate: {
    label: "We differ",
    headerBg: "bg-[color-mix(in_srgb,var(--color-decision-custom)_15%,transparent)]",
    text: "text-decision-custom",
  },
} as const;

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

  // ── Sealed: S8 executive summary ──
  if (sealed) {
    const s = await getGuestSummary(ctx.grant.id);
    if (!s) redirect("/a/expired");
    const stats = [
      { n: s.counts.standard, l: "Adopted", cls: "text-decision-standard" },
      { n: s.counts.discuss, l: "To discuss", cls: "text-decision-configure" },
      { n: s.counts.deviate, l: "We differ", cls: "text-decision-custom" },
      { n: s.total, l: "Total", cls: "text-navy" },
    ];
    return (
      <GuestShell granteeName={s.grant.displayName} granteeRole={s.grant.roleLabel} clientName={s.bundle.client}>
        <main className="mx-auto max-w-[880px] px-[clamp(16px,4vw,32px)] pb-20 pt-11">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Your review · Submitted
          </p>
          <h1 className="font-serif text-[30px] font-medium leading-10 text-ink">
            Thank you{s.grant.displayName ? `, ${s.grant.displayName}` : ""}. Here&apos;s what you
            told us.
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] leading-[1.55] text-ink-soft">
            Your consultant is preparing the workshop from these answers.
          </p>

          {/* Stat strip */}
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((st) => (
              <div key={st.l} className="ax-print-plain rounded-card-warm bg-paper px-3.5 py-[18px] shadow-card">
                <p className={`font-serif text-[28px] font-medium leading-none ${st.cls}`}>{st.n}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
                  {st.l}
                </p>
              </div>
            ))}
          </div>

          {/* Bucket cards */}
          <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {(["standard", "discuss", "deviate"] as const).map((key) => {
              const meta = BUCKET_META[key];
              const items = s.buckets[key];
              return (
                <div
                  key={key}
                  className="ax-print-plain flex flex-col overflow-hidden rounded-card-warm border border-border-default bg-paper shadow-card"
                >
                  <div className={`px-[18px] py-4 ${meta.headerBg}`}>
                    <p className={`font-serif text-[28px] font-medium leading-none ${meta.text}`}>
                      {items.length}
                    </p>
                    <p className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${meta.text}`}>
                      {meta.label}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 px-[18px] py-3.5">
                    {items.length === 0 ? (
                      <p className="text-[13px] text-ink-muted">Nothing here yet.</p>
                    ) : (
                      items.map((it) => (
                        <div key={it.questionId} className="flex flex-col gap-1.5">
                          <div className="flex gap-2">
                            {it.scopeItemId && (
                              <span className="inline-flex h-5 items-center rounded bg-navy px-1.5 font-mono text-[10px] font-bold text-white">
                                {it.scopeItemId}
                              </span>
                            )}
                            <span className="text-[13px] leading-[18px] text-ink-soft">{it.text}</span>
                          </div>
                          {key === "deviate" && it.reason && (
                            <p className="rounded-input border border-[color-mix(in_srgb,var(--color-decision-custom)_30%,transparent)] bg-banner-warn px-2.5 py-1.5 text-[12px] leading-[17px] text-ink-soft">
                              {it.reason}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ax-no-print mt-8">
            <WhatHappensNext current={2} />
          </div>
        </main>
      </GuestShell>
    );
  }

  // ── Live: S4 home ──
  const journey = await getGuestJourney(ctx.grant.id);
  if (!journey) redirect("/a/expired");
  const csrf = issueSessionNonce(ctx.session.id);
  const greeting = `${journey.grant.displayName ?? "Welcome"}${
    journey.grant.roleLabel ? ` · ${journey.grant.roleLabel}` : ""
  }`.toUpperCase();

  return (
    <GuestShell
      granteeName={journey.grant.displayName}
      granteeRole={journey.grant.roleLabel}
      clientName={journey.bundle.client}
    >
      <main className="mx-auto max-w-[880px] px-[clamp(16px,4vw,32px)] pb-[140px] pt-11">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {greeting}
        </p>
        <h1 className="mb-3 font-serif text-[30px] font-medium leading-10 text-ink">
          Your processes, on one page.
        </h1>
        <p className="mb-8 max-w-[58ch] text-[15px] leading-[1.55] text-ink-soft">
          See how the standard works, then tell us where your business differs.
        </p>

        <GuestGuide id="affirm-exec-home" />

        <ValueChainRibbon streams={journey.streams} />

        <WhatHappensNext current={1} />
      </main>

      <SubmitPanel
        csrfNonce={csrf}
        total={journey.totals.total}
        answered={journey.totals.answered}
        clientName={journey.bundle.client}
        streams={journey.streams.map((s) => ({ name: s.streamName, answered: s.answered, total: s.total }))}
      />
    </GuestShell>
  );
}
