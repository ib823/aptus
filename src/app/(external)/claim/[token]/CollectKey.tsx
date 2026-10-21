"use client";

import { useState, type ReactNode } from "react";

import { MaskedKey } from "@/components/coreedge/MaskedKey";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { rotationOverlapSentence } from "@/lib/northbound/key-policy";

import { ClaimRefused } from "./ClaimRefused";

/**
 * The button that mints the key, and the one screen that shows it.
 *
 * THE KEY IS MINTED BY A POST FROM THIS CLICK, NOT BY OPENING THE URL. Mail
 * scanners and chat unfurlers GET every link in a message before a person
 * does; they do not press buttons or send POSTs. Minting on the GET handed the
 * only copy of the key to whichever of them got there first. The same defence
 * the magic-link confirm page uses, for the same reason.
 *
 * THE KEY IS SHOWN IN FULL HERE AND NOWHERE ELSE. It arrives in the POST's
 * response body, exists in this component's state for as long as the tab is
 * open, and is never re-readable: the server keeps only its hash. `MaskedKey`
 * — a component that has no code path to render a whole key — is used for the
 * reference AFTERWARDS while the full value is printed here directly. Keeping
 * them apart is what lets MaskedKey be audited by reading its props.
 */

interface CollectedKey {
  readonly rawToken: string;
  readonly environment: string;
  readonly solutionName: string;
  readonly tail: string;
  /** `ce_live_` or `ce_test_` — the key's own prefix, for the masked reference. */
  readonly tokenPrefix?: string;
  /** ISO date the key stops working, or null where it has no expiry (P0.11). */
  readonly expiresAt?: string | null;
  /** ISO date the key it replaced stops working — the rotation overlap — or null. */
  readonly previousValidUntil?: string | null;
}

type CollectState =
  | { readonly kind: "ready" }
  | { readonly kind: "collecting" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "refused" }
  | { readonly kind: "collected"; readonly key: CollectedKey };

export interface CollectKeyProps {
  /** Where the POST goes: `/claim/<token>/collect`. */
  readonly collectPath: string;
  /** The non-secret key prefix, for the masked reference afterwards. */
  readonly keyPrefix: string;
  /** What the key is for, from the page's read-only check — names, never a key. */
  readonly solutionName: string;
  readonly environment: string;
  /** When the key would expire if collected now (ISO), or null where it would have none. */
  readonly keyExpiresAt: string | null;
  /**
   * The rotation overlap in force, in hours (0 when rotation cuts over at
   * once) — for the advice about renewing this key later.
   */
  readonly overlapHours: number;
  /**
   * The working key collecting replaces, or null when there is none:
   * `overlapHours` at most, and `stopsAt` (ISO) when its own expiry ends the
   * window sooner — worked out by the server, by the claim's own rule.
   */
  readonly replacedKey: { readonly overlapHours: number; readonly stopsAt: string | null } | null;
}

/** What collecting does to the key it replaces, in words that cannot overstate it (P0.11). */
function replacedKeySentence(replacedKey: CollectKeyProps["replacedKey"]): string {
  if (replacedKey === null) return "";
  if (replacedKey.stopsAt !== null) {
    return ` It replaces a key that is still working; that key stops at ${formatDateTime(replacedKey.stopsAt)}, when it expires, so deploy this one before then.`;
  }
  if (replacedKey.overlapHours > 0) {
    return ` It replaces a key that is still working; that key keeps working for up to ${replacedKey.overlapHours} hours after you collect this one, so you can switch without a failed call.`;
  }
  return " It replaces a key that is still working; that key stops the moment you collect this one, so deploy this one straight away.";
}

const optionalString = (v: unknown): boolean => v === undefined || v === null || typeof v === "string";

function isCollectedKey(value: unknown): value is CollectedKey {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rawToken === "string" &&
    typeof v.environment === "string" &&
    typeof v.solutionName === "string" &&
    typeof v.tail === "string" &&
    optionalString(v.tokenPrefix) &&
    optionalString(v.expiresAt) &&
    optionalString(v.previousValidUntil)
  );
}

export function CollectKey({
  collectPath,
  keyPrefix,
  solutionName,
  environment,
  keyExpiresAt,
  overlapHours,
  replacedKey,
}: CollectKeyProps): ReactNode {
  const [state, setState] = useState<CollectState>({ kind: "ready" });

  async function collect(): Promise<void> {
    // A second press while the first is in flight would be refused as spent,
    // and replace the key on screen with "this link can't be used".
    if (state.kind === "collecting") return;
    setState({ kind: "collecting" });
    try {
      const response = await fetch(collectPath, { method: "POST", cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: unknown }).data
          : null;
      setState(response.ok && isCollectedKey(data) ? { kind: "collected", key: data } : { kind: "refused" });
    } catch {
      // Not a refusal: the request may never have arrived, so the link may
      // still be good. Saying "this link can't be used" here would send the
      // person to ask for a new one they do not need.
      setState({ kind: "unreachable" });
    }
  }

  if (state.kind === "refused") return <ClaimRefused />;

  if (state.kind === "collected") {
    const { key } = state;
    return (
      <main className="coreedge mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 p-6">
        <StatusChip status="live" />
        <h1 className="text-xl font-medium text-ink">
          Your key for {key.solutionName} · {key.environment}
        </h1>

        <p className="max-w-prose text-sm text-ink-soft">
          Copy it now. It is shown once and cannot be shown again — not by support, not from a
          backup. The system genuinely does not hold it.
        </p>

        {/*
          Printed directly rather than through MaskedKey, which has no code path
          that renders a whole key. `select-all` so one click takes the value, and
          `font-mono` so an O and a 0 are distinguishable.
        */}
        <code className="select-all break-all rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-ink-tint p-4 font-mono text-sm text-ink">
          {key.rawToken}
        </code>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-muted">
            From now on CoreEdge shows this key only by its reference, the same one on the Keys screen
            and in the app&apos;s settings:
          </p>
          <MaskedKey prefix={key.tokenPrefix ?? keyPrefix} tail={key.tail} />
        </div>

        <p className="max-w-prose text-sm text-ink-soft">
          {key.expiresAt
            ? `It stops working on ${formatDate(key.expiresAt)}. Before then, ask for a new link or have the key rotated — ${rotationOverlapSentence(overlapHours)}.`
            : "It has no expiry. Revoke it when it is no longer needed."}
        </p>
        {key.previousValidUntil ? (
          <p className="max-w-prose text-sm text-ink-soft">
            The key this replaces keeps working until {formatDateTime(key.previousValidUntil)}, so
            deploy this one before then.
          </p>
        ) : null}

        <p className="max-w-prose text-xs text-ink-muted">
          This link is now spent. Opening it again issues nothing.
        </p>
      </main>
    );
  }

  const collecting = state.kind === "collecting";
  return (
    <main className="coreedge mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 p-6">
      <StatusChip status="noKey" />
      <h1 className="text-xl font-medium text-ink">
        Collect your key for {solutionName} · {environment}
      </h1>

      <p className="max-w-prose text-sm text-ink-soft">
        The key is created when you press the button, and shown once. Have somewhere safe to put
        it before you do — it cannot be shown again, not by support and not from a backup.
      </p>
      <p className="max-w-prose text-sm text-ink-soft">
        {keyExpiresAt
          ? `It will stop working on ${formatDate(keyExpiresAt)}.`
          : "It will have no expiry."}
        {replacedKeySentence(replacedKey)}
      </p>

      <button
        type="button"
        onClick={() => void collect()}
        aria-busy={collecting}
        aria-disabled={collecting}
        className="rounded-[var(--radius-input)] bg-navy px-4 py-2 text-sm font-medium text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
      >
        {collecting ? "Collecting…" : "Collect your key"}
      </button>
      {state.kind === "unreachable" ? (
        <p role="status" className="text-xs text-gate-bad-fg">
          The server could not be reached. Try again.
        </p>
      ) : null}
    </main>
  );
}
