import type { ReactNode } from "react";

import { ProvenAt } from "./primitives/ProvenAt";

import {
  HOP_LABELS,
  LANE_HOPS,
  type LaneHop,
} from "@/lib/coreedge/status-vocabulary";

/**
 * GateStrip — the six hops of a lane, and which one broke.
 *
 * A lane is Key → Access → Binding → SAP metadata → SAP data read → App (A1 §5).
 * The strip's job is to say where the chain stopped, so that the person reading
 * it knows whose problem it is before they read another word.
 *
 * Three states, and the third is the one that matters: a hop AFTER the break is
 * `unreached`, not `broken` and not `ok`. Marking it broken would blame five
 * systems for one failure; marking it ok would claim we proved something we
 * never attempted. Unreached says exactly what happened — we never got there.
 */

export type HopState = "ok" | "broken" | "unreached" | "unknown";

export interface GateHop {
  readonly hop: LaneHop;
  readonly state: HopState;
}

const MARK: Readonly<Record<HopState, { glyph: string; className: string; label: string }>> = {
  ok: { glyph: "✓", className: "text-success", label: "passed" },
  broken: { glyph: "✕", className: "text-danger", label: "failed here" },
  unreached: { glyph: "·", className: "text-ink-muted", label: "not reached" },
  unknown: { glyph: "–", className: "text-ink-muted", label: "not checked" },
};

/**
 * Derive the six hop states from the one that broke. Everything before it
 * passed, everything after it was never attempted.
 */
export function hopsFromBreak(brokenAt: LaneHop | null): GateHop[] {
  if (brokenAt === null) return LANE_HOPS.map((hop) => ({ hop, state: "ok" as const }));
  const index = LANE_HOPS.indexOf(brokenAt);
  return LANE_HOPS.map((hop, i) => ({
    hop,
    state: i < index ? "ok" : i === index ? "broken" : "unreached",
  }));
}

export interface GateStripProps {
  readonly hops: readonly GateHop[];
  /**
   * The stored UTC instant, ISO 8601. Rendered in the reader's zone with the
   * zone named — a strip with no age is a claim with no evidence, and a strip
   * showing the stored instant makes the reader do timezone arithmetic to
   * answer the one question the line exists to answer.
   */
  readonly checkedAt?: string;
  /** The relative age, the helper beside it. Never the fact on its own. */
  readonly checkedAge?: string;
  /** The compact four-letter form used in dense table rows. */
  readonly dense?: boolean;
}

/**
 * The compact form the handoff calls "A S K T". It is a SUMMARY of the six, not
 * a different model of the lane: Access, System, Key, Traffic each stand for the
 * hops beneath them, and the full trace is one click away.
 */
const COMPACT: readonly { letter: string; covers: readonly LaneHop[]; label: string }[] = [
  { letter: "A", covers: ["access"], label: "Access" },
  { letter: "S", covers: ["binding", "sapMetadata"], label: "System" },
  { letter: "K", covers: ["key"], label: "Key" },
  { letter: "T", covers: ["sapDataRead", "app"], label: "Traffic" },
];

function worst(states: readonly HopState[]): HopState {
  if (states.includes("broken")) return "broken";
  if (states.includes("unknown")) return "unknown";
  if (states.includes("unreached")) return "unreached";
  return "ok";
}

export function GateStrip({ hops, checkedAt, checkedAge, dense = false }: GateStripProps): ReactNode {
  const byHop = new Map(hops.map((h) => [h.hop, h.state]));

  if (dense) {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-xs">
        {COMPACT.map(({ letter, covers, label }) => {
          const state = worst(covers.map((c) => byHop.get(c) ?? "unknown"));
          const mark = MARK[state];
          return (
            <span key={letter} className={mark.className}>
              <span className="sr-only">
                {label} {mark.label}.{" "}
              </span>
              <span aria-hidden="true">{letter}</span>
            </span>
          );
        })}
        {checkedAt === undefined ? null : (
          <span className="text-ink-muted">
            <ProvenAt iso={checkedAt} age={checkedAge ?? "age not recorded"} />
          </span>
        )}
      </span>
    );
  }

  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {LANE_HOPS.map((hop, i) => {
        const state = byHop.get(hop) ?? "unknown";
        const mark = MARK[state];
        return (
          <li key={hop} className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-[0.375em] text-sm">
              <span aria-hidden="true" className={`${mark.className} font-semibold`}>
                {mark.glyph}
              </span>
              <span className={state === "broken" ? "font-medium text-ink" : "text-ink-soft"}>
                {HOP_LABELS[hop]}
              </span>
              <span className="sr-only">— {mark.label}</span>
            </span>
            {i < LANE_HOPS.length - 1 ? (
              <span aria-hidden="true" className="text-ink-muted">
                →
              </span>
            ) : null}
          </li>
        );
      })}
      {checkedAt === undefined ? null : (
        <li className="text-xs text-ink-muted">
          checked <ProvenAt iso={checkedAt} age={checkedAge ?? "age not recorded"} />
        </li>
      )}
    </ol>
  );
}
