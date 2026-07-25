"use client";

/**
 * Interfaces — the governed config for what a solution consumes.
 *
 * The detail is four cards: Source (which catalogue service), Runtime (how it
 * behaves), Contract (what goes in and comes back), Governance (who can see it
 * and how it is recorded) — plus a fifth, Mapping, which is DISABLED.
 *
 * On the disabled mapping card: it is shown rather than hidden because the shape
 * of the eventual feature is part of the design, and hiding it would invite
 * someone to build a private version. It is inert in three independent ways —
 * greyed, `pointer-events: none`, and (the one that actually matters) the API
 * refuses to accept `mappingVersion` at all. A greyed card is a hint; an
 * unaccepted field is a guarantee.
 *
 * Runtime values are shown as PLATFORM DEFAULTS, read-only. There are no columns
 * behind them, and rendering an editable box over a value nothing reads would
 * imply a control that does not exist.
 */

import { useCallback, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";

export interface StudioInterface {
  id: string;
  name: string;
  version: number;
  sapProduct: string;
  externalId: string;
  operation: "READ" | "CREATE" | "UPDATE";
  entitySet: string | null;
  mode: string;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  mappingVersion: number | null;
  hasRequestSchema: boolean;
  hasResponseSchema: boolean;
  solutionId: string;
  solutionName: string;
}

const STATUS_CHIP: Record<StudioInterface["status"], HonestStatus> = {
  ACTIVE: "ACTIVATED",
  DRAFT: "NOT_CHECKED",
  DEPRECATED: "NOT_PROBEABLE",
};

/** Platform defaults — described, not configured. See the file header. */
const RUNTIME_DEFAULTS = [
  ["Timeout", "10s (or the connection's override)"],
  ["Retry", "none — a failed read is reported, not retried behind your back"],
  ["Cache", "30s on live catalogue reads"],
  ["Quota", "shared live-SAP bucket, 20 requests/minute"],
] as const;

export function InterfacesClient({
  interfaces,
  canAuthor,
}: {
  interfaces: readonly StudioInterface[];
  canAuthor: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(interfaces[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = interfaces.find((i) => i.id === selectedId) ?? null;

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/interfaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "The change could not be saved.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (interfaces.length === 0) {
    return (
      <section style={card}>
        <h2 style={h2}>No interfaces yet</h2>
        <p style={body}>
          An interface records that a solution consumes one catalogue service, at one
          operation. Add one from Discover — open a capability and choose “Add to interface”.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(280px, 360px) 1fr", alignItems: "start" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
              <Th>Interface</Th>
              <Th>Op</Th>
              <Th>Ver</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map((i) => (
              <tr
                key={i.id}
                onClick={() => setSelectedId(i.id)}
                style={{
                  borderTop: "1px solid var(--border-default)",
                  cursor: "pointer",
                  background: i.id === selectedId ? "var(--brand-navy-soft)" : "transparent",
                }}
              >
                <Td>
                  <span style={{ fontWeight: 600 }}>{i.name}</span>
                  <span style={{ display: "block", ...muted }}>{i.solutionName}</span>
                </Td>
                <Td>{i.operation}</Td>
                <Td>v{i.version}</Td>
                <Td>
                  <StudioStatusChip status={STATUS_CHIP[i.status]} label={i.status.toLowerCase()} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <DetailCard title="Source">
            <Row label="Catalogue service" mono>{selected.externalId}</Row>
            <Row label="Product">{selected.sapProduct}</Row>
            <Row label="Entity set" mono>{selected.entitySet ?? "not set"}</Row>
            <Row label="Solution">{selected.solutionName}</Row>
          </DetailCard>

          <DetailCard title="Runtime">
            {RUNTIME_DEFAULTS.map(([k, v]) => (
              <Row key={k} label={k}>{v}</Row>
            ))}
            <p style={{ ...muted, marginTop: 8 }}>
              Platform defaults. These describe how the platform behaves; they are not
              per-interface settings in this version.
            </p>
          </DetailCard>

          <DetailCard title="Contract">
            <Row label="Operation">
              {selected.operation}
              {selected.mode === "WRITE" && (
                <span style={{ marginLeft: 8, color: "var(--status-awaiting-fg)", fontWeight: 600 }}>
                  ⚠ write — stronger review
                </span>
              )}
            </Row>
            <Row label="Version">v{selected.version}</Row>
            <Row label="Request schema">
              {selected.hasRequestSchema ? "captured" : "not captured yet"}
            </Row>
            <Row label="Response schema">
              {selected.hasResponseSchema ? "captured" : "not captured yet — run it in the Test Console"}
            </Row>
            <Row label="Errors">
              <code style={code}>{"{ code, message, correlationId }"}</code>
            </Row>
          </DetailCard>

          <DetailCard title="Governance">
            <Row label="Access">
              Decided separately in the API Access ledger. Defining an interface grants nothing.
            </Row>
            <Row label="Audit">Config changes are recorded. Per-call audit arrives with the runtime.</Row>
            <Row label="Status">{selected.status}</Row>
          </DetailCard>

          {/* Disabled by design — see the file header. No aria-disabled: nothing
              here is interactive, so the state is carried by the copy ("not in
              this version") rather than by an ARIA attribute that a region does
              not support and screen readers would ignore anyway. */}
          <section
            style={{
              ...card,
              opacity: 0.55,
              pointerEvents: "none",
              background: "var(--surface-ink-tint)",
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>
              Mapping <span style={{ ...muted, fontWeight: 500 }}>· not in this version</span>
            </h3>
            <p style={{ ...body, fontSize: 13 }}>
              Field-level mapping and transformation are a later phase. This interface passes
              the service&apos;s own shape through unchanged, and{" "}
              <code style={code}>mappingVersion</code> stays{" "}
              <strong>{selected.mappingVersion === null ? "null" : String(selected.mappingVersion)}</strong>.
            </p>
          </section>

          {canAuthor && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {selected.status !== "ACTIVE" && (
                <button type="button" disabled={busy} onClick={() => patch({ id: selected.id, status: "ACTIVE" })} style={btnPrimary}>
                  Mark ACTIVE
                </button>
              )}
              {selected.status !== "DEPRECATED" && (
                <button type="button" disabled={busy} onClick={() => patch({ id: selected.id, status: "DEPRECATED" })} style={btnSmall}>
                  Deprecate
                </button>
              )}
              {error && <span style={{ fontSize: 12, color: "var(--status-revoked-fg)" }}>{error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "4px 0", fontSize: 13, alignItems: "baseline" }}>
      <span style={{ width: 150, flexShrink: 0, color: "var(--ink-muted)" }}>{label}</span>
      <span style={{ color: "var(--ink-primary)", ...(mono ? { fontFamily: "var(--font-mono, monospace)", fontSize: 12 } : {}) }}>
        {children}
      </span>
    </div>
  );
}

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
const code: React.CSSProperties = { background: "var(--surface-ink-tint)", borderRadius: 4, padding: "1px 5px", fontSize: 12 };

const btnPrimary: React.CSSProperties = {
  height: 36, padding: "0 14px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--brand-navy)", color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  height: 36, padding: "0 14px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)", color: "var(--ink-primary)",
  border: "1px solid var(--border-strong)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
