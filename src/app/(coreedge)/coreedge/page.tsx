import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { NeedsYouRow } from "@/components/coreedge/NeedsYouRow";
import { StatusChip } from "@/components/coreedge/StatusChip";
import {
  DISABLED_REASONS,
  EMPTY_STATES,
  HOME_SECTIONS,
  homeShowingOf,
  laneAge,
} from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { LANE_STATUS_VOCABULARY, OWNER_LABELS } from "@/lib/coreedge/status-vocabulary";
import { listLanes, listOpenRequests } from "@/lib/coreedge/queries";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "./CoreEdgeShell";

/**
 * Screen 01 · Home — "Work arrives. Nobody hunts for it."
 *
 * The ordering rule is the screen: most urgent first, and urgency means "how
 * close is this to being someone's problem right now", not severity in the
 * abstract. A lane nobody can act on is not urgent to the person reading — it is
 * urgent to someone else, and the row says so rather than sitting in the same
 * pile.
 *
 * WHAT IT REFUSES TO DO: invent a count. Every number here comes from a row that
 * exists. The old console's home screen presented a page length as a total, and
 * an operator cannot tell those apart by looking.
 */

export const metadata: Metadata = {
  title: "Home",
  description: "What needs you, most urgent first.",
};

/**
 * Urgency is derived from the status's own token, so it cannot disagree with
 * the chip beside it: a hard stop outranks a wait, and a wait outranks a lane
 * that is fine.
 */
/** Home shows the top of the list; the Operations board shows all of it. */
const HOME_LANE_LIMIT = 8;

const URGENCY: Readonly<Record<string, number>> = {
  "gate-bad": 0,
  "gate-wait": 1,
  "gate-off": 2,
  "gate-info": 3,
  "gate-ok": 4,
};

export default async function CoreEdgeHome(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  // No organization means no tenant to scope to. Rendering an empty console is
  // honest; querying without a scope would not be.
  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge" title="CoreEdge">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization yet, so there are no apps, data feeds or SAP systems to show.
          Ask your platform admin to add you to one.
        </p>
      </CoreEdgeShell>
    );
  }

  // One instant for the whole render, so two chips on the same screen cannot
  // disagree about what "4 minutes ago" means.
  const now = new Date();

  const [lanes, requests] = await Promise.all([listLanes(user.organizationId), listOpenRequests(user.organizationId)]);

  /*
   * THE COUNT IS THE WHOLE LIST; THE PAGE SHOWS THE FIRST EIGHT. Kept as two
   * values rather than one truncated array, because the section heading states
   * a number and this screen's own rule is that every number comes from rows
   * that exist. A heading reading "8" over a list of 8 when 23 lanes are broken
   * is precisely the page-length-as-a-total failure the audit found.
   */
  const attention = lanes
    .filter((l) => l.verdict.status !== "live" && l.verdict.status !== "notStarted")
    .sort((a, b) => {
      const ua = URGENCY[LANE_STATUS_VOCABULARY[a.verdict.status].token] ?? 9;
      const ub = URGENCY[LANE_STATUS_VOCABULARY[b.verdict.status].token] ?? 9;
      return ua - ub;
    });
  const needsAttention = attention.slice(0, HOME_LANE_LIMIT);

  const nothingYet = lanes.length === 0 && requests.length === 0;

  return (
    <CoreEdgeShell
      current="/coreedge"
      title="Needs you"
      /*
       * exactOptionalPropertyTypes is on, so an absent subtitle is an omitted
       * prop rather than an explicit undefined — the two are different types
       * here, and spelling it this way keeps the shell's contract honest.
       */
      {...(nothingYet
        ? {}
        : {
            subtitle: `${attention.length + requests.length} ${
              attention.length + requests.length === 1 ? "thing" : "things"
            }, most urgent first`,
          })}
      badges={requests.length === 0 ? {} : { "/coreedge/requests": requests.length }}
    >
      {nothingYet ? <p className="max-w-prose text-sm text-ink-soft">{EMPTY_STATES.homeFirstVisit.message}</p> : null}

      {/*
        TWO SECTIONS, EACH WITH ITS OWN HEADING AND ITS OWN COUNT. These were one
        unheaded list, so a review waiting on a colleague and a lane that has
        broken sat in the same pile — different work, different next action, and
        no way to see how much of either there was without counting rows by eye.
        A section with nothing in it is not rendered: an empty heading over an
        empty list is a row of furniture, not information.
      */}
      {requests.length === 0 ? null : (
        <section aria-labelledby="home-reviews" className="flex flex-col gap-2">
          <h2 id="home-reviews" className="text-sm font-medium text-ink">
            {HOME_SECTIONS.reviews.heading}{" "}
            <span className="font-normal text-ink-muted">
              {requests.length} {requests.length === 1 ? HOME_SECTIONS.reviews.one : HOME_SECTIONS.reviews.many}
            </span>
          </h2>
          {requests.map((r) => (
            <NeedsYouRow
              key={r.id}
              /*
               * A request YOU raised is blocked, not actionable: you cannot
               * approve your own. Colouring it as action would put it at the top
               * of a list where the one thing you cannot do sits first.
               */
              accent={r.requestedById === user.id ? "blocked" : "action"}
              title={`Review access · ${r.appName} → ${
                r.environment === null ? r.environmentRaw : ENVIRONMENT_LABELS[r.environment]
              }`}
              detail={
                r.requestedById === user.id
                  ? DISABLED_REASONS.ownRequest
                  : `Requested by ${r.requestedByName ?? "a colleague"} · ${r.feedLabel}`
              }
              chips={<StatusChip status="inReview" />}
              action={
                <a
                  href={`/coreedge/requests/${r.id}`}
                  className="rounded-[var(--radius-input)] border border-[color:var(--border-default)] px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
                >
                  Open
                </a>
              }
            />
          ))}
        </section>
      )}

      {attention.length === 0 ? null : (
        <section aria-labelledby="home-lanes" className="flex flex-col gap-2">
          <h2 id="home-lanes" className="text-sm font-medium text-ink">
            {HOME_SECTIONS.lanes.heading}{" "}
            <span className="font-normal text-ink-muted">
              {attention.length} {attention.length === 1 ? HOME_SECTIONS.lanes.one : HOME_SECTIONS.lanes.many}
            </span>
          </h2>
          {needsAttention.map((lane) => {
            const def = LANE_STATUS_VOCABULARY[lane.verdict.status];
            return (
              <NeedsYouRow
                key={`${lane.feedId}-${lane.environment}`}
                /*
                 * Whose problem it is decides how the row reads. A lane waiting on
                 * the client's Basis team is not this person's to fix, and saying
                 * so is more useful than an alarming colour.
                 */
                accent={
                  def.token === "gate-bad"
                    ? def.owner === "appOwner" || def.owner === "reviewer"
                      ? "action"
                      : "blocked"
                    : def.token === "gate-info"
                      ? "info"
                      : "blocked"
                }
                /*
                 * APP NAME FIRST. A reader scanning this list is looking for
                 * their app, and the app was at the far end of the line behind a
                 * feed name and an environment — the one word that would let them
                 * skip a row was the last one they reached.
                 */
                title={`${lane.appName} · ${lane.feedName} · ${ENVIRONMENT_LABELS[lane.environment]}`}
                detail={
                  def.owner === null
                    ? lane.verdict.because
                    : `${lane.verdict.because} ${OWNER_LABELS[def.owner]} fixes this.`
                }
                /*
                 * THE AGE OF PROOF, which the verdict has carried since PR-4 and
                 * nothing rendered. A status without it is a claim with no
                 * evidence: "Live" means proven as of the age shown, and a lane
                 * whose check has never run says WHY it has not — `laneAge`
                 * keeps the six reasons apart where `proofAge` alone collapsed
                 * them into "never checked".
                 */
                chips={<StatusChip status={lane.verdict.status} {...laneAge(lane.verdict, now)} />}
                action={
                  <a
                    href={`/coreedge/apps/${lane.appSlug}/${lane.feedId}/${lane.environment}`}
                    className="rounded-[var(--radius-input)] border border-[color:var(--border-default)] px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
                  >
                    Why?
                  </a>
                }
              />
            );
          })}
          {attention.length > needsAttention.length ? (
            <p className="text-xs text-ink-muted">{homeShowingOf(needsAttention.length, attention.length)}</p>
          ) : null}
        </section>
      )}
    </CoreEdgeShell>
  );
}
