"use client";

/**
 * Access governance — what was asked for, what was decided, and when it stops.
 *
 * THE DECISION AND WHAT IT AUTHORISES ARE TWO COLUMNS, deliberately. A label is
 * not a permission: `SANDBOX_ONLY` on a PROD grant authorises nothing, and
 * `READ_ONLY` on a CREATE request authorises a read and not the write that was
 * asked for. The endpoint computes `authorises` with the same predicates the
 * broker enforces with, so the two cannot drift — which is the failure #168
 * fixed from the runtime side and this screen closes from the reading side.
 *
 * DECIDING IS ADMIN-ONLY, READING IS NOT. Partner leads, executive sponsors and
 * project managers reach this screen and see everything on it. The decision
 * controls simply are not rendered for them — not rendered-and-disabled, because
 * unlike the delegated actions elsewhere in this workspace, this capability is
 * not somewhere else. It is here, and it is not theirs.
 */

import { useState } from "react";

import {
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  OpsTable,
  ProvenanceStrip,
  Stat,
  opsCellStyle,
} from "@/components/ops/OpsChrome";
import { count, useOpsFeed } from "@/components/ops/useOpsFeed";
import {
  Authorises,
  ExpiryRunway,
  decisionTone,
  humanDecision,
} from "@/components/control-tower/GovernanceChrome";

interface Grant {
  id: string;
  solutionId: string;
  solutionName: string | null;
  externalId: string;
  operation: string;
  environment: string;
  justification: string;
  decision: string;
  requestedById: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  authorises: { read: boolean; write: boolean };
  lifecycle: "pending" | "live" | "expiring-soon" | "lapsed";
  unbounded: boolean;
}

interface GrantsPayload {
  expiryRunwayDays: number;
  counts: {
    total: number;
    byDecision: Record<string, number>;
    pending: number;
    expiringSoon: number;
    lapsed: number;
  };
  provenance: {
    expiryIsTheOnlyEnd: string;
    restrictionsAreEnforced: string;
    emptyByDesign: string | null;
    decisionsAreAudited: string;
  };
  grants: Grant[];
}

export function GrantsClient({ canDecide }: { canDecide: boolean }) {
  const { feed, reload } = useOpsFeed<GrantsPayload>("/api/control-tower/grants");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Access governance"
        lede="Every capability a solution has asked to reach, what was decided, and when that decision stops being true. There is no revocation control — an approved grant ends by lapsing, which is why a write cannot be approved without an expiry."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="The grant queue could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <GrantsBody data={feed.data} canDecide={canDecide} onDecided={reload} />
      )}
    </div>
  );
}

function GrantsBody({
  data,
  canDecide,
  onDecided,
}: {
  data: GrantsPayload;
  canDecide: boolean;
  onDecided: () => void;
}) {
  const { counts, grants, provenance, expiryRunwayDays } = data;
  const unbounded = grants.filter((g) => g.unbounded);

  return (
    <>
      <OpsCard>
        <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
          <Stat label="Requests" value={count(counts.total)} basis="every grant in scope" />
          <Stat
            label="Awaiting a decision"
            value={count(counts.pending)}
            tone={counts.pending > 0 ? "attention" : "default"}
          />
          <Stat
            label="Expiring soon"
            value={count(counts.expiringSoon)}
            basis={`within ${expiryRunwayDays} days`}
            tone={counts.expiringSoon > 0 ? "attention" : "default"}
          />
          <Stat label="Lapsed" value={count(counts.lapsed)} basis="ended on their own" />
        </div>

        {grants.length === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title="Nothing has been asked for"
            detail={
              provenance.emptyByDesign ??
              "No solution has requested access to a capability yet. Requests are raised in Developer Studio."
            }
          />
        ) : (
          <OpsTable
            head={
              canDecide
                ? ["Capability", "Decision", "Authorises", "Ends", "Decide"]
                : ["Capability", "Decision", "Authorises", "Ends"]
            }
          >
            {grants.map((g) => (
              <GrantRow
                key={g.id}
                grant={g}
                canDecide={canDecide}
                runwayDays={expiryRunwayDays}
                onDecided={onDecided}
              />
            ))}
          </OpsTable>
        )}

        <ProvenanceStrip claim="Expiry is the only ending">
          {provenance.expiryIsTheOnlyEnd}
          <div style={{ marginTop: 6 }}>{provenance.restrictionsAreEnforced}</div>
          <div style={{ marginTop: 6 }}>
            {provenance.decisionsAreAudited} Every grant in scope is listed — this is a complete
            record, not a sample.
          </div>
        </ProvenanceStrip>
      </OpsCard>

      {unbounded.length > 0 ? (
        <OpsCard>
          <div style={{ padding: "13px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ flex: "none", paddingTop: 1 }}>
              <OpsChip tone="bad" label={`${unbounded.length} unbounded`} />
            </span>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
              These settled grants have no expiry, so nothing will end them — there is no revocation
              path and a settled request cannot be re-decided. They predate the rule that refuses to
              approve an unbounded write. Each needs a new, bounded request to replace it.
            </p>
          </div>
        </OpsCard>
      ) : null}
    </>
  );
}

function GrantRow({
  grant,
  canDecide,
  runwayDays,
  onDecided,
}: {
  grant: Grant;
  canDecide: boolean;
  runwayDays: number;
  onDecided: () => void;
}) {
  const lapsed = grant.lifecycle === "lapsed";
  const isWrite = grant.operation !== "READ";

  return (
    <tr>
      <td style={opsCellStyle}>
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>
          {grant.externalId}
        </span>{" "}
        · {grant.operation}
        <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
          {grant.solutionName ?? grant.solutionId} · {grant.environment}
        </div>
      </td>
      <td style={opsCellStyle}>
        {/* A lapsed grant KEEPS its decision chip, muted. Recolouring it would
            rewrite what was decided — a decision does not un-happen because
            time passed. */}
        <OpsChip
          tone={decisionTone(grant.decision, lapsed)}
          label={humanDecision(grant.decision)}
          meaning={lapsed ? "decided, and since lapsed" : undefined}
        />
      </td>
      <td style={opsCellStyle}>
        <Authorises read={grant.authorises.read} write={grant.authorises.write} />
      </td>
      <td style={opsCellStyle}>
        {grant.lifecycle === "pending" ? (
          <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>not yet decided</span>
        ) : (
          <ExpiryRunway
            expiresAt={grant.expiresAt}
            runwayDays={runwayDays}
            // A read grant may legitimately run indefinitely. A write may not,
            // and if one has no expiry that is a defect and reads as one.
            unboundedIsLegitimate={!isWrite}
          />
        )}
      </td>
      {canDecide ? (
        <td style={{ ...opsCellStyle, textAlign: "right" }}>
          {grant.lifecycle === "pending" ? (
            <DecideControls grant={grant} onDecided={onDecided} />
          ) : (
            <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>settled</span>
          )}
        </td>
      ) : null}
    </tr>
  );
}

/**
 * The decision. The one mutation in this workspace.
 *
 * THE WRITE CHECKLIST IS A DELIBERATE OBSTACLE, not a formality. A write into a
 * client's SAP system is never approved by reflex, so approving one requires
 * acknowledging the checklist explicitly — and the server refuses without it,
 * so this control cannot be routed around by calling the API directly.
 *
 * The refusal messages are the server's own. They name what to do — find a
 * colleague, raise a new request — and rewriting them here would lose that.
 */
function DecideControls({ grant, onDecided }: { grant: Grant; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(false);

  const isWrite = grant.operation !== "READ";

  async function decide(decision: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/control-tower/grants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantId: grant.id,
          decision,
          writeChecklistAcknowledged: checklist,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? `The decision was refused (HTTP ${res.status}).`);
        setBusy(false);
        return;
      }
      onDecided();
    } catch {
      setError("The decision could not be sent. Nothing was recorded.");
      setBusy(false);
    }
  }

  const btn: React.CSSProperties = {
    padding: "5px 11px",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    border: "1px solid var(--border-strong)",
    background: "var(--surface-paper)",
    cursor: busy ? "wait" : "pointer",
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      {isWrite ? (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            fontSize: 11.5,
            color: "var(--ink-secondary)",
            maxWidth: 230,
            textAlign: "left",
            lineHeight: 1.4,
          }}
        >
          <input
            type="checkbox"
            checked={checklist}
            disabled={busy}
            onChange={(e) => setChecklist(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          I have worked through the write checklist. This writes into the client&apos;s SAP system.
        </label>
      ) : null}

      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={btn} disabled={busy} onClick={() => void decide("APPROVED")}>
          Approve
        </button>
        <button type="button" style={btn} disabled={busy} onClick={() => void decide("READ_ONLY")}>
          Read only
        </button>
        <button type="button" style={btn} disabled={busy} onClick={() => void decide("REJECTED")}>
          Refuse
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            fontSize: 11.5,
            color: "var(--status-revoked-fg)",
            maxWidth: 230,
            textAlign: "left",
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
