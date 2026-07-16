/**
 * GET /d/home — V1, the value-stream overview (brief §7 V1).
 *
 * "Eyebrow 'PROCESS DISCOVERY · {CLIENT}' → serif H1 'Your business on one page
 * — before you pick a system.' → coverage chip row (26) → value-stream ribbon
 * (15) with per-segment progress + fit bar → 'where we differ' heatmap (25) →
 * what-happens-next strip."
 *
 * States (brief §7 V1): (a) fresh 0%; (b) mid-progress; (c) all-reviewed → teal
 * banner; (f) skeleton. (d) Present and (e) Export are PR-3.
 *
 * The .dc models only (b), hardcodes 654/638/55/8, ships a fixture client
 * ("Asia Meals Group"), and models only Source-to-Pay with the other streams as
 * "not modeled in this prototype pass". All of that is prototype scaffolding.
 * Here: every count comes from coverageCounts(), all 10 streams come from the
 * loader, and the client comes from the session.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CoverageRow } from "@/components/discovery/CoverageRow";
import { DifferHeatmap } from "@/components/discovery/DifferHeatmap";
import { DiscoveryHomeSkeleton } from "@/components/discovery/DiscoveryHomeSkeleton";
import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { ValueStreamRibbon } from "@/components/discovery/ValueStreamRibbon";
import { WhatHappensNextStrip } from "@/components/discovery/WhatHappensNextStrip";
import { getDiscoveryHome } from "@/lib/discovery/external/journey";
import { isDeviceVerified, requireGuestSession } from "@/lib/discovery/external/guards";
import { isSealed, touchGuestSession } from "@/lib/discovery/external/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function DiscoveryHomeContent() {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/d/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/d/verify");
  void touchGuestSession(ctx.session.id);

  const view = await getDiscoveryHome({
    engagementId: ctx.engagement.id,
    client: ctx.engagement.client,
    displayName: ctx.grant.displayName,
    roleLabel: ctx.grant.roleLabel,
    valueStreamIds: ctx.grant.valueStreamIds,
    sealed: isSealed(ctx.engagement),
  });

  const decided = view.streams.reduce((n, s) => n + s.decided, 0);
  const totalInScope = view.streams.reduce((n, s) => n + s.processCount, 0);

  return (
    <DiscoveryShell
      clientName={view.identity.client}
      engagementLabel="Process Discovery"
      granteeName={view.identity.displayName}
      granteeRole={view.identity.roleLabel}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Process Discovery · {view.identity.client}
      </p>
      <h1 className="mb-7 max-w-[720px] text-pretty font-serif text-[32px] font-medium leading-[38px] text-ink">
        Your business on one page — before you pick a system.
      </h1>

      {/* Sealed / read-only. Derived from engagement state, never a column. */}
      {view.sealed && (
        <p className="mb-6 rounded-input border border-navy-border bg-navy-soft px-4 py-3 text-[13px] text-navy">
          Your review is sealed and read-only. Everything below is what you shared with us.
        </p>
      )}

      {/* State (c): all reviewed — brief §7 V1, verbatim. */}
      {view.allReviewed && !view.sealed && (
        <p className="mb-6 rounded-input border border-decision-standard/30 bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] px-4 py-3 text-[13px] font-semibold text-decision-standard">
          Every stream reviewed — ready for the workshop.
        </p>
      )}

      <CoverageRow coverage={view.coverage} />

      <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Your value streams
      </h2>

      {/* State (a) fresh 0% vs (b) mid-progress. Progress is announced politely
          so a reviewer using a screen reader hears it change, per brief §11. */}
      <p aria-live="polite" className="mb-3.5 text-[13px] text-ink-soft">
        {view.fresh
          ? `Nothing reviewed yet — ${totalInScope.toLocaleString("en")} processes across ${view.streams.length} value streams. Start anywhere.`
          : `${decided.toLocaleString("en")} of ${totalInScope.toLocaleString("en")} processes reviewed across ${view.streams.length} value streams.`}
      </p>

      <ValueStreamRibbon streams={view.streams} />

      <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Where you differ
      </h2>
      <DifferHeatmap streams={view.streams} />

      <WhatHappensNextStrip current={1} />
    </DiscoveryShell>
  );
}

export default function DiscoveryHomePage() {
  // State (f): skeleton. Brief §12.8 — skeleton is first-class, not an
  // afterthought. The .dc models none.
  return (
    <Suspense
      fallback={
        <DiscoveryShell>
          <DiscoveryHomeSkeleton />
        </DiscoveryShell>
      }
    >
      <DiscoveryHomeContent />
    </Suspense>
  );
}
