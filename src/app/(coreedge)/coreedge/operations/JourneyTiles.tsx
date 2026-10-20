import type { ReactNode } from "react";

import {
  formatStat,
  JOURNEY_COPY,
  verdictLabel,
  type DurationStats,
  type JourneySummary,
  type JourneyVerdict,
} from "@/lib/coreedge/journey-metrics";
import { GATE_GLYPHS, type GateToken } from "@/lib/coreedge/status-vocabulary";

/**
 * JourneyTiles — time to first call and time to first real call (P2.12).
 *
 * THE TARGET IS ON THE TILE. A median with no target beside it invites the
 * reader to decide whether it is good; the roadmap already decided (A.3 #1 and
 * #2), so the tile says what the number is held to and whether it meets it.
 *
 * A VERDICT NEEDS ENOUGH JOURNEYS. Below ten the figures are shown and not
 * judged, and a median that open journeys could still raise is labelled "at
 * least" and never called a pass. The words come from journey-metrics.ts, the
 * same module Control Tower renders from, so the two boards cannot disagree.
 *
 * Server-renderable: no handlers, no state. Colours are the console's gate
 * tokens, which carry their own dark values; the glyph carries the meaning.
 */

const VERDICT_GATE: Readonly<Record<JourneyVerdict, GateToken>> = {
  none: "gate-off",
  tooFew: "gate-info",
  meets: "gate-ok",
  misses: "gate-bad",
  unsettled: "gate-wait",
};

const GATE_CLASS: Readonly<Record<GateToken, string>> = {
  "gate-ok": "bg-gate-ok-bg text-gate-ok-fg",
  "gate-info": "bg-gate-info-bg text-gate-info-fg",
  "gate-wait": "bg-gate-wait-bg text-gate-wait-fg",
  "gate-bad": "bg-gate-bad-bg text-gate-bad-fg",
  "gate-off": "bg-gate-off-bg text-gate-off-fg",
};

function Verdict({ verdict, n }: { verdict: JourneyVerdict; n: number }): ReactNode {
  const gate = VERDICT_GATE[verdict];
  return (
    <p
      className={`inline-flex w-fit items-center gap-[0.375em] rounded-full px-[0.625em] py-[0.1875em] text-xs font-medium ${GATE_CLASS[gate]}`}
    >
      <span aria-hidden="true" className="font-semibold">
        {GATE_GLYPHS[gate]}
      </span>
      {verdictLabel(verdict, n)}
    </p>
  );
}

function Figures({ stats, business }: { stats: DurationStats; business: boolean }): ReactNode {
  return (
    <dl className="grid grid-cols-3 gap-3">
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-ink-muted">{JOURNEY_COPY.stats.median}</dt>
        <dd className="text-lg font-medium text-ink">{formatStat(stats.median, stats.medianIsLowerBound, { business })}</dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-ink-muted">{JOURNEY_COPY.stats.p90}</dt>
        <dd className="text-lg font-medium text-ink">{formatStat(stats.p90, stats.p90IsLowerBound, { business })}</dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-ink-muted">{JOURNEY_COPY.stats.journeys}</dt>
        <dd className="text-lg font-medium text-ink">{stats.n}</dd>
      </div>
    </dl>
  );
}

function Tile({ id, heading, children }: { id: string; heading: string; children: ReactNode }): ReactNode {
  return (
    <article
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-4"
    >
      <h3 id={id} className="text-sm font-medium text-ink">
        {heading}
      </h3>
      {children}
    </article>
  );
}

export function JourneyTiles({
  summary,
  idPrefix = "journey",
}: {
  readonly summary: JourneySummary;
  /** Distinct per instance, so two boards on one page keep unique ids. */
  readonly idPrefix?: string;
}): ReactNode {
  const { ttfc, ttfrc } = summary;
  const parts = [
    ["approverWait", ttfrc.parts.approverWait],
    ["sapSetupWait", ttfrc.parts.sapSetupWait],
    ["developerTime", ttfrc.parts.developerTime],
  ] as const;

  return (
    <section aria-labelledby={`${idPrefix}-heading`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={`${idPrefix}-heading`} className="text-sm font-medium text-ink">
          {JOURNEY_COPY.heading}
        </h2>
        <p className="max-w-prose text-sm text-ink-soft">{JOURNEY_COPY.lede(summary.windowDays)}</p>
        {summary.truncated ? <p className="max-w-prose text-sm text-ink-soft">{JOURNEY_COPY.truncated}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Tile id={`${idPrefix}-ttfc`} heading={JOURNEY_COPY.ttfc.title}>
          <p className="text-sm text-ink-soft">{JOURNEY_COPY.ttfc.measures}</p>
          <Figures stats={ttfc.stats} business={false} />
          <p className="text-sm text-ink-soft">{JOURNEY_COPY.ttfc.target}</p>
          <Verdict verdict={ttfc.verdict} n={ttfc.stats.n} />
          {ttfc.open > 0 ? <p className="text-sm text-ink-soft">{JOURNEY_COPY.ttfc.open(ttfc.open)}</p> : null}
        </Tile>

        <Tile id={`${idPrefix}-ttfrc`} heading={JOURNEY_COPY.ttfrc.title}>
          <p className="text-sm text-ink-soft">{JOURNEY_COPY.ttfrc.measures}</p>
          <Figures stats={ttfrc.stats} business />
          <p className="text-sm text-ink-soft">{JOURNEY_COPY.ttfrc.target}</p>
          <Verdict verdict={ttfrc.verdict} n={ttfrc.stats.n} />
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {parts.map(([key, stats]) => (
              <div key={key} className="flex flex-col gap-1">
                <dt className="text-xs text-ink-muted">{JOURNEY_COPY.ttfrc.parts[key]}</dt>
                <dd className="text-sm font-medium text-ink">
                  {formatStat(stats.median, stats.medianIsLowerBound, { business: true })}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-muted">{JOURNEY_COPY.ttfrc.partsNote}</p>
          {ttfrc.open > 0 ? (
            <p className="text-sm text-ink-soft">{JOURNEY_COPY.ttfrc.open(ttfrc.open, ttfrc.openWaitingOn)}</p>
          ) : null}
          {ttfrc.excludedAlreadyCalling > 0 ? (
            <p className="text-sm text-ink-soft">{JOURNEY_COPY.ttfrc.excluded(ttfrc.excludedAlreadyCalling)}</p>
          ) : null}
        </Tile>
      </div>

      <Tile id={`${idPrefix}-funnel`} heading={JOURNEY_COPY.funnel.title}>
        <ol className="flex flex-col gap-1 text-sm">
          {summary.funnel.map(({ step, organizations }) => (
            <li key={step} className="flex items-baseline justify-between gap-4 border-b border-[color:var(--border-default)] py-1">
              <span className="text-ink-soft">{JOURNEY_COPY.funnel.steps[step]}</span>
              <span className="font-medium text-ink">{organizations}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-muted">{JOURNEY_COPY.funnel.note}</p>
      </Tile>
    </section>
  );
}
