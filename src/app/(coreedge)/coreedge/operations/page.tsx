import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { GateStrip, hopsFromBreak } from "@/components/coreedge/GateStrip";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { operationsAllHealthy } from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import {
  GATE_GLYPHS,
  GATE_TOKENS,
  LANE_STATUS_VOCABULARY,
  OWNER_LABELS,
} from "@/lib/coreedge/status-vocabulary";
import { listLanes } from "@/lib/coreedge/queries";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Screen 05 · Operations board — "Every lane across clients, sorted by what
 * needs a human."
 *
 * SORTED BY WHAT NEEDS A HUMAN, not alphabetically and not by age. An operator
 * opens this to find the next thing to do, so the ordering has to answer that
 * question directly. Urgency comes from the status's own gate token, so the sort
 * and the chips cannot disagree.
 *
 * THE COUNT IS A COUNT OF ROWS THAT EXIST. The audit found a page length
 * presented as a total and a sampled figure presented as a window-wide one on
 * the existing Operations screens; both read identically to a correct number.
 * Every figure here is computed from the lanes actually listed.
 *
 * THE LEGEND IS NOT OPTIONAL. This table is dense enough that the glyphs do real
 * work, and a glyph nobody has been told the meaning of is worse than a word.
 */

export const metadata: Metadata = { title: "Operations" };

const URGENCY: Readonly<Record<string, number>> = {
  "gate-bad": 0,
  "gate-wait": 1,
  "gate-off": 2,
  "gate-info": 3,
  "gate-ok": 4,
};

export default async function OperationsBoard(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge/operations" title="Operations">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization, so there are no lanes to show.
        </p>
      </CoreEdgeShell>
    );
  }

  const lanes = (await listLanes(user.organizationId)).sort((a, b) => {
    const ua = URGENCY[LANE_STATUS_VOCABULARY[a.verdict.status].token] ?? 9;
    const ub = URGENCY[LANE_STATUS_VOCABULARY[b.verdict.status].token] ?? 9;
    if (ua !== ub) return ua - ub;
    return a.appName.localeCompare(b.appName);
  });

  const live = lanes.filter((l) => l.verdict.status === "live").length;
  const unknown = lanes.filter((l) => l.verdict.status === "unknown").length;

  return (
    <CoreEdgeShell
      current="/coreedge/operations"
      title="Operations"
      subtitle={`${lanes.length} ${lanes.length === 1 ? "lane" : "lanes"} in this organization`}
    >
      {/*
        THE HONEST HEADLINE. Where every lane is live, A6's sentence is exact.
        Where any lane is Unknown, saying so first matters more than a total:
        Unknown is a claim about our own evidence, and an operator who does not
        know that will read the rest of the board as measured fact.
      */}
      {lanes.length > 0 && live === lanes.length ? (
        <p className="text-sm text-ink-soft">{operationsAllHealthy(live, 15)}</p>
      ) : unknown > 0 ? (
        <p className="max-w-prose text-sm text-ink-soft">
          {unknown} of {lanes.length} {lanes.length === 1 ? "lane has" : "lanes have"} no proven
          read behind them. Reachable is not the same as readable, so those read Unknown rather
          than Live.
        </p>
      ) : null}

      <OpsTable
        caption="Every lane, sorted by what needs a human"
        legend={
          <span>
            {GATE_TOKENS.map((t) => `${GATE_GLYPHS[t]} ${t.replace("gate-", "")}`).join(" · ")}
          </span>
        }
        rows={lanes}
        rowKey={(l) => `${l.appId}-${l.feedId}-${l.environment}`}
        empty={<p className="text-sm text-ink-soft">No apps or data feeds exist yet.</p>}
        columns={[
          {
            key: "lane",
            header: "Lane",
            cell: (l) => (
              <a
                href={`/coreedge/apps/${l.appSlug}/${l.feedId}/${l.environment}`}
                className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
              >
                {l.feedName} · {ENVIRONMENT_LABELS[l.environment]}
              </a>
            ),
          },
          { key: "app", header: "App", cell: (l) => l.appName },
          // An absent system is a reason, not a blank cell: the audit found an
          // absence rendered as empty, which reads as a bug rather than a fact.
          { key: "system", header: "SAP system", cell: (l) => l.system ?? "None connected" },
          { key: "status", header: "Status", cell: (l) => <StatusChip status={l.verdict.status} /> },
          {
            key: "hops",
            header: "Hops",
            cell: (l) => (
              <GateStrip hops={hopsFromBreak(LANE_STATUS_VOCABULARY[l.verdict.status].brokenHop)} dense />
            ),
          },
          {
            key: "owner",
            header: "Who fixes it",
            cell: (l) => {
              const owner = LANE_STATUS_VOCABULARY[l.verdict.status].owner;
              return owner === null ? "—" : OWNER_LABELS[owner];
            },
          },
        ]}
      />
    </CoreEdgeShell>
  );
}
