"use client";

/**
 * Connections — the client half.
 *
 * Renders connection METADATA and runs the read-only connectivity probe. The
 * secret column is not something this component redacts; it is something it
 * never receives (the endpoint's select does not read it). The "🔒 Sealed"
 * cell is therefore a statement of fact, not a mask over a value in memory.
 *
 * WRITES ARE SWITCHED ON HERE (P0.3). The API always accepted `writeEnabled`
 * on a save, and the form never offered it — so no screen could allow writes
 * on a connection, and every re-save (how credentials are rotated) sent no
 * `writeEnabled` and switched a writing connection's writes off. The form now
 * carries "Allow writes". It asked for a "write secret" too, which nothing
 * ever read back, so it gated nothing and is gone (wave 2 integration review
 * round 3): what gates a write is this switch, the passkey and the audit row
 * on the save, the approved write grant and the app's write key. Re-saving a
 * connection whose writes are live (active, writes
 * allowed) starts with the box ticked, so a rotation keeps them on; unticking
 * it says, before Save, that the save turns them off. A DEACTIVATED
 * connection starts unticked: a save reactivates the row, so a ticked default
 * would quietly re-arm writes an operator had stopped (P0.3 review round 1).
 *
 * Writes are allowed for a system, not a row (P0.3 review round 2): a save
 * that points a writing row at another environment, SAP host or base path
 * (review round 3: a gateway routes by path), or SAP client
 * starts unticked and says why. The form sends what it showed for the row it
 * replaces, so a save from a page loaded before the row changed (deactivated
 * during an incident) is refused with 409 rather than re-arming it; saving a
 * deactivated row says, before Save, that it makes it active again.
 */

import { useRouter } from "next/navigation";

import { useCallback, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";
import { fetchWithStepUp } from "@/lib/auth/step-up-client";
import { CONNECTION_PROOF_TTL_MS, connectionHealthVerdict } from "@/lib/coreedge/freshness";
import { isAllowedApiKeyHeader } from "@/lib/sap-public/api-key-header";
import { sanitizeTenantKey } from "@/lib/sap-public/tenant-key";
import {
  changedStoredSettings,
  connectionSaveBody,
  formWriteTarget,
  storedEnvironmentTwin,
  storedFormSettings,
  writeTargetChanges,
  type ConnectionFormFields,
  type StoredSetting,
  type WriteTargetField,
} from "@/lib/studio/connection-form";
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
  /**
   * The SAP client, or null on a one-tenant-per-host product. With the
   * environment and the host, the system the row's writes are allowed for:
   * the form unticks Allow writes when a save points the row elsewhere (P0.3
   * review round 2).
   */
  client: string | null;
  /** The probe path — the value that decides NO_PROBE_PATH on the health chip. */
  apiPath: string | null;
  timeoutMs: number | null;
  /** The OAuth token endpoint (a column, not a secret): a re-save sends it back unless it is edited. */
  oauthTokenUrl?: string | null;
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

/** What the health chip reads: the recorded status and when SAP last answered 200. */
export interface ConnectionHealthInput {
  readonly lastValidationStatus: string | null;
  /** ISO string as the page serialises it, or a Date. */
  readonly lastValidatedAt: string | Date | null;
}

/**
 * Health → the honest-status vocabulary already used across the console, so a
 * connection's state reads the same way a capability's does.
 *   OK, recent    → ACTIVATED     (proven by a live 200 within CONNECTION_PROOF_TTL_MS)
 *   OK, aged      → NOT_CHECKED   (stale: our evidence has aged; see `connectionHealthChip`)
 *   UNAUTHORIZED  → NEEDS_SETUP   (401/403 — arrangement/credentials)
 *   NOT_FOUND     → NOT_FOUND     (404 on this tenant)
 *   TIMEOUT/ERROR → PROBE_FAILED  (unreachable right now)
 *   UNREADABLE    → NEEDS_SETUP   (the stored secret will not open: re-enter it)
 *   GROUP_UNREADABLE → NEEDS_SETUP (another connection for the product will not open)
 *   never tested  → NOT_CHECKED
 *
 * UNREADABLE is named, not left to the default (P0.2, A50): the probe sweep
 * records it for a connection it checked and could not open, so "Not
 * checked" was false, and the broker refuses every call through it.
 * GROUP_UNREADABLE (P0.2 review) is a row whose own secret opens while a
 * sibling's will not; `unreadableHint` says which row to fix under the chip.
 *
 * AN OK IS ONLY ACTIVATED WHILE IT IS RECENT (P0.2 review round 4). This took
 * the status alone, so an OK from months ago — the nightly probe stopped —
 * kept the green "Reachable" chip here while Operations, the topology lens and
 * the SAP systems screen called the same row stale. The age is now an input,
 * and the reading is `connectionHealthVerdict`, the one every other screen
 * uses, so the two cannot disagree. Exported for its test.
 */
export function healthToStatus(c: ConnectionHealthInput, now: Date = new Date()): HonestStatus {
  switch (c.lastValidationStatus) {
    case "OK":
      return verdictOf(c, now) === "healthy" ? "ACTIVATED" : "NOT_CHECKED";
    case "UNAUTHORIZED":
    case "UNREADABLE":
    case "GROUP_UNREADABLE":
      return "NEEDS_SETUP";
    case "NOT_FOUND":
      return "NOT_FOUND";
    /*
     * The attempt ran and failed. Distinct from NO_PROBE_PATH below, which is
     * terminal — separating them is the entire point of the split, and lumping
     * a timed-out connection in with "there is nothing here to check" told an
     * operator to stop trying at exactly the moment a retry was the fix.
     */
    case "TIMEOUT":
    case "ERROR":
      return "PROBE_FAILED";
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
/**
 * The line under the chip for a connection the broker refuses because a
 * secret will not open — saying WHICH secret, so "Needs setup" does not send
 * a builder to re-save a row whose own secret is fine (P0.2 review). Null for
 * every other status. Exported for its test.
 */
export function unreadableHint(status: string | null): string | null {
  if (status === "UNREADABLE") return "The stored secret will not open: re-save this connection's secrets.";
  if (status === "GROUP_UNREADABLE") {
    return "This secret opens, but another connection for this product will not: re-save or deactivate the one marked unreadable.";
  }
  return null;
}

function healthLabel(status: HonestStatus): string | undefined {
  return status === "ACTIVATED" ? "Reachable" : undefined;
}

function verdictOf(c: ConnectionHealthInput, now: Date) {
  const at = c.lastValidatedAt === null ? null : new Date(c.lastValidatedAt);
  return connectionHealthVerdict(
    { lastValidationStatus: c.lastValidationStatus, lastValidatedAt: at && !Number.isNaN(at.getTime()) ? at : null },
    now,
  );
}

/**
 * The chip as drawn: status, visible label and accessible meaning.
 *
 * A stale OK is drawn in the muted "not checked" tone and labelled
 * "OK · stale", the words Operations → Connections and the SAP systems screen
 * use for the same row; its meaning says the evidence has aged rather than
 * "not yet probed", which would be false. Exported for its test.
 */
export function connectionHealthChip(
  c: ConnectionHealthInput,
  now: Date = new Date(),
): { status: HonestStatus; label: string | undefined; meaning: string | undefined } {
  const status = healthToStatus(c, now);
  if (c.lastValidationStatus === "OK" && status !== "ACTIVATED") {
    const hours = Math.round(CONNECTION_PROOF_TTL_MS / (60 * 60 * 1000));
    return {
      status,
      label: "OK · stale",
      meaning: `the last 200 was more than ${hours} h ago and no probe has succeeded since — our evidence has aged, which says nothing either way about SAP; test it again`,
    };
  }
  return { status, label: healthLabel(status), meaning: undefined };
}

export function ConnectionsClient({
  connections,
  canManage,
  basicAuthNotices = {},
}: {
  connections: readonly StudioConnection[];
  /** Builder rights: test, add, replace, activate. Was named canTest when
   *  testing was the only thing this screen could do. */
  canManage: boolean;
  /**
   * Product key → the dated notice shown before a NEW Basic-auth connection to
   * it is saved (SuccessFactors). Computed on the server, which has the clock
   * and SF_BASIC_AUTH_DELETION_DATE; absent products get no notice.
   */
  basicAuthNotices?: Readonly<Record<string, string>>;
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
      const res = await fetchWithStepUp("/api/studio/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      // Parsed defensively: a response with no JSON body must surface as a
      // sentence, never as "Unexpected end of JSON input" (A52).
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? `The change could not be saved (HTTP ${res.status}).`);
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
          <ConnectionForm connections={connections} basicAuthNotices={basicAuthNotices} />
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
              <ConnectionForm connections={connections} basicAuthNotices={basicAuthNotices} />
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
                      const chip = connectionHealthChip(c);
                      return <StudioStatusChip status={chip.status} label={chip.label} meaning={chip.meaning} />;
                    })()}
                    {unreadableHint(c.lastValidationStatus) ? (
                      <span style={{ fontSize: 11, color: "var(--ink-muted)", maxWidth: 260 }}>
                        {unreadableHint(c.lastValidationStatus)}
                      </span>
                    ) : null}
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
function ConnectionForm({
  connections,
  basicAuthNotices,
}: {
  connections: readonly StudioConnection[];
  basicAuthNotices: Readonly<Record<string, string>>;
}) {
  const [product, setProduct] = useState("s4hana");
  const [key, setKey] = useState("");
  /*
   * A RE-SAVE KEEPS WHAT IS STORED (wave 2 final review round 3). The route
   * replaces every column with what the save sends, and this form started
   * blank, so re-saving a connection to rotate its password silently cleared
   * its probe path and timeout (and any other setting not typed again): the
   * Test then probed another service, a slow tenant timed out, and the
   * rotation probe judged the new secret somewhere it was never proven.
   *
   * Each stored setting is null until the person edits it, and until then
   * the field shows, and the save sends, the stored value of the connection
   * being replaced (`storedFormSettings`). Clearing a field is a visible
   * edit, and the form says before Save which stored settings the save
   * changes. Secrets are sealed and never readable, so they are always typed.
   */
  const [clientTyped, setClient] = useState<string | null>(null);
  const [labelTyped, setLabel] = useState<string | null>(null);
  const [baseUrlTyped, setBaseUrl] = useState<string | null>(null);
  const [environmentTyped, setEnvironment] = useState<string | null>(null);
  const [authTypeTyped, setAuthType] = useState<ConnectionFormFields["authType"] | null>(null);
  const [oauthTokenUrlTyped, setOauthTokenUrl] = useState<string | null>(null);
  const [apiPathTyped, setApiPath] = useState<string | null>(null);
  const [timeoutMsTyped, setTimeoutMs] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("apikey");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [samlAssertion, setSamlAssertion] = useState("");
  /*
   * How the SuccessFactors assertion is supplied. "key" — CoreEdge signs a
   * fresh one per token exchange — is the default because it is the one that
   * keeps working: a pasted assertion expires, by SAP's default in ten minutes.
   */
  const [samlSigning, setSamlSigning] = useState<"key" | "assertion">("key");
  const [samlPrivateKey, setSamlPrivateKey] = useState("");
  const [samlUserId, setSamlUserId] = useState("");
  /*
   * "Allow writes" (P0.3). Null until the person touches the box, and until
   * then it follows the connection being replaced: ticked when that one allows
   * writes, so re-saving to rotate credentials keeps them on.
   */
  const [allowWritesChoice, setAllowWritesChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A save that went through with a warning from the probe of its new secret: shown before the page reloads. */
  const [savedWarning, setSavedWarning] = useState<SavedWarning | null>(null);

  /*
   * THE ROW THIS SAVE REPLACES, and what is stored on it. The key is
   * normalized exactly as the server stores it, or "SF-Prod" would read as
   * new against a stored "sf-prod".
   */
  const normalizedKey = sanitizeTenantKey(key);
  const replacing = connections.find((c) => c.product === product && c.key === normalizedKey) ?? null;
  const stored = storedFormSettings(replacing);
  const client = clientTyped ?? stored.client;
  const label = labelTyped ?? stored.label;
  const baseUrl = baseUrlTyped ?? stored.baseUrl;
  /** A deactivated row whose stored environment a live row now holds starts blank, as on main (`storedEnvironmentTwin`). */
  const environmentTwin = storedEnvironmentTwin(replacing, connections);
  const environment = environmentTyped ?? (environmentTwin ? "" : stored.environment);
  const authType = authTypeTyped ?? stored.authType;
  const oauthTokenUrl = oauthTokenUrlTyped ?? stored.oauthTokenUrl;
  const apiPath = apiPathTyped ?? stored.apiPath;
  const timeoutMs = timeoutMsTyped ?? stored.timeoutMs;
  /** The stored settings this save changes, said before Save (`changedStoredSettings`). */
  const changedSettings = replacing
    ? changedStoredSettings(stored, { product, client, label, baseUrl, environment, authType, oauthTokenUrl, apiPath, timeoutMs })
    : [];

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

  /*
   * SAP RETIRES BASIC FOR SUCCESSFACTORS — said BEFORE Save, on new rows only.
   *
   * A warning, not a disabled button: Basic still authenticates until SAP's
   * (tentative) deletion date, and the server saves it too. A key that matches
   * an existing connection of this product is a re-save — credential rotation
   * on a connection already running — so it gets no notice.
   */
  const isNewConnection = replacing === null;
  /**
   * Writes are live on the row being replaced — active AND allowed, the rule
   * the route applies. A save always leaves the row active, so defaulting
   * from `writeEnabled` alone re-armed the writes of a deactivated connection.
   */
  const writableToday = Boolean(replacing?.isActive && replacing.writeEnabled);
  /*
   * WRITES ARE ALLOWED FOR A SYSTEM, NOT A ROW (P0.3 review round 2). A save
   * that points a writing row at another environment, SAP host or base path,
   * or SAP client
   * would switch writes on there for the first time, so the box does not
   * carry them over: it starts unticked, and ticking it is enabling writes —
   * the route's rule, by the same function.
   */
  const movedFields: WriteTargetField[] = replacing
    ? writeTargetChanges(replacing, formWriteTarget({ product, environment, baseUrl, client }))
    : [];
  const movesWrites = writableToday && movedFields.length > 0;
  const allowWrites = allowWritesChoice ?? (writableToday && !movesWrites);
  /** This save would switch off writes the connection allows today (on the system it points at today). */
  const turnsWritesOff = writableToday && !allowWrites && !movesWrites;
  /** The upsert stores the row active, so saving a deactivated row brings it back. */
  const reactivatesRow = replacing !== null && !replacing.isActive;
  const basicAuthNotice =
    authType === "basic" && isNewConnection ? (basicAuthNotices[product] ?? null) : null;

  // Mirrors the server's superRefine. Reported as you type so the disabled
  // button is never a mystery.
  const missing: string[] = [];
  if (key.trim().length < 1) missing.push("a tenant key");
  if (label.trim().length < 2) missing.push("a label");
  if (!baseUrl.startsWith("https://")) missing.push("an https base URL");
  if (authType === "basic" && (!username.trim() || !password)) missing.push("a username and password");
  if (authType === "bearer" && !bearerToken) missing.push("a bearer token");
  if (authType === "api-key" && !apiKey) missing.push("an API key");
  // The header the key travels in cannot be one the transport sets itself —
  // sending a key as Authorization is not API-key auth, it is a different
  // request. Said here as well as refused by the route, so the rule is visible
  // where the field is typed rather than only after Save.
  if (authType === "api-key" && apiKeyHeader.trim() && !isAllowedApiKeyHeader(apiKeyHeader))
    missing.push("a header name of its own (not Authorization, Cookie or Host)");
  if (authType === "oauth-client-credentials" && (!clientId.trim() || !clientSecret || !oauthTokenUrl.startsWith("https://")))
    missing.push("a client id, secret and https token URL");
  if (
    authType === "oauth-saml-bearer" &&
    (!clientId.trim() || !companyId.trim() || !oauthTokenUrl.startsWith("https://"))
  )
    missing.push("an API key, company id and https token URL");
  if (authType === "oauth-saml-bearer" && samlSigning === "key" && (!samlPrivateKey.trim() || !samlUserId.trim()))
    missing.push("the registration's private key and the SuccessFactors user id to sign for");
  if (authType === "oauth-saml-bearer" && samlSigning === "assertion" && !samlAssertion.trim())
    missing.push("a pre-signed SAML assertion");

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithStepUp("/api/studio/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          connectionSaveBody(
            {
              product, client, key, label, baseUrl, environment, authType, apiKey, apiKeyHeader, username,
              password, bearerToken, clientId, clientSecret, oauthTokenUrl, companyId, samlAssertion,
              samlSigning, samlPrivateKey, samlUserId, apiPath, timeoutMs, allowWrites,
            },
            // What this form showed for the row it replaces: the route refuses
            // the save (409) when the row has changed since the page loaded —
            // deactivated by an operator, say (P0.3 review round 2).
            replacing ? { isActive: replacing.isActive, writeEnabled: replacing.writeEnabled } : null,
          ),
        ),
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
        .catch(() => null)) as {
        error?: { message?: string; correlationId?: string };
        data?: { rotationProbe?: { outcome?: string; warning?: string | null } };
      } | null;

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
      /*
       * SAVED, BUT SAP REFUSED THE NEW SECRET OR COULD NOT CHECK IT (wave 2
       * final review round 3). Under observe the save goes through and its
       * response says what the probe found; reloading at once would wipe the
       * one sentence that says calls are about to fail. The typed secrets are
       * cleared here instead, and the warning stays until the person reloads.
       */
      const warning = json?.data?.rotationProbe?.warning;
      if (warning) {
        for (const clear of [setPassword, setBearerToken, setApiKey, setClientSecret, setSamlAssertion, setSamlPrivateKey]) clear("");
        setSavedWarning({ refused: json?.data?.rotationProbe?.outcome === "rejected", text: warning });
        setBusy(false);
        return;
      }
      // A FULL reload, deliberately: the form holds typed SECRETS, and a
      // router.refresh() keeps client state — leaving a password sitting in a
      // React field after save. Reload is the reset that clears it.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The connection could not be saved.");
      setBusy(false);
    }
  }, [product, client, key, label, baseUrl, environment, authType, username, password, bearerToken, apiKey, apiKeyHeader, clientId, clientSecret, oauthTokenUrl, companyId, samlAssertion, samlSigning, samlPrivateKey, samlUserId, apiPath, timeoutMs, allowWrites, replacing]);

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
          {environmentTwin && environmentTyped === null ? (
            <span data-testid="environment-twin-notice" style={{ fontSize: 11, lineHeight: "16px", color: "var(--status-awaiting-fg)" }}>
              This connection was {replacing?.environment}, but “{environmentTwin.label}” ({environmentTwin.key}) is now the
              active {replacing?.environment} connection, so the field starts blank. Give this one another environment, or
              deactivate that one first.
            </span>
          ) : null}
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
          <option value="api-key">API key header — SAP Business Accelerator Hub sandbox</option>
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
      {basicAuthNotice && (
        <p
          role="status"
          data-testid="sf-basic-auth-notice"
          style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--status-awaiting-fg)" }}
        >
          {basicAuthNotice}
        </p>
      )}
      {authType === "bearer" && (
        <Label text="Bearer token">
          <input type="password" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} autoComplete="new-password" style={input} />
        </Label>
      )}
      {authType === "api-key" && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr" }}>
          <Label text="API key">
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" style={input} />
          </Label>
          <Label text="Header name">
            {/* SAP's sandbox reads `apikey`; other API-key gateways name theirs
                differently. Sent as its own header — no Authorization at all,
                and never a header the transport sets for itself. */}
            <input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} placeholder="apikey" style={input} />
          </Label>
        </div>
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
          <Label text="Assertion">
            <select
              value={samlSigning}
              onChange={(e) => setSamlSigning(e.target.value as "key" | "assertion")}
              style={input}
            >
              <option value="key">CoreEdge signs a fresh one for each token (recommended)</option>
              <option value="assertion">Paste a pre-signed assertion (expires)</option>
            </select>
          </Label>
          {samlSigning === "key" ? (
            <>
              <Label text="SuccessFactors user id">
                <input value={samlUserId} onChange={(e) => setSamlUserId(e.target.value)} autoComplete="off" style={input} />
              </Label>
              <Label text="Private key — paste the whole Certificate.pem">
                {/* What Admin Center → Manage OAuth2 Client Applications →
                    Generate X.509 Certificate downloads: its key block (labelled
                    ENCRYPTED, though it is not) and its certificate, which is
                    used to check the pair before saving. A PEM key the customer
                    generated and registered themselves works too. Sealed like
                    every other secret and never shown again; the route refuses
                    one that cannot sign before it is stored. */}
                <textarea
                  value={samlPrivateKey}
                  onChange={(e) => setSamlPrivateKey(e.target.value)}
                  rows={4}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="-----BEGIN ENCRYPTED PRIVATE KEY----- … -----BEGIN CERTIFICATE----- …"
                  style={{ ...input, fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}
                />
              </Label>
            </>
          ) : (
            <Label text="SAML assertion">
              {/* A textarea, not an input: assertions are multi-kilobyte base64
                  documents and a single-line field makes them unpasteable in
                  practice. From your IdP or SAP's offline generator — and it
                  stops working when it expires, which is why the key is the
                  default above. */}
              <textarea
                value={samlAssertion}
                onChange={(e) => setSamlAssertion(e.target.value)}
                rows={4}
                // A bearer credential until it expires: no autofill, and no
                // enhanced spellcheck sending it to a vendor's servers.
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the signed assertion"
                style={{ ...input, fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}
              />
            </Label>
          )}
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

      <fieldset
        style={{ margin: 0, padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-input, 8px)", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <legend style={{ padding: "0 4px", fontSize: 13, fontWeight: 600, color: "var(--ink-primary)" }}>Writes</legend>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--ink-primary)" }}>
          <input
            type="checkbox"
            checked={allowWrites}
            onChange={(e) => setAllowWritesChoice(e.target.checked)}
            aria-describedby="connection-writes-hint"
          />
          Allow writes through this connection
        </label>
        <span id="connection-writes-hint" style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-muted)" }}>
          A create interface writes into SAP only through a connection that allows writes, for a declared
          environment, with an approved write grant and a write key issued under API Access. Allowing writes is a
          governance action: Save asks for your passkey and the change is recorded.
        </span>
        {turnsWritesOff ? (
          <p role="status" data-testid="writes-off-notice" style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--status-awaiting-fg)" }}>
            This connection allows writes today. Saving it without Allow writes turns them off, and every create through
            it is refused until it is saved again with writes allowed.
          </p>
        ) : null}
        {movesWrites ? (
          <p role="status" data-testid="writes-moved-notice" style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--status-awaiting-fg)" }}>
            This connection allows writes on {describeTarget(replacing)}. This save points it at a different{" "}
            {movedFields.map((f) => TARGET_FIELD_NAMES[f]).join(", ")}, so Allow writes starts unticked: writes are not
            carried to another system. Ticking it switches writes on for the new one, which asks for your passkey and is
            recorded as enabling writes.
          </p>
        ) : null}
      </fieldset>

      {reactivatesRow ? (
        <p role="status" data-testid="reactivates-notice" style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--status-awaiting-fg)" }}>
          This connection is deactivated. Saving it makes it active again
          {allowWrites ? ", with writes on" : ""}, so it serves calls from then on. If it was stopped on purpose, check
          with whoever stopped it first.
        </p>
      ) : null}

      {changedSettings.length > 0 ? (
        <p role="status" data-testid="settings-changed-notice" style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--status-awaiting-fg)" }}>
          This save changes the stored {changedSettings.map((f) => STORED_SETTING_NAMES[f]).join(", ")} of this connection.
          Fields left as they were keep what is stored.
        </p>
      ) : null}

      {error && (
        <p style={{ ...body, color: "var(--status-error, #8E2A26)" }} role="alert">{error}</p>
      )}

      {savedWarning ? (
        <div
          role="alert"
          data-testid="rotation-probe-warning"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 12,
            borderRadius: "var(--radius-input, 8px)",
            background: savedWarning.refused ? "var(--status-revoked-bg)" : "var(--status-awaiting-bg)",
            color: savedWarning.refused ? "var(--status-revoked-fg)" : "var(--status-awaiting-fg)",
          }}
        >
          <strong style={{ fontSize: 13 }}>Saved, with a warning</strong>
          <span style={{ fontSize: 13, lineHeight: "20px" }}>{savedWarning.text}</span>
          <span>
            <button type="button" style={testBtn} onClick={() => window.location.reload()}>
              Reload connections
            </button>
          </span>
        </div>
      ) : null}

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

/** What a save that went through says about the probe of its new secret (rotation.ts `rotationProbeWarning`). */
interface SavedWarning {
  /** SAP refused the new secret: drawn as an error, not a caution. */
  readonly refused: boolean;
  readonly text: string;
}

/** How the settings-changed notice names each stored setting. */
const STORED_SETTING_NAMES: Record<StoredSetting, string> = {
  label: "label",
  baseUrl: "base URL",
  environment: "environment",
  client: "SAP client",
  authType: "auth type",
  oauthTokenUrl: "token URL",
  apiPath: "probe path",
  timeoutMs: "timeout",
};

/** How the moved-writes notice names each part of the write target. */
const TARGET_FIELD_NAMES: Record<WriteTargetField, string> = {
  environment: "environment",
  baseUrl: "SAP host or base path",
  client: "SAP client",
};

/**
 * The system a row's writes are allowed for, in words: "DEV at host/path
 * client 100". The base path is named with the host, because behind a
 * path-routed gateway it is what tells two systems apart (review round 3).
 */
function describeTarget(c: Pick<StudioConnection, "environment" | "baseUrl" | "client"> | null): string {
  if (!c) return "";
  let host = c.baseUrl;
  try {
    const url = new URL(c.baseUrl);
    host = `${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    // Shown as stored.
  }
  return `${c.environment ?? "an undeclared environment"} at ${host}${c.client ? ` client ${c.client}` : ""}`;
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
