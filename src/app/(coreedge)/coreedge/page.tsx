import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { NeedsYouRow } from "@/components/coreedge/NeedsYouRow";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { EMPTY_STATES } from "@/lib/coreedge/copy";
import { proofAge } from "@/lib/coreedge/freshness";
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
          Your account is not attached to an organization yet, so there are no apps, data feeds or
          SAP systems to show. Ask your platform admin to add you to one.
        </p>
      </CoreEdgeShell>
    );
  }

  // One instant for the whole render, so two chips on the same screen cannot
  // disagree about what "4 minutes ago" means.
  const now = new Date();

  const [lanes, requests] = await Promise.all([
    listLanes(user.organizationId),
    listOpenRequests(user.organizationId),
  ]);

  const needsAttention = lanes
    .filter((l) => l.verdict.status !== "live" && l.verdict.status !== "notStarted")
    .sort((a, b) => {
      const ua = URGENCY[LANE_STATUS_VOCABULARY[a.verdict.status].token] ?? 9;
      const ub = URGENCY[LANE_STATUS_VOCABULARY[b.verdict.status].token] ?? 9;
      return ua - ub;
    })
    .slice(0, 8);

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
            subtitle: `${needsAttention.length + requests.length} ${
              needsAttention.length + requests.length === 1 ? "thing" : "things"
            }, most urgent first`,
          })}
      badges={requests.length === 0 ? {} : { "/coreedge/requests": requests.length }}
    >
      {nothingYet ? (
        <p className="max-w-prose text-sm text-ink-soft">{EMPTY_STATES.homeFirstVisit.message}</p>
      ) : null}

      <div className="flex flex-col gap-2">
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
                ? "You raised this, so a colleague has to approve it."
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
              title={`${lane.feedName} · ${ENVIRONMENT_LABELS[lane.environment]} — ${lane.appName}`}
              detail={
                def.owner === null
                  ? lane.verdict.because
                  : `${lane.verdict.because} ${OWNER_LABELS[def.owner]} fixes this.`
              }
              /*
               * THE AGE OF PROOF, which the verdict has carried since PR-4 and
               * nothing rendered. A status without it is a claim with no
               * evidence: "Live" means proven as of the age shown, and a lane
               * whose check has never run says so rather than looking current.
               */
              chips={
                <StatusChip status={lane.verdict.status} age={proofAge(lane.verdict.checkedAt, now)} />
              }
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
      </div>
    </CoreEdgeShell>
  );
}
