"use client";

/**
 * API Access — the request → decision ledger.
 *
 * Two things this screen is careful to say out loud:
 *
 *   1. An APPROVED row grants nothing at runtime in v1. Nothing calls SAP on a
 *      solution's behalf yet, so this is a record of a decision, not a live
 *      permission. A developer who reads "APPROVED" as "my app can now call
 *      production" has misunderstood the screen, so the screen says so.
 *   2. You cannot decide your own request. The control is enforced server-side;
 *      the UI disables the buttons as well so the rule is visible before it is
 *      hit, rather than arriving as a rejection.
 */

import { useCallback, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";
import { ENVIRONMENT_ORDER, isWriteOperation, type GrantEnvironment } from "@/lib/studio/grants";

export interface LedgerGrant {
  id: string;
  solutionName: string;
  externalId: string;
  operation: "READ" | "CREATE" | "UPDATE";
  environment: GrantEnvironment;
  justification: string;
  /** Already resolved for display (an elapsed expiry reads as EXPIRED). */
  decision: string;
  requestedById: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** Ledger decision → the console's shared status vocabulary. */
function decisionToStatus(decision: string): HonestStatus {
  switch (decision) {
    case "APPROVED":
      return "ACTIVATED";
    case "SANDBOX_ONLY":
    case "READ_ONLY":
      return "AVAILABLE";
    case "REJECTED":
      return "NOT_FOUND";
    case "EXPIRED":
      return "NOT_PROBEABLE";
    default:
      return "NOT_CHECKED";
  }
}

const DECISION_LABEL: Record<string, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  SANDBOX_ONLY: "Sandbox only",
  READ_ONLY: "Read only",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export function AccessGrantsClient({
  grants,
  currentUserId,
  highestApproved,
  canDecide,
}: {
  grants: readonly LedgerGrant[];
  currentUserId: string;
  highestApproved: GrantEnvironment | null;
  canDecide: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const decide = useCallback(
    async (grantId: string, decision: string) => {
      setBusy(grantId);
      setErrors((e) => ({ ...e, [grantId]: "" }));
      try {
        const res = await fetch("/api/studio/access-grants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grantId,
            decision,
            writeChecklistAcknowledged: checklist[grantId] ?? false,
          }),
        });
        const json = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) throw new Error(json.error?.message ?? "The decision could not be recorded.");
        window.location.reload();
      } catch (err) {
        setErrors((e) => ({
          ...e,
          [grantId]: err instanceof Error ? err.message : "The decision could not be recorded.",
        }));
      } finally {
        setBusy(null);
      }
    },
    [checklist],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ProgressiveTrust highest={highestApproved} />

      {grants.length === 0 ? (
        <section style={card}>
          <h2 style={h2}>No access has been requested yet</h2>
          <p style={body}>
            A request records which capability a solution needs, at which operation and in
            which environment, and why. Nothing is decided until a second person reviews it.
          </p>
        </section>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
                <Th>Solution</Th>
                <Th>Capability</Th>
                <Th>Op</Th>
                <Th>Env</Th>
                <Th>Decision</Th>
                <Th>Justification</Th>
                {canDecide && <Th>Review</Th>}
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => {
                const isOwnRequest = g.requestedById !== null && g.requestedById === currentUserId;
                const pending = g.decision === "REQUESTED";
                const write = isWriteOperation(g.operation);
                return (
                  <tr key={g.id} style={{ borderTop: "1px solid var(--border-default)" }}>
                    <Td>{g.solutionName}</Td>
                    <Td mono>{g.externalId}</Td>
                    <Td>
                      {g.operation}
                      {write && (
                        <span
                          title="Writes into the client's SAP system — higher risk"
                          style={{ marginLeft: 6, color: "var(--status-awaiting-fg)", fontWeight: 600 }}
                        >
                          ⚠ write
                        </span>
                      )}
                    </Td>
                    <Td>{g.environment}</Td>
                    <Td>
                      <StudioStatusChip
                        status={decisionToStatus(g.decision)}
                        label={DECISION_LABEL[g.decision] ?? g.decision}
                      />
                    </Td>
                    <Td>
                      <span style={{ display: "block", maxWidth: 320, color: "var(--ink-secondary)" }}>
                        {g.justification}
                      </span>
                    </Td>
                    {canDecide && (
                      <Td>
                        {!pending ? (
                          <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>
                            {g.decidedAt ? `decided ${new Date(g.decidedAt).toLocaleDateString()}` : "—"}
                          </span>
                        ) : isOwnRequest ? (
                          <span style={{ color: "var(--ink-muted)", fontSize: 12, maxWidth: 220, display: "block" }}>
                            You raised this request — someone else must review it.
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {write && (
                              <label style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "flex-start", maxWidth: 240 }}>
                                <input
                                  type="checkbox"
                                  checked={checklist[g.id] ?? false}
                                  onChange={(e) =>
                                    setChecklist((c) => ({ ...c, [g.id]: e.target.checked }))
                                  }
                                />
                                <span>
                                  I have worked through the write checklist: scope, reversibility,
                                  and blast radius in {g.environment}.
                                </span>
                              </label>
                            )}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {(["APPROVED", "SANDBOX_ONLY", "READ_ONLY", "REJECTED"] as const).map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  disabled={busy === g.id}
                                  onClick={() => void decide(g.id, d)}
                                  style={d === "REJECTED" ? btnDanger : btnSmall}
                                >
                                  {DECISION_LABEL[d]}
                                </button>
                              ))}
                            </div>
                            {errors[g.id] && (
                              <span style={{ fontSize: 11, color: "var(--status-revoked-fg)", maxWidth: 240 }}>
                                {errors[g.id]}
                              </span>
                            )}
                          </div>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Progressive trust — a DESCRIPTION of how far this organization has actually
 * got, derived from real approved grants. It is not a gate: v1 does not refuse a
 * PROD request because TEST has not been approved, because no policy defines
 * that, and a rule invented here could block legitimate work.
 */
function ProgressiveTrust({ highest }: { highest: GrantEnvironment | null }) {
  const reachedIdx = highest ? ENVIRONMENT_ORDER.indexOf(highest) : -1;
  return (
    <section style={card}>
      <h2 style={h2}>Progressive trust</h2>
      <p style={{ ...body, marginBottom: 12 }}>
        {highest
          ? `The furthest environment with an approved grant is ${highest}.`
          : "No environment has an approved grant yet."}
      </p>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
        {ENVIRONMENT_ORDER.map((env, i) => {
          const reached = i <= reachedIdx;
          return (
            <li
              key={env}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--radius-pill, 9999px)",
                fontSize: 12,
                fontWeight: 600,
                background: reached ? "var(--status-signed-bg)" : "var(--surface-ink-tint)",
                color: reached ? "var(--status-signed-fg)" : "var(--ink-muted)",
              }}
            >
              {env}
            </li>
          );
        })}
      </ol>
      <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
        This describes what has been approved. It does not enforce an order, and an approved
        grant does not make anything callable — runtime enforcement is a later phase.
      </p>
    </section>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-secondary)", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td style={{ padding: "9px 12px", verticalAlign: "top", color: "var(--ink-primary)", ...(mono ? { fontFamily: "var(--font-mono, monospace)", fontSize: 12 } : {}) }}>
      {children}
    </td>
  );
}

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card-warm, 12px)",
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 20,
};

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: 16, lineHeight: "24px", fontWeight: 600 };
const body: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" };
const muted: React.CSSProperties = { fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };

const btnSmall: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)",
  color: "var(--brand-navy)",
  border: "1px solid var(--brand-navy)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnDanger: React.CSSProperties = {
  ...btnSmall,
  color: "var(--cta-red)",
  border: "1px solid var(--cta-red)",
};
