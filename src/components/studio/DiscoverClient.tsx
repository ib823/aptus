"use client";

/**
 * Discover — the capability explorer, in Studio.
 *
 * The catalogue itself is REUSED wholesale (`SapCapabilityCatalogue`), which is
 * why honest status, the readiness scorecard, the content-type tiles, the lazy
 * per-row detail and the data-confirm badge all behave identically to the SAP
 * Operations surface. Forking it would mean forking honest-status, and two
 * implementations of "is this activated?" is exactly one too many.
 *
 * Studio adds two things on top: the business-domain lens, and the ability to
 * turn a discovered service into a governed Interface draft.
 *
 * "Add to interface" creates a DRAFT and nothing more. It grants no access —
 * access is decided separately through an ApiAccessGrant, and nothing is callable
 * at runtime in v1 at all. The dialog says so, because a developer who believes
 * this button granted them production access is a developer about to be surprised.
 */

import { useCallback, useState } from "react";

import {
  SapCapabilityCatalogue,
  type CatalogueSelection,
} from "@/components/sap/SapCapabilityCatalogue";

export interface DiscoverSolutionOption {
  id: string;
  name: string;
}

type SubmitState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "done"; name: string };

export function DiscoverClient({
  solutions,
  canAuthor,
  tenant,
  product,
}: {
  solutions: readonly DiscoverSolutionOption[];
  canAuthor: boolean;
  /** The tenant the switcher selected. Null when none is configured anywhere. */
  tenant: string | null;
  /** That tenant's product. Was hardcoded to "s4hana" regardless of selection. */
  product: string;
}) {
  const [selection, setSelection] = useState<CatalogueSelection | null>(null);
  const [solutionId, setSolutionId] = useState<string>(solutions[0]?.id ?? "");
  const [operation, setOperation] = useState<"READ" | "CREATE" | "UPDATE">("READ");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const close = useCallback(() => {
    setSelection(null);
    setState({ kind: "idle" });
  }, []);

  const submit = useCallback(async () => {
    if (!selection || !solutionId) return;
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/studio/interfaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solutionId,
          externalId: selection.externalId,
          sapProduct: selection.product,
          name: selection.title,
          operation,
        }),
      });
      const json = (await res.json()) as { data?: { name: string }; error?: { message?: string } };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? "Could not create the interface draft.");
      }
      setState({ kind: "done", name: json.data.name });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }, [selection, solutionId, operation]);

  return (
    <>
      <SapCapabilityCatalogue
        product={product}
        domainLens
        {...(tenant ? { tenant } : {})}
        {...(canAuthor ? { onAddToInterface: (s: CatalogueSelection) => setSelection(s) } : {})}
      />

      {selection && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-to-interface-title"
          style={overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div style={dialog}>
            <h2 id="add-to-interface-title" style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
              Add to interface
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
              Creates a <strong>DRAFT</strong> interface for{" "}
              <code style={code}>{selection.externalId}</code>. This records intent only — it
              grants no access. Access is requested and decided separately.
            </p>

            {solutions.length === 0 ? (
              <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
                You have no solutions yet. An interface belongs to a solution, so register one
                first — a solution records what you are building and who owns it.
              </p>
            ) : state.kind === "done" ? (
              <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--status-signed-fg)" }}>
                Draft interface “{state.name}” created.
              </p>
            ) : (
              <>
                <label htmlFor="ati-solution" style={label}>
                  Solution
                </label>
                <select
                  id="ati-solution"
                  value={solutionId}
                  onChange={(e) => setSolutionId(e.target.value)}
                  style={field}
                >
                  {solutions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <label htmlFor="ati-operation" style={{ ...label, marginTop: 12 }}>
                  Operation
                </label>
                <select
                  id="ati-operation"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as "READ" | "CREATE" | "UPDATE")}
                  style={field}
                >
                  <option value="READ">READ</option>
                  <option value="CREATE">CREATE — write, stronger review</option>
                  <option value="UPDATE">UPDATE — write, stronger review</option>
                </select>
              </>
            )}

            {state.kind === "error" && (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--status-revoked-fg)" }}>
                {state.message}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button type="button" onClick={close} style={btnSecondary}>
                {state.kind === "done" ? "Close" : "Cancel"}
              </button>
              {solutions.length > 0 && state.kind !== "done" && (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={state.kind === "saving" || !solutionId}
                  style={{ ...btnPrimary, opacity: state.kind === "saving" ? 0.6 : 1 }}
                >
                  {state.kind === "saving" ? "Creating…" : "Create draft"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};

const dialog: React.CSSProperties = {
  width: 520,
  maxWidth: "100%",
  background: "var(--surface-paper)",
  borderRadius: "var(--radius-card-warm, 12px)",
  boxShadow: "0 16px 40px rgba(0,0,0,.12)",
  padding: 20,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-secondary)",
};

const field: React.CSSProperties = {
  width: "100%",
  height: 40,
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 14,
  padding: "0 8px",
};

const code: React.CSSProperties = {
  background: "var(--surface-ink-tint)",
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: 12,
};

const btnBase: React.CSSProperties = {
  height: 40,
  padding: "0 16px",
  borderRadius: "var(--radius-input, 8px)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  border: "1px solid var(--border-strong)",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "var(--brand-navy)",
  color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)",
};
