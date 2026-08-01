"use client";

/**
 * Broker traffic — what the northbound broker actually did.
 *
 * THE COUNTS ARE WINDOW-WIDE; THE EVENT LIST IS A PAGE. Those are different
 * things and the screen says which is which. `counts.total` is every call in the
 * window; `events` is the newest hundred of them. Rendering the page length as
 * the total was the defect this endpoint shipped with, and it under-reported by
 * a factor of fifty on a busy window.
 *
 * LATENCY IS THE ONE FIGURE THAT IS NOT WINDOW-WIDE, and it never appears
 * without saying so. `basis` and `sampleSize` come from the payload and are
 * rendered beneath the number — including when the sample happens to be the
 * whole window. A caveat that shows up only sometimes is one people stop
 * looking for.
 *
 * THE BINDING TRIAD IS A QUARTET. `notApplicable` is calls refused before any
 * connection was reached — at authentication, the throttle, or the grant gate.
 * They used to be counted as *agreed*, so a window of pure failure reported a
 * wall of agreement. They render in neutral grey, not a failure colour: those
 * calls were correctly refused, and colouring them red would invent an incident.
 */

import { useState } from "react";
import {
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  OpsTable,
  ProvenanceReasons,
  ProvenanceStrip,
  Stat,
  opsCellStyle,
  opsMonoStyle,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import {
  DEFAULT_OPS_WINDOW_HOURS,
  OpsWindowPicker,
  count,
  useOpsFeed,
} from "@/components/ops/useOpsFeed";

interface TrafficEvent {
  id: string;
  at: string;
  solutionId: string;
  operation: string;
  externalId: string;
  credentialEnvironment: string;
  connectionEnvironment: string | null;
  connectionId: string | null;
  status: number;
  outcome: string;
  rowCount: number | null;
  durationMs: number | null;
  clientTokenId: string;
}

interface TrafficPayload {
  windowHours: number;
  counts: { total: number; byStatus: Record<string, number> };
  latency: {
    medianMs: number | null;
    measured: number;
    unmeasured: number;
    basis: string;
    sampleSize: number;
  };
  environmentBinding: {
    agreed: number;
    unverified: number;
    mismatch: number;
    notApplicable: number;
  };
  truncated: boolean;
  provenance: {
    floorNotCensus: boolean;
    missing: string[];
    eventsAreAPage: { returned: number; limit: number; of: number };
  };
  events: TrafficEvent[];
}

/** The honest-status buckets the broker already classifies into. */
const OUTCOME: Record<string, { tone: OpsTone; label: string; meaning: string }> = {
  ok: { tone: "good", label: "ok", meaning: "the service answered with records" },
  // 2xx with zero rows is a SUCCESSFUL read of an empty resource, and stays
  // visually distinct from every failure. Collapsing it into one is the exact
  // dishonesty the status vocabulary exists to prevent.
  empty: { tone: "neutral", label: "empty", meaning: "answered successfully with no records" },
  needs_setup: { tone: "attention", label: "needs setup", meaning: "401 or 403" },
  not_found: { tone: "bad", label: "not found", meaning: "404 — not in this tenant" },
  refused: { tone: "attention", label: "refused", meaning: "refused before reaching SAP" },
  throttled: { tone: "muted", label: "throttled", meaning: "429 — rate limited" },
  error: { tone: "bad", label: "error", meaning: "5xx from the tenant or the broker" },
};

export function BrokerTrafficClient() {
    const [windowHours, setWindowHours] = useState(DEFAULT_OPS_WINDOW_HOURS);
const { feed } = useOpsFeed<TrafficPayload>("/api/ops/broker-traffic", windowHours);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Broker traffic"
        lede="Every northbound call this organization made, as the audit trail recorded it. The counts are for the whole window; the list below is the newest page of it."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder
            kind="error"
            title="Broker traffic could not be read"
            detail={feed.message}
          />
        </OpsCard>
      ) : (
        <TrafficBody data={feed.data} onWindowChange={setWindowHours} />
      )}
    </div>
  );
}

function TrafficBody({
  data,
  onWindowChange,
}: {
  data: TrafficPayload;
  onWindowChange: (hours: number) => void;
}) {
  const { counts, latency, environmentBinding: eb, provenance, events, windowHours } = data;
  const page = provenance.eventsAreAPage;

  return (
    <>
      {/* The window control. Every ops feed accepted ?hours= and clamped it;
          the screens simply never sent one, so all four were hard-wired to 24
          hours with no way to widen during an investigation. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <OpsWindowPicker id="ops-window-traffic" hours={windowHours} onChange={onWindowChange} />
      </div>
      <OpsCard>
        <div style={{ display: "flex", gap: 34, padding: "15px 16px", flexWrap: "wrap" }}>
          <Stat label="Calls" value={count(counts.total)} basis={`last ${windowHours} hours`} />
          {latency.medianMs === null ? (
            <Stat
              label="Median latency"
              // Null, never zero. A zero would read as "instantaneous" rather
              // than "not measured".
              value="—"
              basis={
                latency.sampleSize === 0
                  ? "no calls in this window"
                  : `nothing in the page carried a duration`
              }
            />
          ) : (
            <Stat
              label="Median latency"
              value={count(latency.medianMs)}
              unit="ms"
              basis={`over ${count(latency.measured)} of ${count(counts.total)} · ${count(latency.unmeasured)} unmeasured`}
            />
          )}
        </div>

        <div
          style={{
            padding: "0 16px 15px",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".08em",
              color: "var(--ink-muted)",
              fontWeight: 600,
              marginRight: 4,
            }}
          >
            Environment binding
          </span>
          <OpsChip
            tone="good"
            label={`agreed · ${count(eb.agreed)}`}
            meaning="the connection's landscape matched the credential's"
          />
          <OpsChip
            tone="neutral"
            label={`unverified · ${count(eb.unverified)}`}
            meaning="the connection had not declared its landscape"
          />
          <OpsChip
            tone="bad"
            label={`mismatch · ${count(eb.mismatch)}`}
            meaning="served from a landscape other than the credential declared"
          />
          <OpsChip
            tone="muted"
            label={`no connection reached · ${count(eb.notApplicable)}`}
            meaning="refused at authentication, the throttle or the grant gate — there was no binding to agree or disagree"
          />
        </div>

        {events.length === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title="No calls in this window"
            detail="Nothing reached the broker in the last 24 hours. This is not the same as an outage — see below for what leaves no record at all."
          />
        ) : (
          <OpsTable head={["Time", "Solution", "Call", "Outcome", "Binding", "Latency"]}>
            {events.map((e) => (
              <tr key={e.id}>
                <td style={opsMonoStyle}>{new Date(e.at).toLocaleTimeString("en-GB")}</td>
                <td style={opsCellStyle}>
                  {e.solutionId}
                  <div
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 11.5,
                      color: "var(--ink-muted)",
                    }}
                  >
                    {e.clientTokenId}
                  </div>
                </td>
                <td style={opsMonoStyle}>
                  <b style={{ color: "var(--ink-primary)" }}>{e.operation}</b> {e.externalId}
                </td>
                <td style={opsCellStyle}>
                  <OpsChip
                    tone={OUTCOME[e.outcome]?.tone ?? "muted"}
                    label={OUTCOME[e.outcome]?.label ?? e.outcome}
                    meaning={OUTCOME[e.outcome]?.meaning}
                  />
                </td>
                <td style={opsCellStyle}>
                  <BindingCell
                    credential={e.credentialEnvironment}
                    connection={e.connectionEnvironment}
                    connectionId={e.connectionId}
                  />
                </td>
                <td style={{ ...opsMonoStyle, textAlign: "right" }}>
                  {e.durationMs === null ? "—" : `${count(e.durationMs)} ms`}
                </td>
              </tr>
            ))}
          </OpsTable>
        )}

        <ProvenanceStrip claim="Floor, not census">
          <ProvenanceReasons reasons={provenance.missing} />
          <div style={{ marginTop: 6 }}>
            {page.of === 0
              ? "Counts above are for the full window."
              : `Showing ${count(page.returned)} of ${count(page.of)} calls. Counts above are for the full window.`}
          </div>
        </ProvenanceStrip>
      </OpsCard>
    </>
  );
}

/**
 * The per-call binding, in the same four-way vocabulary as the summary.
 *
 * A call that never reached a connection is not a binding failure and must not
 * look like one — it renders as an absence of the question, not a wrong answer.
 */
function BindingCell({
  credential,
  connection,
  connectionId,
}: {
  credential: string;
  connection: string | null;
  connectionId: string | null;
}) {
  if (connectionId === null) {
    return <OpsChip tone="muted" label="no connection" meaning="refused before a connection was reached" />;
  }
  if (connection === null) {
    return <OpsChip tone="neutral" label="unverified" meaning="the connection had not declared its landscape" />;
  }
  if (connection.toUpperCase() !== credential.toUpperCase()) {
    return (
      <OpsChip
        tone="bad"
        label={`${credential} → ${connection}`}
        meaning="served from a landscape other than the credential declared"
      />
    );
  }
  return <OpsChip tone="good" label={connection} meaning="the connection's landscape matched" />;
}
