"use client";

/**
 * Time to first call — the north-star measure, across the portfolio (P2.12).
 *
 * Renders the endpoint's summary and nothing else, with the same words the
 * CoreEdge board uses (journey-metrics.ts): the target beside every median, a
 * verdict only once there are ten journeys, and "at least" on a figure open
 * journeys could still raise.
 */

import {
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  ProvenanceStrip,
  Stat,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import { FeedAsAt, useOpsFeed } from "@/components/ops/useOpsFeed";
import {
  formatStat,
  JOURNEY_COPY,
  verdictLabel,
  type DurationStats,
  type JourneySummary,
  type JourneyVerdict,
} from "@/lib/coreedge/journey-metrics";

type JourneyPayload = JourneySummary & { scope: "scoped" | "global" };

const VERDICT_TONE: Readonly<Record<JourneyVerdict, OpsTone>> = {
  none: "muted",
  tooFew: "info",
  meets: "good",
  misses: "bad",
  unsettled: "attention",
};

export function JourneyClient() {
  const { feed, fetchedAt } = useOpsFeed<JourneyPayload>("/api/control-tower/journey");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title={JOURNEY_COPY.heading}
        lede="How long a developer takes to a first successful call, and an app to its first call on a real system, against the roadmap's targets."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="Time to first call could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <JourneyBody data={feed.data} />
      )}
    </div>
  );
}

function Figures({ stats, business }: { stats: DurationStats; business: boolean }) {
  return (
    <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
      <Stat label={JOURNEY_COPY.stats.median} value={formatStat(stats.median, stats.medianIsLowerBound, { business })} />
      <Stat label={JOURNEY_COPY.stats.p90} value={formatStat(stats.p90, stats.p90IsLowerBound, { business })} />
      <Stat label={JOURNEY_COPY.stats.journeys} value={stats.n} />
    </div>
  );
}

const text: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" };
const tileTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: "var(--ink-primary)" };
const body: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, padding: "15px 16px" };

function JourneyBody({ data }: { data: JourneyPayload }) {
  const { ttfc, ttfrc } = data;
  return (
    <>
      <OpsCard>
        <section aria-labelledby="ct-journey-ttfc" style={body}>
          <h2 id="ct-journey-ttfc" style={tileTitle}>
            {JOURNEY_COPY.ttfc.title}
          </h2>
          <p style={text}>{JOURNEY_COPY.ttfc.measures}</p>
          <Figures stats={ttfc.stats} business={false} />
          <p style={text}>{JOURNEY_COPY.ttfc.target}</p>
          <div>
            <OpsChip tone={VERDICT_TONE[ttfc.verdict]} label={verdictLabel(ttfc.verdict, ttfc.stats.n)} />
          </div>
          {ttfc.open > 0 ? <p style={text}>{JOURNEY_COPY.ttfc.open(ttfc.open)}</p> : null}
        </section>
      </OpsCard>

      <OpsCard>
        <section aria-labelledby="ct-journey-ttfrc" style={body}>
          <h2 id="ct-journey-ttfrc" style={tileTitle}>
            {JOURNEY_COPY.ttfrc.title}
          </h2>
          <p style={text}>{JOURNEY_COPY.ttfrc.measures}</p>
          <Figures stats={ttfrc.stats} business />
          <p style={text}>{JOURNEY_COPY.ttfrc.target}</p>
          <div>
            <OpsChip tone={VERDICT_TONE[ttfrc.verdict]} label={verdictLabel(ttfrc.verdict, ttfrc.stats.n)} />
          </div>
          <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
            <Stat
              label={JOURNEY_COPY.ttfrc.parts.approverWait}
              value={formatStat(ttfrc.parts.approverWait.median, ttfrc.parts.approverWait.medianIsLowerBound, { business: true })}
              basis="median"
            />
            <Stat
              label={JOURNEY_COPY.ttfrc.parts.sapSetupWait}
              value={formatStat(ttfrc.parts.sapSetupWait.median, ttfrc.parts.sapSetupWait.medianIsLowerBound, { business: true })}
              basis="median"
            />
            <Stat
              label={JOURNEY_COPY.ttfrc.parts.developerTime}
              value={formatStat(ttfrc.parts.developerTime.median, ttfrc.parts.developerTime.medianIsLowerBound, { business: true })}
              basis="median"
            />
          </div>
          {ttfrc.open > 0 ? <p style={text}>{JOURNEY_COPY.ttfrc.open(ttfrc.open, ttfrc.openWaitingOn)}</p> : null}
          {ttfrc.excludedAlreadyCalling > 0 ? (
            <p style={text}>{JOURNEY_COPY.ttfrc.excluded(ttfrc.excludedAlreadyCalling)}</p>
          ) : null}
        </section>
        <ProvenanceStrip claim="Three parts, three medians">{JOURNEY_COPY.ttfrc.partsNote}</ProvenanceStrip>
      </OpsCard>

      <OpsCard>
        <section aria-labelledby="ct-journey-funnel" style={body}>
          <h2 id="ct-journey-funnel" style={tileTitle}>
            {JOURNEY_COPY.funnel.title}
          </h2>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {data.funnel.map(({ step, organizations }) => (
              <li
                key={step}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  fontSize: 13,
                  borderBottom: "1px solid var(--border-default)",
                  paddingBottom: 6,
                }}
              >
                <span style={{ color: "var(--ink-secondary)" }}>{JOURNEY_COPY.funnel.steps[step]}</span>
                <span style={{ fontWeight: 600, color: "var(--ink-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {organizations}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <ProvenanceStrip claim="Recorded since this measure was added">
          {JOURNEY_COPY.lede(data.windowDays)} {JOURNEY_COPY.funnel.note}
          {data.truncated ? ` ${JOURNEY_COPY.truncated}` : ""}
          {data.scope === "global" ? " Every organization is included." : " Your organization only."}
        </ProvenanceStrip>
      </OpsCard>
    </>
  );
}
