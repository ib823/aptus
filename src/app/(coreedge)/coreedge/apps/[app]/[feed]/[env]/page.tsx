import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { GateStrip, hopsFromBreak } from "@/components/coreedge/GateStrip";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { WhyTrace } from "@/components/coreedge/WhyTrace";
import { WHY_CASE_HOP, type WhyCase } from "@/lib/coreedge/copy";
import { proofAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS, parseLaneEnvironment } from "@/lib/coreedge/lanes";
import {
  LANE_STATUS_VOCABULARY,
  OWNER_LABELS,
  type LaneStatus,
} from "@/lib/coreedge/status-vocabulary";
import { listLanes } from "@/lib/coreedge/queries";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../../../../CoreEdgeShell";

/**
 * Screen 04 · Lane › Why? + timeline — "The refusal routes to its fix, and names
 * whose fix it is."
 *
 * A1's fifth principle, made into a screen. A refusal that shows a code and
 * stops has handed the user a research project; this one names the broken hop,
 * the owner and the one action.
 *
 * THE CORRELATION ID IS DERIVED FROM THE LANE, not generated per render. A
 * reference that changes every time the page loads is useless for quoting to
 * support, which is the only reason it exists.
 */

export const metadata: Metadata = { title: "Lane" };

/**
 * Which Why? case explains this status.
 *
 * Statuses with no case are the ones A6 never wrote an explanation for — the
 * healthy ones, and the two that are claims about our own evidence rather than
 * about the lane. They render the trace without a headline rather than borrowing
 * someone else's.
 */
const WHY_FOR_STATUS: Readonly<Partial<Record<LaneStatus, WhyCase>>> = {
  noKey: "key",
  keyNotValid: "key",
  rateLimited: "rateLimit",
  noAccess: "access",
  inReview: "access",
  accessEnded: "accessExpired",
  noSapSystem: "binding",
  bindingRefused: "bindingAmbiguous",
  signInRefused: "sapMetadata401",
  sapRefused: "sapDataRead403",
  sapUnavailable: "sapTimeoutOr5xx",
  circuitOpen: "sapTimeoutOr5xx",
};

export default async function LaneDetail({
  params,
}: {
  params: Promise<{ app: string; feed: string; env: string }>;
}): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) notFound();

  const { app, feed, env } = await params;
  const environment = parseLaneEnvironment(env);
  if (environment === null) notFound();

  const lanes = await listLanes(user.organizationId, { appSlug: app });
  const lane = lanes.find((l) => l.feedId === feed && l.environment === environment);
  if (lane === undefined) notFound();


  // One instant for the whole render.
  const now = new Date();

  const def = LANE_STATUS_VOCABULARY[lane.verdict.status];
  const whyCase = WHY_FOR_STATUS[lane.verdict.status];
  const correlationId = `${lane.appSlug}.${lane.feedId}.${environment}`.toLowerCase();

  return (
    <CoreEdgeShell
      current="/coreedge"
      title={`${lane.feedName} · ${ENVIRONMENT_LABELS[environment]}`}
      subtitle={lane.appName}
    >
      <div className="flex flex-wrap items-center gap-4">
        <StatusChip status={lane.verdict.status} age={proofAge(lane.verdict.checkedAt, now)} />
        <span className="text-sm text-ink-soft">{lane.verdict.because}</span>
      </div>

      {whyCase === undefined ? (
        /*
         * No Why? case, which is the right outcome for Live, No data, Unknown
         * and Not started. The trace still renders — where the chain stopped is
         * worth seeing even when nothing is wrong — but no headline is borrowed
         * from a different failure.
         */
        <section className="flex flex-col gap-4 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-5">
          <h2 className="text-base font-medium text-ink">{def.means}</h2>
          <GateStrip
            hops={hopsFromBreak(def.brokenHop)}
            {...(lane.verdict.checkedAt === null
              ? {}
              : {
                  checkedAt: lane.verdict.checkedAt.toISOString(),
                  checkedAge: proofAge(lane.verdict.checkedAt, now),
                })}
          />
          {def.owner === null ? null : (
            <p className="text-xs text-ink-muted">{OWNER_LABELS[def.owner]} owns this.</p>
          )}
          <p className="text-xs text-ink-muted">
            Reference <span className="font-mono select-all text-ink-soft">{correlationId}</span>
          </p>
        </section>
      ) : (
        <WhyTrace
          whyCase={whyCase}
          facts={{
            env: ENVIRONMENT_LABELS[environment],
            dataset: lane.feedName,
            system: lane.system ?? "this SAP system",
          }}
          hops={hopsFromBreak(WHY_CASE_HOP[whyCase])}
          brokenAt={WHY_CASE_HOP[whyCase]}
          correlationId={correlationId}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink">The six hops</h2>
        <GateStrip hops={hopsFromBreak(def.brokenHop)} />
        <p className="max-w-prose text-xs text-ink-muted">
          A hop after the break was never attempted, so it reads &quot;not reached&quot; rather than
          passed or failed.
        </p>
      </section>
    </CoreEdgeShell>
  );
}
