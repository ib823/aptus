"use client";

/**
 * Runtime client credentials — issue, rotate, revoke.
 *
 * The token is displayed exactly once, immediately after it is minted, because
 * the server keeps only a hash and genuinely cannot show it again. The copy says
 * so plainly rather than politely: a developer who assumes they can come back
 * for it later will be locked out of their own integration.
 *
 * Segregation of duties is enforced server-side. This UI states the rule up
 * front so it reads as governance rather than as an error, and so the owner
 * knows to ask a colleague before they try.
 *
 * EXPIRY AND THE ROTATION OVERLAP (P0.11). A TEST or PROD key must expire:
 * the form pre-fills the default and caps the date at the maximum, and a PROD
 * key cannot be issued without one. The table shows each key's expiry, flags a
 * TEST or PROD key issued before that rule as "no expiry - set one", and —
 * after a rotation — until when the replaced key still works. The state comes
 * from the server, judged by the broker's own rule, so an expired key never
 * reads "active" here.
 *
 * THE WRITE KEY IS ISSUED HERE (P0.3). POST /api/studio/clients/write-credential
 * shipped with every gate and no screen that called it, while the Interfaces
 * screen told builders to "issue the write credential under API Access" — a
 * button that did not exist. Each live credential row now carries an "Issue
 * write key" action (or "Replace write key" once one exists), offered to a
 * builder who does not own the app, and only where a second person has
 * approved a CREATE or UPDATE grant for that environment. Where it cannot
 * succeed the row says why in words, beside the disabled control, rather than
 * leaving the route's refusal to be the first notice. The route stays the
 * authority: it re-checks every gate and asks for a fresh passkey
 * (`write_key.issue`), and the key is shown once, like the bearer token.
 *
 * THE KEY COLUMN IS THE KEY'S OWN REFERENCE (P0.3, A45): its prefix and the
 * last four characters of the key itself, recorded at mint — the reference the
 * claim page and the CoreEdge keys screen show for the same key.
 */

import { useRouter } from "next/navigation";

import { useCallback, useMemo, useState } from "react";

import { fetchWithStepUp } from "@/lib/auth/step-up-client";
import { KEY_STATE_LABELS, replacedKeyStopsEarly, requiresExpiry, type KeyState } from "@/lib/northbound/key-policy";

export interface CredentialSummary {
  id: string;
  solutionId: string;
  solutionName: string;
  /** Null only when the solution row is gone; see `disambiguate`. */
  solutionSlug: string | null;
  label: string;
  environment: string;
  sapClient?: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** Judged server-side by the broker's own rule (key-policy.ts). */
  state: KeyState;
  /** `ce_live_`, `ce_test_`, or `ce_` for a key minted before P0.11. */
  tokenPrefix: string;
  expiresAt: string | null;
  /** Until when the key a rotation replaced still works, or null. */
  previousValidUntil: string | null;
  /**
   * The last four characters of the current key (P0.3, A45), or null for a key
   * minted before they were recorded. Never more of the key.
   */
  tokenTail: string | null;
  /** A write key is sealed on this credential — presence only, never the key. */
  writeKeyIssued: boolean;
  /**
   * A live, approved CREATE or UPDATE grant covers this credential's
   * environment for its solution: the precondition the write-key route checks,
   * judged by the same predicates (grantsWrite, unexpired, unrevoked).
   */
  writeGrantLive: boolean;
  /**
   * The write-key route refuses this credential until it has an expiry: a
   * TEST or PROD key minted before expiry was mandatory (`noExpiry`) while
   * COREEDGE_KEY_EXPIRY is enforced — the route's own gate 5b
   * (`lacksRequiredExpiry`), judged server-side because the mode is (P0.3
   * review round 1).
   */
  writeKeyNeedsExpiry: boolean;
}

/** What the "Issue write key" control on one credential row may do, and why not. */
export interface WriteKeyAction {
  readonly enabled: boolean;
  readonly label: "Issue write key" | "Replace write key";
  /** Shown beside a disabled control; null when the action is available. */
  readonly reason: string | null;
}

/**
 * The write-key action for one credential row, from the facts the page holds.
 * Mirrors the route's gates in the order a person can act on them; the route
 * re-checks all of them and the ones this screen cannot see (owners named,
 * the passkey). The expiry rule is seen: the page judges it with the route's
 * own predicate and mode (`writeKeyNeedsExpiry`).
 */
export function writeKeyAction(
  c: Pick<CredentialSummary, "state" | "environment" | "writeKeyIssued" | "writeGrantLive" | "writeKeyNeedsExpiry">,
  viewerOwns: boolean,
): WriteKeyAction {
  const label = c.writeKeyIssued ? "Replace write key" : "Issue write key";
  if (!(c.state === "active" || c.state === "noExpiry")) {
    return {
      enabled: false,
      label,
      reason: "This credential is not live (expired, revoked or inactive). A write key is sealed onto a live credential only — rotate it first.",
    };
  }
  if (viewerOwns) {
    return {
      enabled: false,
      label,
      reason: "You own this app, so a colleague who does not own it issues its write key.",
    };
  }
  if (c.writeKeyNeedsExpiry) {
    return {
      enabled: false,
      label,
      reason: `This ${c.environment} key has no expiry, and a write key sealed on it would never end either. Rotate it first to give it one, then issue its write key.`,
    };
  }
  if (!c.writeGrantLive) {
    return {
      enabled: false,
      label,
      reason: `No approved CREATE or UPDATE grant covers ${c.environment} for this app. Request one in the ledger above; a colleague approves it.`,
    };
  }
  return { enabled: true, label, reason: null };
}

/** The key policy in force, for the form's defaults and limits. */
export interface CredentialKeyPolicy {
  /** The longest a TEST or PROD key may live, in days. */
  maxTtlDays: number;
  /** The default expiry date (YYYY-MM-DD) for a TEST or PROD key minted today. */
  defaultExpiry: string;
  /** How long a replaced key keeps working, in hours; 0 when rotation cuts over at once. */
  overlapHours: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD for a day offset from today, in UTC — the zone the server judges in. */
function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/**
 * What the Rotate button promises about the key it replaces. The overlap
 * never outlasts that key's own expiry (key-policy.ts), so a key that expires
 * inside the window is told when it stops, not "N hours" (review round 2).
 */
function rotateTitle(c: CredentialSummary, overlapHours: number): string {
  if (overlapHours <= 0 || !(c.state === "active" || c.state === "noExpiry")) return "Mint a new key";
  const stopsAt = replacedKeyStopsEarly(
    { isActive: true, revokedAt: null, expiresAt: c.expiresAt ? new Date(c.expiresAt) : null },
    new Date(),
    null,
    overlapHours,
  );
  return stopsAt !== null
    ? `Mint a new key; this one keeps working until it expires at ${stopsAt.toLocaleString()}`
    : `Mint a new key; this one keeps working for ${overlapHours} hours`;
}

export interface CredentialSolution {
  id: string;
  name: string;
  /** Unique within the organization, unlike `name`. See `disambiguate`. */
  slug: string;
  /** True when the viewer owns it — they may not mint its credential. */
  viewerOwns: boolean;
}

/**
 * The names that more than one solution answers to.
 *
 * A credential is chosen by solution and verified by reading the name back, and
 * `Solution.name` carries no uniqueness — the schema constrains
 * `@@unique([organizationId, slug])` and nothing else. Two solutions called
 * "QA-E2E-Main" are therefore legal, and a credential minted against the wrong
 * one is indistinguishable from a correct one in the picker, in the credentials
 * table, and in the auto-generated `<solution> · <environment>` label. The
 * symptom is a northbound interface list that comes back empty with nothing on
 * screen to explain it.
 *
 * The slug is shown ONLY where the name is genuinely ambiguous. Appending it
 * everywhere would put a technical identifier in front of every reader to solve
 * a problem most organizations do not have; showing it exactly when it
 * discriminates keeps the common case clean and makes its appearance meaningful.
 */
export function ambiguousNames(names: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) twice.add(n);
    seen.add(n);
  }
  return twice;
}

/** `name` alone, or `name (slug)` when the name does not identify one solution. */
export function disambiguate(
  name: string,
  slug: string | null,
  ambiguous: ReadonlySet<string>,
): string {
  return ambiguous.has(name) && slug ? `${name} (${slug})` : name;
}

export function ClientCredentials({
  credentials,
  solutions,
  canIssue,
  connectedEnvironments,
  keyPolicy,
}: {
  credentials: readonly CredentialSummary[];
  solutions: readonly CredentialSolution[];
  canIssue: boolean;
  /**
   * Environments at least one ACTIVE connection declares, upper-cased. The
   * picker offered SANDBOX / DEV / TEST / PROD with nothing to say which of
   * them anything serves — SANDBOX is first and the natural starting point, and
   * on a DEV-only estate it produced a credential that was issued cleanly and
   * failed at every call. Now each option says so before it is chosen.
   */
  connectedEnvironments: readonly string[];
  keyPolicy: CredentialKeyPolicy;
}) {
  const router = useRouter();
  const [solutionId, setSolutionId] = useState(solutions[0]?.id ?? "");
  const [environment, setEnvironment] = useState("SANDBOX");
  /*
   * The SAP client half of the binding. Optional by design: most products
   * address no client, and requiring one would be a field nobody could fill.
   * Where a landscape holds several data containers (on-premise, RISE), a
   * credential without it can only ever be refused as AMBIGUOUS.
   */
  const [sapClient, setSapClient] = useState("");
  /*
   * The expiry DATE (UTC). Sent as the start of that day, so the default — the
   * day the maximum lifetime ends — never lands past the maximum. Pre-filled
   * where an expiry is mandatory, empty (no expiry) elsewhere — so empty for
   * the SANDBOX the picker starts on; switching environment re-applies that
   * rule rather than carrying a choice across.
   */
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string; warning: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The one-time write key just minted, shown like the bearer token. */
  const [writeKey, setWriteKey] = useState<{ key: string; warning: string } | null>(null);
  /** Replacing a write key stops the current one at once, so it is confirmed first. */
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);

  /*
   * Computed from the organization's full solution list, so the picker and the
   * credentials table below reach the same verdict about which names are
   * ambiguous. Deriving them separately is how the two would eventually
   * disagree — the picker qualifying a name the table left bare, which is worse
   * than neither doing it.
   */
  const ambiguousSolutionNames = useMemo(
    () => ambiguousNames(solutions.map((s) => s.name)),
    [solutions],
  );

  const call = useCallback(async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const res = await fetchWithStepUp("/api/studio/clients", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data?: { token?: string; warning?: string };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? "The request failed.");
      if (json.data?.token) {
        setIssued({ token: json.data.token, warning: json.data.warning ?? "" });
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  /*
   * Mint a write key onto one credential row (P0.3). Through fetchWithStepUp:
   * the route asks for a fresh passkey (`write_key.issue`) once
   * COREEDGE_STEP_UP is enforce, and this turns that refusal into the prompt.
   */
  const issueWriteKey = useCallback(async (c: CredentialSummary) => {
    setBusy(true);
    setError(null);
    setIssued(null);
    setWriteKey(null);
    setConfirmReplace(null);
    try {
      const res = await fetchWithStepUp("/api/studio/clients/write-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solutionId: c.solutionId, environment: c.environment }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { writeKey?: string; warning?: string };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.data?.writeKey) {
        throw new Error(json?.error?.message ?? `The write key could not be issued (HTTP ${res.status}).`);
      }
      setWriteKey({ key: json.data.writeKey, warning: json.data.warning ?? "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The write key could not be issued.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const viewerOwns = (solutionId: string) => solutions.find((s) => s.id === solutionId)?.viewerOwns ?? false;

  const selected = solutions.find((s) => s.id === solutionId);

  return (
    <section style={card}>
      <h2 style={h2}>Runtime credentials</h2>
      <p style={body}>
        A client credential is what a deployed application uses to call CoreEdge. It is issued
        per solution <em>and environment</em> — one for DEV, one for TEST, one for PROD, each
        carrying that solution&apos;s approved access in that environment and nothing more.
        Re-issuing for an environment replaces that environment&apos;s token only.
      </p>
      <p style={{ ...body, marginTop: 8 }}>
        TEST and PROD keys expire, at most {keyPolicy.maxTtlDays} days after they are issued.{" "}
        {keyPolicy.overlapHours > 0
          ? `Rotating gives the key a new lifetime, and the key it replaces keeps working for up to ${keyPolicy.overlapHours} hours (never past its own expiry) so you can deploy the new one without a failed call.`
          : "Rotating gives the key a new lifetime, and the key it replaces stops at once."}{" "}
        If a key has leaked, revoke it instead — that ends the current and the previous key at once.
      </p>

      {canIssue && solutions.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>
            <span style={labelText}>Solution</span>
            <select value={solutionId} onChange={(e) => setSolutionId(e.target.value)} style={field}>
              {solutions.map((s) => (
                <option key={s.id} value={s.id}>
                  {disambiguate(s.name, s.slug, ambiguousSolutionNames)}
                  {s.viewerOwns ? " (you own this)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelText}>Environment</span>
            <select
              value={environment}
              onChange={(e) => {
                setEnvironment(e.target.value);
                setExpiresOn(requiresExpiry(e.target.value) ? keyPolicy.defaultExpiry : "");
              }}
              style={field}
            >
              {["SANDBOX", "DEV", "TEST", "PROD"].map((e) => (
                <option key={e} value={e}>
                  {connectedEnvironments.includes(e) ? e : `${e} — no connection`}
                </option>
              ))}
            </select>
            {!connectedEnvironments.includes(environment) && (
              <span style={{ display: "block", marginTop: 4, fontSize: 11, lineHeight: "16px", color: "var(--status-awaiting-fg)", maxWidth: 260 }}>
                No active connection declares {environment}. A credential issued for it
                will authenticate and then be refused at the environment binding on every
                call. Add the connection first, or pick an environment that has one.
              </span>
            )}
          </label>
          <label>
            <span style={labelText}>SAP client (optional)</span>
            <input
              value={sapClient}
              onChange={(e) => setSapClient(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="100"
              inputMode="numeric"
              style={field}
            />
            <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
              Only for systems that address one — on-premise and RISE. Leave empty otherwise.
            </span>
          </label>
          <label>
            <span style={labelText}>
              Expires on (UTC){requiresExpiry(environment) ? "" : " — optional"}
            </span>
            <input
              type="date"
              value={expiresOn}
              min={utcDate(1)}
              {...(requiresExpiry(environment) ? { max: utcDate(keyPolicy.maxTtlDays) } : {})}
              required={environment === "PROD"}
              onChange={(e) => setExpiresOn(e.target.value)}
              style={field}
            />
            <span style={{ display: "block", marginTop: 4, fontSize: 11, lineHeight: "16px", color: "var(--ink-muted)", maxWidth: 260 }}>
              {requiresExpiry(environment)
                ? `${environment} keys must expire, at most ${keyPolicy.maxTtlDays} days from today. The key stops at 00:00 UTC on this day.`
                : "Leave empty for a key with no expiry."}
            </span>
          </label>
          <button
            type="button"
            disabled={
              busy ||
              !solutionId ||
              Boolean(selected?.viewerOwns) ||
              (environment === "PROD" && expiresOn.length === 0)
            }
            onClick={() =>
              call("POST", {
                solutionId,
                environment,
                ...(sapClient ? { sapClient } : {}),
                ...(expiresOn ? { expiresAt: `${expiresOn}T00:00:00.000Z` } : {}),
                /*
                 * The label is stored, and is what someone reads back weeks
                 * later to decide whether a credential is the right one. It
                 * qualifies the same way the picker does — otherwise the one
                 * durable record of which solution a token belongs to is the
                 * one place the ambiguity survives.
                 */
                label: `${
                  selected
                    ? disambiguate(selected.name, selected.slug, ambiguousSolutionNames)
                    : "solution"
                } · ${environment}${sapClient ? `/${sapClient}` : ""}`,
              })
            }
            title={
              selected?.viewerOwns
                ? "You own this solution — a colleague must issue its credential"
                : "Issue a credential"
            }
            style={{ ...btnPrimary, opacity: selected?.viewerOwns ? 0.5 : 1 }}
          >
            Issue credential
          </button>
        </div>
      )}

      {selected?.viewerOwns && canIssue && (
        <p style={{ ...muted, marginTop: 10 }}>
          You own this solution, so you cannot mint its runtime credential — the same
          second-pair-of-eyes rule that applies to approving access. Ask a colleague to issue it.
        </p>
      )}

      {issued && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--surface-banner-warn)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card-warm, 12px)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>{issued.warning}</p>
          <code
            style={{
              display: "block",
              padding: 10,
              background: "var(--surface-paper)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-input, 8px)",
              fontSize: 12,
              wordBreak: "break-all",
              userSelect: "all",
            }}
          >
            {issued.token}
          </code>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(issued.token)}
            style={{ ...btnSmall, marginTop: 10 }}
          >
            Copy
          </button>
        </div>
      )}

      {writeKey && (
        <div
          role="status"
          data-testid="write-key-once"
          style={{ marginTop: 16, padding: 16, background: "var(--surface-banner-warn)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card-warm, 12px)" }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--ink-primary)" }}>{writeKey.warning}</p>
          <code
            style={{
              display: "block",
              padding: 10,
              background: "var(--surface-paper)",
              color: "var(--ink-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-input, 8px)",
              fontSize: 12,
              wordBreak: "break-all",
              userSelect: "all",
            }}
          >
            {writeKey.key}
          </code>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(writeKey.key)}
            style={{ ...btnSmall, marginTop: 10 }}
          >
            Copy write key
          </button>
        </div>
      )}

      {error && <p role="alert" style={{ marginTop: 12, fontSize: 13, color: "var(--status-revoked-fg)" }}>{error}</p>}

      {credentials.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
                <Th>Solution</Th>
                <Th>Env</Th>
                <Th>Key</Th>
                <Th>State</Th>
                <Th>Expires</Th>
                <Th>Last used</Th>
                <Th>Write key</Th>
                {canIssue && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {credentials.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--border-default)" }}>
                  <Td>{disambiguate(c.solutionName, c.solutionSlug, ambiguousSolutionNames)}</Td>
                  <Td>{c.sapClient ? `${c.environment}/${c.sapClient}` : c.environment}</Td>
                  <Td>
                    {/* The key's own reference (A45): prefix and the key's last four. */}
                    <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
                      {c.tokenPrefix}…{c.tokenTail ?? ""}
                    </span>
                    {c.tokenTail === null ? (
                      <span style={{ ...muted, display: "block" }}>ending not recorded</span>
                    ) : null}
                  </Td>
                  <Td>
                    <span
                      style={
                        c.state === "noExpiry" || c.state === "expired"
                          ? { color: "var(--status-awaiting-fg)", fontWeight: 600 }
                          : undefined
                      }
                    >
                      {KEY_STATE_LABELS[c.state]}
                    </span>
                  </Td>
                  <Td>
                    {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "no expiry"}
                    {c.previousValidUntil ? (
                      <span style={{ ...muted, display: "block" }}>
                        previous key works until {new Date(c.previousValidUntil).toLocaleString()}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : "never used"}</Td>
                  <Td>{c.writeKeyIssued ? "issued" : "none"}</Td>
                  {canIssue && (
                    <Td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => call("PATCH", { clientId: c.id, action: "rotate" })}
                          title={rotateTitle(c, keyPolicy.overlapHours)}
                          style={btnSmall}
                        >
                          Rotate
                        </button>
                        {!c.revokedAt && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => call("PATCH", { clientId: c.id, action: "revoke" })}
                            style={btnDanger}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                      {(() => {
                        const action = writeKeyAction(c, viewerOwns(c.solutionId));
                        const reasonId = `write-key-reason-${c.id}`;
                        if (confirmReplace === c.id) {
                          return (
                            <div style={{ marginTop: 6, maxWidth: 280 }}>
                              <p style={{ ...muted, margin: "0 0 6px" }}>
                                Replacing it stops the current write key at once. Deploy the new one straight after.
                              </p>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button type="button" disabled={busy} onClick={() => void issueWriteKey(c)} style={btnDanger}>
                                  Replace now
                                </button>
                                <button type="button" onClick={() => setConfirmReplace(null)} style={btnSmall}>
                                  Keep current key
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div style={{ marginTop: 6, maxWidth: 280 }}>
                            <button
                              type="button"
                              disabled={busy || !action.enabled}
                              aria-describedby={action.reason ? reasonId : undefined}
                              onClick={() => (c.writeKeyIssued ? setConfirmReplace(c.id) : void issueWriteKey(c))}
                              style={{ ...btnSmall, opacity: action.enabled ? 1 : 0.5, cursor: action.enabled ? "pointer" : "not-allowed" }}
                            >
                              {action.label}
                            </button>
                            {action.reason ? (
                              <span id={reasonId} style={{ ...muted, display: "block", marginTop: 4 }}>
                                {action.reason}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-secondary)", whiteSpace: "nowrap" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "9px 12px", verticalAlign: "top", color: "var(--ink-primary)" }}>{children}</td>;
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
const muted: React.CSSProperties = { fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };
const labelText: React.CSSProperties = { display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-secondary)" };
const field: React.CSSProperties = { height: 40, borderRadius: "var(--radius-input, 8px)", border: "1px solid var(--border-strong)", background: "var(--surface-paper)", color: "var(--ink-primary)", fontSize: 14, padding: "0 8px" };
const btnPrimary: React.CSSProperties = { height: 40, padding: "0 16px", borderRadius: "var(--radius-input, 8px)", background: "var(--brand-navy)", color: "var(--surface-paper)", border: "1px solid var(--brand-navy)", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const btnSmall: React.CSSProperties = { height: 28, padding: "0 10px", borderRadius: "var(--radius-input, 8px)", background: "var(--surface-paper)", color: "var(--brand-navy)", border: "1px solid var(--brand-navy)", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnDanger: React.CSSProperties = { ...btnSmall, color: "var(--cta-red)", border: "1px solid var(--cta-red)" };
