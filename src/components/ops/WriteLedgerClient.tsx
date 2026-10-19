"use client";

/**
 * Write ledger — reservations, and the writes that never got one.
 *
 * TWO SOURCES THAT DO NOT RECONCILE, AND THE SCREEN LEADS WITH THAT. The
 * reservation table holds row states; the audit feed holds events. They count
 * different things and will not add up, and an operator who discovers that
 * themselves concludes one of them is broken. So the mechanism is stated as a
 * permanent property rather than surfaced as a discrepancy warning.
 *
 * THE EMPTY STATE IS THE POINT OF THIS SCREEN IN THIS RELEASE. No write
 * credential can be issued yet, so every write is refused at the credential
 * gate before a key is reserved. That is a precise, verifiable statement about a
 * control that works — designed as a demonstration of the product's honesty,
 * never as an apology, and never with sample rows.
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
import { count, DEFAULT_OPS_WINDOW_HOURS, FeedAsAt, OpsWindowPicker, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";

interface ReservationRow {
  id: string;
  solutionId: string;
  interfaceId: string | null;
  state: "in-flight" | "completed" | "failed" | "stale-reservation";
  status: number | null;
  createdAt: string;
  expiresAt: string;
}

interface AuditRow {
  id: string;
  at: string;
  solutionId: string;
  externalId: string;
  status: number;
  kind: "conflict" | "blocked" | "upstream-failed" | "outcome-unknown";
  correlationId: string;
  clientTokenId: string;
}

interface LedgerPayload {
  windowHours: number;
  reservations: {
    inFlight: number;
    completed: number;
    failed: number;
    staleReservation: number;
    total: number;
  };
  fromAudit: { blocked: number; conflicts: number; upstreamFailed: number; outcomeUnknown: number };
  truncated: boolean;
  provenance: {
    sourcesDoNotReconcile: boolean;
    why: string[];
    emptyByDesign: string | null;
    rowsAreAPage: {
      reservationRows: { returned: number; of: number };
      auditRows: { returned: number; of: number };
      limit: number;
    };
  };
  reservationRows: ReservationRow[];
  auditRows: AuditRow[];
}

const RESERVATION: Record<ReservationRow["state"], { tone: OpsTone; label: string; meaning: string }> = {
  "in-flight": { tone: "info", label: "in flight", meaning: "reserved, no outcome yet, still inside its TTL" },
  completed: { tone: "good", label: "completed", meaning: "the write reached SAP and succeeded" },
  failed: {
    tone: "bad",
    label: "failed",
    meaning: "the write was sent to SAP and did not succeed — after a 502 or 504 it may still have been applied",
  },
  "stale-reservation": {
    tone: "attention",
    label: "stale reservation",
    // The one state an operator may need to act on.
    meaning: "reserved, past its TTL, never completed — a retry on that key gets 409 until it lapses",
  },
};

/*
 * WHAT A FAILED WRITE EVENT WAS — and only one of these means "never reached
 * SAP". Every one used to render as blocked, so a 504 whose POST SAP may have
 * committed read as a write that never happened, and the developer resubmitted
 * it under a new key. `outcome-unknown` is the one to check in SAP before
 * anybody retries.
 */
const AUDIT_KIND: Record<AuditRow["kind"], { tone: OpsTone; label: string; meaning: string }> = {
  conflict: { tone: "attention", label: "conflict", meaning: "409 — that key was already in flight" },
  blocked: { tone: "muted", label: "blocked", meaning: "refused at a gate before SAP was reached — nothing was written" },
  "upstream-failed": {
    tone: "bad",
    label: "SAP refused",
    meaning: "reached SAP, which refused it — nothing was written",
  },
  "outcome-unknown": {
    tone: "attention",
    label: "outcome unknown",
    meaning: "502/504 — the write may have been applied; check SAP before anyone resubmits",
  },
};

export function WriteLedgerClient() {
  const [windowHours, setWindowHours] = useState(DEFAULT_OPS_WINDOW_HOURS);
  const { feed, fetchedAt } = useOpsFeed<LedgerPayload>("/api/ops/write-ledger", windowHours);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Write ledger"
        lede="Idempotency reservations, and the failed writes the audit feed recorded — refused before one was made, refused by SAP, or with an outcome only SAP knows. These are two different records of two different things — they will not add up, and the reason is stated below rather than left to be discovered."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="The write ledger could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <LedgerBody data={feed.data} onWindowChange={setWindowHours} />
      )}
    </div>
  );
}

function LedgerBody({
  data,
  onWindowChange,
}: {
  data: LedgerPayload;
  onWindowChange: (hours: number) => void;
}) {
  const { reservations, fromAudit, provenance, reservationRows, auditRows, windowHours } = data;
  const page = provenance.rowsAreAPage;

  return (
    <>
      {/* Window control — see useOpsFeed.OPS_WINDOWS. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <OpsWindowPicker id="ops-window-ledger" hours={windowHours} onChange={onWindowChange} />
      </div>
      <OpsCard>
        <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
          <Stat label="Reserved" value={count(reservations.total)} basis={`last ${windowHours} hours`} />
          <Stat label="Completed" value={count(reservations.completed)} />
          <Stat label="In flight" value={count(reservations.inFlight)} />
          <Stat
            label="Stale"
            value={count(reservations.staleReservation)}
            basis="past TTL, never completed"
            tone={reservations.staleReservation > 0 ? "attention" : "default"}
          />
        </div>

        {reservationRows.length === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title={
              provenance.emptyByDesign
                ? "No write has reserved a key — by design"
                : "No reservations in this window"
            }
            detail={
              provenance.emptyByDesign ??
              `No write reached the reservation step in the last ${windowHours} hours.`
            }
          />
        ) : (
          <OpsTable head={["Solution", "State", "HTTP", "Reserved", "Expires"]}>
            {reservationRows.map((r) => (
              <tr key={r.id}>
                <td style={opsCellStyle}>
                  {r.solutionId}
                  {r.interfaceId ? (
                    <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                      {r.interfaceId}
                    </div>
                  ) : null}
                </td>
                <td style={opsCellStyle}>
                  <OpsChip
                    tone={RESERVATION[r.state].tone}
                    label={RESERVATION[r.state].label}
                    meaning={RESERVATION[r.state].meaning}
                  />
                </td>
                <td style={opsMonoStyle}>{r.status ?? "—"}</td>
                <td style={opsMonoStyle}>{sinceLabel(r.createdAt)}</td>
                <td style={opsMonoStyle}>{new Date(r.expiresAt).toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </OpsTable>
        )}

        <ProvenanceStrip claim="Two sources, and they do not reconcile">
          <ProvenanceReasons reasons={provenance.why} />
          <div style={{ marginTop: 6 }}>
            {page.reservationRows.of === 0
              ? "Counts above are for the whole window."
              : `Showing ${count(page.reservationRows.returned)} of ${count(page.reservationRows.of)} reservations. Counts above are for the whole window.`}
          </div>
        </ProvenanceStrip>
      </OpsCard>

      <OpsCard>
        <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
          <Stat
            label="Refused before reserving"
            value={count(fromAudit.blocked)}
            basis="blocked at a gate — SAP never reached"
          />
          <Stat
            label="Refused by SAP"
            value={count(fromAudit.upstreamFailed)}
            basis="reached SAP, nothing written"
          />
          <Stat
            label="Outcome unknown"
            value={count(fromAudit.outcomeUnknown)}
            basis="502/504 — may have been applied"
            tone={fromAudit.outcomeUnknown > 0 ? "attention" : "default"}
          />
          <Stat
            label="Idempotency conflicts"
            value={count(fromAudit.conflicts)}
            basis="409 — a key already in flight"
          />
        </div>

        {auditRows.length === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title="No refused writes in this window"
            // Not the same claim as the reservation panel above, and must not
            // read like it: this counts events, that counts row states.
            detail="No write was refused at a gate, refused or failed by SAP, or conflicted on a key. This counts events in the audit feed, which is a different record from the reservations above."
          />
        ) : (
          <OpsTable head={["Time", "Solution", "Capability", "Kind", "HTTP"]}>
            {auditRows.map((a) => (
              <tr key={a.id}>
                <td style={opsMonoStyle}>{new Date(a.at).toLocaleTimeString("en-GB")}</td>
                <td style={opsCellStyle}>
                  {a.solutionId}
                  <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                    {a.clientTokenId}
                  </div>
                </td>
                <td style={opsMonoStyle}>{a.externalId}</td>
                <td style={opsCellStyle}>
                  <OpsChip
                    tone={AUDIT_KIND[a.kind].tone}
                    label={AUDIT_KIND[a.kind].label}
                    meaning={AUDIT_KIND[a.kind].meaning}
                  />
                </td>
                <td style={opsMonoStyle}>{a.status}</td>
              </tr>
            ))}
          </OpsTable>
        )}

        <ProvenanceStrip claim="Events, not row states">
          These come from the append-only audit feed. A write refused at any gate never reserves a
          key, so it appears here and nowhere above; one SAP refused or failed appears in both.
          {page.auditRows.of > 0 ? (
            <> Showing {count(page.auditRows.returned)} of {count(page.auditRows.of)}.</>
          ) : null}
        </ProvenanceStrip>
      </OpsCard>
    </>
  );
}
