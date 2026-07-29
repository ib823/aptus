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
  /** DEV | TEST | PROD | SANDBOX, or null when undeclared (a scored incident). */
  environment: string | null;
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
  canManage,
}: {
  connections: readonly StudioConnection[];
  /** Builder rights: test, add, replace, activate. Was named canTest when
   *  testing was the only thing this screen could do. */
  canManage: boolean;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, TestOutcome | { error: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const setActive = useCallback(async (id: string, isActive: boolean) => {
    setToggling(id);
    setToggleError(null);
    try {
      const res = await fetch("/api/studio/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "The change could not be saved.");
      window.location.reload();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "The change could not be saved.");
      setToggling(null);
    }
  }, []);

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
          nothing anywhere in Studio will claim a capability is activated.
        </p>
        {canManage ? (
          <ConnectionForm />
        ) : (
          <p style={{ ...body, marginTop: 12 }}>
            Your role can view connections; adding one is a builder action.
          </p>
        )}
      </section>
    );
  }

  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" style={btnSmall} onClick={() => setAdding((a) => !a)}>
            {adding ? "Cancel" : "+ Add a connection"}
          </button>
          {adding && (
            <section style={{ ...card, marginTop: 12 }}>
              <ConnectionForm />
            </section>
          )}
        </div>
      )}
      {toggleError && (
        <p style={{ ...body, color: "var(--status-error, #8E2A26)", marginBottom: 8 }} role="alert">
          {toggleError}
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
            <Th>Alias</Th>
            <Th>Key</Th>
            <Th>Product</Th>
            {/* THE VALUE THE CRITICAL binding-mismatch RULE FIRES ON. It was
                stored, and shown only inside the tenant switcher, so the screen
                that manages connections could not tell you whether a row was
                DEV or PROD — the single most consequential attribute a
                connection has, and the left-hand operand of the one critical
                incident rule in the product. */}
            <Th>Environment</Th>
            <Th>Base URL</Th>
            <Th>Auth</Th>
            <Th>Secret</Th>
            <Th>Health</Th>
            <Th>Write</Th>
            <Th>Active</Th>
            {canManage && <Th>Test</Th>}
            {canManage && <Th>Actions</Th>}
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
                <Td>
                  {c.environment ? (
                    <span style={{ fontWeight: 600 }}>{c.environment}</span>
                  ) : (
                    // Undeclared is a SCORED minor incident and makes writes
                    // through this connection refuse outright, so it is stated
                    // rather than left blank.
                    <span style={{ color: "var(--ink-muted)" }} title="Reads are served but marked unverified; writes are refused. Set it to clear the incident.">
                      not declared
                    </span>
                  )}
                </Td>
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
                {canManage && (
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
                {canManage && (
                  <Td>
                    {/* Deactivate rather than delete. A connection is referenced by
                        stored probes and audit rows; removing it would orphan the
                        record of what was done through it. */}
                    <button
                      type="button"
                      onClick={() => void setActive(c.id, !c.isActive)}
                      disabled={toggling === c.id}
                      style={testBtn}
                    >
                      {toggling === c.id ? "Saving…" : c.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/**
 * Add or replace a connection.
 *
 * SECRETS ARE ALWAYS RE-ENTERED. The server reseals the whole bundle on every
 * write, so there is no "edit the label only" path here — saving replaces the
 * credential set. That is stated on the form rather than discovered later, when
 * a connection that used to work stops at its next SAP call.
 *
 * Nothing here ever displays an existing secret, because nothing can: the read
 * path does not select the sealed column, so there is no value to prefill.
 */
function ConnectionForm() {
  const [product, setProduct] = useState("s4hana");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [environment, setEnvironment] = useState("");
  const [authType, setAuthType] = useState<"basic" | "bearer" | "oauth-client-credentials">("basic");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [oauthTokenUrl, setOauthTokenUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the server's superRefine. Reported as you type so the disabled
  // button is never a mystery.
  const missing: string[] = [];
  if (key.trim().length < 1) missing.push("a tenant key");
  if (label.trim().length < 2) missing.push("a label");
  if (!baseUrl.startsWith("https://")) missing.push("an https base URL");
  if (authType === "basic" && (!username.trim() || !password)) missing.push("a username and password");
  if (authType === "bearer" && !bearerToken) missing.push("a bearer token");
  if (authType === "oauth-client-credentials" && (!clientId.trim() || !clientSecret || !oauthTokenUrl.startsWith("https://")))
    missing.push("a client id, secret and https token URL");

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          key: key.trim(),
          label: label.trim(),
          baseUrl: baseUrl.trim(),
          authType,
          ...(environment.trim() ? { environment: environment.trim() } : {}),
          ...(authType === "basic" ? { username: username.trim(), password } : {}),
          ...(authType === "bearer" ? { bearerToken } : {}),
          ...(authType === "oauth-client-credentials"
            ? { clientId: clientId.trim(), clientSecret, oauthTokenUrl: oauthTokenUrl.trim() }
            : {}),
        }),
      });
      /*
       * A FAILING RESPONSE MAY HAVE NO BODY, AND `.json()` THROWS ON EMPTY.
       *
       * When the server died before it could write an envelope, this line threw
       * a DOMException and the `catch` below rendered its message straight onto
       * the screen:
       *
       *     Failed to execute 'json' on 'Response': Unexpected end of JSON input
       *
       * A consultant read that after filling in a nine-field form correctly. It
       * names a browser API they have never heard of, says nothing about what
       * went wrong, and gives them nothing to quote to support — while the
       * actual failure was a missing deployment key. The parse error replaced
       * the real error and became the only thing anyone could see.
       *
       * Parsing is now allowed to fail without becoming the story: an
       * unreadable body from a failed request means the server could not say
       * what happened, and THAT is what the reader is told, along with the
       * status they can quote.
       */
      const json = (await res
        .json()
        .catch(() => null)) as { error?: { message?: string; correlationId?: string } } | null;

      if (!res.ok) {
        const stated = json?.error?.message;
        const ref = json?.error?.correlationId;
        throw new Error(
          stated
            ? ref
              ? `${stated} (reference ${ref})`
              : stated
            : `The connection could not be saved, and the server returned no explanation ` +
              `(HTTP ${res.status}). This is a problem with the environment rather than ` +
              `with what you entered — report the status code to whoever operates it.`,
        );
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The connection could not be saved.");
      setBusy(false);
    }
  }, [product, key, label, baseUrl, environment, authType, username, password, bearerToken, clientId, clientSecret, oauthTokenUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Label text="Product">
          <select value={product} onChange={(e) => setProduct(e.target.value)} style={input}>
            {PRODUCT_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Label>
        <Label text="Tenant key" hint="Normalized — probes are stored under it.">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="x5m-100" style={input} />
        </Label>
        <Label text="Label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Customizing X5M/100" style={input} />
        </Label>
        <Label text="Environment" hint="Optional. Blank shows no chip rather than a guess.">
          <input value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="DEV" style={input} />
        </Label>
      </div>

      <Label text="Base URL" hint="https only — these carry credentials on every call.">
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://my123456-api.s4hana.cloud.sap" style={input} />
      </Label>

      <Label text="Auth type">
        <select value={authType} onChange={(e) => setAuthType(e.target.value as typeof authType)} style={input}>
          <option value="basic">Basic — communication user</option>
          <option value="bearer">Bearer token</option>
          <option value="oauth-client-credentials">OAuth client credentials</option>
        </select>
      </Label>

      {authType === "basic" && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <Label text="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" style={input} />
          </Label>
          <Label text="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={input} />
          </Label>
        </div>
      )}
      {authType === "bearer" && (
        <Label text="Bearer token">
          <input type="password" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} autoComplete="new-password" style={input} />
        </Label>
      )}
      {authType === "oauth-client-credentials" && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Label text="Client ID">
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" style={input} />
          </Label>
          <Label text="Client secret">
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" style={input} />
          </Label>
          <Label text="Token URL">
            <input value={oauthTokenUrl} onChange={(e) => setOauthTokenUrl(e.target.value)} placeholder="https://…/oauth/token" style={input} />
          </Label>
        </div>
      )}

      {error && (
        <p style={{ ...body, color: "var(--status-error, #8E2A26)" }} role="alert">{error}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || missing.length > 0}
          style={{ ...saveBtn, opacity: busy || missing.length > 0 ? 0.5 : 1 }}
        >
          {busy ? "Saving…" : "Save connection"}
        </button>
        {missing.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Still needs {missing.join(", ")}.</span>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: 0 }}>
        Saving an existing product + key <strong>replaces</strong> it, including its
        credentials — secrets are resealed on every save, so they must be entered each
        time. They are never readable afterwards, not even here.
      </p>
    </div>
  );
}

function Label({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
      {text}
      {children}
      {hint && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-muted)" }}>{hint}</span>}
    </label>
  );
}

/** Mirrors SAP_ODATA_PRODUCTS on the server, which the route validates against. */
const PRODUCT_OPTIONS = ["s4hana", "successfactors", "ariba"] as const;

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

const btnSmall: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)",
  color: "var(--brand-navy)",
  border: "1px solid var(--border-strong)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const saveBtn: React.CSSProperties = {
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
