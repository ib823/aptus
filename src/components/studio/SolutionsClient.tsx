"use client";

/**
 * Solutions + Canvas.
 *
 * The list is passport cards; selecting one opens the Canvas — four tabs that
 * separate what a solution IS (Business), what it DOES (Functional), how it is
 * RUN (Operating) and how it is PACKAGED (Commercial).
 *
 * `repoUrl` sits under Operating, not Commercial. The approved mock put it under
 * Commercial; the reconciliation corrected it, and it is the right call — where
 * the source lives is an operational fact about running the thing, not a
 * commercial one.
 *
 * The ownership gate is enforced on the server. This UI mirrors it (disabled
 * promote, named missing roles) so the rule is legible before it is hit — but the
 * server is what actually holds the line.
 */

import { useCallback, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";
import { missingOwners, type SolutionStatus } from "@/lib/studio/solutions";

export interface StudioSolution {
  id: string;
  name: string;
  slug: string;
  classification: string;
  businessProblem: string;
  status: SolutionStatus;
  dataClass: string;
  technicalOwnerId: string | null;
  businessOwnerId: string | null;
  supportOwnerId: string | null;
  repoUrl: string | null;
  packagingNote: string | null;
  reuseIntent: string | null;
  interfaceCount: number;
  grantCount: number;
}

const STATUS_CHIP: Record<SolutionStatus, HonestStatus> = {
  ACTIVE: "ACTIVATED",
  DRAFT: "NOT_CHECKED",
  RESTRICTED: "NEEDS_SETUP",
  RETIRED: "NOT_PROBEABLE",
};

const STATUS_LABEL: Record<SolutionStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  RESTRICTED: "Restricted",
  RETIRED: "Retired",
};

const TABS = ["Business", "Functional", "Operating", "Commercial"] as const;
type Tab = (typeof TABS)[number];

export function SolutionsClient({
  solutions,
  canAuthor,
  currentUserId,
}: {
  solutions: readonly StudioSolution[];
  canAuthor: boolean;
  currentUserId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(solutions[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("Business");
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const selected = solutions.find((s) => s.id === selectedId) ?? null;

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/studio/solutions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data?: { autoDropped?: boolean; autoDropReason?: string };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? "The change could not be saved.");
      if (json.data?.autoDropped) {
        setMessage({ kind: "info", text: json.data.autoDropReason ?? "Moved to RESTRICTED." });
        // Let the operator read why before the list refreshes under them.
        setTimeout(() => window.location.reload(), 2500);
        return;
      }
      window.location.reload();
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "The change could not be saved.",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  if (solutions.length === 0) {
    return (
      <section style={card}>
        <h2 style={h2}>Register your first solution</h2>
        <p style={body}>
          A solution is the passport for something you are building: the business problem it
          solves, who is accountable for it, and which SAP capabilities it may consume.
          Nothing is governed until a solution exists.
        </p>
        {canAuthor ? (
          <RegisterSolutionForm />
        ) : (
          <p style={{ ...muted, marginTop: 12 }}>
            Your role can view Studio; registering a solution is a builder action.
          </p>
        )}
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(260px, 340px) 1fr", alignItems: "start" }}>
      {/* passport cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {canAuthor && (
          <>
            <button type="button" style={btnSmall} onClick={() => setRegistering((r) => !r)}>
              {registering ? "Cancel" : "+ Register a solution"}
            </button>
            {registering && (
              <section style={{ ...card, padding: 16 }}>
                <RegisterSolutionForm />
              </section>
            )}
          </>
        )}
        {solutions.map((s) => {
          const active = s.id === selectedId;
          const missing = missingOwners(s);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              style={{
                ...card,
                textAlign: "left",
                cursor: "pointer",
                borderColor: active ? "var(--brand-navy)" : "var(--border-default)",
                borderWidth: active ? 2 : 1,
                padding: 16,
              }}
              aria-current={active ? "true" : undefined}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                <StudioStatusChip status={STATUS_CHIP[s.status]} label={STATUS_LABEL[s.status]} />
              </div>
              <div style={{ ...muted, marginTop: 4 }}>{s.classification.replace(/_/g, " ").toLowerCase()}</div>
              <div style={{ ...muted, marginTop: 6 }}>
                {s.interfaceCount} interface{s.interfaceCount === 1 ? "" : "s"} · {s.grantCount} grant
                {s.grantCount === 1 ? "" : "s"} · {s.dataClass}
              </div>
              {missing.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--status-awaiting-fg)" }}>
                  Missing: {missing.join(", ")}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* canvas */}
      {selected && (
        <section style={{ ...card, padding: 0 }}>
          <div style={{ display: "flex", gap: 4, padding: "12px 16px 0", borderBottom: "1px solid var(--border-default)" }} role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  borderBottom: tab === t ? "2px solid var(--brand-navy)" : "2px solid transparent",
                  color: tab === t ? "var(--brand-navy)" : "var(--ink-secondary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ padding: 20 }}>
            {tab === "Business" && (
              <>
                <Field label="Business problem">{selected.businessProblem}</Field>
                <Field label="Classification">{selected.classification.replace(/_/g, " ")}</Field>
                <Field label="Data class">{selected.dataClass}</Field>
              </>
            )}

            {tab === "Functional" && (
              <>
                <Field label="Interfaces">
                  {selected.interfaceCount === 0
                    ? "None yet — add one from Discover."
                    : `${selected.interfaceCount} governed interface${selected.interfaceCount === 1 ? "" : "s"}`}
                </Field>
                <Field label="Access grants">
                  {selected.grantCount === 0
                    ? "None yet — request access from the API Access screen."
                    : `${selected.grantCount} request${selected.grantCount === 1 ? "" : "s"} in the ledger`}
                </Field>
              </>
            )}

            {tab === "Operating" && (
              <>
                <Field label="Repository">
                  {selected.repoUrl ? (
                    <a href={selected.repoUrl} rel="noreferrer noopener" target="_blank">
                      {selected.repoUrl}
                    </a>
                  ) : (
                    "Not set. The solution's application code lives in your own repository — Studio governs the integration, not the code."
                  )}
                </Field>
                <OwnershipEditor
                  solution={selected}
                  canAuthor={canAuthor}
                  busy={busy}
                  currentUserId={currentUserId}
                  onSave={patch}
                />
              </>
            )}

            {tab === "Commercial" && (
              <>
                <Field label="Packaging">{selected.packagingNote ?? "Not recorded."}</Field>
                <Field label="Reuse intent">{selected.reuseIntent ?? "Not recorded."}</Field>
              </>
            )}

            {message && (
              <p
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  color: message.kind === "error" ? "var(--status-revoked-fg)" : "var(--status-awaiting-fg)",
                }}
              >
                {message.text}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Ownership + promotion. The promote button is disabled and the missing roles
 * are NAMED, so the gate is understood before it is met — but the server is what
 * enforces it.
 */
function OwnershipEditor({
  solution,
  canAuthor,
  busy,
  currentUserId,
  onSave,
}: {
  solution: StudioSolution;
  canAuthor: boolean;
  busy: boolean;
  currentUserId: string;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const missing = missingOwners(solution);
  const complete = missing.length === 0;

  const claim = (field: "technicalOwnerId" | "businessOwnerId" | "supportOwnerId") =>
    onSave({ id: solution.id, [field]: currentUserId });

  const release = (field: "technicalOwnerId" | "businessOwnerId" | "supportOwnerId") =>
    onSave({ id: solution.id, [field]: null });

  return (
    <div style={{ marginTop: 8 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Accountability</h3>
      {(
        [
          ["technicalOwnerId", "Technical owner", solution.technicalOwnerId],
          ["businessOwnerId", "Business owner", solution.businessOwnerId],
          ["supportOwnerId", "Support owner", solution.supportOwnerId],
        ] as const
      ).map(([field, label, value]) => (
        <div key={field} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
          <span style={{ width: 140, color: "var(--ink-secondary)" }}>{label}</span>
          <span style={{ flex: 1, fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
            {value ?? "— unassigned"}
          </span>
          {canAuthor && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (value ? release(field) : claim(field))}
              style={btnSmall}
            >
              {value ? "Clear" : "Claim"}
            </button>
          )}
        </div>
      ))}

      {canAuthor && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy || !complete || solution.status === "ACTIVE"}
            onClick={() => onSave({ id: solution.id, status: "ACTIVE" })}
            title={complete ? "Promote to ACTIVE" : `Missing: ${missing.join(", ")}`}
            style={{ ...btnPrimary, opacity: !complete || solution.status === "ACTIVE" ? 0.5 : 1 }}
          >
            {solution.status === "ACTIVE" ? "Active" : "Promote to ACTIVE"}
          </button>
          {!complete && (
            <span style={{ fontSize: 12, color: "var(--status-awaiting-fg)" }}>
              A solution cannot be ACTIVE without all three owners. Missing: {missing.join(", ")}.
            </span>
          )}
          {complete && solution.status === "ACTIVE" && (
            <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
              Clearing an owner will move this solution to RESTRICTED.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, lineHeight: "22px", color: "var(--ink-primary)" }}>{children}</div>
    </div>
  );
}

/**
 * Register a solution.
 *
 * This form did not exist. The console told you "register one first" — from the
 * Solutions empty state AND from Discover's "Add to interface" dialog — while
 * offering no way to do it, so the only route in was a hand-rolled POST. A
 * product that names the next step and then withholds it is worse than one that
 * never mentioned it.
 *
 * The constraints below mirror the server's zod schema exactly (name 2–120,
 * businessProblem 10–2000, dataClass 1–80). Mirrored, not trusted: the server
 * validates independently. The point is to fail in the field rather than after a
 * round trip.
 */
function RegisterSolutionForm() {
  const [name, setName] = useState("");
  const [classification, setClassification] = useState<string>("CLIENT_APP");
  const [businessProblem, setBusinessProblem] = useState("");
  const [dataClass, setDataClass] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the server. Reported as you type so the disabled button is never a
  // mystery — a form that refuses to submit without saying why is its own bug.
  const problems: string[] = [];
  if (name.trim().length < 2) problems.push("a name of at least 2 characters");
  if (businessProblem.trim().length < 10) problems.push("a business problem of at least 10 characters");
  if (dataClass.trim().length < 1) problems.push("a data class");

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/solutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          classification,
          businessProblem: businessProblem.trim(),
          dataClass: dataClass.trim(),
          // Omitted rather than sent empty: the server validates repoUrl as a
          // URL, and "" is not one.
          ...(repoUrl.trim() ? { repoUrl: repoUrl.trim() } : {}),
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "The solution could not be registered.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The solution could not be registered.");
      setBusy(false);
    }
  }, [name, classification, businessProblem, dataClass, repoUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      <label style={fieldLabel}>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Delivery tracker"
          style={input}
        />
      </label>

      <label style={fieldLabel}>
        Classification
        <select
          value={classification}
          onChange={(e) => setClassification(e.target.value)}
          style={input}
        >
          {SOLUTION_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      <label style={fieldLabel}>
        Business problem
        <textarea
          value={businessProblem}
          onChange={(e) => setBusinessProblem(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Ops has no live view of outbound deliveries running late."
          style={{ ...input, height: "auto", padding: 8, resize: "vertical" }}
        />
      </label>

      <label style={fieldLabel}>
        Data class
        <input
          value={dataClass}
          onChange={(e) => setDataClass(e.target.value)}
          maxLength={80}
          placeholder="client-operational"
          style={input}
        />
        <span style={muted}>
          What kind of data this handles — it travels with the solution into every access
          decision made about it.
        </span>
      </label>

      <label style={fieldLabel}>
        Repository URL <span style={muted}>(optional)</span>
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          maxLength={500}
          placeholder="https://github.com/..."
          style={input}
        />
      </label>

      {error && (
        <p style={{ ...body, color: "var(--status-error, #8E2A26)" }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || problems.length > 0}
          style={{ ...btnPrimary, opacity: busy || problems.length > 0 ? 0.5 : 1 }}
        >
          {busy ? "Registering…" : "Register solution"}
        </button>
        {problems.length > 0 && <span style={muted}>Still needs {problems.join(", ")}.</span>}
      </div>

      <p style={muted}>
        Registers as <strong>DRAFT</strong>. It records what you are building — it grants no
        access to anything. Access is requested and decided separately.
      </p>
    </div>
  );
}

/** Mirrors the server's KINDS enum, with the labels a human would use. */
const SOLUTION_KINDS = [
  { value: "CLIENT_APP", label: "Client app — built for a specific client" },
  { value: "INTERNAL_ACCELERATOR", label: "Internal accelerator — reused across engagements" },
  { value: "PRESALES_DEMO", label: "Presales demo — used to win work" },
  { value: "REUSABLE", label: "Reusable component — a building block" },
  { value: "EXPERIMENT", label: "Experiment — exploratory, may be discarded" },
] as const;

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ink-primary)",
};

const input: React.CSSProperties = {
  height: 34,
  padding: "0 8px",
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 13,
  fontWeight: 400,
  width: "100%",
  boxSizing: "border-box",
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
  border: "1px solid var(--border-strong)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: "var(--radius-input, 8px)",
  background: "var(--brand-navy)",
  color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
