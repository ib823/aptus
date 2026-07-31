"use client";

/**
 * Runtime client credentials — issue, rotate, revoke.
 *
 * The token is displayed exactly once, immediately after it is minted, because
 * the server keeps only a hash and genuinely cannot show it again. The copy says
 * so plainly rather than politely: a developer who assumes they can come back
 * for it later will be locked out of their own integration.
 *
 * Segregation of duties is enforced server-side. This UI states the rule up
 * front so it reads as governance rather than as an error, and so the owner
 * knows to ask a colleague before they try.
 */

import { useCallback, useState } from "react";

export interface CredentialSummary {
  id: string;
  solutionId: string;
  solutionName: string;
  label: string;
  environment: string;
  sapClient?: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CredentialSolution {
  id: string;
  name: string;
  /** True when the viewer owns it — they may not mint its credential. */
  viewerOwns: boolean;
}

export function ClientCredentials({
  credentials,
  solutions,
  canIssue,
}: {
  credentials: readonly CredentialSummary[];
  solutions: readonly CredentialSolution[];
  canIssue: boolean;
}) {
  const [solutionId, setSolutionId] = useState(solutions[0]?.id ?? "");
  const [environment, setEnvironment] = useState("SANDBOX");
  /*
   * The SAP client half of the binding. Optional by design: most products
   * address no client, and requiring one would be a field nobody could fill.
   * Where a landscape holds several data containers (on-premise, RISE), a
   * credential without it can only ever be refused as AMBIGUOUS.
   */
  const [sapClient, setSapClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string; warning: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const res = await fetch("/api/studio/clients", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data?: { token?: string; warning?: string };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? "The request failed.");
      if (json.data?.token) {
        setIssued({ token: json.data.token, warning: json.data.warning ?? "" });
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const selected = solutions.find((s) => s.id === solutionId);

  return (
    <section style={card}>
      <h2 style={h2}>Runtime credentials</h2>
      <p style={body}>
        A client credential is what a deployed application uses to call CoreEdge. It is issued
        per solution and carries that solution&apos;s approved access — nothing more.
      </p>

      {canIssue && solutions.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>
            <span style={labelText}>Solution</span>
            <select value={solutionId} onChange={(e) => setSolutionId(e.target.value)} style={field}>
              {solutions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.viewerOwns ? " (you own this)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelText}>Environment</span>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value)} style={field}>
              {["SANDBOX", "DEV", "TEST", "PROD"].map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelText}>SAP client (optional)</span>
            <input
              value={sapClient}
              onChange={(e) => setSapClient(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="100"
              inputMode="numeric"
              style={field}
            />
            <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
              Only for systems that address one — on-premise and RISE. Leave empty otherwise.
            </span>
          </label>
          <button
            type="button"
            disabled={busy || !solutionId || Boolean(selected?.viewerOwns)}
            onClick={() =>
              call("POST", {
                solutionId,
                environment,
                ...(sapClient ? { sapClient } : {}),
                label: `${selected?.name ?? "solution"} · ${environment}${sapClient ? `/${sapClient}` : ""}`,
              })
            }
            title={
              selected?.viewerOwns
                ? "You own this solution — a colleague must issue its credential"
                : "Issue a credential"
            }
            style={{ ...btnPrimary, opacity: selected?.viewerOwns ? 0.5 : 1 }}
          >
            Issue credential
          </button>
        </div>
      )}

      {selected?.viewerOwns && canIssue && (
        <p style={{ ...muted, marginTop: 10 }}>
          You own this solution, so you cannot mint its runtime credential — the same
          second-pair-of-eyes rule that applies to approving access. Ask a colleague to issue it.
        </p>
      )}

      {issued && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--surface-banner-warn)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card-warm, 12px)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>{issued.warning}</p>
          <code
            style={{
              display: "block",
              padding: 10,
              background: "var(--surface-paper)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-input, 8px)",
              fontSize: 12,
              wordBreak: "break-all",
              userSelect: "all",
            }}
          >
            {issued.token}
          </code>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(issued.token)}
            style={{ ...btnSmall, marginTop: 10 }}
          >
            Copy
          </button>
        </div>
      )}

      {error && <p style={{ marginTop: 12, fontSize: 13, color: "var(--status-revoked-fg)" }}>{error}</p>}

      {credentials.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
                <Th>Solution</Th>
                <Th>Env</Th>
                <Th>State</Th>
                <Th>Last used</Th>
                {canIssue && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {credentials.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--border-default)" }}>
                  <Td>{c.solutionName}</Td>
                  <Td>{c.sapClient ? `${c.environment}/${c.sapClient}` : c.environment}</Td>
                  <Td>
                    {c.revokedAt ? "revoked" : c.isActive ? "active" : "inactive"}
                  </Td>
                  <Td>{c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : "never used"}</Td>
                  {canIssue && (
                    <Td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => call("PATCH", { clientId: c.id, action: "rotate" })}
                          style={btnSmall}
                        >
                          Rotate
                        </button>
                        {!c.revokedAt && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => call("PATCH", { clientId: c.id, action: "revoke" })}
                            style={btnDanger}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-secondary)", whiteSpace: "nowrap" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "9px 12px", verticalAlign: "top", color: "var(--ink-primary)" }}>{children}</td>;
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
const labelText: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-secondary)" };
const field: React.CSSProperties = { height: 40, borderRadius: "var(--radius-input, 8px)", border: "1px solid var(--border-strong)", background: "var(--surface-paper)", color: "var(--ink-primary)", fontSize: 14, padding: "0 8px" };
const btnPrimary: React.CSSProperties = { height: 40, padding: "0 16px", borderRadius: "var(--radius-input, 8px)", background: "var(--brand-navy)", color: "var(--surface-paper)", border: "1px solid var(--brand-navy)", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const btnSmall: React.CSSProperties = { height: 28, padding: "0 10px", borderRadius: "var(--radius-input, 8px)", background: "var(--surface-paper)", color: "var(--brand-navy)", border: "1px solid var(--brand-navy)", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnDanger: React.CSSProperties = { ...btnSmall, color: "var(--cta-red)", border: "1px solid var(--cta-red)" };
