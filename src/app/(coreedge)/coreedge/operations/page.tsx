import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { GateStrip, hopsFromBreak } from "@/components/coreedge/GateStrip";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { ProvenAt } from "@/components/coreedge/primitives/ProvenAt";
import { StatusChip } from "@/components/coreedge/StatusChip";
import {
  laneCheckedAge,
  LANE_SWEEP_FLEET_NOTE,
  LANE_SWEEP_LABELS,
  LANE_SWEEP_LAST_FAILED,
  LANE_SWEEP_NEVER_RAN,
  LANE_SWEEP_NOT_RECORDED,
  operationsAllHealthy,
} from "@/lib/coreedge/copy";
import { proofAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import {
  GATE_GLYPHS,
  GATE_TOKENS,
  LANE_STATUS_VOCABULARY,
  OWNER_LABELS,
} from "@/lib/coreedge/status-vocabulary";
import { lastLaneSweep, listLaneTraffic, listLanes } from "@/lib/coreedge/queries";
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

  const now = new Date();
  const [allLanes, traffic, sweep] = await Promise.all([
    listLanes(user.organizationId),
    listLaneTraffic(user.organizationId, now),
    lastLaneSweep(),
  ]);

  const lanes = allLanes.sort((a, b) => {
    const ua = URGENCY[LANE_STATUS_VOCABULARY[a.verdict.status].token] ?? 9;
    const ub = URGENCY[LANE_STATUS_VOCABULARY[b.verdict.status].token] ?? 9;
    if (ua !== ub) return ua - ub;
    /*
     * THEN BY AGE OF PROOF, oldest first — which is what the caption has
     * always promised and the sort did not do. Within one urgency band the
     * lane nobody has checked for longest is the one most likely to be
     * claiming something that is no longer true, so it belongs at the top.
     * A lane that has never been checked sorts above every dated one: no
     * evidence is older than any evidence.
     */
    const ta = a.verdict.checkedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const tb = b.verdict.checkedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (ta !== tb) return ta - tb;
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

      {/*
        WHAT THE NIGHTLY CHECK ACTUALLY DID, above the statuses it produced.
        Every chip below is a claim about the last check, and this board showed
        those claims for a release in which it never said whether a check had
        run at all — so a column of Unknowns looked the same whether the sweep
        skipped those lanes at 04:30 or has never executed once. The figures are
        the sweep's own, read back from the CronRunLog row its cron route wrote.
      */}
      <section
        aria-labelledby="lane-sweep-heading"
        className="flex flex-col gap-2 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-4"
      >
        <h2 id="lane-sweep-heading" className="text-sm font-medium text-ink">
          The nightly lane check
        </h2>
        {sweep === null ? (
          <p className="max-w-prose text-sm text-ink-soft">{LANE_SWEEP_NEVER_RAN}</p>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              Last run <ProvenAt iso={sweep.startedAt.toISOString()} age={proofAge(sweep.startedAt, now)} />
            </p>
            {sweep.ok ? null : (
              <p className="max-w-prose text-sm text-gate-bad-fg">{LANE_SWEEP_LAST_FAILED}</p>
            )}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["checked", sweep.checked],
                  ["skippedNoConnection", sweep.skippedNoConnection],
                  ["skippedNoEntitySet", sweep.skippedNoEntitySet],
                  ["unreadable", sweep.unreadable],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink-soft">{LANE_SWEEP_LABELS[key]}</dt>
                  <dd className="font-medium text-ink">
                    {value === null ? (
                      <span className="font-normal text-ink-muted">{LANE_SWEEP_NOT_RECORDED}</span>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-ink-muted">{LANE_SWEEP_FLEET_NOTE}</p>
          </>
        )}
      </section>

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
          {
            key: "status",
            header: "Status",
            cell: (l) => (
              <StatusChip status={l.verdict.status} age={laneCheckedAge(l.verdict, now)} />
            ),
          },
          {
            key: "hops",
            header: "Hops",
            cell: (l) => (
              /*
               * THE VERDICT'S BREAK, not the vocabulary's. A per-status answer
               * and a per-lane one are not the same fact: a lane whose SAP
               * system timed out at the metadata probe derives `sapUnavailable`,
               * whose fixed vocabulary hop is `sapDataRead` — so the S in A·S·K·T
               * read as passed on a lane where the system is exactly what did
               * not answer, beside a chip saying SAP unavailable.
               */
              <GateStrip hops={hopsFromBreak(l.verdict.brokenHop)} dense />
            ),
          },
          {
            /*
             * CALLS AND ERRORS COME FROM THE AUDIT TABLE, not from the status.
             * A lane can read Live and be failing right now — the status is a
             * claim about the last check, traffic is what happened — and the
             * board exists to show exactly that gap.
             */
            key: "calls",
            header: "Calls 24 h",
            cell: (l) => {
              const t = traffic.get(`${l.appId}::${l.feedId}::${l.environment}`);
              return t === undefined ? <span className="text-ink-muted">None</span> : String(t.calls);
            },
          },
          {
            key: "errors",
            header: "Errors",
            cell: (l) => {
              const t = traffic.get(`${l.appId}::${l.feedId}::${l.environment}`);
              if (t === undefined) return <span className="text-ink-muted">—</span>;
              return t.errors === 0 ? (
                "0"
              ) : (
                <span className="text-gate-bad-fg">
                  {GATE_GLYPHS["gate-bad"]} {t.errors}
                </span>
              );
            },
          },
          {
            // The age of proof, as its own column, because the board is where
            // an operator decides what to believe before deciding what to do.
            // A lane with no proof reads why not, not "never checked": which of
            // the six it is decides whether an operator has anything to do.
            key: "checked",
            header: "Checked",
            cell: (l) => laneCheckedAge(l.verdict, now),
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

      <nav aria-label="Operations sections" className="flex flex-wrap gap-4">
        <a href="/coreedge/operations/keys" className="text-sm text-ink-soft underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy">
          Keys nobody is using
        </a>
      </nav>
    </CoreEdgeShell>
  );
}
