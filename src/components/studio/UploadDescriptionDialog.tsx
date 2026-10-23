"use client";

/**
 * Register an interface from its service description (roadmap P1.2): the
 * service's $metadata as a file, from ADT, /IWFND/MAINT_SERVICE or a
 * colleague, and the interface's settings. The server compiles the file in
 * the Contract Compiler's worker and creates a DRAFT with its contract, 1.0.0,
 * with NO call to any tenant (POST /api/studio/interfaces/from-description).
 *
 * The dataset picker is filled by reading the file here, in the browser, with
 * DOMParser (XML) or JSON.parse (CSDL JSON). That is a convenience only: the
 * server reads the file again, in its own worker, and decides. A hostile file
 * can harm only this tab.
 */

import { useId, useMemo, useState } from "react";

import type { RegisterProductOption, RegisterSolutionOption } from "@/components/studio/RegisterOwnApiDialog";
import { useModalDialog } from "@/hooks/useModalDialog";
import { inferODataVersion, validateServicePath, type ODataVersion } from "@/lib/sap-public/service-path";

/** As the server's MAX_UPLOAD_DESCRIPTION_BYTES (contracts/upload.ts). */
const MAX_BYTES = 4 * 1024 * 1024;

/** The entity sets a description declares, as far as this tab can tell; empty when it cannot. */
export function entitySetsInDescription(text: string): string[] {
  const trimmed = text.trimStart();
  try {
    if (trimmed.startsWith("{")) {
      const doc = JSON.parse(trimmed) as Record<string, unknown>;
      const names: string[] = [];
      for (const schema of Object.values(doc)) {
        if (!schema || typeof schema !== "object") continue;
        for (const member of Object.values(schema as Record<string, unknown>)) {
          if (!member || typeof member !== "object" || (member as { $Kind?: unknown }).$Kind !== "EntityContainer") continue;
          for (const [name, m] of Object.entries(member as Record<string, unknown>)) {
            if (m && typeof m === "object" && (m as { $Collection?: unknown }).$Collection === true) names.push(name);
          }
        }
      }
      return names;
    }
    const doc = new DOMParser().parseFromString(trimmed, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return [];
    return Array.from(doc.getElementsByTagNameNS("*", "EntitySet"))
      .map((e) => e.getAttribute("Name") ?? "")
      .filter((n) => n !== "");
  } catch {
    return [];
  }
}

type Source = "own" | "catalogue";
type SubmitState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "done"; id: string; semver: string; message: string };

export function UploadDescriptionDialog({
  solutions,
  products,
  defaultProduct,
  onClose,
}: {
  solutions: readonly RegisterSolutionOption[];
  products: readonly RegisterProductOption[];
  defaultProduct: string;
  onClose: () => void;
}) {
  const ids = useId();
  // Focus in on opening, Tab kept inside, Escape closes, focus back to "Upload a description" on closing.
  const { panelRef, headingRef } = useModalDialog({ onClose });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<string[]>([]);
  const [solutionId, setSolutionId] = useState(solutions[0]?.id ?? "");
  const [name, setName] = useState("");
  const [product, setProduct] = useState(products.some((p) => p.key === defaultProduct) ? defaultProduct : (products[0]?.key ?? ""));
  const [source, setSource] = useState<Source>("own");
  const [servicePath, setServicePath] = useState("");
  const [version, setVersion] = useState<ODataVersion>("V2");
  const [externalId, setExternalId] = useState("");
  const [operation, setOperation] = useState<"READ" | "CREATE" | "UPDATE">("READ");
  const [entitySet, setEntitySet] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const trimmedPath = servicePath.trim();
  const pathCheck = useMemo(() => validateServicePath(trimmedPath), [trimmedPath]);
  const pathError = source === "own" && trimmedPath.length > 0 && !pathCheck.ok ? pathCheck.message : null;

  const choose = async (f: File | null) => {
    setFile(null);
    setDatasets([]);
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFileError("The file is larger than 4 MB. Register the service by its path and verify it from the tenant instead.");
      return;
    }
    setFile(f);
    const found = entitySetsInDescription(await f.text());
    setDatasets(found);
    if (found.length > 0 && !found.includes(entitySet)) setEntitySet(found[0]!);
  };

  const canSubmit =
    state.kind !== "saving" &&
    file !== null &&
    solutionId !== "" &&
    name.trim() !== "" &&
    entitySet.trim() !== "" &&
    (source === "own" ? pathCheck.ok : externalId.trim() !== "");

  const submit = async () => {
    if (!file) return;
    setState({ kind: "saving" });
    const fields = {
      solutionId,
      sapProduct: product,
      name: name.trim(),
      operation,
      entitySet: entitySet.trim(),
      ...(source === "own" && pathCheck.ok ? { servicePath: pathCheck.path, odataVersion: version } : { externalId: externalId.trim() }),
    };
    const form = new FormData();
    form.append("description", file);
    form.append("fields", JSON.stringify(fields));
    try {
      const res = await fetch("/api/studio/interfaces/from-description", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { interface: { id: string }; contract: { semver: string }; message: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "The interface could not be created from the file.");
      setState({ kind: "done", id: json.data.interface.id, semver: json.data.contract.semver, message: json.data.message });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  const titleId = `${ids}-title`;
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={dialog}>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
          Register from a description file
        </h2>
        <p style={{ ...hint, marginTop: 0 }}>
          Upload the service&apos;s $metadata (EDMX or CSDL JSON, up to 4 MB). CoreEdge creates a DRAFT interface with its contract
          from the file, without contacting any SAP system. Verify it against a tenant before any write.
        </p>

        {state.kind === "done" ? (
          <div role="status" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--status-signed-fg)", fontWeight: 600 }}>
              DRAFT created, contract {state.semver} from your file, not verified on any tenant.
            </p>
            <p style={hint}>{state.message}</p>
            <p style={{ ...hint, marginTop: 8 }}>
              <a href={`/studio/interfaces`} style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
                Open it in Interfaces
              </a>{" "}
              to verify it.
            </p>
          </div>
        ) : solutions.length === 0 ? (
          <p style={{ ...hint, marginTop: 12 }}>
            You have no solutions yet. An interface belongs to a solution, so register one first.{" "}
            <a href="/studio/solutions" style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
              Register a solution
            </a>
            .
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <div>
              <label htmlFor={`${ids}-file`} style={label}>
                Description file
              </label>
              <input
                id={`${ids}-file`}
                type="file"
                accept=".xml,.edmx,.json,application/xml,application/json,text/xml"
                onChange={(e) => void choose(e.target.files?.[0] ?? null)}
                aria-describedby={`${ids}-file-help`}
              />
              <p id={`${ids}-file-help`} style={fileError ? { ...hint, color: "var(--status-revoked-fg)" } : hint}>
                {fileError ?? (file ? `${datasets.length} dataset${datasets.length === 1 ? "" : "s"} found in the file.` : "Save it as UTF-8.")}
              </p>
            </div>

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
              <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} style={field} />
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
            </div>

            <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
              <legend style={label}>The service</legend>
              <div style={{ display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="radio" name={`${ids}-source`} checked={source === "own"} onChange={() => setSource("own")} />
                  Your own service path
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="radio" name={`${ids}-source`} checked={source === "catalogue"} onChange={() => setSource("catalogue")} />
                  An SAP catalogue service
                </label>
              </div>
            </fieldset>

            {source === "own" ? (
              <>
                <div>
                  <label htmlFor={`${ids}-path`} style={label}>
                    Service path
                  </label>
                  <input
                    id={`${ids}-path`}
                    value={servicePath}
                    onChange={(e) => {
                      setServicePath(e.target.value);
                      setVersion(inferODataVersion(e.target.value.trim()));
                    }}
                    placeholder="/sap/opu/odata/sap/YY1_SALESBONUS_CDS"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={pathError !== null}
                    aria-describedby={`${ids}-path-help`}
                    style={{ ...field, fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13 }}
                  />
                  <p id={`${ids}-path-help`} style={pathError ? { ...hint, color: "var(--status-revoked-fg)" } : hint}>
                    {pathError ?? "The path the service is called at on your connection's host, without $metadata or ?sap-client."}
                  </p>
                </div>
                <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                  <legend style={label}>OData version</legend>
                  <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
                    {(["V2", "V4"] as const).map((v) => (
                      <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="radio" name={`${ids}-version`} checked={version === v} onChange={() => setVersion(v)} />
                        {v}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
              <div>
                <label htmlFor={`${ids}-api`} style={label}>
                  Catalogue service (its Business Accelerator Hub id)
                </label>
                <input
                  id={`${ids}-api`}
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  placeholder="API_SUPPLIERINVOICE_PROCESS_SRV"
                  spellCheck={false}
                  style={{ ...field, fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13 }}
                />
              </div>
            )}

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
              {datasets.length > 0 ? (
                <select id={`${ids}-entity`} value={entitySet} onChange={(e) => setEntitySet(e.target.value)} style={field}>
                  {datasets.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${ids}-entity`}
                  value={entitySet}
                  onChange={(e) => setEntitySet(e.target.value)}
                  maxLength={200}
                  spellCheck={false}
                  style={{ ...field, fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13 }}
                />
              )}
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--status-revoked-fg)" }}>
            {state.message}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            {state.kind === "done" ? "Close" : "Cancel"}
          </button>
          {state.kind !== "done" && solutions.length > 0 && (
            <button type="button" onClick={() => void submit()} disabled={!canSubmit} style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.6 }}>
              {state.kind === "saving" ? "Compiling…" : "Create draft"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── presentation (the same shapes as "Register your own API") ─────────── */

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
