/**
 * The parity scorecard — the gap simulator's output inside the product (P1.9).
 *
 * A SERVER COMPONENT, deliberately: no "use client", no fetch, no API route.
 * The other Control Tower screens fetch because their data is per
 * organization and in the database. This one has neither: it is a committed
 * file, a function of the commit, so it renders on the server from the props
 * the page passes and ships no figure in a client chunk.
 *
 * IT FORMATS AND LAYS OUT, AND COMPUTES NOTHING. Every figure is read from the
 * scorecard as the generator wrote it, with the roadmap's own wording and
 * formatting, which is what lets "the page matches the CI JSON" be checked by
 * reading the page (tests/unit/ops/parity-scorecard-page.test.tsx).
 *
 * THE BUILD CARD COMES FIRST, so the commit is never below the fold: the claim
 * this page makes is "these figures are this commit's", and the commit is half
 * of it.
 */

import type { ReactNode } from "react";

import {
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsTable,
  ProvenanceStrip,
  opsCellStyle,
  opsMonoStyle,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import type { BuildStamp } from "@/lib/build-stamp";
import {
  formatCount,
  formatPct,
  formatPoints,
  type CellLevel,
  type ParityScorecard as Scorecard,
} from "@/lib/coreedge/parity-scorecard";

/** Text first: the chip always reads full, partial or none, so the tone is never the only carrier. */
const LEVEL_TONE: Readonly<Record<CellLevel, OpsTone>> = {
  full: "good",
  partial: "attention",
  none: "neutral",
};

const text: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" };
const tileTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: "var(--ink-primary)" };
const head: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, padding: "15px 16px 12px" };
const num: React.CSSProperties = { ...opsCellStyle, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const muted: React.CSSProperties = { ...opsCellStyle, color: "var(--ink-muted)" };
/** A 40- or 64-character hash wraps rather than forcing the page to scroll sideways on a phone. */
const hash: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 12.5,
  overflowWrap: "anywhere",
  color: "var(--ink-primary)",
};

function Level({ level }: { level: CellLevel }) {
  return <OpsChip tone={LEVEL_TONE[level]} label={level} asStatus={false} />;
}

/** One card: a titled section, what is in it, and the strip that qualifies it. */
function Panel({
  id,
  title,
  intro,
  children,
  strip,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  strip?: ReactNode;
}) {
  return (
    <OpsCard>
      <section aria-labelledby={id}>
        <div style={head}>
          <h2 id={id} style={tileTitle}>
            {title}
          </h2>
          {intro ? <p style={text}>{intro}</p> : null}
        </div>
        {children}
        {strip}
      </section>
    </OpsCard>
  );
}

const share = (count: number, pct: number) => `${formatCount(count)} (${formatPct(pct)})`;

function BuildCard({ scorecard, build }: { scorecard: Scorecard; build: BuildStamp }) {
  const { matrix, registry } = scorecard.inputs;
  const row = (label: string, value: string | null) => (
    <>
      <dt style={{ color: "var(--ink-muted)" }}>{label}</dt>
      <dd style={{ margin: 0, minWidth: 0 }}>{value ?? "not recorded"}</dd>
    </>
  );
  return (
    <Panel
      id="ct-parity-build"
      title="This build"
      strip={
        <ProvenanceStrip claim="These figures are this commit's">
          Computed by <code>scripts/coreedge/simulate-gap-matrix.mjs</code> from <code>{matrix.path}</code> (revised{" "}
          {matrix.revisedOn ?? "on no recorded date"}, sha256 <span style={hash}>{matrix.sha256}</span>) and{" "}
          <code>{registry.path}</code> (generated from the code, sha256 <span style={hash}>{registry.sha256}</span>).
          CI recomputes them on every pull request and every push to main, fails if this page&apos;s data differs (
          <code>pnpm coreedge:check</code>), and prints the same two digests; every Vercel build re-checks them before
          it touches the database. Nothing here is a live measurement: a scenario&apos;s figures say what the code and
          the matrix allow.
        </ProvenanceStrip>
      }
    >
      <div style={{ padding: "0 16px 15px" }}>
        {build.commit ? (
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr)",
              gap: "4px 14px",
              fontSize: 13,
              color: "var(--ink-secondary)",
            }}
          >
            <dt style={{ color: "var(--ink-muted)" }}>Commit</dt>
            <dd style={{ margin: 0, minWidth: 0 }}>
              <code style={hash}>{build.commit}</code>
            </dd>
            {row("Branch", build.ref)}
            {row("Environment", build.environment)}
            {row("Deployment", build.deployment)}
          </dl>
        ) : (
          <p style={text}>
            No commit recorded: this is not a Vercel deployment, so the figures are those of the checkout it runs from.
          </p>
        )}
      </div>
    </Panel>
  );
}

function Headline({ scorecard }: { scorecard: Scorecard }) {
  const IS = scorecard.integrationSuite;
  const today = scorecard.steps[0]!;
  const last = scorecard.steps[scorecard.steps.length - 1]!;
  const { model } = scorecard;
  const rows: [string, string, string, string][] = [
    ["Valid scenarios fully supported", share(IS.fullySupported, IS.fullPct), share(today.fullySupported, today.fullPct), share(last.fullySupported, last.fullPct)],
    ["Valid scenarios at least partly supported", share(IS.atLeastPartial, IS.partialPct), share(today.atLeastPartial, today.partialPct), share(last.atLeastPartial, last.partialPct)],
    [`Lifecycle stages full (of ${model.lifecycleStages})`, String(IS.lifecycleFull), String(today.lifecycleFull), String(last.lifecycleFull)],
  ];
  return (
    <Panel
      id="ct-parity-headline"
      title="Headline"
      intro={`Of ${formatCount(model.totalPermutations)} permutations, ${formatCount(model.validScenarios)} are valid: SAP itself makes them possible. CoreEdge today is scored as the hosted instance (${model.headlineHosting}).`}
    >
      <OpsTable
        label="Headline: Integration Suite and CoreEdge"
        head={["Measure", "SAP Integration Suite", "CoreEdge today (hosted)", `CoreEdge after ${last.id}`]}
      >
        {rows.map(([measure, ...values]) => (
          <tr key={measure}>
            <td style={opsCellStyle}>{measure}</td>
            {values.map((v, i) => (
              <td key={i} style={num}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </OpsTable>
    </Panel>
  );
}

function Phases({ scorecard }: { scorecard: Scorecard }) {
  const IS = scorecard.integrationSuite;
  const L = scorecard.model.lifecycleStages;
  return (
    <Panel
      id="ct-parity-phases"
      title="Phase by phase"
      intro="CoreEdge today and after each roadmap phase, cumulatively, with Integration Suite beside it."
      strip={
        <ProvenanceStrip claim="A scenario is full only when all six of its cells are">
          One partial cell holds it at partial, so coverage barely moves inside a phase. The upgrades column shows the
          progress coverage cannot: how many of the phase&apos;s matrix upgrades the capability registry already scores
          at or above their target today. Integration Suite has no phases in this model, so its row is a fixed
          reference. Points behind are percentage points of the valid scenarios.
        </ProvenanceStrip>
      }
    >
      <OpsTable
        label="CoreEdge phase by phase against Integration Suite"
        head={[
          "After",
          "Full",
          "Partial",
          `Lifecycle full (of ${L})`,
          "Full: behind IS",
          "Partial: behind IS",
          "Phase upgrades the code already credits",
          "Biggest remaining blockers",
        ]}
      >
        {scorecard.steps.map((s) => (
          <tr key={s.id}>
            <td style={{ ...opsCellStyle, minWidth: 160 }}>
              <div style={{ fontWeight: 600, color: "var(--ink-primary)" }}>{s.id}</div>
              <div style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{s.name}</div>
            </td>
            <td style={num}>{share(s.fullySupported, s.fullPct)}</td>
            <td style={num}>{share(s.atLeastPartial, s.partialPct)}</td>
            <td style={num}>{s.lifecycleFull}</td>
            <td style={num}>{formatPoints(s.behindIntegrationSuite.fullPoints)}</td>
            <td style={num}>{formatPoints(s.behindIntegrationSuite.partialPoints)}</td>
            <td style={s.upgrades ? num : muted}>
              {s.upgrades ? `${s.upgrades.creditedToday} of ${s.upgrades.total}` : "Not a phase"}
            </td>
            <td style={{ ...opsCellStyle, minWidth: 260 }}>
              <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                {s.topBlockers.map((b) => (
                  <li key={b.cell}>
                    {b.label} {formatPct(b.leveragePct)} (sole {formatCount(b.soleBlocker)})
                  </li>
                ))}
              </ol>
            </td>
          </tr>
        ))}
        <tr>
          <td style={{ ...opsCellStyle, fontWeight: 600, color: "var(--ink-primary)" }}>Integration Suite (reference)</td>
          <td style={num}>{share(IS.fullySupported, IS.fullPct)}</td>
          <td style={num}>{share(IS.atLeastPartial, IS.partialPct)}</td>
          <td style={num}>{IS.lifecycleFull}</td>
          <td style={muted}>Reference</td>
          <td style={muted}>Reference</td>
          <td style={muted}>No phases in this model</td>
          <td style={muted}>Not ranked</td>
        </tr>
      </OpsTable>
    </Panel>
  );
}

function Blockers({ scorecard }: { scorecard: Scorecard }) {
  const { blockersToday } = scorecard;
  const nothingIsOneCellAway = blockersToday.every((b) => b.soleBlocker === 0);
  return (
    <Panel
      id="ct-parity-blockers"
      title="What holds CoreEdge back most today"
      intro={`The ${blockersToday.length} cells the simulator ranks highest, with the capability registry's reason for each rating.`}
      strip={
        <ProvenanceStrip claim="Leverage and sole, from the simulator">
          Leverage is the share of the scenarios CoreEdge does not fully support that a cell holds back, each scenario
          split equally between its cells below full. Sole counts the scenarios that turn full if only this cell does.
          {nothingIsOneCellAway ? " Sole is 0 for every ranked cell today: no scenario is one cell from full." : ""}{" "}
          Raised in names the first roadmap phase whose upgrades make the cell full.
        </ProvenanceStrip>
      }
    >
      <OpsTable
        label="Ranked blockers today"
        head={["Rank", "Cell", "Rating today", "Leverage", "Sole", "Raised in", "Why (registry note)"]}
      >
        {blockersToday.map((b) => (
          <tr key={b.cell}>
            <td style={num}>{b.rank}</td>
            <td style={opsMonoStyle}>{b.label}</td>
            <td style={opsCellStyle}>
              <Level level={b.level} />
            </td>
            <td style={num}>{share(b.leverage, b.leveragePct)}</td>
            <td style={num}>{formatCount(b.soleBlocker)}</td>
            <td style={{ ...opsCellStyle, whiteSpace: "nowrap" }}>{b.raisedIn}</td>
            <td style={{ ...opsCellStyle, minWidth: 320, color: "var(--ink-secondary)", fontSize: 12.5 }}>
              {b.note ?? "The registry has no note for this cell."}
            </td>
          </tr>
        ))}
      </OpsTable>
    </Panel>
  );
}

function Lifecycle({ scorecard }: { scorecard: Scorecard }) {
  return (
    <Panel
      id="ct-parity-lifecycle"
      title="Lifecycle stages"
      intro="Scored on their own, outside the scenario count: what it takes to find, build, govern, run and retire an integration."
    >
      <OpsTable
        label="Lifecycle stages, Integration Suite and CoreEdge"
        head={["Stage", "What it means", "Integration Suite", "CoreEdge today", "CoreEdge reaches full in"]}
      >
        {scorecard.lifecycle.map((l) => (
          <tr key={l.stage}>
            <td style={opsMonoStyle}>{l.stage}</td>
            <td style={{ ...opsCellStyle, minWidth: 240, color: "var(--ink-secondary)" }}>{l.meaning}</td>
            <td style={opsCellStyle}>
              <Level level={l.integrationSuite} />
            </td>
            <td style={opsCellStyle}>
              <Level level={l.today} />
            </td>
            <td style={opsCellStyle}>{l.reachesFullIn}</td>
          </tr>
        ))}
      </OpsTable>
    </Panel>
  );
}

function Hosting({ scorecard }: { scorecard: Scorecard }) {
  const { networks } = scorecard.model;
  return (
    <Panel
      id="ct-parity-hosting"
      title="Hosting"
      intro={`Network reach depends on where CoreEdge runs, so CoreEdge today is scored under each hosting mode. The headline is ${scorecard.model.headlineHosting}, the hosted instance.`}
    >
      <OpsTable label="CoreEdge today by hosting mode" head={["Hosting", ...networks, "Full today", "Partial today"]}>
        {scorecard.hosting.map((h) => (
          <tr key={h.hosting}>
            <td style={opsMonoStyle}>{h.headline ? `${h.hosting} (headline)` : h.hosting}</td>
            {networks.map((net) => (
              <td key={net} style={opsCellStyle}>
                <Level level={h.network[net] ?? "none"} />
              </td>
            ))}
            <td style={num}>{share(h.fullySupported, h.fullPct)}</td>
            <td style={num}>{share(h.atLeastPartial, h.partialPct)}</td>
          </tr>
        ))}
      </OpsTable>
    </Panel>
  );
}

function FullToday({ scorecard }: { scorecard: Scorecard }) {
  const { fullToday } = scorecard;
  return (
    <Panel
      id="ct-parity-full"
      title={`Cells CoreEdge scores full today (${fullToday.length})`}
      intro="Each with the capability registry's note, which names the live run where one is recorded."
      strip={
        <ProvenanceStrip claim="Last proved: not recorded">
          The capability registry records whether tests, a document and a live run exist for a cell, not when the run
          happened, so this page cannot say when each cell was last proved. Dated live runs arrive with roadmap item
          P1.8; whether &quot;full&quot; should also need a recent one is open decision D15.
        </ProvenanceStrip>
      }
    >
      <ul style={{ margin: 0, padding: "0 16px 15px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
        {fullToday.map((c) => (
          <li key={c.cell} style={{ fontSize: 13, lineHeight: "20px" }}>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--ink-primary)" }}>
              {c.label}
            </span>
            <span style={{ color: "var(--ink-secondary)" }}> — {c.note ?? "The registry has no note for this cell."}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ParityScorecard({ scorecard, build }: { scorecard: Scorecard; build: BuildStamp }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1180, minWidth: 0 }}>
      <OpsHeading
        title="Parity scorecard"
        lede="SAP Integration Suite and CoreEdge, scored by the gap simulator on every scenario SAP makes possible: today, after each roadmap phase, and what holds CoreEdge back most. Simulated from the code and the matrix, not measured on a tenant."
      />
      <BuildCard scorecard={scorecard} build={build} />
      <Headline scorecard={scorecard} />
      <Phases scorecard={scorecard} />
      <Blockers scorecard={scorecard} />
      <Lifecycle scorecard={scorecard} />
      <Hosting scorecard={scorecard} />
      <FullToday scorecard={scorecard} />
    </div>
  );
}
