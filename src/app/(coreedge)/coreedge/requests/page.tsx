import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OpsTable } from "@/components/coreedge/OpsTable";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { EMPTY_STATES } from "@/lib/coreedge/copy";
import { describeAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { listGrantsNeedingReapproval, listOpenRequests } from "@/lib/coreedge/queries";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Screen 03a · Requests — what is waiting on a decision.
 *
 * Requests YOU raised are listed alongside the rest rather than hidden, and
 * marked. Hiding them would leave a builder unable to see that their own request
 * exists or how long it has been waiting; marking them is what stops someone
 * opening one expecting to act.
 *
 * Below the queue: approved access that NEEDS RE-APPROVAL (P0.1, A47) — legacy
 * grants bound to no single interface, so one approval reaches every SAP system
 * offering the same service. Listed here because this is where approvers look.
 */

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsList(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge/requests" title="Requests">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization, so no access requests are visible.
        </p>
      </CoreEdgeShell>
    );
  }

  const now = new Date();
  const [requests, reapprovals] = await Promise.all([
    listOpenRequests(user.organizationId),
    listGrantsNeedingReapproval(user.organizationId, now),
  ]);

  return (
    <CoreEdgeShell
      current="/coreedge/requests"
      title="Requests"
      {...(requests.length === 0
        ? {}
        : { subtitle: `${requests.length} waiting on a decision` })}
      badges={requests.length === 0 ? {} : { "/coreedge/requests": requests.length }}
    >
      <OpsTable
        caption="Access requests waiting on a decision"
        legend={
          <span>
            {GATE_GLYPHS["gate-wait"]} waiting · a request you raised cannot be approved by you
          </span>
        }
        rows={requests}
        rowKey={(r) => r.id}
        empty={
          <p className="text-sm text-ink-soft">{EMPTY_STATES.requestsNoneWaiting.message}</p>
        }
        columns={[
          {
            key: "app",
            header: "App",
            cell: (r) => (
              <a
                href={`/coreedge/requests/${r.id}`}
                className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
              >
                {r.appName}
              </a>
            ),
          },
          { key: "feed", header: "Data feed", cell: (r) => r.feedLabel },
          {
            key: "env",
            header: "Environment",
            // An environment that does not parse is shown raw rather than
            // silently dropped — the row exists and someone has to fix it.
            cell: (r) =>
              r.environment === null ? r.environmentRaw : ENVIRONMENT_LABELS[r.environment],
          },
          { key: "status", header: "Status", cell: () => <StatusChip status="inReview" /> },
          {
            /*
             * WAITING, NOT CHECKED. Every status renders with an age (handoff
             * §4), but a review has no check behind it — StatusChip's age is
             * announced as "checked …", which would be false here. The age that
             * matters for a queue is how long it has waited, so it is its own
             * fact beside the chip rather than inside it. R06 is the scenario:
             * requests waiting over four hours, with several reviewers.
             */
            key: "waiting",
            header: "Waiting",
            cell: (r) => describeAge(r.createdAt, now) ?? "just now",
          },
          {
            key: "who",
            header: "Requested by",
            cell: (r) =>
              r.requestedById === user.id ? (
                <span className="text-ink-muted">You</span>
              ) : (
                (r.requestedByName ?? "—")
              ),
          },
        ]}
      />
      {reapprovals.length === 0 ? null : (
        <section className="mt-8 space-y-3" aria-labelledby="needs-reapproval">
          <h2 id="needs-reapproval" className="text-sm font-medium text-ink">
            Approved access that needs re-approval ({reapprovals.length})
          </h2>
          <p className="max-w-prose text-sm text-ink-soft">
            Each of these was approved before an approval named the one interface it covers, and it
            matches none or several of its app&apos;s interfaces, so it reaches every SAP system that
            offers the same service. It keeps working until this deployment switches to strict
            binding. Ask for a new request from the interface it is for, approve that, then revoke
            the old grant in Control Tower.
          </p>
          <OpsTable
            caption="Approved access that needs re-approval"
            legend={<span>Most recently used first · last used is when it last authorised a call</span>}
            rows={reapprovals}
            rowKey={(r) => r.id}
            columns={[
              { key: "app", header: "App", cell: (r) => r.appName },
              { key: "feed", header: "Data feed", cell: (r) => r.feedLabel },
              {
                key: "env",
                header: "Environment",
                cell: (r) => (r.environment === null ? r.environmentRaw : ENVIRONMENT_LABELS[r.environment]),
              },
              { key: "why", header: "Why", cell: (r) => r.reason },
              {
                key: "used",
                header: "Last used",
                cell: (r) => (r.lastUsedAt === null ? "not since binding" : (describeAge(r.lastUsedAt, now) ?? "just now")),
              },
            ]}
          />
        </section>
      )}
    </CoreEdgeShell>
  );
}
