"use client";

/**
 * Connections — the client half.
 *
 * Renders connection METADATA and runs the read-only connectivity probe. The
 * secret column is not something this component redacts; it is something it
 * never receives (the endpoint's select does not read it). The "🔒 Sealed"
 * cell is therefore a statement of fact, not a mask over a value in memory.
 */

import { useRouter } from "next/navigation";

import { useCallback, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";
import { PRODUCT_MARKS } from "@/lib/studio/product-marks";
import { ProductLabel } from "@/components/sap/ProductLabel";

export interface StudioConnection {
  id: string;
  product: string;
  key: string;
  label: string;
  baseUrl: string;
  authType: string;
  /** DEV | TEST | PROD | SANDBOX, or null when undeclared (a scored incident). */
  environment: string | null;
  /** The probe path — the value that decides NO_PROBE_PATH on the health chip. */
  apiPath: string | null;
  timeoutMs: number | null;
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

/**
 * What the health chip is CALLED in this table, which is not what the shared
 * vocabulary calls it.
 *
 * The vocabulary's word for a live 200 is "Activated", and for a capability that
 * is the right word — it means the service is activated on the tenant. This
 * table has already spent that word on something else: the Active column and the
 * Activate / Deactivate buttons say whether the connection is enabled to carry
 * traffic. Two different facts, and the health chip does not move when you
 * toggle the other one.
 *
 * So a connection you had just deactivated rendered as
 *
 *     ● Activated   |   no   |   [ Activate ]
 *
 * three adjacent cells, one word, two meanings — and the honest reading of that
 * row is that the console has contradicted itself. StudioStatusChip's own header
 * warns about exactly this ("overloading those names ... is a trap for the next
 * reader"); the trap was simply sprung from the other direction.
 *
 * Only ACTIVATED collides. "Reachable" states what the probe established and
 * pairs with "Not probeable", which is already in the vocabulary. Everything
 * else keeps the shared label so the console still reads as one system.
 */
function healthLabel(status: HonestStatus): string | undefined {
  return status === "ACTIVATED" ? "Reachable" : undefined;
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
  const router = useRouter();
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
      router.refresh();
      setToggling(null);
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "The change could not be saved.");
      setToggling(null);
    }
  }, [router]);

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
                <Td>
                  <ProductLabel product={c.product} />
                </Td>
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
                <Td mono>
                  {c.baseUrl}
                  {/* The probe path, beside the URL it extends — so the health
                      column's "Not probeable" has its cause on the same row. */}
                  {c.apiPath ? (
                    <span style={{ display: "block", fontSize: 11, color: "var(--ink-muted)" }}>
                      probe: {c.apiPath}
                    </span>
                  ) : null}
                </Td>
                <Td>{c.authType}</Td>
                <Td>
                  <span title="Sealed with AES-256-GCM and never returned to the console">
                    🔒 Sealed
                  </span>
                </Td>
                <Td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {(() => {
                      const health = healthToStatus(c.lastValidationStatus);
                      return <StudioStatusChip status={health} label={healthLabel(health)} />;
                    })()}
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
  const [client, setClient] = useState("");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [environment, setEnvironment] = useState("");
  const [authType, setAuthType] = useState<
    "basic" | "bearer" | "oauth-client-credentials" | "oauth-saml-bearer"
  >("basic");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [oauthTokenUrl, setOauthTokenUrl] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [samlAssertion, setSamlAssertion] = useState("");
  const [apiPath, setApiPath] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * TWO ENVIRONMENT VOCABULARIES, RECONCILED ON SIGHT. The connection's
   * environment is deliberately free text (a landscape called PREPROD should
   * not be forced to pick the nearest wrong word) — but grants and credentials
   * use a closed SANDBOX|DEV|TEST|PROD vocabulary, and the broker binds a call
   * by EXACT match. A connection declared PREPROD can therefore never be
   * matched by any credential, and until this warning existed nothing said so
   * before the first refused call.
   */
  const GRANT_ENVIRONMENTS = ["SANDBOX", "DEV", "TEST", "PROD"];
  const envOutsideGrantVocabulary =
    environment.trim().length > 0 &&
    !GRANT_ENVIRONMENTS.includes(environment.trim().toUpperCase());

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
  if (
    authType === "oauth-saml-bearer" &&
    (!clientId.trim() || !companyId.trim() || !samlAssertion.trim() || !oauthTokenUrl.startsWith("https://"))
  )
    missing.push("an API key, company id, SAML assertion and https token URL");

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
          /*
           * Sent only where the product HAS a client. The API rejects one on a
           * cloud product, so a stale value left behind by switching the picker
           * from on-premise back to Cloud ERP would otherwise fail the whole
           * save with a message about a field the form is no longer showing.
           */
          ...(PRODUCT_MARKS[product]?.addressesClient && client.trim()
            ? { client: client.trim() }
            : {}),
          ...(apiPath.trim() ? { apiPath: apiPath.trim() } : {}),
          ...(timeoutMs.trim() && Number.isFinite(Number(timeoutMs))
            ? { timeoutMs: Number(timeoutMs) }
            : {}),
          ...(authType === "basic" ? { username: username.trim(), password } : {}),
          ...(authType === "bearer" ? { bearerToken } : {}),
          ...(authType === "oauth-saml-bearer"
            ? {
                clientId: clientId.trim(),
                companyId: companyId.trim(),
                samlAssertion: samlAssertion.trim(),
                oauthTokenUrl: oauthTokenUrl.trim(),
              }
            : {}),
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
      // A FULL reload, deliberately: the form holds typed SECRETS, and a
      // router.refresh() keeps client state — leaving a password sitting in a
      // React field after save. Reload is the reset that clears it.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The connection could not be saved.");
      setBusy(false);
    }
  }, [product, client, key, label, baseUrl, environment, authType, username, password, bearerToken, clientId, clientSecret, oauthTokenUrl, companyId, samlAssertion, apiPath, timeoutMs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Label text="Product">
          {/* TILES, NOT A DROPDOWN — the alternative was a <select> of raw
              keys. The glyph is the symbol lifted out of the supplied artwork;
              the whole image would have put a grey marketing square on the
              cream form and repeated, in baked-in pixels, the name written
              underneath it in real text. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRODUCT_OPTIONS.map((p) => {
              const mark = PRODUCT_MARKS[p];
              const selected = p === product;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setProduct(p)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    // Centred, so a name that wraps to two lines — "SAP Cloud
                    // ERP Private" will, once it is supported — grows into the
                    // box rather than pushing the tile out of line with the
                    // others.
                    justifyContent: "center",
                    gap: 4,
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid ${selected ? "var(--brand-navy)" : "var(--border-default)"}`,
                    background: selected ? "var(--surface-ink-tint)" : "var(--surface-paper)",
                    /*
                       ONE SIZE FOR EVERY TILE. These sized themselves to their
                       contents, so "SAP SuccessFactors" made a wider box than
                       "SAP Ariba" and the edition line under Cloud ERP made a
                       taller one. Three tiles, three shapes, for no reason a
                       reader could act on.

                       `all: unset` resets box-sizing to content-box, so the
                       padding and border would otherwise be ADDED to these
                       numbers and the tiles would differ again the moment a
                       border width changed. Hence the explicit border-box.
                    */
                    boxSizing: "border-box",
                    width: 148,
                    height: 132,
                  }}
                >
                  {mark?.glyph ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mark.glyph}
                      alt=""
                      width={56}
                      height={56}
                      style={{ display: "block", flexShrink: 0 }}
                    />
                  ) : null}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: selected ? 650 : 500,
                      textAlign: "center",
                      lineHeight: 1.25,
                    }}
                  >
                    {mark?.name ?? p}
                  </span>
                  {/* The edition line is ALWAYS rendered, empty where there is
                      none, so the glyph and name sit at the same height on
                      every tile instead of shifting up on two of the three. */}
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--ink-muted)",
                      textAlign: "center",
                      lineHeight: 1.2,
                      minHeight: 13,
                    }}
                  >
                    {mark?.edition ?? ""}
                  </span>
                </button>
              );
            })}
          </div>
        </Label>
        {PRODUCT_MARKS[product]?.addressesClient ? (
          <Label
            text="SAP client"
            hint="Three digits, e.g. 100. Part of every URL — it decides which data container."
          >
            {/*
              ONLY FOR PRODUCTS THAT HAVE ONE. Cloud products are a single
              tenant per host, and the API refuses a client on them outright —
              offering the field there would invite a value that cannot mean
              anything. On-premise, RISE and ECC address a client INSIDE one
              system: the same baseUrl with 100 and 080 is two different
              companies' worth of data.
            */}
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="100"
              inputMode="numeric"
              maxLength={3}
              style={input}
            />
          </Label>
        ) : null}
        <Label text="Tenant key" hint="Normalized — probes are stored under it.">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="x5m-100" style={input} />
        </Label>
        <Label text="Label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Customizing X5M/100" style={input} />
        </Label>
        <Label text="Environment" hint="Optional. Blank shows no chip rather than a guess.">
          <input value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="DEV" style={input} />
          {envOutsideGrantVocabulary && (
            <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--status-awaiting-fg)" }}>
              Grants and runtime credentials use SANDBOX, DEV, TEST or PROD — a credential can
              only bind to a connection whose environment matches exactly, so “
              {environment.trim().toUpperCase()}” will never serve a runtime call. Keep it if
              this connection is for Studio browsing only.
            </span>
          )}
        </Label>
      </div>

      <Label text="Base URL" hint="https only — these carry credentials on every call.">
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://my123456-api.s4hana.cloud.sap" style={input} />
      </Label>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <Label
          text="Probe path (optional)"
          hint="The $metadata-capable service path used by the connection test. Without one, ECC and other custom landscapes stay “Not probeable”."
        >
          {/*
            The API has always accepted apiPath; the form never offered it — so
            an ECC connection's health chip was permanently "Not probeable" with
            no way to fix it from the screen that showed the chip.
          */}
          <input
            value={apiPath}
            onChange={(e) => setApiPath(e.target.value)}
            placeholder="/sap/opu/odata/sap/ZMY_SERVICE"
            style={input}
          />
        </Label>
        <Label text="Timeout ms (optional)" hint="1000–120000. Blank uses the platform default.">
          <input
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            placeholder="30000"
            inputMode="numeric"
            style={input}
          />
        </Label>
      </div>

      <Label text="Auth type">
        <select value={authType} onChange={(e) => setAuthType(e.target.value as typeof authType)} style={input}>
          <option value="basic">Basic — communication user</option>
          <option value="bearer">Bearer token</option>
          <option value="oauth-client-credentials">OAuth client credentials</option>
          <option value="oauth-saml-bearer">OAuth SAML bearer — SuccessFactors</option>
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
      {authType === "oauth-saml-bearer" && (
        <>
          <Label text="API key (client id)">
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} style={input} />
          </Label>
          <Label text="Company id">
            <input value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={input} />
          </Label>
          <Label text="Token URL">
            <input
              value={oauthTokenUrl}
              onChange={(e) => setOauthTokenUrl(e.target.value)}
              placeholder="https://apiNN.successfactors.com/oauth/token"
              style={input}
            />
          </Label>
          <Label text="SAML assertion">
            {/* A textarea, not an input: assertions are multi-kilobyte base64
                documents and a single-line field makes them unpasteable in
                practice. Generated by your IdP or SAP's assertion generator —
                this console does not sign one, and says so rather than
                pretending to. */}
            <textarea
              value={samlAssertion}
              onChange={(e) => setSamlAssertion(e.target.value)}
              rows={4}
              placeholder="Paste the signed assertion"
              style={{ ...input, fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}
            />
          </Label>
        </>
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
/*
 * DERIVED, NOT LISTED. This was `["s4hana", "successfactors", "ariba"]` — a
 * THIRD place products were enumerated, after SAP_ODATA_PRODUCTS and the API's
 * zod enum. Adding private cloud, on-premise and ECC to two of the three would
 * have left the picker silently short, which is the same shape as the five
 * routes that knew one of two tenant registries.
 *
 * PRODUCT_MARKS is the client-safe mirror of SAP_ODATA_PRODUCTS; a test
 * reconciles them, so a product added to the connector cannot go unofferable.
 */
const PRODUCT_OPTIONS = Object.keys(PRODUCT_MARKS);

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
