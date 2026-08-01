"use client";

/**
 * Incidents — what needs attention, and why it is rated that way.
 *
 * THE MOST IMPORTANT THING ON THIS SCREEN IS THE EMPTY STATE. It is the view
 * most likely to be glanced at, and the glance most likely to be wrong. An
 * empty list means nothing crossed a threshold in what the audit feed recorded
 * — the feed is a floor, and it thins exactly when the database is struggling.
 * So this screen never says "All clear", never shows a green tick, and never
 * implies health. It says what it knows: nothing crossed a threshold.
 *
 * EVERY SEVERITY IS TRACEABLE. The rules, their thresholds and the count each
 * one observed all come from the payload, and all three are rendered. An
 * operator seeing "critical" can read the rule that produced it without leaving
 * the page — which is the difference between a measurement and a judgement.
 */

import { useState } from "react";
import {
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  ProvenanceStrip,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import {
  DEFAULT_OPS_WINDOW_HOURS,
  OpsWindowPicker,
  count,
  useOpsFeed,
} from "@/components/ops/useOpsFeed";

type Severity = "critical" | "major" | "minor";

interface Incident {
  id: string;
  severity: Severity;
  title: string;
  observed: number;
  threshold: number;
  firesWhen: string;
  whyThisSeverity: string;
  remediation: string;
}

interface IncidentsPayload {
  windowHours: number;
  counts: { total: number; critical: number; major: number; minor: number };
  incidents: Incident[];
  rules: Array<{ id: string; severity: Severity; title: string; firesWhen: string }>;
  thresholds: Record<string, number>;
  provenance: { emptyIsNotHealthy: string; severitiesAreReproducible: string };
}

/** Severity → tone. Critical is the only one that gets the failure colour. */
const TONE: Record<Severity, OpsTone> = {
  critical: "bad",
  major: "attention",
  minor: "neutral",
};

export function IncidentsClient() {
    const [windowHours, setWindowHours] = useState(DEFAULT_OPS_WINDOW_HOURS);
const { feed } = useOpsFeed<IncidentsPayload>("/api/ops/incidents", windowHours);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Incidents"
        lede="Derived from the feeds this deployment already records. Every severity comes from a named rule with its threshold attached — nothing here is scored at request time."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder
            kind="error"
            title="The incident feed could not be read"
            detail={feed.message}
          />
        </OpsCard>
      ) : (
        <IncidentsBody data={feed.data} onWindowChange={setWindowHours} />
      )}
    </div>
  );
}

function IncidentsBody({
  data,
  onWindowChange,
}: {
  data: IncidentsPayload;
  onWindowChange: (hours: number) => void;
}) {
  const { counts, incidents, rules, provenance, windowHours } = data;

  return (
    <>
      {/* The window control. Every ops feed accepted ?hours= and clamped it;
          the screens simply never sent one, so all four were hard-wired to 24
          hours with no way to widen during an investigation. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <OpsWindowPicker id="ops-window-incidents" hours={windowHours} onChange={onWindowChange} />
      </div>
      <OpsCard>
        {incidents.length === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title="Nothing crossed a threshold"
            // Deliberately not "All clear". See the file header.
            detail={`${rules.length} rules are being watched. None fired in the last ${windowHours} hours.`}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "13px 16px",
                borderBottom: "1px solid var(--border-default)",
                flexWrap: "wrap",
              }}
            >
              {counts.critical > 0 ? (
                <OpsChip tone="bad" label={`${counts.critical} critical`} />
              ) : null}
              {counts.major > 0 ? (
                <OpsChip tone="attention" label={`${counts.major} major`} />
              ) : null}
              {counts.minor > 0 ? <OpsChip tone="neutral" label={`${counts.minor} minor`} /> : null}
            </div>
            {incidents.map((i) => (
              <IncidentRow key={i.id} incident={i} />
            ))}
          </div>
        )}

        <ProvenanceStrip claim="Empty is not healthy">
          {provenance.emptyIsNotHealthy}
        </ProvenanceStrip>
      </OpsCard>

      <RuleBook rules={rules} />
    </>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  return (
    <article
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <OpsChip tone={TONE[incident.severity]} label={incident.severity} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-primary)" }}>
          {incident.title}
        </span>
      </div>

      {/* The number and the rule that judged it, side by side. Neither is
          meaningful without the other. */}
      <div
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11.5,
          color: "var(--ink-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        observed {count(incident.observed)} · fires at {count(incident.threshold)}
      </div>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
        <b style={{ fontWeight: 600 }}>Why this severity.</b> {incident.whyThisSeverity}
      </p>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
        <b style={{ fontWeight: 600 }}>What to do.</b> {incident.remediation}
      </p>
    </article>
  );
}

/**
 * Every rule, firing or not.
 *
 * Without this, an empty screen is unfalsifiable — a reader cannot tell whether
 * nothing is wrong or nothing is being watched. Listing the rules turns "no
 * incidents" into a statement with content.
 */
function RuleBook({ rules }: { rules: IncidentsPayload["rules"] }) {
  return (
    <OpsCard>
      <div
        style={{
          padding: "13px 16px",
          borderBottom: "1px solid var(--border-default)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        What is being watched
      </div>
      {rules.map((r) => (
        <div
          key={r.id}
          style={{
            padding: "11px 16px",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <span style={{ flex: "none", paddingTop: 1 }}>
            <OpsChip tone={TONE[r.severity]} label={r.severity} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--ink-primary)" }}>{r.title}</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2, lineHeight: 1.5 }}>
              Fires when {r.firesWhen}.
            </div>
          </div>
        </div>
      ))}
    </OpsCard>
  );
}
