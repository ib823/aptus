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
import { count, FeedAsAt, useOpsFeed } from "@/components/ops/useOpsFeed";
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
  lifecycle: "pending" | "live" | "expiring-soon" | "lapsed" | "revoked";
  unbounded: boolean;
  revokedAt: string | null;
  revokedReason: string | null;
}

interface GrantsPayload {
  expiryRunwayDays: number;
  counts: {
    total: number;
    byDecision: Record<string, number>;
    pending: number;
    expiringSoon: number;
    lapsed: number;
    revoked: number;
    unbounded: number;
  };
  /** True when `grants` is a page of a larger set — the counts above are not. */
  truncated: boolean;
  provenance: {
    howAGrantEnds: string;
    whyExpiryIsStillRequired: string;
    restrictionsAreEnforced: string;
    emptyByDesign: string | null;
    decisionsAreAudited: string;
    grantsAreAPage: { returned: number; limit: number; of: number };
  };
  grants: Grant[];
}

export function GrantsClient({ canDecide }: { canDecide: boolean }) {
  const { feed, reload, fetchedAt } = useOpsFeed<GrantsPayload>("/api/control-tower/grants");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Access governance"
        lede="Every capability a solution has asked to reach, what was decided, and when that decision stops being true. An approved grant ends by lapsing or by admin revocation below — expiry stays mandatory on writes because revocation requires someone to notice."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

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
  const { counts, grants, provenance, expiryRunwayDays, truncated } = data;
  // The rows on this page that are unbounded. `counts.unbounded` is the
  // portfolio truth — past the page limit these two can differ, and the panel
  // below says so rather than letting the visible list stand in for the total.
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
          <Stat
            label="Revoked"
            value={count(counts.revoked)}
            basis="withdrawn by an admin"
          />
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

        <ProvenanceStrip claim="How a grant ends">
          {provenance.howAGrantEnds}
          <div style={{ marginTop: 6 }}>{provenance.whyExpiryIsStillRequired}</div>
          <div style={{ marginTop: 6 }}>{provenance.restrictionsAreEnforced}</div>
          <div style={{ marginTop: 6 }}>
            {provenance.decisionsAreAudited}{" "}
            {truncated
              ? `Showing ${provenance.grantsAreAPage.returned} of ${provenance.grantsAreAPage.of} grants — the counts above cover all of them; the rows are a page.`
              : "Every grant in scope is listed — this is a complete record, not a sample."}
          </div>
        </ProvenanceStrip>
      </OpsCard>

      {counts.unbounded > 0 ? (
        <OpsCard>
          <div style={{ padding: "13px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ flex: "none", paddingTop: 1 }}>
              {/* The DATABASE count, never the page's — an unbounded grant past
                  the page limit must still raise this panel, and used not to. */}
              <OpsChip tone="bad" label={`${counts.unbounded} unbounded`} />
              {counts.unbounded > unbounded.length ? (
                <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--ink-muted)" }}>
                  {unbounded.length} on this page
                </span>
              ) : null}
            </span>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
              These settled grants have no expiry, so nothing will end them on its own. They predate
              the rule that now refuses to approve ANY unbounded grant, reads included. Revoking the
              credential does not help: it suspends the means of using a grant, and the next
              credential issued for that solution reactivates it.
              <br />
              <br />
              <strong>Revoke each one, then raise a bounded request to replace it.</strong> Revocation
              takes effect on the next call and leaves the original decision intact in the ledger.
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
  const revoked = grant.lifecycle === "revoked";
  // A revoked grant is muted for the same reason a lapsed one is: the decision
  // stands, its force does not.
  const lapsed = grant.lifecycle === "lapsed" || revoked;
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
          meaning={
            revoked
              ? "decided, and since revoked"
              : lapsed
                ? "decided, and since lapsed"
                : undefined
          }
        />
        {revoked && grant.revokedReason ? (
          <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-muted)" }}>
            {/* The reason IS the record. A withdrawal with no visible cause is
                the thing the required-reason rule exists to prevent. */}
            revoked: {grant.revokedReason}
          </div>
        ) : null}
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
          ) : revoked ? (
            <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>revoked</span>
          ) : grant.authorises.read || grant.authorises.write ? (
            // Only a grant that still authorises something has anything to
            // withdraw. A lapsed one is already ended.
            <RevokeControl grant={grant} onRevoked={onDecided} />
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

/**
 * Emergency withdrawal.
 *
 * SEPARATE FROM `DecideControls` ON PURPOSE. Deciding settles a pending request;
 * revoking ends a settled one. Putting them in one control would invite the
 * reading that revocation is another decision value — it is not. The decision
 * stays exactly as it was recorded, and the withdrawal is a second fact beside
 * it.
 *
 * The reason is mandatory and the server enforces a floor, so this cannot be
 * clicked through: it is the field someone reads later when a client asks why
 * their integration stopped.
 */
function RevokeControl({ grant, onRevoked }: { grant: Grant; onRevoked: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/control-tower/grants/${grant.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        // The server's refusals name what to do; keep its words.
        setError(body.error?.message ?? `Revocation was refused (HTTP ${res.status}).`);
        setBusy(false);
        return;
      }
      onRevoked();
    } catch {
      setError("The revocation could not be sent. Check the connection and try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--cta-red, #B3261E)",
          background: "none",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          padding: "3px 9px",
          cursor: "pointer",
        }}
      >
        Revoke
      </button>
    );
  }

  const tooShort = reason.trim().length < 10;

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "stretch", minWidth: 240 }}>
      <label
        htmlFor={`revoke-reason-${grant.id}`}
        style={{ fontSize: 11.5, color: "var(--ink-secondary)", textAlign: "left" }}
      >
        Why is this access being withdrawn?
      </label>
      <textarea
        id={`revoke-reason-${grant.id}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        disabled={busy}
        style={{
          fontSize: 12.5,
          padding: "5px 7px",
          borderRadius: 6,
          border: "1px solid var(--border-default)",
          background: "var(--surface-paper)",
          color: "var(--ink-primary)",
          resize: "vertical",
        }}
      />
      <p style={{ margin: 0, fontSize: 11, color: "var(--ink-muted)", textAlign: "left" }}>
        Takes effect on the next call. The decision stays in the ledger as it was.
      </p>
      {error ? (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--cta-red, #B3261E)", textAlign: "left" }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          disabled={busy}
          style={{
            fontSize: 11.5,
            background: "none",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "3px 9px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={busy || tooShort}
          title={tooShort ? "Give a reason of at least 10 characters" : undefined}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "#fff",
            background: "var(--cta-red, #B3261E)",
            border: "1px solid transparent",
            borderRadius: 6,
            padding: "3px 9px",
            cursor: busy || tooShort ? "not-allowed" : "pointer",
            opacity: busy || tooShort ? 0.55 : 1,
          }}
        >
          {busy ? "Revoking…" : "Confirm revoke"}
        </button>
      </div>
    </div>
  );
}
