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
import { formatDate } from "@/lib/format/date";

/**
 * An interface a request may be raised against.
 *
 * A request is ALWAYS raised against one of these, never typed by hand. At
 * runtime the broker matches a grant on solutionId + externalId + operation +
 * environment, all four exact — so a grant whose externalId differs from an
 * interface's by a character is approved, listed in the ledger, counted in the
 * portfolio, and authorises nothing, with no diagnostic anywhere. Deriving both
 * fields from a real row is what makes that mistake unavailable.
 */
export interface RequestableInterface {
  id: string;
  name: string;
  solutionId: string;
  solutionName: string;
  externalId: string;
  operation: "READ" | "CREATE" | "UPDATE";
}

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
  canRequest,
  requestableInterfaces,
}: {
  grants: readonly LedgerGrant[];
  currentUserId: string;
  highestApproved: GrantEnvironment | null;
  canDecide: boolean;
  /** Raising a request is a builder action, same gate as deciding one. */
  canRequest: boolean;
  requestableInterfaces: readonly RequestableInterface[];
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

      {canRequest && <RequestAccess interfaces={requestableInterfaces} />}

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
                            {g.decidedAt ? `decided ${formatDate(g.decidedAt)}` : "—"}
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

/**
 * Raise an access request.
 *
 * THE CAPABILITY IS PICKED, NOT TYPED. `externalId` and `operation` come from a
 * real Interface row and are shown as consequences of that pick. The runtime
 * matches a grant on solutionId + externalId + operation + environment, all four
 * exact, so a hand-typed capability produces a grant that is approved, displayed,
 * counted — and authorises nothing, silently. One catalogue service can also back
 * several interfaces at different operations, which is why the pair travels
 * together: a READ grant raised against a CREATE interface would pass approval
 * and then be refused at the first call, long after anyone was looking.
 */
function RequestAccess({ interfaces }: { interfaces: readonly RequestableInterface[] }) {
  const [open, setOpen] = useState(false);
  const [interfaceId, setInterfaceId] = useState("");
  const [environment, setEnvironment] = useState<GrantEnvironment>("SANDBOX");
  const [justification, setJustification] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = interfaces.find((i) => i.id === interfaceId) ?? null;
  const isWrite = selected ? isWriteOperation(selected.operation) : false;

  // Mirrors the server bound (10-2000). Mirrored, never trusted: the route
  // validates independently.
  const justificationTooShort = justification.trim().length < 10;
  // A write grant cannot be APPROVED without an expiry, so a write request that
  // arrives without one strands the approver -- they can neither approve it nor
  // supply the date themselves. Requiring it here keeps them unblocked. It is a
  // convenience, NOT the control: evaluateDecision is the control, and a caller
  // hitting the API directly is still refused there.
  const missingWriteExpiry = isWrite && expiresAt.trim().length === 0;
  const cannotSubmit = !selected || justificationTooShort || missingWriteExpiry || busy;

  const submit = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/studio/access-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solutionId: selected.solutionId,
          externalId: selected.externalId,
          operation: selected.operation,
          environment,
          justification: justification.trim(),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "The request could not be raised.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request could not be raised.");
    } finally {
      setBusy(false);
    }
  }, [selected, environment, justification, expiresAt]);

  if (interfaces.length === 0) {
    return (
      <section style={card}>
        <h2 style={h2}>Nothing to request access for yet</h2>
        <p style={body}>
          A request is always raised against an interface, so that what is approved matches
          exactly what the runtime will look for. Add one from <strong>Discover</strong> first.
        </p>
      </section>
    );
  }

  if (!open) {
    return (
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 style={h2}>Request access</h2>
            <p style={body}>
              Ask for a capability on behalf of a solution. A second person decides — you
              cannot approve your own request.
            </p>
          </div>
          <button type="button" style={btnSmall} onClick={() => setOpen(true)}>
            Request access
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={card}>
      <h2 style={h2}>Request access</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 620 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Capability</span>
          <select
            value={interfaceId}
            onChange={(e) => setInterfaceId(e.target.value)}
            style={field}
          >
            <option value="">Choose an interface…</option>
            {interfaces.map((i) => (
              <option key={i.id} value={i.id}>
                {i.solutionName} — {i.name} ({i.operation})
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <p style={muted}>
            Requesting <strong>{selected.operation}</strong> on{" "}
            <code>{selected.externalId}</code> for <strong>{selected.solutionName}</strong>.
            The capability and operation come from the interface, so what is approved is
            exactly what the runtime will match.
          </p>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Environment</span>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as GrantEnvironment)}
            style={field}
          >
            {ENVIRONMENT_ORDER.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>
            Expires {isWrite ? <strong>(required for a write)</strong> : "(optional)"}
          </span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={field}
          />
          {isWrite && (
            <span style={muted}>
              A write grant cannot be approved without an expiry — there is no way to revoke
              one afterwards, so it has to end on its own.
            </span>
          )}
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Why this solution needs it</span>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={4}
            style={{ ...field, height: "auto", resize: "vertical" }}
            placeholder="What the solution does with this capability, and why this environment."
          />
          <span style={muted}>
            {justificationTooShort
              ? "At least 10 characters — the approver reads this."
              : `${justification.trim().length} characters.`}
          </span>
        </label>

        {error && <span style={{ fontSize: 12, color: "var(--cta-red)" }}>{error}</span>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={btnSmall} disabled={cannotSubmit} onClick={submit}>
            {busy ? "Raising…" : "Raise request"}
          </button>
          <button type="button" style={btnSmall} disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-secondary)",
};

const field: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 13,
  fontFamily: "inherit",
};

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
