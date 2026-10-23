"use client";

/**
 * The SAP API Policy §1.2 sign-off for an interface on a customer-built SAP
 * S/4HANA Cloud Public Edition service (roadmap P1.2, studio/api-policy.ts).
 *
 * The person reads the policy's own words, with its version, chooses the
 * basis — SAP's documentation for the product, an authorisation from SAP, or
 * another, each but the first with its reference — and confirms the statement.
 * The server asks for a fresh passkey (fetchWithStepUp) and refuses the person
 * who chose the service, by registering the interface or by changing its
 * service later: someone else signs, as someone else decides its access.
 */

import { useId, useState } from "react";

import { fetchWithStepUp } from "@/lib/auth/step-up-client";
import {
  API_POLICY_ID,
  API_POLICY_SECTION_TEXT,
  MAX_SIGN_OFF_REFERENCE,
  SIGN_OFF_BASES,
  SIGN_OFF_BASIS_LABELS,
  statementText,
  type SignOffBasis,
} from "@/lib/studio/api-policy";

type SubmitState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

export function PolicySignOffDialog({
  interfaceId,
  serviceIdentity,
  onClose,
  onSigned,
}: {
  interfaceId: string;
  /** The interface's externalId: what the sign-off covers. */
  serviceIdentity: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const ids = useId();
  const [basis, setBasis] = useState<SignOffBasis>("DOCUMENTATION");
  const [reference, setReference] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const needsReference = basis !== "DOCUMENTATION";
  const canSubmit = state.kind !== "saving" && acknowledged && (!needsReference || reference.trim() !== "");

  const submit = async () => {
    setState({ kind: "saving" });
    try {
      const res = await fetchWithStepUp(`/api/studio/interfaces/${encodeURIComponent(interfaceId)}/policy-sign-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basis, reference: reference.trim(), acknowledge: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "The sign-off could not be recorded.");
      onSigned();
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

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
          SAP API Policy §1.2 sign-off
        </h2>
        <p style={{ ...hint, marginTop: 0 }}>
          This interface calls a service your team built on SAP S/4HANA Cloud Public Edition. SAP permits custom
          interfaces explicitly only on private cloud and on-premise, so a person in your organization records why
          calling this one is permitted. Someone other than the person who chose this service for the interface signs.
        </p>
        <blockquote style={quote}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>{API_POLICY_ID}</span>
          {API_POLICY_SECTION_TEXT}
        </blockquote>

        <fieldset style={{ border: "none", margin: "12px 0 0", padding: 0 }}>
          <legend style={label}>Basis</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
            {SIGN_OFF_BASES.map((b) => (
              <label key={b} style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="radio" name={`${ids}-basis`} value={b} checked={basis === b} onChange={() => setBasis(b)} />
                {SIGN_OFF_BASIS_LABELS[b]}
              </label>
            ))}
          </div>
        </fieldset>

        <div style={{ marginTop: 12 }}>
          <label htmlFor={`${ids}-reference`} style={label}>
            Reference {needsReference ? "" : "(optional)"}
          </label>
          <input
            id={`${ids}-reference`}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={MAX_SIGN_OFF_REFERENCE}
            placeholder={needsReference ? "The SAP incident, agreement or page" : "The documentation page, if you have it"}
            style={field}
            aria-required={needsReference}
          />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13, lineHeight: "20px" }}>
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 3 }} />
          <span>{statementText(serviceIdentity)}</span>
        </label>

        {state.kind === "error" && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--status-revoked-fg)" }}>
            {state.message}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={!canSubmit} style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.6 }}>
            {state.kind === "saving" ? "Recording…" : "Sign off"}
          </button>
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
  width: 600,
  maxWidth: "100%",
  maxHeight: "calc(100vh - 48px)",
  overflowY: "auto",
  background: "var(--surface-paper)",
  borderRadius: "var(--radius-card-warm, 12px)",
  boxShadow: "0 16px 40px rgba(0,0,0,.12)",
  padding: 20,
};

const quote: React.CSSProperties = {
  margin: "12px 0 0",
  padding: "8px 12px",
  borderLeft: "3px solid var(--border-strong)",
  background: "var(--surface-ink-tint)",
  fontSize: 13,
  lineHeight: "20px",
  color: "var(--ink-primary)",
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

const hint: React.CSSProperties = { margin: "4px 0 0", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" };

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
