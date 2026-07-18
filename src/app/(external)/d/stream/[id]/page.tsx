/**
 * GET /d/stream/[id] — V2, the stream / workflow index (brief §7 V2).
 *
 * Every one of the 10 streams is real here. The .dc models only Source-to-Pay
 * and renders the other seven as "not modeled in this prototype pass" — that is
 * prototype scaffolding and does not ship.
 *
 * Persona scope is enforced in the view model, not here: an out-of-scope stream
 * returns null and lands on the terminal rather than 403-ing, which would
 * confirm the stream exists.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { DISCOVERY_MODE_COOKIE, parseMode } from "@/lib/discovery/mode";
import { FitBar } from "@/components/discovery/FitBar";
import { StreamIndex } from "@/components/discovery/StreamIndex";
import { SEALED_NOTICE, STREAM_COMPLETE_BANNER } from "@/lib/discovery/copy";
import { getDiscoveryStream } from "@/lib/discovery/external/journey";
import { isDeviceVerified, requireGuestSession } from "@/lib/discovery/external/guards";
import { isSealed, touchGuestSession } from "@/lib/discovery/external/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DiscoveryStreamPage({ params }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/d/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/d/verify");
  void touchGuestSession(ctx.session.id);

  const { id } = await params;
  const view = await getDiscoveryStream({
    engagementId: ctx.engagement.id,
    client: ctx.engagement.client,
    displayName: ctx.grant.displayName,
    roleLabel: ctx.grant.roleLabel,
    valueStreamIds: ctx.grant.valueStreamIds,
    sealed: isSealed(ctx.engagement),
    streamId: id,
  });
  if (!view) redirect("/d/home");

  const mode = parseMode((await cookies()).get(DISCOVERY_MODE_COOKIE)?.value);

  return (
    <DiscoveryShell
      mode={mode}
      clientName={view.identity.client}
      engagementLabel="Process Discovery"
      granteeName={view.identity.displayName}
      granteeRole={view.identity.roleLabel}
    >
      <nav aria-label="Breadcrumb" className="mb-2.5">
        <ol className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-ink-muted">
          <li>
            <Link
              href="/d/home"
              className="text-ink-muted underline-offset-2 hover:text-navy hover:underline focus-visible:shadow-focus-ring focus-visible:outline-none"
            >
              Overview
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{view.name}</li>
        </ol>
      </nav>

      <h1 className="mb-1.5 font-serif text-[30px] font-medium leading-10 text-ink">{view.name}</h1>
      {/* Support line — brief §7 V2. The .dc has none (conflict #5). */}
      <p className="mb-3.5 text-sm text-ink-soft">{view.domain}</p>

      {view.sealed && (
        <p className="mb-6 rounded-input border border-navy-border bg-navy-soft px-4 py-3 text-[13px] text-navy">
          {SEALED_NOTICE}
        </p>
      )}

      {view.complete && !view.sealed && (
        <p className="mb-6 rounded-input border border-decision-standard/30 bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] px-4 py-3 text-[13px] font-semibold text-decision-standard">
          {STREAM_COMPLETE_BANNER}
        </p>
      )}

      <FitBar mix={view.mix} className="mb-6 max-w-[420px]" />

      <StreamIndex workflows={view.workflows} />
    </DiscoveryShell>
  );
}
