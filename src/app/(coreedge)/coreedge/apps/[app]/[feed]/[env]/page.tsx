import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { GateStrip, hopsFromBreak } from "@/components/coreedge/GateStrip";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { WhyTrace } from "@/components/coreedge/WhyTrace";
import {
  HOPS_AFTER_THE_BREAK,
  laneCheckedAge,
  UNCHECKED_EXPLANATION,
  WHY_NO_RECORDED_CALL,
  type WhyCase,
} from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS, parseLaneEnvironment } from "@/lib/coreedge/lanes";
import {
  LANE_STATUS_VOCABULARY,
  OWNER_LABELS,
  type LaneStatus,
} from "@/lib/coreedge/status-vocabulary";
import { lastLaneCall, listLanes } from "@/lib/coreedge/queries";
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
 * THE REFERENCE IS A REAL CORRELATION ID OR THERE IS NONE. It used to be built
 * from the lane's own slugs — stable across renders, which was the stated goal,
 * and wrong for a bigger reason: it is not in `NorthboundAuditEvent`, so
 * `lookupCorrelationId` returns "not found" for it and quoting it to support
 * starts a hunt for a call nobody recorded. It now comes from the lane's most
 * recent audited call, and a lane with no calls says so.
 *
 * ONE GATE STRIP. The page rendered two — the trace's own, and a second "The six
 * hops" section below it — drawn from two different sources, so they could and
 * did disagree about which hop broke. There is one strip and one source now: the
 * verdict, which is the same object the chip beside it comes from.
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

  /*
   * THE ONE SOURCE FOR WHERE THE CHAIN STOPPED. `LANE_STATUS_VOCABULARY` also
   * carries a `brokenHop`, and it is a per-STATUS answer where this is a
   * per-LANE one — which is a real difference, not a stylistic one. A lane whose
   * SAP system timed out at the metadata probe derives `sapUnavailable`, and the
   * vocabulary's fixed answer for that status is `sapDataRead`: the strip would
   * mark SAP metadata as PASSED on a lane where metadata is exactly what did not
   * answer. The verdict knows which; the vocabulary cannot.
   */
  const hops = hopsFromBreak(lane.verdict.brokenHop);

  const lastCall = await lastLaneCall(user.organizationId, lane.appId, lane.feedId, environment);

  return (
    <CoreEdgeShell
      current="/coreedge"
      title={`${lane.feedName} · ${ENVIRONMENT_LABELS[environment]}`}
      subtitle={lane.appName}
    >
      <div className="flex flex-wrap items-center gap-4">
        <StatusChip status={lane.verdict.status} age={laneCheckedAge(lane.verdict, now)} />
        <span className="text-sm text-ink-soft">{lane.verdict.because}</span>
      </div>

      {/*
        WHY THERE IS NO AGE, on the one screen with room to say it in full. The
        chip's phrase fits a table cell; this says whose move it is, and for the
        five reasons that are outside the nightly sweep on purpose, says that
        plainly rather than leaving a person waiting for a check that is not
        coming.
      */}
      {lane.verdict.unchecked === null ? null : (
        <p className="max-w-prose text-sm text-ink-soft">
          {UNCHECKED_EXPLANATION[lane.verdict.unchecked]}
        </p>
      )}

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
            hops={hops}
            {...(lane.verdict.checkedAt === null
              ? {}
              : {
                  checkedAt: lane.verdict.checkedAt.toISOString(),
                  checkedAge: laneCheckedAge(lane.verdict, now),
                })}
          />
          <p className="max-w-prose text-xs text-ink-muted">{HOPS_AFTER_THE_BREAK}</p>
          {def.owner === null ? null : (
            <p className="text-xs text-ink-muted">{OWNER_LABELS[def.owner]} owns this.</p>
          )}
          <p className="text-xs text-ink-muted">
            {lastCall === null ? (
              WHY_NO_RECORDED_CALL
            ) : (
              <>
                Reference{" "}
                <span className="font-mono select-all text-ink-soft">{lastCall.correlationId}</span>
              </>
            )}
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
          hops={hops}
          /*
           * THE LANE'S OWN REASON, not A6's general one. The deck gives a single
           * Key row covering missing, expired, revoked and retired; the
           * derivation knows which of the four this lane is, and printing the
           * list of four under a lane whose key was revoked hands back the
           * research project the trace exists to remove.
           */
          because={lane.verdict.because}
          {...(lastCall === null ? {} : { correlationId: lastCall.correlationId })}
        />
      )}
    </CoreEdgeShell>
  );
}
