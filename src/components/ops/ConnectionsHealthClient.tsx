"use client";

/**
 * Connection health — and the binding backlog.
 *
 * TWO INDEPENDENT AXES, NEVER MERGED. A connection's probe health ("did it
 * answer?") and its environment binding ("do we know which landscape it is?")
 * are separate questions with separate remedies. A connection can be perfectly
 * healthy and completely unverified — that combination is common, and
 * collapsing the two would tell an operator to fix a connection that is working.
 *
 * `NO_PROBE_PATH` COUNTS AS UNKNOWN, NOT AS NEEDS-ATTENTION. It means WE have no
 * path to probe and refused to guess one. The customer has nothing to fix, and a
 * screen that nags about things you cannot action is a screen people stop
 * opening.
 *
 * "LAST SUCCEEDED", NOT "LAST VALIDATED". The timestamp moves only on a real
 * 200, so a failing status beside a three-week-old date is the truth: it last
 * worked three weeks ago and it is failing now. Naming the column for what the
 * field means stops the pairing looking like a bug — and stops someone later
 * "fixing" it by touching the timestamp on failure, which would destroy the only
 * record of when the connection last actually worked.
 */

import {
  AbsencePill,
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  OpsTable,
  ProvenanceStrip,
  opsCellStyle,
  opsMonoStyle,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import { count, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";

interface Connection {
  id: string;
  product: string;
  key: string;
  label: string;
  environment: string | null;
  writeEnabled: boolean;
  status: string;
  lastValidatedAt: string | null;
  neverTested: boolean;
}

interface ConnectionsPayload {
  counts: {
    total: number;
    healthy: number;
    needsAttention: number;
    unknown: number;
    neverTested: number;
  };
  provenance: { activeOnly: boolean; excludedInactive: number; why: string };
  bindingBacklog: { undeclaredEnvironment: number; remediation: string; consequence: string };
  prodConnections: number;
  connections: Connection[];
}

/**
 * The six probe outcomes, and what each rolls up as.
 *
 * `NEVER_TESTED` is absent on purpose: it is not a probe result, it is the
 * schema's name for a null column. It renders as an absence, not a status.
 */
const PROBE: Record<string, { tone: OpsTone; label: string; meaning: string }> = {
  OK: { tone: "good", label: "OK", meaning: "a live probe returned 200" },
  UNAUTHORIZED: {
    tone: "attention",
    label: "UNAUTHORIZED",
    meaning: "401 or 403 — credentials or the communication arrangement",
  },
  NOT_FOUND: { tone: "bad", label: "NOT_FOUND", meaning: "404 — not in this tenant" },
  TIMEOUT: { tone: "attention", label: "TIMEOUT", meaning: "reached, did not answer in time" },
  ERROR: { tone: "bad", label: "ERROR", meaning: "the tenant returned a failure" },
  NO_PROBE_PATH: {
    tone: "muted",
    label: "NO_PROBE_PATH",
    // Framed as ours, never as a tenant failure.
    meaning: "no probe path is configured — our gap, not the tenant's",
  },
};

export function ConnectionsHealthClient() {
  const { feed } = useOpsFeed<ConnectionsPayload>("/api/ops/connections-health");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Connections"
        lede="Probe health and environment binding for every active SAP connection. Health and binding are separate questions — a connection can answer perfectly and still not have declared which landscape it is."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder
            kind="error"
            title="Connection health could not be read"
            detail={feed.message}
          />
        </OpsCard>
      ) : (
        <ConnectionsBody data={feed.data} />
      )}
    </div>
  );
}

function ConnectionsBody({ data }: { data: ConnectionsPayload }) {
  const { counts, connections, provenance, bindingBacklog } = data;
  const declared = counts.total - bindingBacklog.undeclaredEnvironment;

  return (
    <>
      {bindingBacklog.undeclaredEnvironment > 0 ? (
        <BindingBacklog
          undeclared={bindingBacklog.undeclaredEnvironment}
          declared={declared}
          total={counts.total}
          remediation={bindingBacklog.remediation}
          consequence={bindingBacklog.consequence}
        />
      ) : null}

      <OpsCard>
        {counts.total === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title="No active SAP connection"
            // Distinct from "we could not read them" and from "they are unhealthy".
            detail="Nothing is configured for this organization yet. Add a connection in Developer Studio; until then the broker has nothing to reach."
          />
        ) : (
          <OpsTable head={["Connection", "Environment", "Health", "Last succeeded"]}>
            {connections.map((c) => (
              <tr key={c.id}>
                <td style={opsCellStyle}>
                  {c.label}
                  <div
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 11.5,
                      color: "var(--ink-muted)",
                    }}
                  >
                    {c.product} · {c.key}
                  </div>
                </td>
                <td style={opsCellStyle}>
                  {c.environment ? (
                    <OpsChip
                      // PROD renders as a warning — it is the one landscape where
                      // an accidental write cannot be taken back.
                      tone={c.environment.toUpperCase() === "PROD" ? "attention" : "info"}
                      label={c.environment}
                    />
                  ) : (
                    <AbsencePill
                      label="environment not declared"
                      meaning="reads are served but marked unverified; writes are refused outright"
                    />
                  )}
                </td>
                <td style={opsCellStyle}>
                  {c.neverTested ? (
                    <AbsencePill
                      label="never tested"
                      meaning="no probe has run — the absence of a result, not a result"
                    />
                  ) : (
                    <OpsChip
                      tone={PROBE[c.status]?.tone ?? "muted"}
                      label={PROBE[c.status]?.label ?? c.status}
                      meaning={PROBE[c.status]?.meaning ?? "an unrecognised probe outcome"}
                    />
                  )}
                </td>
                <td style={opsMonoStyle}>{sinceLabel(c.lastValidatedAt)}</td>
              </tr>
            ))}
          </OpsTable>
        )}

        <ProvenanceStrip claim="Active connections only">
          {provenance.excludedInactive > 0
            ? `${count(provenance.excludedInactive)} deactivated connection${provenance.excludedInactive === 1 ? " is" : "s are"} not listed. ${provenance.why}`
            : provenance.why}
          {counts.total > 0 ? (
            <>
              {" "}
              Showing all {count(counts.total)} active connection
              {counts.total === 1 ? "" : "s"}.
            </>
          ) : null}
        </ProvenanceStrip>
      </OpsCard>
    </>
  );
}

/**
 * The backlog, shaped to reach zero.
 *
 * A bare count could sit constant forever without anyone noticing, which is
 * exactly how a permissive read rule quietly becomes permanent. A bar with a
 * printed target makes a stalled backlog visible, and the remediation link is
 * part of the component — a backlog you cannot act on from where you see it does
 * not get cleared.
 */
function BindingBacklog({
  undeclared,
  declared,
  total,
  remediation,
  consequence,
}: {
  undeclared: number;
  declared: number;
  total: number;
  remediation: string;
  consequence: string;
}) {
  const pct = total > 0 ? Math.round((declared / total) * 100) : 0;
  return (
    <OpsCard>
      <div style={{ padding: "15px 16px", maxWidth: 460 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--ink-muted)",
            fontWeight: 600,
          }}
        >
          Binding backlog
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            margin: "8px 0 2px",
            color: "var(--warning)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count(undeclared)}
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-muted)" }}> to clear</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={declared}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${declared} of ${total} connections have declared an environment`}
          style={{
            height: 6,
            borderRadius: 9999,
            background: "var(--status-expired-bg)",
            overflow: "hidden",
            margin: "10px 0 8px",
          }}
        >
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--success)" }} />
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 11.5,
            color: "var(--ink-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count(declared)} of {count(total)} declared · target 0
        </div>

        <p style={{ fontSize: 12, color: "var(--ink-secondary)", lineHeight: 1.5, margin: "10px 0 0" }}>
          {consequence}
        </p>
        <p style={{ fontSize: 12.5, color: "var(--ink-secondary)", margin: "8px 0 0" }}>
          {remediation}
        </p>
      </div>
    </OpsCard>
  );
}
