import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LaneCard } from "@/components/coreedge/LaneCard";
import { AppStatusChip } from "@/components/coreedge/StatusChip";
import { EMPTY_STATES, laneAge } from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS, LANE_ENVIRONMENTS } from "@/lib/coreedge/lanes";
import { getApp, listLanes } from "@/lib/coreedge/queries";
import { getCurrentUser } from "@/lib/auth/session";


import { CoreEdgeShell } from "../../CoreEdgeShell";

/**
 * Screen 02 · App › lane board — "Feeds × environments. One cell is one lane."
 *
 * The grid IS the model. A row is a data feed, a column is an environment, and
 * every cell is a lane with its own status — which is what makes promotion
 * legible: you can see that Sandbox is live, Dev is live, Test is in review and
 * Prod has never been started, in one glance, without reading a single sentence.
 *
 * EVERY CELL RENDERS, including the ones nothing has happened in. "Not started"
 * is a status precisely so that the empty cells are visible; showing only the
 * lanes with rows behind them would hide the ones a builder most needs to act
 * on.
 *
 * AN APP WITH NO FEEDS HAS A BOARD, NOT A 404 (P0.3, A63). Lanes are feeds ×
 * environments, so an app with no feed yet has none, and the board used to
 * call notFound() on an empty lane list: a new app's owner was told it does not
 * exist, on the only screen that links to "Add data feed". Whether the app
 * exists is asked on its own (`getApp`); only a missing app is a 404, and an
 * app with no feeds shows the empty state with the way to add one.
 */

export const metadata: Metadata = { title: "App" };

export default async function AppLaneBoard({
  params,
}: {
  params: Promise<{ app: string }>;
}): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) notFound();

  const { app } = await params;
  // One instant for the whole board.
  const now = new Date();
  const [summary, lanes] = await Promise.all([
    getApp(user.organizationId, app),
    listLanes(user.organizationId, { appSlug: app }),
  ]);
  if (summary === null) notFound();

  // Feeds in the order the query returned them, de-duplicated. Not sorted again
  // here: one ordering decision, made in the query.
  const feeds: { id: string; name: string }[] = [];
  for (const lane of lanes) {
    if (!feeds.some((f) => f.id === lane.feedId)) {
      feeds.push({ id: lane.feedId, name: lane.feedName });
    }
  }

  return (
    <CoreEdgeShell
      current="/coreedge"
      title={summary.name}
      subtitle={`${feeds.length} ${feeds.length === 1 ? "data feed" : "data feeds"} × ${LANE_ENVIRONMENTS.length} environments`}
    >
      <div className="flex items-center gap-3">
        <AppStatusChip status={summary.status} />
        {summary.status === "restricted" ? (
          /*
           * DECISION D3, visible where it matters: Restricted stops NEW access
           * being requested or approved and leaves existing lanes serving. The
           * lanes below therefore keep their own statuses, and this line is why
           * the Promote actions are unavailable.
           */
          <span className="text-xs text-ink-muted">
            Existing lanes keep serving. No new access can be requested or approved.
          </span>
        ) : null}
      </div>

      {feeds.length === 0 ? (
        <p className="max-w-prose text-sm text-ink-soft">{EMPTY_STATES.appNoFeeds.message}</p>
      ) : null}

      <div className="flex flex-col gap-8">
        {feeds.map((feed) => (
          <section key={feed.id} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-ink">{feed.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LANE_ENVIRONMENTS.map((env) => {
                const lane = lanes.find((l) => l.feedId === feed.id && l.environment === env);
                if (lane === undefined) return null;
                return (
                  <LaneCard
                    key={env}
                    env={ENVIRONMENT_LABELS[env]}
                    system={lane.system}
                    status={lane.verdict.status}
                    // The lane's own hops and its own announced clause — see
                    // LaneCard. Neither is derivable from the status alone.
                    hops={lane.verdict.hops}
                    announced={laneAge(lane.verdict, now).announced}
                    /*
                     * LaneCard has rendered facts.checkedAgo since PR-2 and this
                     * board passed no facts at all, so every card on it showed a
                     * status with no evidence beside it. The row count rides
                     * along for the same reason: "Live · 5 rows · 4 minutes ago"
                     * is a claim someone can check.
                     */
                    facts={{
                      checkedAgo: laneAge(lane.verdict, now).age,
                      ...(lane.rows === null ? {} : { rows: lane.rows }),
                    }}
                    action={
                      <a
                        href={`/coreedge/apps/${lane.appSlug}/${lane.feedId}/${env}`}
                        className="text-xs text-ink-soft underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
                      >
                        Open lane
                      </a>
                    }
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/*
        * Both routes exist as pages; without these they would ship unreachable,
        * which is how /coreedge/design-system nearly shipped in PR-3.
        */}
      <nav aria-label="App actions" className="flex flex-wrap gap-4">
        <a href={`/coreedge/apps/${app}/add-feed`} className="text-sm text-ink-soft underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy">
          Add data feed
        </a>
        <a href={`/coreedge/apps/${app}/settings`} className="text-sm text-ink-soft underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy">
          App settings
        </a>
      </nav>
    </CoreEdgeShell>
  );
}
