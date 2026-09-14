import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { GateStrip } from "@/components/coreedge/GateStrip";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { WhyTrace } from "@/components/coreedge/WhyTrace";
import { RecheckLane } from "@/components/coreedge/actions/RecheckLane";
import { SendClaimLink } from "@/components/coreedge/actions/SendClaimLink";
import { refuseRecheck, refuseSendClaimLink } from "@/lib/coreedge/authz";
import {
  CLAIM_LINK_COPY,
  DISABLED_REASONS,
  HOPS_AFTER_THE_BREAK,
  laneAge,
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
import { lastLaneCall, listLanes, pendingClaimLink } from "@/lib/coreedge/queries";
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
   * THE ONE SOURCE FOR WHERE THE CHAIN STOPPED, and it is the verdict itself.
   *
   * Two earlier answers were both wrong here. `LANE_STATUS_VOCABULARY.brokenHop`
   * is a per-STATUS answer where this needs a per-LANE one. And
   * `hopsFromBreak(verdict.brokenHop)` walked the DISPLAY order, so a "No key"
   * lane drew Key broken and Access "not reached" — beside a chip saying access
   * is approved. Access had been proven; the derivation just proves it first.
   * `verdict.hops` comes off the same walk that produced the status.
   */
  const hops = lane.verdict.hops;

  const lastCall = await lastLaneCall(user.organizationId, lane.appId, lane.feedId, environment);
  const link = await pendingClaimLink(user.organizationId, lane.appId, environment, now);

  /*
   * THE TWO VERBS THIS SCREEN OFFERS, and why each is offered at all.
   *
   * Until now this page had none: every CoreEdge control rendered disabled with
   * "This action isn't wired up yet", so a lane reading "No key · collect or
   * renew the key" gave the reader the instruction and no way to follow it.
   *
   * The gates come from the same functions the routes run, so the reason shown
   * before the press and the reason returned after it are one sentence from one
   * source.
   */
  const sendRefusal = refuseSendClaimLink(user.role);
  const recheckRefusal = refuseRecheck(user.role);

  const keyHop = hops.find((h) => h.hop === "key");
  /*
   * Offer the link where the key is what stopped the chain, or where one is
   * already out — sending a link on a lane whose key works would revoke a
   * working credential to solve a problem nobody has.
   */
  const offerLink = keyHop?.state === "broken" || link !== null;
  const sendBlockedBecause =
    lane.appStatus === "retired"
      ? CLAIM_LINK_COPY.appRetired
      : sendRefusal === null
        ? null
        : DISABLED_REASONS[sendRefusal];

  return (
    <CoreEdgeShell
      current="/coreedge"
      title={`${lane.feedName} · ${ENVIRONMENT_LABELS[environment]}`}
      subtitle={lane.appName}
    >
      {/*
        THE CHIP ALONE. `lane.verdict.because` used to sit beside it and again
        inside the trace below, so the page said the same sentence twice with a
        contradicting heading between them. The explanation belongs in the trace,
        once — see WhyTrace's header.
      */}
      <div className="flex flex-wrap items-center gap-4">
        <StatusChip status={lane.verdict.status} {...laneAge(lane.verdict, now)} />
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
          {/* The lane's own sentence, not the status's definition — the same
              rule the trace follows, so both branches say one thing. */}
          <h2 className="text-base font-medium text-ink">{lane.verdict.because}</h2>
          <GateStrip
            hops={hops}
            {...(lane.verdict.checkedAt === null
              ? {}
              : {
                  checkedAt: lane.verdict.checkedAt.toISOString(),
                  checkedAge: laneAge(lane.verdict, now).age,
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

      {/*
        THE ACTIONS, and they are at the bottom on purpose: this screen exists to
        explain, and a reader who has not yet read what broke cannot choose
        between sending a key and re-checking.
      */}
      <section aria-label="What you can do" className="flex flex-wrap items-start gap-6">
        {offerLink ? (
          <span className="flex flex-col items-start gap-1">
            {link === null ? null : (
              <span className="text-sm text-ink-soft">
                {/*
                  THE DESIGN'S EXPIRED CASE. "No key" and "link expired" look the
                  same from the lane's side and have different fixes: the first
                  needs a link sent, the second needs a NEW one because the
                  window closed before the app owner opened it.
                */}
                {link.expired ? CLAIM_LINK_COPY.laneLinkExpired : CLAIM_LINK_COPY.linkSentNotOpened}
              </span>
            )}
            <SendClaimLink
              solutionId={lane.appId}
              environment={environment}
              expired={link?.expired ?? false}
              {...(sendBlockedBecause === null ? {} : { blockedBecause: sendBlockedBecause })}
              idPrefix="lane"
            />
            {link === null || link.expired || sendBlockedBecause !== null ? null : (
              <span className="text-xs text-ink-muted">{CLAIM_LINK_COPY.sendingAgainRevokes}</span>
            )}
          </span>
        ) : null}

        <RecheckLane
          solutionId={lane.appId}
          interfaceId={lane.feedId}
          environment={environment}
          {...(recheckRefusal === null ? {} : { blockedBecause: DISABLED_REASONS[recheckRefusal] })}
          idPrefix="lane"
        />
      </section>
    </CoreEdgeShell>
  );
}
