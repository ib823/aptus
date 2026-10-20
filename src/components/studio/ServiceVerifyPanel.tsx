"use client";

/**
 * Verify — ask the SAP system for this interface's service description, live.
 *
 * One button per chosen environment. CoreEdge reads the service's $metadata
 * through the organization's own connection for that environment and reports
 * whether the service exists, whether sign-in worked, which datasets it offers,
 * and whether the interface's dataset is one of them. It reads no business
 * data. For your own API a successful verify is what lets a write interface be
 * activated, and written through IN THAT ENVIRONMENT — the panel lists each
 * environment verified, because a DEV verify does not open PROD writes; for a
 * catalogue service it is information.
 *
 * The datasets come back as a picker: choosing one saves it on the interface
 * (a contract change, so verification clears) and verifies again at once, so
 * the developer never has to type an entity-set name SAP already told us.
 * When the service says it is another OData version than the interface does,
 * the panel offers to switch the version and verify again — the only other
 * way out of that answer would be a hand-written API call.
 *
 * A RESULT DESCRIBES ONE VERSION. Every verify answer carries the interface
 * version it was asked about, and is shown only while the interface is still
 * that version. A path, version or dataset saved elsewhere on the page bumps
 * the version, so a green "verified" and the old service's dataset picker
 * disappear instead of sitting under "Not verified since it last changed"
 * (review round 2) — and a dataset picked here can only come from the
 * service the interface now names.
 */

import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useState } from "react";

import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";

export interface VerifiedEnvironment {
  environment: string;
  /** ISO timestamp. */
  at: string;
  sapClient: string | null;
  /**
   * The connection that answered has since been edited (host or client),
   * deactivated, or re-declared: the write gate no longer accepts this entry.
   */
  connectionChanged?: boolean;
}

export interface VerifyTarget {
  product: string;
  environment: string;
  sapClient: string | null;
  label: string;
}

interface VerifyOutcome {
  status: string;
  verified: boolean;
  detail: string;
  entitySets: string[];
  entitySet: string | null;
  suggestedEntitySet: string | null;
  detectedODataVersion?: string | null;
  boundTo: { label: string; environment: string | null; sapClient: string | null } | null;
  /** The interface version the answer describes. */
  interfaceVersion?: number;
}

const CHIP: Record<string, { status: HonestStatus; label: string }> = {
  OK: { status: "ACTIVATED", label: "verified" },
  ENTITY_SET_MISSING: { status: "NEEDS_SETUP", label: "dataset not found" },
  VERSION_MISMATCH: { status: "NEEDS_SETUP", label: "version differs" },
  UNAUTHORIZED: { status: "NEEDS_SETUP", label: "sign-in refused" },
  NOT_FOUND: { status: "NOT_FOUND", label: "no such service" },
  TIMEOUT: { status: "PROBE_FAILED", label: "no answer" },
  ERROR: { status: "PROBE_FAILED", label: "failed" },
  METADATA_TOO_LARGE: { status: "PROBE_FAILED", label: "too large" },
  CHANGED_DURING_VERIFY: { status: "PROBE_FAILED", label: "changed meanwhile" },
  BINDING_REFUSED: { status: "NOT_CHECKED", label: "no connection" },
};

function targetKey(t: VerifyTarget): string {
  return `${t.environment}::${t.sapClient ?? ""}`;
}

function targetLabel(t: VerifyTarget): string {
  return [t.environment, t.sapClient ? `client ${t.sapClient}` : null, t.label].filter(Boolean).join(" · ");
}

function bindingLabel(v: VerifiedEnvironment): string {
  return `${v.environment}${v.sapClient ? ` (client ${v.sapClient})` : ""}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/**
 * The dataset the picker opens on. A near match SAP's answer suggests comes
 * first; otherwise the interface's OWN dataset when the service lists it, so
 * the picker reads as "this is what you have" and "Use this dataset" starts
 * disabled. Opening on the first listed name instead turned one click on a
 * button that looks like "confirm" into a contract change — new version,
 * verification cleared, a live write interface back to draft (review round 3).
 */
export function initialDatasetPick(
  out: Pick<VerifyOutcome, "entitySets" | "entitySet" | "suggestedEntitySet">,
  current: string | null,
): string {
  if (out.suggestedEntitySet) return out.suggestedEntitySet;
  const own = current ?? out.entitySet;
  if (own && out.entitySets.includes(own)) return own;
  return out.entitySets[0] ?? "";
}

export function ServiceVerifyPanel({
  interfaceId,
  interfaceVersion,
  isCustom,
  entitySet,
  verifiedAt,
  verifiedEnvironment,
  verifiedEntitySets,
  verifiedEnvironments = [],
  odataVersion = null,
  liveWrite = false,
  targets,
  canAuthor,
}: {
  interfaceId: string;
  /**
   * The interface's current version. A result for another version is not
   * shown (see the header). Omitted: every result is shown.
   */
  interfaceVersion?: number;
  isCustom: boolean;
  entitySet: string | null;
  verifiedAt: string | null;
  verifiedEnvironment: string | null;
  verifiedEntitySets: readonly string[] | null;
  /** Your own API: each environment with a current successful verify. */
  verifiedEnvironments?: readonly VerifiedEnvironment[];
  /** Your own API: the declared OData version (V2 | V4). */
  odataVersion?: string | null;
  /**
   * Your own API, a WRITE interface that is ACTIVE: changing its dataset or
   * version clears verification and returns it to draft, so writes stop until
   * it is verified and activated again. Said before the click.
   */
  liveWrite?: boolean;
  /** This interface's product's declared connections only. */
  targets: readonly VerifyTarget[];
  canAuthor: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [targetId, setTargetId] = useState(targets[0] ? targetKey(targets[0]) : "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string>("");

  const target = useMemo(() => targets.find((t) => targetKey(t) === targetId) ?? null, [targets, targetId]);

  const verify = useCallback(async (): Promise<VerifyOutcome | null> => {
    if (!target) return null;
    const res = await fetch(`/api/studio/interfaces/${encodeURIComponent(interfaceId)}/verify-service`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ environment: target.environment, sapClient: target.sapClient }),
    });
    const json = (await res.json()) as { data?: VerifyOutcome; error?: { message?: string } };
    if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Verify could not run.");
    return json.data;
  }, [interfaceId, target]);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await verify();
      setOutcome(out);
      if (out) setPick(initialDatasetPick(out, entitySet));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify could not run.");
    } finally {
      setBusy(false);
    }
  }, [verify, router, entitySet]);

  /** Save a contract change (which clears verification), then verify the same target again. */
  const saveAndVerify = useCallback(
    async (change: Record<string, unknown>, failure: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/studio/interfaces", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: interfaceId, ...change }),
        });
        const json = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) throw new Error(json.error?.message ?? failure);
        setOutcome(await verify());
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : failure);
      } finally {
        setBusy(false);
      }
    },
    [interfaceId, verify, router],
  );

  const chooseDataset = useCallback(
    (name: string) => saveAndVerify({ entitySet: name }, "The dataset could not be saved."),
    [saveAndVerify],
  );

  const switchVersion = useCallback(
    (version: string) => saveAndVerify({ odataVersion: version }, "The OData version could not be saved."),
    [saveAndVerify],
  );

  // Only an answer about the contract the interface has NOW.
  const current =
    outcome !== null &&
    (interfaceVersion === undefined || outcome.interfaceVersion === undefined || outcome.interfaceVersion === interfaceVersion)
      ? outcome
      : null;
  const openBindings = verifiedEnvironments.filter((v) => !v.connectionChanged);
  const changedBindings = verifiedEnvironments.filter((v) => v.connectionChanged);

  const chip = current ? (CHIP[current.status] ?? { status: "PROBE_FAILED" as const, label: current.status.toLowerCase() }) : null;
  const sets = current?.entitySets ?? [];
  const detected = current?.detectedODataVersion ?? null;
  const canSwitchVersion =
    canAuthor &&
    isCustom &&
    current?.status === "VERSION_MISMATCH" &&
    (detected === "V2" || detected === "V4") &&
    detected !== odataVersion;
  const liveWriteWarning = liveWrite ? (
    <span style={{ ...muted, color: "var(--status-awaiting-fg)" }}>
      This write interface is live. Changing it clears verification and returns it to draft, so writes stop until it
      is verified and activated again.
    </span>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "inherit", fontSize: 13 }}>
      <span style={{ color: "var(--ink-primary)" }}>
        {verifiedAt
          ? `Last verified in ${verifiedEnvironment ?? "an environment"} on ${formatDate(verifiedAt)}` +
            (verifiedEntitySets ? ` · ${verifiedEntitySets.length} dataset${verifiedEntitySets.length === 1 ? "" : "s"}` : "")
          : "Not verified since it last changed"}
        {isCustom && (
          <span style={{ ...muted, display: "block" }}>
            {openBindings.length > 0
              ? "Writes are allowed only in the environments verified here: " +
                openBindings.map(bindingLabel).join(", ") +
                ". Verify every environment you will write to — a DEV verify does not open PROD."
              : "Writes through your own API are refused in each environment until it has been verified there."}
          </span>
        )}
        {isCustom && changedBindings.length > 0 && (
          <span style={{ ...muted, display: "block", color: "var(--status-awaiting-fg)" }}>
            {`Verify again: the connection for ${changedBindings.map(bindingLabel).join(", ")} has changed since it was verified, so writes there are refused.`}
          </span>
        )}
      </span>
      <span style={muted}>
        Verify asks the SAP system for this service&apos;s description ($metadata) through your connection and
        lists its datasets. It reads no business data.
      </span>

      {targets.length === 0 ? (
        <span style={muted}>
          No connection for this product declares an environment yet. Set one in{" "}
          <a href="/studio/connections" style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
            Connections
          </a>
          .
        </span>
      ) : (
        canAuthor && (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label htmlFor={`${ids}-target`} style={{ ...muted, fontWeight: 600 }}>
              Ask
            </label>
            <select
              id={`${ids}-target`}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              style={selectStyle}
            >
              {targets.map((t) => (
                <option key={targetKey(t)} value={targetKey(t)}>
                  {targetLabel(t)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void run()} disabled={busy || !target} style={btn}>
              {busy ? "Verifying…" : "Verify"}
            </button>
          </span>
        )
      )}

      <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {error && <span style={{ fontSize: 12, color: "var(--status-revoked-fg)" }}>{error}</span>}
        {current && chip && (
          <>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <StudioStatusChip status={chip.status} label={chip.label} />
              {current.boundTo && <span style={muted}>Answered by {current.boundTo.label}</span>}
            </span>
            <span style={{ color: "var(--ink-secondary)" }}>{current.detail}</span>
            {canSwitchVersion && (
              <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
                <span>
                  <button type="button" style={btn} disabled={busy} onClick={() => void switchVersion(detected!)}>
                    Switch to {detected} and verify again
                  </button>
                </span>
                {liveWriteWarning}
              </span>
            )}
            {canAuthor && current.status === "ENTITY_SET_MISSING" && current.suggestedEntitySet && (
              <span>
                <button
                  type="button"
                  style={linkBtn}
                  disabled={busy}
                  onClick={() => void chooseDataset(current.suggestedEntitySet!)}
                >
                  Did you mean {current.suggestedEntitySet}?
                </button>
              </span>
            )}
            {canAuthor && sets.length > 0 && (
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label htmlFor={`${ids}-sets`} style={{ ...muted, fontWeight: 600 }}>
                  Datasets
                </label>
                <select id={`${ids}-sets`} value={pick} onChange={(e) => setPick(e.target.value)} style={selectStyle}>
                  {sets.map((n) => (
                    <option key={n} value={n}>
                      {n}
                      {n === entitySet ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  style={btn}
                  disabled={busy || pick === "" || pick === entitySet}
                  onClick={() => void chooseDataset(pick)}
                >
                  Use this dataset
                </button>
                {liveWriteWarning}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const muted: React.CSSProperties = { fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };

const selectStyle: React.CSSProperties = {
  height: 30,
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 12.5,
  padding: "0 6px",
  maxWidth: 320,
};

const btn: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  border: "1px solid var(--border-strong)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--brand-navy)",
  cursor: "pointer",
  textDecoration: "underline",
};
