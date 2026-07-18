/**
 * GET /d/process/[pid] — V3, process detail (brief §7 V3). THE core screen.
 *
 * "Sticky journey progress bar → serif H1 neutral process name (scope ID in a
 * chip, never the title) → one-line best-practice description → flow diagram as
 * the centrepiece → the fit/scope selector → attribution footer. No product
 * mapping on this or any client view — it is consultant-only (§6/24)."
 *
 * The 197 no-flow processes get the honest fallback panel and STILL get the
 * selector: a reviewer can tell us a process is not applicable whether or not we
 * hold a flow for it. Brief §7 V3(e): "selector still available".
 */

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CompletenessBadge } from "@/components/discovery/CompletenessBadge";
import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { FitSelector } from "@/components/discovery/FitSelector";
import { FlowDiagram } from "@/components/discovery/FlowDiagram";
import { PresentFollower } from "@/components/discovery/PresentFollower";
import { PresentProcess } from "@/components/discovery/PresentProcess";
import { PresentShell } from "@/components/discovery/PresentShell";
import { DISCOVERY_MODE_COOKIE, parseMode } from "@/lib/discovery/mode";
import {
  NO_FLOW_FALLBACK,
  PROMISE_V3,
  PROVENANCE_CLIENT,
  SEALED_NOTICE,
} from "@/lib/discovery/copy";
import { issueSessionNonce } from "@/lib/discovery/external/csrf";
import { getDiscoveryProcess, getDiscoveryStream } from "@/lib/discovery/external/journey";
import { isDeviceVerified, requireGuestSession } from "@/lib/discovery/external/guards";
import { effectiveStreamIds } from "@/lib/discovery/external/scope";
import { isSealed, touchGuestSession } from "@/lib/discovery/external/session";
import { FIT_LABELS } from "@/lib/discovery/fit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface PageProps {
  params: Promise<{ pid: string }>;
}

export default async function DiscoveryProcessPage({ params }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/d/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/d/verify");
  void touchGuestSession(ctx.session.id);

  const { pid } = await params;
  const view = await getDiscoveryProcess({
    engagementId: ctx.engagement.id,
    client: ctx.engagement.client,
    displayName: ctx.grant.displayName,
    roleLabel: ctx.grant.roleLabel,
    scope: effectiveStreamIds({
      engagementStreamIds: ctx.engagement.valueStreamIds,
      grantStreamIds: ctx.grant.valueStreamIds,
    }),
    sealed: isSealed(ctx.engagement),
    processId: pid,
  });
  if (!view) redirect("/d/home");

  const p = view.process;
  const state = view.decision?.status ?? "open";
  const mode = parseMode((await cookies()).get(DISCOVERY_MODE_COOKIE)?.value);
  const csrf = issueSessionNonce(ctx.session.id);

  // Present (§7 V5): the opposite chrome — full-bleed, no nav, projected scale.
  if (mode === "present") {
    // The facilitator bar's live tally reads the CURRENT stream's real
    // decisions, not a mock: the room watches this number move.
    const stream = await getDiscoveryStream({
      engagementId: ctx.engagement.id,
      client: ctx.engagement.client,
      displayName: ctx.grant.displayName,
      roleLabel: ctx.grant.roleLabel,
      scope: effectiveStreamIds({
      engagementStreamIds: ctx.engagement.valueStreamIds,
      grantStreamIds: ctx.grant.valueStreamIds,
    }),
      sealed: isSealed(ctx.engagement),
      streamId: view.streamId,
    });
    return (
      <PresentShell
        clientName={view.identity.client}
        context={view.streamName}
        counter={stream ? `${stream.decided} / ${stream.processCount} reviewed` : null}
        mode={mode}
      >
        {/* The seam's client half: follows the consultant's driving. */}
        <PresentFollower currentProcessId={p.id} />
        <PresentProcess
          view={view}
          csrf={csrf}
          streamMix={stream?.mix ?? { standard: 0, differ: 0, discuss: 0, na: 0, open: 0 }}
        />
      </PresentShell>
    );
  }

  return (
    <DiscoveryShell
      mode={mode}
      clientName={view.identity.client}
      engagementLabel="Process Discovery"
      granteeName={view.identity.displayName}
      granteeRole={view.identity.roleLabel}
    >
      {/* Sticky journey bar — breadcrumb + chip + name + fit state. */}
      <div className="sticky top-14 z-20 -mx-8 mb-2 border-b border-border-default bg-cream px-8 py-2.5">
        <div className="flex items-center gap-2.5 text-[13px]">
          <Link
            href={`/d/stream/${encodeURIComponent(view.streamId)}`}
            className="ax-touch text-ink-soft hover:text-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            <span aria-hidden="true">←</span>
            <span className="sr-only">Back to {view.streamName}</span>
          </Link>
          <nav aria-label="Breadcrumb">
            <p className="font-mono text-[11px] uppercase text-ink-soft">
              {view.streamName} / {view.workflowName}
            </p>
          </nav>
          <span className="ml-auto inline-flex h-[22px] items-center rounded-pill bg-ink-tint px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-soft">
            {FIT_LABELS[state]}
          </span>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* Scope chip — the ID lives here, never in the title (§6/2, §7 V3). */}
        <span className="inline-flex h-[22px] items-center rounded-[5px] bg-navy px-[7px] font-mono text-[11px] font-bold text-white">
          {p.id}
        </span>
        <CompletenessBadge completeness={p.completeness} />
      </div>

      <h1 className="mb-2 font-serif text-[30px] font-medium leading-10 text-ink">{p.name}</h1>
      <p className="mb-7 max-w-[640px] text-[15px] leading-[22px] text-ink-soft">{p.description}</p>

      {view.sealed && (
        <p className="mb-6 rounded-input border border-navy-border bg-navy-soft px-4 py-3 text-[13px] text-navy">
          {SEALED_NOTICE}
        </p>
      )}

      {p.hasFlow ? (
        <FlowDiagram flow={p.flow} />
      ) : (
        /* One of the 197. Never an empty diagram — brief §6/18: "never a fake flow". */
        <div className="mb-2 rounded-card-warm border border-border-default bg-paper px-8 py-10 text-center">
          <p className="text-sm text-ink-soft">{NO_FLOW_FALLBACK}</p>
        </div>
      )}

      {/* Attribution — §6/12 style (mono 10, muted, shown never hidden),
          §10 string (verbatim, incl. "the reference names no vendor"). */}
      <p className="mb-7 font-mono text-[10px] leading-4 text-ink-soft">{PROVENANCE_CLIENT}</p>

      <p className="sr-only">{PROMISE_V3}</p>

      <FitSelector
        processId={p.id}
        initialStatus={view.decision?.status ?? null}
        initialReason={view.decision?.reason ?? null}
        sealed={view.sealed}
        csrf={csrf}
      />

      <nav aria-label="Process navigation" className="mt-10 flex gap-2.5 border-t border-border-default pt-6">
        {view.prevId && (
          <Link
            href={`/d/process/${encodeURIComponent(view.prevId)}`}
            className="ax-touch flex h-9 items-center rounded-input border border-border-default bg-paper px-4 text-[13px] font-semibold text-ink-soft hover:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Previous process
          </Link>
        )}
        {view.nextId && (
          <Link
            href={`/d/process/${encodeURIComponent(view.nextId)}`}
            className="ax-touch flex h-9 items-center rounded-input border border-navy bg-navy px-4 text-[13px] font-semibold text-white hover:bg-navy-hover focus-visible:shadow-focus-ring focus-visible:outline-none"
          >
            Next process
          </Link>
        )}
        <Link
          href="/d/summary"
          className="ax-touch ml-auto flex h-9 items-center rounded-input border border-border-default bg-paper px-4 text-[13px] font-semibold text-ink-soft hover:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          Scope summary
        </Link>
      </nav>
    </DiscoveryShell>
  );
}
