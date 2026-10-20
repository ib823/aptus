"use client";

/**
 * Workbench write-backs — the changes people made to a live SAP system from
 * the Workbench, outside the broker (P0.7).
 *
 * A DIFFERENT RECORD FROM THE LEDGER ABOVE IT. The ledger counts broker writes,
 * per solution and credential. These rows are platform-scope: a platform admin
 * creating a record (Write Mode on /sap-explorer) or running a create-then-
 * delete write-test, against the deployment's own tenant. Each row was written
 * BEFORE SAP was called, so a write that never reported back is still here,
 * as PENDING, rather than missing.
 *
 * PLATFORM ADMINS ONLY. The endpoint refuses everyone else, and that refusal is
 * rendered as what it is — not as an error, and never as an empty table, which
 * would claim no write happened.
 */

import { useState } from "react";
import {
  OpsCard,
  OpsChip,
  OpsPlaceholder,
  OpsTable,
  ProvenanceReasons,
  ProvenanceStrip,
  Stat,
  opsCellStyle,
  opsMonoStyle,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import { count, DEFAULT_OPS_WINDOW_HOURS, OpsWindowPicker, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";
import { ProductLabel } from "@/components/sap/ProductLabel";

/**
 * The states a row can be in. PENDING and UNRESOLVED are both "no outcome
 * recorded" — the server splits them by age, because "still running" and
 * "nobody will ever know" call for different actions.
 */
type RowState =
  | "PENDING"
  | "UNRESOLVED"
  | "SUCCEEDED"
  | "BLOCKED"
  | "SAP_REFUSED"
  | "OUTCOME_UNKNOWN"
  | "LEFT_BEHIND";

interface WorkbenchWriteRow {
  id: string;
  at: string;
  action: string;
  actorEmail: string;
  actorRole: string;
  product: string;
  tenantKey: string;
  tenantLabel: string | null;
  serviceKey: string;
  entitySet: string;
  state: RowState | string;
  sapStatus: number | null;
  reason: string | null;
  correlationId: string;
}

interface WorkbenchWritesPayload {
  windowHours: number;
  total: number;
  counts: Record<RowState, number>;
  truncated: boolean;
  provenance: {
    outcomes: Record<RowState, string>;
    pendingUnresolvedAfterMinutes: number;
    cannotTell: string[];
    rowsAreAPage: { returned: number; of: number; limit: number };
  };
  rows: WorkbenchWriteRow[];
}

const STATE: Record<RowState, { tone: OpsTone; label: string }> = {
  PENDING: { tone: "info", label: "in progress" },
  UNRESOLVED: { tone: "attention", label: "never recorded" },
  SUCCEEDED: { tone: "good", label: "succeeded" },
  BLOCKED: { tone: "muted", label: "blocked" },
  SAP_REFUSED: { tone: "bad", label: "SAP refused" },
  OUTCOME_UNKNOWN: { tone: "attention", label: "outcome unknown" },
  LEFT_BEHIND: { tone: "attention", label: "left behind" },
};

const ACTION: Record<string, string> = {
  SAP_WORKBENCH_WRITE: "create",
  SAP_WORKBENCH_WRITE_TEST: "write-test",
};

function isState(value: string): value is RowState {
  return Object.prototype.hasOwnProperty.call(STATE, value);
}

/** The meaning comes from the server, so the screen cannot describe a state differently. */
function chipFor(row: WorkbenchWriteRow, meanings: Record<RowState, string>) {
  // An unknown value is shown verbatim rather than mapped to a guess.
  if (!isState(row.state)) return { tone: "muted" as OpsTone, label: row.state, meaning: row.state };
  return { ...STATE[row.state], meaning: meanings[row.state] };
}

export function WorkbenchWritesClient() {
  const [windowHours, setWindowHours] = useState(DEFAULT_OPS_WINDOW_HOURS);
  const { feed } = useOpsFeed<WorkbenchWritesPayload>("/api/ops/workbench-writes", windowHours);

  return (
    <section aria-labelledby="workbench-writes-heading" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 id="workbench-writes-heading" style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
          Workbench write-backs
        </h2>
        {feed.state === "ready" ? (
          <OpsWindowPicker id="ops-window-workbench-writes" hours={windowHours} onChange={setWindowHours} />
        ) : null}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)", maxWidth: "68ch" }}>
        Records people created in SAP from the Workbench, outside the broker — Write Mode and the
        create-then-delete write-test. Each was recorded, naming the person, before SAP was called.
      </p>
      <OpsCard>
        {feed.state === "loading" ? (
          <OpsPlaceholder kind="loading" title="" detail="" />
        ) : feed.state === "error" ? (
          <OpsPlaceholder
            kind="error"
            title="Workbench write-backs could not be shown"
            // The server's own words: for anyone but a platform admin this is
            // the role refusal, which is the truth — not an empty feed.
            detail={`${feed.message} These are platform-scope records, visible to platform admins only.`}
          />
        ) : (
          <WorkbenchWritesBody data={feed.data} />
        )}
      </OpsCard>
    </section>
  );
}

function WorkbenchWritesBody({ data }: { data: WorkbenchWritesPayload }) {
  const { counts, provenance, rows, windowHours } = data;
  const atRisk = counts.OUTCOME_UNKNOWN + counts.LEFT_BEHIND + counts.UNRESOLVED;

  return (
    <>
      <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
        <Stat label="Recorded" value={count(data.total)} basis={`last ${windowHours} hours`} />
        <Stat label="Succeeded" value={count(counts.SUCCEEDED)} />
        <Stat label="Refused" value={count(counts.SAP_REFUSED + counts.BLOCKED)} basis="by SAP, or before sending" />
        <Stat
          label="Check SAP"
          value={count(atRisk)}
          basis="outcome unknown, left behind, or never recorded"
          tone={atRisk > 0 ? "attention" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          title="No Workbench write-back in this window"
          detail={`No one wrote to SAP from the Workbench in the last ${windowHours} hours. Every such write is recorded before SAP is called, so a write that failed midway would still be listed here.`}
        />
      ) : (
        <OpsTable head={["Time", "Person", "What", "Target", "Outcome", "HTTP"]}>
          {rows.map((r) => {
            const chip = chipFor(r, provenance.outcomes);
            return (
              <tr key={r.id}>
                <td style={opsMonoStyle}>{sinceLabel(r.at)}</td>
                <td style={opsCellStyle}>
                  {r.actorEmail}
                  <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>{r.actorRole}</div>
                </td>
                <td style={opsCellStyle}>{ACTION[r.action] ?? r.action}</td>
                <td style={opsMonoStyle}>
                  {r.serviceKey} / {r.entitySet}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-muted)" }}>
                    <ProductLabel product={r.product} size={16} mutedName />
                    <span>· {r.tenantLabel ?? r.tenantKey}</span>
                  </div>
                </td>
                <td style={opsCellStyle}>
                  <OpsChip tone={chip.tone} label={chip.label} meaning={chip.meaning} />
                  {r.reason ? (
                    <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                      {r.reason}
                    </div>
                  ) : null}
                </td>
                <td style={opsMonoStyle}>
                  {r.sapStatus ?? "—"}
                  <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }} title="Correlation id returned to the person">
                    {r.correlationId.slice(0, 8)}
                  </div>
                </td>
              </tr>
            );
          })}
        </OpsTable>
      )}

      <ProvenanceStrip claim="Recorded before SAP was called">
        A row older than {provenance.pendingUnresolvedAfterMinutes} minutes with no outcome is a write whose
        result was never recorded — check SAP before anyone repeats it. What this cannot tell:
        <ProvenanceReasons reasons={provenance.cannotTell} />
        {provenance.rowsAreAPage.of > 0 ? (
          <div style={{ marginTop: 6 }}>
            Showing {count(provenance.rowsAreAPage.returned)} of {count(provenance.rowsAreAPage.of)}. Counts above are
            for the whole window.
          </div>
        ) : null}
      </ProvenanceStrip>
    </>
  );
}
