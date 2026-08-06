"use client";

/**
 * Test Console + Scaffold.
 *
 * RUNS THROUGH THE BROKER. Every run goes to /api/studio/test/broker-run, which
 * exercises the SAME pipeline the deployed application's call takes: the grant
 * gate, the environment + SAP-client connection binding, the same read function
 * against the BOUND connection, and a northbound audit row marked dryRun. A
 * green result here is evidence the runtime call will succeed; a refusal here
 * is the exact refusal the application would receive, and the card says so.
 * (The console used to call the env-tenant /entities and /preview routes — no
 * grant check, no binding, no audit — so a green console proved nothing and
 * could read a DIFFERENT system than the one the app would reach.)
 *
 * THE LAZY-READ RULE: nothing touches SAP until you press Run. Selecting an
 * interface, switching tabs, or opening this page fires no live call.
 *
 * Honest status is not re-implemented here. A 200 with zero rows renders as
 * "No records" — a successful read of something empty — and is visibly different
 * from 403 "not set up" and from a 5xx failure. Those three are different facts
 * and the console never blurs them. A GOVERNANCE refusal renders no status chip
 * at all: the chip vocabulary describes the tenant's capability, and a refusal
 * that never reached the tenant has no tenant fact to report.
 *
 * Scaffold produces DOWNLOADS. There is no in-browser editor: the solution's code
 * lives in the developer's own repository.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { StudioStatusChip } from "@/components/studio/StudioStatusChip";
import { type HonestStatus } from "@/lib/studio/honest-status";

/** A saved run, as the test-cases API returns it. */
interface SavedCase {
  id: string;
  name: string;
  interfaceId: string;
  request: { entity?: string; limit?: number } | null;
  lastOutcome: "PASS" | "FAIL" | "NOT_RUN";
  httpStatus: number | null;
  lastRunAt: string | null;
}

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
  /**
   * Absent when no read reached the tenant — including every governance
   * refusal. The chip is rendered only when this is set, because the
   * vocabulary describes the tenant's capability and nothing else may borrow it.
   */
  status?: HonestStatus | undefined;
  detail?: string;
  rows?: Record<string, unknown>[];
  entitySets?: string[];
  httpStatus?: number | undefined;
  /** A governance refusal — the same one the deployed app would receive. */
  refusal?: { kind: string; message: string } | undefined;
  /** Which connection the binding chose — the fact the old console lacked. */
  boundTo?:
    | {
        label: string;
        environment: string | null;
        sapClient: string | null;
        bindingUnverified: boolean;
      }
    | undefined;
  /** The interface is still DRAFT; served, and said. */
  draft?: boolean;
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
  const [capturing, setCapturing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [files, setFiles] = useState<{ path: string; contents: string }[] | null>(null);

  const selected = interfaces.find((i) => i.id === selectedId) ?? null;

  /*
   * SAVED CASES, FINALLY READABLE. "Save as test case" confirmed "Saved" and no
   * screen in the product ever listed, replayed or deleted one — a write-only
   * record, the same dead-end shape the registration flow was cured of. This is
   * a DB read, not a tenant read, so loading it on mount does not violate the
   * lazy-read rule; replay goes through the same broker dry-run as Run.
   */
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [caseBusy, setCaseBusy] = useState<string | null>(null);
  const [caseResult, setCaseResult] = useState<Record<string, string>>({});

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/test-cases");
      const json = (await res.json()) as { data?: { cases?: SavedCase[]; testCases?: SavedCase[] } };
      setCases(json.data?.cases ?? json.data?.testCases ?? []);
    } catch {
      /* the panel simply stays empty; saving still works */
    }
  }, []);
  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const replayCase = useCallback(
    async (c: SavedCase) => {
      setCaseBusy(c.id);
      try {
        const res = await fetch("/api/studio/test/broker-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interfaceId: c.interfaceId,
            ...(c.request?.entity ? { entity: c.request.entity } : {}),
            limit: Math.min(c.request?.limit ?? 10, 50),
          }),
        });
        const json = (await res.json()) as {
          data?: { outcome: string; status?: string; httpStatus?: number; refusal?: { message: string } };
          error?: { message?: string };
        };
        const d = json.data;
        setCaseResult((m) => ({
          ...m,
          [c.id]: !res.ok || !d
            ? json.error?.message ?? "replay failed"
            : d.outcome === "refused"
              ? `refused — ${d.refusal?.message ?? ""}`
              : `${d.status} · HTTP ${d.httpStatus}`,
        }));
      } catch {
        setCaseResult((m) => ({ ...m, [c.id]: "replay failed" }));
      } finally {
        setCaseBusy(null);
      }
    },
    [],
  );

  const deleteCase = useCallback(
    async (id: string) => {
      setCaseBusy(id);
      try {
        const res = await fetch("/api/studio/test-cases", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (res.ok) setCases((cs) => cs.filter((c) => c.id !== id));
      } finally {
        setCaseBusy(null);
      }
    },
    [],
  );

  /*
   * Entity sets this tenant actually exposed on the last run, unioned with the
   * one the Interfaces record declares. Read from `run` so the dropdown gets
   * richer after a probe without another request.
   */
  const knownEntitySets = useMemo(() => {
    const names = new Set<string>();
    if (selected?.entitySet) names.add(selected.entitySet);
    for (const n of run?.entitySets ?? []) names.add(n);
    return [...names].sort();
  }, [selected?.entitySet, run?.entitySets]);


  /** The only place a live SAP read is triggered — through the broker pipeline. */
  const doRun = useCallback(async () => {
    if (!selected) return;
    setRun({ phase: "running" });
    setSaved(null);
    try {
      const res = await fetch("/api/studio/test/broker-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interfaceId: selected.id,
          ...(entity ? { entity } : {}),
          limit: Math.min(limit, 50),
        }),
      });
      const json = (await res.json()) as {
        data?:
          | { outcome: "refused"; refusal: { kind: string; message: string } }
          | {
              outcome: "ran";
              status: "OK" | "EMPTY" | "NEEDS_SETUP" | "NOT_FOUND" | "TIMEOUT" | "ERROR";
              httpStatus: number;
              records: Record<string, unknown>[];
              note: string;
              draft: boolean;
              boundTo: {
                label: string;
                environment: string | null;
                sapClient: string | null;
                bindingUnverified: boolean;
              };
            };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        setRun({
          phase: "done",
          detail: json.error?.message ?? `The run could not be started (HTTP ${res.status}).`,
        });
        return;
      }
      if (json.data.outcome === "refused") {
        // A governance refusal, verbatim. No status chip: nothing reached the
        // tenant, so there is no tenant fact to report — the refusal IS the
        // result, and it is the same one the deployed application would get.
        setRun({ phase: "done", refusal: json.data.refusal, detail: json.data.refusal.message });
        return;
      }
      const d = json.data;
      // The broker's read statuses ARE tenant facts, mapped to the shared
      // honest-status vocabulary the chip owns.
      const status: HonestStatus =
        d.status === "OK" || d.status === "EMPTY"
          ? "ACTIVATED"
          : d.status === "NEEDS_SETUP"
            ? "NEEDS_SETUP"
            : d.status === "NOT_FOUND"
              ? "NOT_FOUND"
              : "NOT_PROBEABLE";
      setRun({
        phase: "done",
        status,
        rows: d.records,
        httpStatus: d.httpStatus,
        detail: d.note,
        draft: d.draft,
        boundTo: d.boundTo,
      });
    } catch {
      setRun({ phase: "done", detail: "The run could not be completed." });
    }
  }, [selected, entity, limit]);

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
          // The outcome is what actually happened, never inferred — and the
          // status it happened against travels with it, so a stored PASS can be
          // checked rather than trusted.
          lastOutcome: run.status === "ACTIVATED" ? "PASS" : "FAIL",
          ...(run.httpStatus === undefined ? {} : { httpStatus: run.httpStatus }),
        }),
      });
      const json = (await res.json()) as { data?: { name: string }; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Could not save.");
      setSaved(json.data.name);
      void loadCases();
    } catch (err) {
      setSaved(err instanceof Error ? `Failed: ${err.message}` : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [selected, run, entity, limit, tenantKey, loadCases]);

  /**
   * Turn the rows we just saw into a described contract.
   *
   * Sends the sample so the server can infer a SHAPE; the rows themselves are
   * not stored. Costs no extra SAP call — the read already happened.
   */
  const captureSchema = useCallback(async () => {
    if (!selected || !run.rows || run.rows.length === 0) return;
    setCapturing(true);
    try {
      const res = await fetch(`/api/studio/interfaces/${selected.id}/capture-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: run.rows.slice(0, 100) }),
      });
      const json = (await res.json()) as {
        data?: { fields: number; required: number; sampleSize: number };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Could not capture the schema.");
      setSaved(
        `Captured ${json.data.fields} field${json.data.fields === 1 ? "" : "s"} ` +
          `(${json.data.required} always present) from ${json.data.sampleSize} rows. ` +
          "Regenerate the scaffold for a precise contract.",
      );
    } catch (err) {
      setSaved(err instanceof Error ? `Failed: ${err.message}` : "Failed to capture the schema.");
    } finally {
      setCapturing(false);
    }
  }, [selected, run]);

  /**
   * Record this outcome so it can be replayed offline.
   *
   * Works for failures too: "not set up" and "upstream failed" are the states
   * that actually break integrations, so they are the ones worth being able to
   * test against.
   */
  const captureFixture = useCallback(async () => {
    if (!selected || run.phase !== "done" || !run.status) return;
    setCapturing(true);
    try {
      const res = await fetch(`/api/studio/interfaces/${selected.id}/capture-fixture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The tenant's status travels with the capture. Without it a fixture
        // cannot say where it came from, and a genuine empty read is
        // indistinguishable from one recorded while this console was wrong.
        body: JSON.stringify({
          honestStatus: run.status,
          sourceStatus: run.httpStatus,
          rows: run.rows ?? [],
        }),
      });
      const json = (await res.json()) as {
        data?: { scenario: string; rows: number; replaced: boolean };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Could not capture the fixture.");
      setSaved(
        `${json.data.replaced ? "Replaced" : "Captured"} the "${json.data.scenario}" fixture` +
          `${json.data.rows > 0 ? ` (${json.data.rows} rows)` : ""}. ` +
          "Regenerate the scaffold to ship it with the offline mock.",
      );
    } catch (err) {
      setSaved(err instanceof Error ? `Failed: ${err.message}` : "Failed to capture the fixture.");
    } finally {
      setCapturing(false);
    }
  }, [selected, run]);

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
            {/*
              A SELECT, not free text.

              This value is concatenated into an OData path aimed at a real
              client tenant, and the Interfaces record declares the valid name
              (`A_BankDetail`) — accepting arbitrary typing offered nothing
              except a way to send malformed paths upstream. The broker run
              does not enumerate $metadata (that was the ungoverned /entities
              route), so the declared entity set is the offer; the server
              validates regardless — this is the affordance, not the control.
            */}
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              style={{ ...field, width: 220 }}
              disabled={!selected}
            >
              <option value="">
                {selected?.entitySet ? `${selected.entitySet} (declared)` : "First available"}
              </option>
              {knownEntitySets
                .filter((name) => name !== selected?.entitySet)
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
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
            disabled={run.phase === "running" || !selected}
            style={btnPrimary}
            title="Run through the broker — the same pipeline the deployed app uses"
          >
            {run.phase === "running" ? "Running…" : "Run"}
          </button>
        </div>
        <p style={{ ...muted, marginTop: 10 }}>
          Nothing is read until you press Run. The run goes through the broker: the same
          grant check, the same environment binding, the same connection the deployed
          application would reach — and it is recorded in the northbound trail as a dry run.
        </p>
      </section>

      {run.phase === "done" && (
        <section style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h2 style={{ ...h2, margin: 0 }}>{run.refusal ? "Refused by governance" : "Result"}</h2>
            {run.status && <StudioStatusChip status={run.status} />}
            {run.httpStatus && <span style={muted}>HTTP {run.httpStatus}</span>}
            {run.draft && (
              <span style={{ ...muted, color: "var(--status-awaiting-fg)" }} title="Served with x-coreedge-interface-status: DRAFT">
                draft interface
              </span>
            )}
          </div>
          <p style={body}>{run.detail}</p>
          {/* WHICH system answered — the binding's own facts, so a green run is
              evidence about the connection the app will actually reach. */}
          {run.boundTo && (
            <p style={{ ...muted, marginTop: 6 }}>
              Bound to <strong>{run.boundTo.label}</strong>
              {run.boundTo.environment ? ` · ${run.boundTo.environment}` : ""}
              {run.boundTo.sapClient ? `/${run.boundTo.sapClient}` : ""}
              {run.boundTo.bindingUnverified
                ? " · binding unverified (the connection has not declared its environment)"
                : ""}
            </p>
          )}

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

          {/* ONLY ON A REAL SUCCESS. This line was keyed on `rows.length === 0`
              alone, which is true of every failure too — a refusal returns no
              rows either. So a tenant answering 403 rendered "Needs setup · HTTP
              403" and then, thirty pixels below, told the developer to treat the
              refusal as data.

              That is the same false sentence the honest-status fix was raised
              for, surviving in the same card because only the badge, the status
              and the detail were made outcome-aware. The condition has to read
              the OUTCOME, not the row count: emptiness is a property of a
              successful read, and nothing else may claim it. */}
          {run.status === "ACTIVATED" && run.rows && run.rows.length === 0 && (
            <p style={{ ...muted, marginTop: 8 }}>
              This is an empty resource, not a failure. Your application should treat it as data.
            </p>
          )}

          {canSave && (
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => void saveCase()} disabled={saving} style={btnSmall}>
                {saving ? "Saving…" : "Save as test case"}
              </button>
              {/* Only offered when there are rows to learn from — capturing an
                  empty result would teach the contract nothing. */}
              {run.rows && run.rows.length > 0 && (
                <button type="button" onClick={() => void captureSchema()} disabled={capturing} style={btnSmall}>
                  {capturing ? "Capturing…" : "Capture schema"}
                </button>
              )}
              {/* Offered for EVERY honest outcome, including the failures — a
                  mock that can only serve the happy path lets a test suite prove
                  the easy half. */}
              <button type="button" onClick={() => void captureFixture()} disabled={capturing} style={btnSmall}>
                {capturing ? "Capturing…" : "Capture fixture"}
              </button>
              {saved && <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{saved}</span>}
            </div>
          )}
        </section>
      )}

      {cases.length > 0 && (
        <section style={card}>
          <h2 style={h2}>Saved test cases</h2>
          <p style={body}>
            Replays run through the broker — the same grant, binding and connection a fresh
            Run uses — so a case that passed last month can be checked against today.
          </p>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
            {cases.map((c) => (
              <li
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--border-default)" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                <span style={muted}>
                  last: {c.lastOutcome}
                  {c.httpStatus ? ` · HTTP ${c.httpStatus}` : ""}
                  {c.lastRunAt ? ` · ${new Date(c.lastRunAt).toLocaleDateString()}` : ""}
                </span>
                {caseResult[c.id] && (
                  <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>now: {caseResult[c.id]}</span>
                )}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button type="button" style={btnSmall} disabled={caseBusy === c.id} onClick={() => void replayCase(c)}>
                    {caseBusy === c.id ? "…" : "Replay"}
                  </button>
                  {canSave && (
                    <button type="button" style={btnSmall} disabled={caseBusy === c.id} onClick={() => void deleteCase(c.id)}>
                      Delete
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
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
