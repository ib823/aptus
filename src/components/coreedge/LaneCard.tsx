import type { ReactNode } from "react";

import { LANE_DETAIL, type LaneDetailFacts } from "@/lib/coreedge/copy";
import {
  LANE_STATUS_VOCABULARY,
  type LaneHop,
  type LaneStatus,
} from "@/lib/coreedge/status-vocabulary";

import { GateStrip, hopsFromBreak } from "./GateStrip";
import { StatusChip } from "./StatusChip";

/**
 * LaneCard — one app × one data feed × one environment.
 *
 * A lane is the unit this console is organised around, and the card is where a
 * person meets it. It says four things in a fixed order, because the order is
 * the argument: which environment, which SAP system serves it, what state it is
 * in, and the one thing to do next.
 *
 * The SAP system is named on the card rather than hidden behind it. "Test" is
 * not an address — two clients' Test systems are different machines, and a lane
 * that reads from the wrong one fails in a way nobody can see from a status.
 */

export interface LaneCardProps {
  readonly env: string;
  /** The SAP system serving this lane, or null when none is bound. */
  readonly system: string | null;
  readonly status: LaneStatus;
  /**
   * Where this lane's chain actually stopped, from its own verdict.
   *
   * NOT THE SAME FACT AS THE STATUS'S. `LANE_STATUS_VOCABULARY` carries one
   * hop per status, which is right for a status and wrong for a lane: a SAP
   * system that stops answering at the metadata probe derives `sapUnavailable`,
   * whose vocabulary hop is `sapDataRead` — so the S in A·S·K·T read as passed
   * on a card whose chip said SAP unavailable. A caller holding a verdict
   * passes it; the vocabulary's answer is the fallback for a caller
   * demonstrating a status rather than showing a lane.
   */
  readonly brokenHop?: LaneHop | null;
  readonly facts?: LaneDetailFacts;
  /** The one action. Rendered by the caller so this stays a presentational card. */
  readonly action?: ReactNode;
  readonly selected?: boolean;
  readonly onOpen?: () => void;
}

export function LaneCard({
  env,
  system,
  status,
  brokenHop,
  facts = {},
  action,
  selected = false,
  onOpen,
}: LaneCardProps): ReactNode {
  const def = LANE_STATUS_VOCABULARY[status];
  const detail = LANE_DETAIL[status](facts);

  const frame =
    "flex flex-col gap-3 rounded-[var(--radius-card-warm)] border bg-paper p-4 text-left " +
    (selected ? "border-navy" : "border-[color:var(--border-default)]");

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{env}</span>
        {/*
          No system is not an absence to be styled away — it is the reason the
          lane cannot work, so it says so in words.
        */}
        <span className="text-xs text-ink-muted">{system ?? "No SAP system"}</span>
      </div>

      <StatusChip status={status} {...(facts.checkedAgo === undefined ? {} : { age: facts.checkedAgo })} />

      {detail === null ? null : <p className="text-xs text-ink-soft">{detail}</p>}

      <GateStrip hops={hopsFromBreak(brokenHop === undefined ? def.brokenHop : brokenHop)} dense />

      {action === undefined ? null : <div className="pt-1">{action}</div>}
    </>
  );

  if (onOpen === undefined) return <div className={frame}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${frame} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy`}
    >
      {body}
    </button>
  );
}
