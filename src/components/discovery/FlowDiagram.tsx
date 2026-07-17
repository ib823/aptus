/**
 * ABeam Workbench — role-laned flow diagram (brief §6/19). The L2 hero.
 *
 * "The process's ordered steps rendered as a horizontal swimlane: left rail =
 * role lanes (sans 12 semibold on ink-tint band, colored 3px left edge per
 * role); each step a box (radius 10, paper, --brand-navy-border, 1px) with a
 * navy numeral chip, step name (13/18 semibold), placed in its role's lane;
 * connected by --border-strong arrows that elbow across lanes; START navy
 * circle, END taupe circle. Long flows (>12 steps): Explore wraps to rows.
 * Blank-role steps sit in a 'System / Automatic' lane."
 *
 * The .dc builds none of this: it draws arrows only WITHIN a lane, has no
 * START/END, and never paginates. Brief wins (conflict #8).
 *
 * GEOMETRY — why this works without measuring the DOM:
 * lane rows are a fixed uniform height, so a connector's elbow can be drawn from
 * lane index alone. Each connector is an SVG spanning every lane row
 * (`grid-row: 1 / -1`) with a viewBox whose height is `lanes × LANE_H`; the path
 * runs from the source lane's centre to the target lane's centre. No refs, no
 * effects, no layout thrash — and it renders correctly on the server.
 *
 * Steps are chunked into bands of MAX_STEPS_PER_BAND so a 40-step flow wraps
 * into readable rows rather than a horizontal scroll of 40 boxes.
 */

"use client";

import { useState } from "react";
import { FLOW_FOOTNOTE, OPTIONAL_TAG, SUBSTEP_EMPTY } from "@/lib/discovery/copy";
import type { DiscoveryFlowStep } from "@/lib/discovery/serializers";

const LANE_H = 96; // px — uniform, which is what makes the elbow math exact.
const STEP_W = 200;
const CONNECTOR_W = 36;
const LANE_LABEL_W = 130;

/** Brief §6/19: "Long flows (>12 steps): Explore wraps to rows." */
const MAX_STEPS_PER_BAND = 12;

interface PositionedStep {
  step: DiscoveryFlowStep;
  /** 1-based, continuous across bands — the numeral the reviewer sees. */
  number: number;
  laneIndex: number;
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface FlowDiagramProps {
  flow: DiscoveryFlowStep[];
}

export function FlowDiagram({ flow }: FlowDiagramProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  // Lanes in first-appearance order — the reading order of the process.
  const lanes: string[] = [];
  for (const s of flow) if (!lanes.includes(s.lane)) lanes.push(s.lane);

  const positioned: PositionedStep[] = flow.map((step, i) => ({
    step,
    number: i + 1,
    laneIndex: lanes.indexOf(step.lane),
  }));

  const bands = chunk(positioned, MAX_STEPS_PER_BAND);

  return (
    <div className="mb-2 rounded-card-warm border border-navy-border bg-paper p-[22px]">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        Process flow
      </h2>

      <div className="ax-snap-lane overflow-x-auto">
        {bands.map((band, bandIndex) => (
          <div
            key={bandIndex}
            className={bandIndex > 0 ? "mt-6 border-t border-border-default pt-6" : ""}
          >
            {bands.length > 1 && (
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.04em] text-ink-soft">
                Steps {band[0]!.number}–{band[band.length - 1]!.number} of {positioned.length}
              </p>
            )}

            <div
              className="grid"
              style={{
                gridTemplateColumns: `${LANE_LABEL_W}px ${CONNECTOR_W}px ${band
                  .map(() => `${STEP_W}px ${CONNECTOR_W}px`)
                  .join(" ")}`,
                gridTemplateRows: `repeat(${lanes.length}, ${LANE_H}px)`,
              }}
            >
              {/* Lane rail */}
              {lanes.map((lane, i) => (
                <div
                  key={lane}
                  style={{ gridColumn: 1, gridRow: i + 1 }}
                  className="flex items-center pr-3"
                >
                  <span className="w-full truncate rounded-input border-l-[3px] border-navy bg-ink-tint px-2.5 py-1.5 text-xs font-semibold text-ink">
                    {lane}
                  </span>
                </div>
              ))}

              {/* START (first band) — navy circle, in the first step's lane. */}
              {bandIndex === 0 && (
                <div
                  style={{ gridColumn: 2, gridRow: band[0]!.laneIndex + 1 }}
                  className="flex items-center justify-center"
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-pill bg-navy font-mono text-[8px] font-bold uppercase text-white"
                    aria-hidden="true"
                  >
                    ▶
                  </span>
                  <span className="sr-only">Start of flow</span>
                </div>
              )}

              {band.map((ps, i) => {
                // Grid columns: 1 rail, 2 lead-in connector, then pairs.
                const stepCol = 3 + i * 2;
                const connectorCol = stepCol + 1;
                const next = band[i + 1];

                return (
                  <div key={ps.number} className="contents">
                    <div
                      style={{ gridColumn: stepCol, gridRow: ps.laneIndex + 1 }}
                      className="flex items-center"
                    >
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === ps.number ? null : ps.number)}
                        aria-expanded={expanded === ps.number}
                        aria-controls={`substeps-${ps.number}`}
                        className="ax-touch flex w-full flex-col gap-2 rounded-step border border-navy-border bg-paper px-3.5 py-3 text-left transition-shadow duration-[var(--dur-calm)] ease-[var(--ease-calm)] hover:shadow-card-warm-hover focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none motion-reduce:transition-none"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="flex size-[22px] shrink-0 items-center justify-center rounded-pill bg-navy font-mono text-[11px] font-bold text-white"
                            aria-hidden="true"
                          >
                            {ps.number}
                          </span>
                          {ps.step.optional && (
                            <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-ink-soft">
                              {OPTIONAL_TAG}
                            </span>
                          )}
                        </span>
                        <span className="text-[13px] font-semibold leading-[18px] text-ink">
                          <span className="sr-only">Step {ps.number}: </span>
                          {ps.step.step}
                        </span>
                      </button>
                    </div>

                    {/* Connector to the next step — elbows when the lane changes. */}
                    {next && (
                      <div
                        style={{ gridColumn: connectorCol, gridRow: `1 / -1` }}
                        className="relative"
                      >
                        <Connector
                          fromLane={ps.laneIndex}
                          toLane={next.laneIndex}
                          laneCount={lanes.length}
                        />
                      </div>
                    )}

                    {/* END — taupe circle, after the final step of the final band. */}
                    {!next && bandIndex === bands.length - 1 && (
                      <div
                        style={{ gridColumn: connectorCol, gridRow: ps.laneIndex + 1 }}
                        className="flex items-center justify-center"
                      >
                        <span
                          className="flex size-6 items-center justify-center rounded-pill bg-border-strong font-mono text-[8px] font-bold text-white"
                          aria-hidden="true"
                        >
                          ■
                        </span>
                        <span className="sr-only">End of flow</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sub-step drill for a step in this band. */}
            {band.map((ps) =>
              expanded === ps.number ? (
                <div
                  key={`drill-${ps.number}`}
                  id={`substeps-${ps.number}`}
                  className="mt-3 rounded-input bg-ink-tint px-3 py-2.5"
                >
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-soft">
                    Step {ps.number} · {ps.step.lane}
                  </p>
                  {ps.step.substeps.length === 0 ? (
                    <p className="text-xs leading-[17px] text-ink-soft">{SUBSTEP_EMPTY}</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {ps.step.substeps.map((sub, j) => (
                        <li
                          key={j}
                          className="flex items-start gap-2 text-xs leading-[17px] text-ink-soft"
                        >
                          <span className="flex-1">
                            {sub.title}
                            <span className="text-ink-soft"> ({sub.lane})</span>
                          </span>
                          {sub.optional && (
                            <span className="shrink-0 text-[9px] font-bold uppercase text-ink-soft">
                              {OPTIONAL_TAG}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null,
            )}
          </div>
        ))}
      </div>

      {/* §6/19 verbatim. The .dc appends "Click a step for detail."; brief wins. */}
      <p className="mt-3 text-[11px] leading-4 text-ink-soft">{FLOW_FOOTNOTE}</p>
    </div>
  );
}

/**
 * One connector. Same lane → a straight arrow. Different lane → an elbow: out,
 * down/up, then in. Drawn in a viewBox sized to the whole lane stack, so lane
 * indices alone give exact coordinates.
 */
function Connector({
  fromLane,
  toLane,
  laneCount,
}: {
  fromLane: number;
  toLane: number;
  laneCount: number;
}) {
  const h = laneCount * LANE_H;
  const y1 = fromLane * LANE_H + LANE_H / 2;
  const y2 = toLane * LANE_H + LANE_H / 2;
  const midX = CONNECTOR_W / 2;

  const d =
    fromLane === toLane
      ? `M 0 ${y1} H ${CONNECTOR_W}`
      : `M 0 ${y1} H ${midX} V ${y2} H ${CONNECTOR_W}`;

  return (
    <svg
      width={CONNECTOR_W}
      height={h}
      viewBox={`0 0 ${CONNECTOR_W} ${h}`}
      className="absolute inset-0 text-border-strong"
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* Arrowhead at the target lane. */}
      <path
        d={`M ${CONNECTOR_W - 5} ${y2 - 3.5} L ${CONNECTOR_W} ${y2} L ${CONNECTOR_W - 5} ${y2 + 3.5}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
