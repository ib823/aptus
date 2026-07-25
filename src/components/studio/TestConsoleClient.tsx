"use client";

/**
 * Test Console + Scaffold.
 *
 * THE LAZY-READ RULE: nothing touches SAP until you press Run. Selecting an
 * interface, switching tabs, or opening this page fires no live call. Every read
 * goes through /entities and /preview, which sit in the tight live-SAP throttle —
 * a console that fanned out reads on render could quietly hammer a client's
 * production tenant just because someone left a tab open.
 *
 * Honest status is not re-implemented here. A 200 with zero rows renders as
 * "No records" — a successful read of something empty — and is visibly different
 * from 403 "not set up" and from a 5xx failure. Those three are different facts
 * and the console never blurs them.
 *
 * Scaffold produces DOWNLOADS. There is no in-browser editor: the solution's code
 * lives in the developer's own repository.
 */

import { useCallback, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";

export interface TestableInterface {
  id: string;
  name: string;
  externalId: string;
  sapProduct: string;
  entitySet: string | null;
  operation: string;
  solutionName: string;
}

interface RunState {
  phase: "idle" | "running" | "done";
  status?: HonestStatus;
  detail?: string;
  rows?: Record<string, unknown>[];
  entitySets?: string[];
  httpStatus?: number;
}

export function TestConsoleClient({
  interfaces,
  tenantKey,
  canSave,
}: {
  interfaces: readonly TestableInterface[];
  tenantKey: string | null;
  canSave: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(interfaces[0]?.id ?? null);
  const [entity, setEntity] = useState("");
  const [limit, setLimit] = useState(10);
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [files, setFiles] = useState<{ path: string; contents: string }[] | null>(null);

  const selected = interfaces.find((i) => i.id === selectedId) ?? null;

  /** The only place a live SAP read is triggered. */
  const doRun = useCallback(async () => {
    if (!selected || !tenantKey) return;
    setRun({ phase: "running" });
    setSaved(null);
    try {
      const common = `product=${encodeURIComponent(selected.sapProduct)}&tenant=${encodeURIComponent(tenantKey)}&service=${encodeURIComponent(selected.externalId)}`;

      // 1. Schema first — what does this service expose on this tenant?
      const schemaRes = await fetch(`/api/sap/tdd/entities?${common}`);
      const schemaJson = (await schemaRes.json()) as {
        data?: { entitySets?: { name: string }[] };
        error?: { message?: string };
      };

      if (schemaRes.status === 401 || schemaRes.status === 403) {
        setRun({
          phase: "done",
          status: "NEEDS_SETUP",
          httpStatus: schemaRes.status,
          detail: "The communication arrangement is not set up, or the credentials were rejected.",
        });
        return;
      }
      if (!schemaRes.ok) {
        setRun({
          phase: "done",
          status: "NOT_PROBEABLE",
          httpStatus: schemaRes.status,
          detail: schemaJson.error?.message ?? "The tenant could not be inspected.",
        });
        return;
      }

      const entitySets = (schemaJson.data?.entitySets ?? []).map((e) => e.name);
      const targetEntity = entity || selected.entitySet || entitySets[0] || "";
      if (!targetEntity) {
        setRun({
          phase: "done",
          status: "NOT_PROBEABLE",
          entitySets,
          detail: "This service exposes no entity set to read.",
        });
        return;
      }

      // 2. Rows — only now, and only for the chosen entity.
      const rowsRes = await fetch(
        `/api/sap/tdd/preview?${common}&entity=${encodeURIComponent(targetEntity)}&limit=${limit}`,
      );
      const rowsJson = (await rowsRes.json()) as {
        data?: { rows?: Record<string, unknown>[]; records?: Record<string, unknown>[] };
        error?: { message?: string };
      };

      if (rowsRes.status === 401 || rowsRes.status === 403) {
        setRun({
          phase: "done",
          status: "NEEDS_SETUP",
          entitySets,
          httpStatus: rowsRes.status,
          detail: "Reachable, but this entity is not released to the connected user.",
        });
        return;
      }
      if (!rowsRes.ok) {
        setRun({
          phase: "done",
          status: "NOT_PROBEABLE",
          entitySets,
          httpStatus: rowsRes.status,
          detail: rowsJson.error?.message ?? "The read failed.",
        });
        return;
      }

      const rows = rowsJson.data?.rows ?? rowsJson.data?.records ?? [];
      setRun({
        phase: "done",
        // A 200 with no rows is ACTIVATED — the service answered. It just has
        // nothing in it, which is data, not a fault.
        status: "ACTIVATED",
        entitySets,
        rows,
        httpStatus: 200,
        detail:
          rows.length === 0
            ? "No records. The service answered successfully and returned nothing — that is not an error."
            : `${rows.length} record${rows.length === 1 ? "" : "s"} returned.`,
      });
    } catch {
      setRun({ phase: "done", status: "NOT_PROBEABLE", detail: "The read could not be completed." });
    }
  }, [selected, tenantKey, entity, limit]);

  const saveCase = useCallback(async () => {
    if (!selected || run.phase !== "done") return;
    setSaving(true);
    try {
      const res = await fetch("/api/studio/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interfaceId: selected.id,
          name: `${selected.name} — ${entity || selected.entitySet || "default"} (${limit})`,
          request: { entity: entity || selected.entitySet, limit, tenant: tenantKey },
          // The outcome is what actually happened, never inferred.
          lastOutcome: run.status === "ACTIVATED" ? "PASS" : "FAIL",
        }),
      });
      const json = (await res.json()) as { data?: { name: string }; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Could not save.");
      setSaved(json.data.name);
    } catch (err) {
      setSaved(err instanceof Error ? `Failed: ${err.message}` : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [selected, run, entity, limit, tenantKey]);

  const loadScaffold = useCallback(async () => {
    if (!selected) return;
    setFiles(null);
    const res = await fetch(`/api/studio/interfaces/${selected.id}/scaffold`);
    const json = (await res.json()) as { data?: { files: { path: string; contents: string }[] } };
    if (json.data) setFiles(json.data.files);
  }, [selected]);

  function download(file: { path: string; contents: string }) {
    const blob = new Blob([file.contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (interfaces.length === 0) {
    return (
      <section style={card}>
        <h2 style={h2}>No interfaces to test</h2>
        <p style={body}>
          Add an interface from Discover first. The Test Console runs a real read against the
          connected tenant using that interface&apos;s configuration.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={card}>
        <h2 style={h2}>Run a read</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "block" }}>
            <span style={labelText}>Interface</span>
            <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} style={field}>
              {interfaces.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.solutionName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={labelText}>Entity set</span>
            <input
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder={selected?.entitySet ?? "first available"}
              style={{ ...field, width: 220 }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={labelText}>Rows</span>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 10)))}
              style={{ ...field, width: 90 }}
            />
          </label>
          <button
            type="button"
            onClick={() => void doRun()}
            disabled={run.phase === "running" || !tenantKey}
            style={btnPrimary}
            title={tenantKey ? "Run a live read" : "No SAP tenant is connected"}
          >
            {run.phase === "running" ? "Running…" : "Run"}
          </button>
        </div>
        {!tenantKey && (
          <p style={{ ...muted, marginTop: 10 }}>
            No SAP tenant is connected for this organization, so there is nothing to read.
          </p>
        )}
        <p style={{ ...muted, marginTop: 10 }}>
          Nothing is read until you press Run — and every read goes through the rate-limited
          live-SAP path.
        </p>
      </section>

      {run.phase === "done" && (
        <section style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h2 style={{ ...h2, margin: 0 }}>Result</h2>
            {run.status && <StudioStatusChip status={run.status} />}
            {run.httpStatus && <span style={muted}>HTTP {run.httpStatus}</span>}
          </div>
          <p style={body}>{run.detail}</p>

          {run.rows && run.rows.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
                    {Object.keys(run.rows[0] ?? {}).slice(0, 8).map((k) => (
                      <th key={k} style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {run.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border-default)" }}>
                      {Object.keys(run.rows![0] ?? {}).slice(0, 8).map((k) => (
                        <td key={k} style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {String(row[k] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {run.rows && run.rows.length === 0 && (
            <p style={{ ...muted, marginTop: 8 }}>
              This is an empty resource, not a failure. Your application should treat it as data.
            </p>
          )}

          {canSave && (
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => void saveCase()} disabled={saving} style={btnSmall}>
                {saving ? "Saving…" : "Save as test case"}
              </button>
              {saved && <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{saved}</span>}
            </div>
          )}
        </section>
      )}

      <section style={card}>
        <h2 style={h2}>Scaffold</h2>
        <p style={body}>
          Generate a typed contract and a starter client for this interface. This is the
          hand-off point: <strong>the solution&apos;s application code lives in your own
          repository</strong>, in whatever stack you use. There is no editor here, by design.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void loadScaffold()} disabled={!selected} style={btnPrimary}>
            Generate
          </button>
          {files?.map((f) => (
            <button key={f.path} type="button" onClick={() => download(f)} style={btnSmall}>
              ⭳ {f.path}
            </button>
          ))}
        </div>
        {files && (
          <p style={{ ...muted, marginTop: 10 }}>
            The OpenAPI document is the portable artifact — generate a client in any language
            from it with <code style={code}>openapi-generator</code>.
          </p>
        )}
      </section>
    </div>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

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

const labelText: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-secondary)",
};

const field: React.CSSProperties = {
  height: 40,
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 14,
  padding: "0 8px",
};

const btnPrimary: React.CSSProperties = {
  height: 40, padding: "0 16px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--brand-navy)", color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  height: 32, padding: "0 12px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)", color: "var(--brand-navy)",
  border: "1px solid var(--brand-navy)", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
