/**
 * GET /d/summary — V4, scope summary (brief §7 V4).
 *
 * "Eyebrow 'DISCOVERY SUMMARY · {CLIENT} · {DATE}' → serif H1 'Here's how
 * {Client} runs — and where you differ.' → stat strip → three buckets → per-stream
 * fit bars → what-happens-next (node 2) → export CTA."
 *
 * The .dc omits the date and the per-stream fit bars; brief wins (conflicts #19,
 * #21). Bucket bands are 15% + serif 28 per §6/11, not the .dc's 12% + serif 24
 * (conflict #22).
 *
 * The export CTA is stubbed — PR-6 wires it. It is rendered disabled with an
 * explanation rather than as a live button that does nothing.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { DISCOVERY_MODE_COOKIE, parseMode } from "@/lib/discovery/mode";
import { FitBar } from "@/components/discovery/FitBar";
import { SummaryBuckets } from "@/components/discovery/SummaryBuckets";
import { WhatHappensNextStrip } from "@/components/discovery/WhatHappensNextStrip";
import { EXPORT_CTA, SEALED_NOTICE } from "@/lib/discovery/copy";
import { getDiscoverySummary } from "@/lib/discovery/external/journey";
import { isDeviceVerified, requireGuestSession } from "@/lib/discovery/external/guards";
import { effectiveStreamIds } from "@/lib/discovery/external/scope";
import { isSealed, touchGuestSession } from "@/lib/discovery/external/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DiscoverySummaryPage() {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/d/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/d/verify");
  void touchGuestSession(ctx.session.id);

  const view = await getDiscoverySummary({
    engagementId: ctx.engagement.id,
    client: ctx.engagement.client,
    displayName: ctx.grant.displayName,
    roleLabel: ctx.grant.roleLabel,
    scope: effectiveStreamIds({
      engagementStreamIds: ctx.engagement.valueStreamIds,
      grantStreamIds: ctx.grant.valueStreamIds,
    }),
    sealed: isSealed(ctx.engagement),
  });

  const mode = parseMode((await cookies()).get(DISCOVERY_MODE_COOKIE)?.value);

  // {DATE} per brief §7 V4. Rendered from the request's own clock, formatted
  // en-GB so the reader sees a date, not an ISO stamp.
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const tiles = [
    { value: view.mix.standard, label: "Runs as standard", tone: "text-decision-standard" },
    { value: view.mix.discuss, label: "Discuss", tone: "text-decision-configure" },
    { value: view.mix.differ, label: "We differ", tone: "text-decision-custom" },
    { value: view.mix.na, label: "Not applicable", tone: "text-ink-muted" },
    { value: view.total, label: "Total processes loaded", tone: "text-navy" },
  ];

  return (
    <DiscoveryShell
      mode={mode}
      clientName={view.identity.client}
      engagementLabel="Process Discovery"
      granteeName={view.identity.displayName}
      granteeRole={view.identity.roleLabel}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Discovery Summary · {view.identity.client} · {date}
      </p>
      <h1 className="mb-7 max-w-[640px] font-serif text-[30px] font-medium leading-10 text-ink">
        Here&apos;s how {view.identity.client} runs — and where you differ.
      </h1>

      {view.sealed && (
        <p className="mb-6 rounded-input border border-navy-border bg-navy-soft px-4 py-3 text-[13px] text-navy">
          {SEALED_NOTICE}
        </p>
      )}

      <ul className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <li
            key={t.label}
            className="rounded-card-warm border border-border-default bg-paper px-3.5 py-4 shadow-card-warm"
          >
            {/* Serif 28 per §3's ramp — the .dc's 26 is off-ramp (conflict #24). */}
            <p className={`font-serif text-[28px] font-medium leading-none ${t.tone}`}>{t.value}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              {t.label}
            </p>
          </li>
        ))}
      </ul>

      {/* Brief §9's honest gap capture, surfaced. A differ with no reason still
          counts in the stat strip but is not complete, and we say so rather than
          letting the number imply a finished record. */}
      {view.incomplete > 0 && (
        <p className="mb-8 rounded-input border border-decision-custom/30 bg-banner-warn px-4 py-3 text-[13px] text-ink-soft">
          <strong className="font-semibold text-decision-custom">
            {view.incomplete} {view.incomplete === 1 ? "decision needs" : "decisions need"} a reason
          </strong>{" "}
          before we can size {view.incomplete === 1 ? "it" : "them"}. They&apos;re marked below.
        </p>
      )}

      <SummaryBuckets buckets={view.buckets} />

      <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        By value stream
      </h2>
      <ul className="mb-8 flex flex-col gap-3.5">
        {view.streams.map((s) => (
          <li
            key={s.id}
            className="rounded-card-warm border border-border-default bg-paper px-5 py-4 shadow-card-warm"
          >
            <p className="mb-2 text-[13px] font-semibold text-ink">{s.name}</p>
            <FitBar mix={s.mix} />
          </li>
        ))}
      </ul>

      <WhatHappensNextStrip current={2} className="mb-6" />

      <button
        type="button"
        disabled
        aria-describedby="export-stub-note"
        className="ax-touch flex h-10 items-center rounded-input bg-cta px-5 text-sm font-semibold text-white opacity-50"
      >
        {EXPORT_CTA}
      </button>
      <p id="export-stub-note" className="mt-2 text-[11px] text-ink-muted">
        The export pack arrives in a later pass.
      </p>
    </DiscoveryShell>
  );
}
