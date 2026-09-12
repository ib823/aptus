import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OpsTable } from "@/components/coreedge/OpsTable";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { EMPTY_STATES } from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { listOpenRequests } from "@/lib/coreedge/queries";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Screen 03a · Requests — what is waiting on a decision.
 *
 * Requests YOU raised are listed alongside the rest rather than hidden, and
 * marked. Hiding them would leave a builder unable to see that their own request
 * exists or how long it has been waiting; marking them is what stops someone
 * opening one expecting to act.
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

  const requests = await listOpenRequests(user.organizationId);

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
    </CoreEdgeShell>
  );
}
