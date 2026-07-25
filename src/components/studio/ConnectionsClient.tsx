"use client";

/**
 * Connections — the client half.
 *
 * Renders connection METADATA and runs the read-only connectivity probe. The
 * secret column is not something this component redacts; it is something it
 * never receives (the endpoint's select does not read it). The "🔒 Sealed"
 * cell is therefore a statement of fact, not a mask over a value in memory.
 */

import { useCallback, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";

export interface StudioConnection {
  id: string;
  product: string;
  key: string;
  label: string;
  baseUrl: string;
  authType: string;
  writeEnabled: boolean;
  isActive: boolean;
  lastValidatedAt: string | null;
  lastValidationStatus: string | null;
}

interface TestOutcome {
  status: string;
  detail: string;
  durationMs: number;
  validated: boolean;
}

/**
 * Health → the honest-status vocabulary already used across the console, so a
 * connection's state reads the same way a capability's does.
 *   OK            → ACTIVATED     (proven by a live 200)
 *   UNAUTHORIZED  → NEEDS_SETUP   (401/403 — arrangement/credentials)
 *   NOT_FOUND     → NOT_FOUND     (404 on this tenant)
 *   TIMEOUT/ERROR → NOT_PROBEABLE (unreachable right now)
 *   never tested  → NOT_CHECKED
 */
function healthToStatus(status: string | null): HonestStatus {
  switch (status) {
    case "OK":
      return "ACTIVATED";
    case "UNAUTHORIZED":
      return "NEEDS_SETUP";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "TIMEOUT":
    case "ERROR":
    case "NO_PROBE_PATH":
      return "NOT_PROBEABLE";
    default:
      return "NOT_CHECKED";
  }
}

export function ConnectionsClient({
  connections,
  canTest,
}: {
  connections: readonly StudioConnection[];
  canTest: boolean;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, TestOutcome | { error: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const test = useCallback(async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`/api/studio/connections/${id}/test`, { method: "POST" });
      const json = (await res.json()) as { data?: TestOutcome; error?: { message?: string } };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? "The test could not be run.");
      }
      setOutcomes((m) => ({ ...m, [id]: json.data! }));
    } catch (err) {
      setOutcomes((m) => ({
        ...m,
        [id]: { error: err instanceof Error ? err.message : "The test could not be run." },
      }));
    } finally {
      setTesting(null);
    }
  }, []);

  if (connections.length === 0) {
    return (
      <section style={card}>
        <h2 style={h2}>No SAP tenant connected</h2>
        <p style={body}>
          This organization has no SAP connection yet, so there is nothing to probe — and
          nothing anywhere in Studio will claim a capability is activated. A connection is
          added by a platform administrator.
        </p>
      </section>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
            <Th>Alias</Th>
            <Th>Key</Th>
            <Th>Product</Th>
            <Th>Base URL</Th>
            <Th>Auth</Th>
            <Th>Secret</Th>
            <Th>Health</Th>
            <Th>Write</Th>
            <Th>Active</Th>
            {canTest && <Th>Test</Th>}
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => {
            const outcome = outcomes[c.id];
            return (
              <tr key={c.id} style={{ borderTop: "1px solid var(--border-default)" }}>
                <Td>{c.label}</Td>
                <Td mono>{c.key}</Td>
                <Td>{c.product}</Td>
                <Td mono>{c.baseUrl}</Td>
                <Td>{c.authType}</Td>
                <Td>
                  <span title="Sealed with AES-256-GCM and never returned to the console">
                    🔒 Sealed
                  </span>
                </Td>
                <Td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <StudioStatusChip status={healthToStatus(c.lastValidationStatus)} />
                    <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                      {c.lastValidatedAt
                        ? `last 200 · ${new Date(c.lastValidatedAt).toLocaleString()}`
                        : "never returned 200"}
                    </span>
                  </div>
                </Td>
                <Td>{c.writeEnabled ? "enabled" : "disabled"}</Td>
                <Td>{c.isActive ? "yes" : "no"}</Td>
                {canTest && (
                  <Td>
                    <button
                      type="button"
                      onClick={() => void test(c.id)}
                      disabled={testing === c.id}
                      style={testBtn}
                    >
                      {testing === c.id ? "Testing…" : "Test connectivity"}
                    </button>
                    {outcome && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 11,
                          maxWidth: 260,
                          color:
                            "error" in outcome
                              ? "var(--status-revoked-fg)"
                              : outcome.validated
                                ? "var(--status-signed-fg)"
                                : "var(--status-awaiting-fg)",
                        }}
                      >
                        {"error" in outcome
                          ? outcome.error
                          : `${outcome.detail} (${outcome.durationMs}ms)`}
                      </p>
                    )}
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "9px 12px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--ink-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td
      style={{
        padding: "9px 12px",
        verticalAlign: "top",
        color: "var(--ink-primary)",
        ...(mono ? { fontFamily: "var(--font-mono, monospace)", fontSize: 12 } : {}),
      }}
    >
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

const testBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)",
  color: "var(--brand-navy)",
  border: "1px solid var(--brand-navy)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
