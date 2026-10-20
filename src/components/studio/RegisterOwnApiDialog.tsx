"use client";

/**
 * Register your own API — an interface for a service the customer built.
 *
 * Discover lists what SAP publishes. A Z* RAP service, a YY1_* custom CDS view,
 * an ECC Gateway service or SuccessFactors' /odata/v2 with custom MDF objects is
 * never there, so this is the way in: the developer names the service by its
 * path on the connection's host, and its OData version.
 *
 * The path is validated as it is typed, with the same function the API
 * enforces with (service-path.ts), so the sentence the developer sees is the
 * one the server would answer. Like "Add to interface", this creates a DRAFT
 * and grants nothing; Verify (on the interface) is the next step.
 */

import { useCallback, useId, useMemo, useState } from "react";

import {
  inferODataVersion,
  validateServicePath,
  type ODataVersion,
} from "@/lib/sap-public/service-path";

export interface RegisterSolutionOption {
  id: string;
  name: string;
}

export interface RegisterProductOption {
  key: string;
  label: string;
  addressesClient: boolean;
}

type SubmitState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

export function RegisterOwnApiDialog({
  solutions,
  products,
  onClose,
  onCreated,
}: {
  solutions: readonly RegisterSolutionOption[];
  /** OData products only — Ariba has no service path. */
  products: readonly RegisterProductOption[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const ids = useId();
  const [solutionId, setSolutionId] = useState(solutions[0]?.id ?? "");
  const [name, setName] = useState("");
  const [product, setProduct] = useState(products[0]?.key ?? "");
  const [servicePath, setServicePath] = useState("");
  const [version, setVersion] = useState<ODataVersion>("V2");
  const [versionTouched, setVersionTouched] = useState(false);
  const [operation, setOperation] = useState<"READ" | "CREATE" | "UPDATE">("READ");
  const [entitySet, setEntitySet] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const trimmedPath = servicePath.trim();
  const pathCheck = useMemo(() => validateServicePath(trimmedPath), [trimmedPath]);
  const pathError = trimmedPath.length > 0 && !pathCheck.ok ? pathCheck.message : null;
  const selectedProduct = products.find((p) => p.key === product) ?? null;

  const onPathChange = (next: string) => {
    setServicePath(next);
    // The version follows the path (…/odata4/… is V4) until the developer
    // chooses it themselves; after that their choice stands.
    if (!versionTouched) setVersion(inferODataVersion(next.trim()));
  };

  const canSubmit =
    state.kind !== "saving" &&
    solutionId !== "" &&
    name.trim() !== "" &&
    product !== "" &&
    pathCheck.ok;

  const submit = useCallback(async () => {
    if (!pathCheck.ok) return;
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/studio/interfaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solutionId,
          sapProduct: product,
          name: name.trim(),
          servicePath: trimmedPath,
          odataVersion: version,
          operation,
          ...(entitySet.trim() ? { entitySet: entitySet.trim() } : {}),
        }),
      });
      const json = (await res.json()) as { data?: { id: string }; error?: { message?: string } };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? "The interface could not be registered.");
      }
      onCreated(json.data.id);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }, [pathCheck.ok, solutionId, product, name, trimmedPath, version, operation, entitySet, onCreated]);

  const titleId = `${ids}-title`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={dialog}>
        <h2 id={titleId} style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
          Register your own API
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
          For a service your team built and published in SAP: a Z* RAP service, a YY1_* custom
          CDS view or business object, an ECC Gateway service. CoreEdge calls it through your
          connection, under the same grants, keys and audit as any catalogue service.
        </p>

        {solutions.length === 0 ? (
          <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
            You have no solutions yet. An interface belongs to a solution, so register one first.{" "}
            <a href="/studio/solutions" style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
              Register a solution
            </a>
            .
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label htmlFor={`${ids}-solution`} style={label}>
                Solution
              </label>
              <select id={`${ids}-solution`} value={solutionId} onChange={(e) => setSolutionId(e.target.value)} style={field}>
                {solutions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${ids}-name`} style={label}>
                Name
              </label>
              <input
                id={`${ids}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Travel bookings read"
                maxLength={200}
                style={field}
              />
            </div>

            <div>
              <label htmlFor={`${ids}-product`} style={label}>
                SAP product
              </label>
              <select id={`${ids}-product`} value={product} onChange={(e) => setProduct(e.target.value)} style={field}>
                {products.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              {product === "successfactors" && (
                <p style={hint}>Usually /odata/v2. Your custom MDF objects (cust_…) are datasets under it. Enter the dataset too: Verify then checks just that one, because the description of the whole tenant is too large to read.</p>
              )}
              {product === "ecc" && <p style={hint}>Only services activated in NetWeaver Gateway exist.</p>}
            </div>

            <div>
              <label htmlFor={`${ids}-path`} style={label}>
                Service path
              </label>
              <input
                id={`${ids}-path`}
                value={servicePath}
                onChange={(e) => onPathChange(e.target.value)}
                placeholder={product === "successfactors" ? "/odata/v2" : "/sap/opu/odata/sap/ZUI_TRAVEL_O2"}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={pathError !== null}
                aria-describedby={`${ids}-path-help`}
                style={{ ...field, fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13 }}
              />
              <p id={`${ids}-path-help`} style={pathError ? { ...hint, color: "var(--status-revoked-fg)" } : hint}>
                {pathError ??
                  "The part of the service's address after the host, starting with /. Copy it from the service binding in ADT (Service URL) or from /IWFND/MAINT_SERVICE, without $metadata or ?sap-client. It starts with /sap/opu/odata/ or /sap/opu/odata4/ (SuccessFactors: /odata/v2). The host always comes from your connection."}
              </p>
            </div>

            <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
              <legend style={label}>OData version</legend>
              <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
                {(["V2", "V4"] as const).map((v) => (
                  <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name={`${ids}-version`}
                      value={v}
                      checked={version === v}
                      onChange={() => {
                        setVersion(v);
                        setVersionTouched(true);
                      }}
                    />
                    {v === "V2" ? "V2 (…/sap/opu/odata/…)" : "V4 (…/sap/opu/odata4/…)"}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor={`${ids}-operation`} style={label}>
                Operation
              </label>
              <select
                id={`${ids}-operation`}
                value={operation}
                onChange={(e) => setOperation(e.target.value as "READ" | "CREATE" | "UPDATE")}
                style={field}
              >
                <option value="READ">READ</option>
                <option value="CREATE">CREATE — write, stronger review</option>
                <option value="UPDATE">UPDATE — write, stronger review</option>
              </select>
            </div>

            <div>
              <label htmlFor={`${ids}-entity`} style={label}>
                Entity set (dataset)
              </label>
              <input
                id={`${ids}-entity`}
                value={entitySet}
                onChange={(e) => setEntitySet(e.target.value)}
                placeholder={product === "successfactors" ? "cust_TravelRequest" : "Travel"}
                spellCheck={false}
                maxLength={200}
                style={{ ...field, fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13 }}
              />
              <p style={hint}>Optional. After saving, use Verify to list the datasets this service offers and pick one.</p>
            </div>

            {selectedProduct?.addressesClient && (
              <p style={hint}>
                This product addresses an SAP client. CoreEdge adds sap-client from the connection on every call;
                leave it out of the path.
              </p>
            )}
          </div>
        )}

        {state.kind === "error" && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--status-revoked-fg)" }}>
            {state.message}
          </p>
        )}

        <p style={{ ...hint, marginTop: 16 }}>Creates a DRAFT. It grants no access.</p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          {solutions.length > 0 && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.6 }}
            >
              {state.kind === "saving" ? "Registering…" : "Register draft"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── presentation (the same shapes as Discover's "Add to interface") ───────── */

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
  width: 560,
  maxWidth: "100%",
  maxHeight: "calc(100vh - 48px)",
  overflowY: "auto",
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
  padding: 0,
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
  boxSizing: "border-box",
};

const hint: React.CSSProperties = { margin: "4px 0 0", fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };

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
