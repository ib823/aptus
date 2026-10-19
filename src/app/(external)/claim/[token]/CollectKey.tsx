"use client";

import { useState, type ReactNode } from "react";

import { MaskedKey } from "@/components/coreedge/MaskedKey";
import { StatusChip } from "@/components/coreedge/StatusChip";

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
}

function isCollectedKey(value: unknown): value is CollectedKey {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rawToken === "string" &&
    typeof v.environment === "string" &&
    typeof v.solutionName === "string" &&
    typeof v.tail === "string"
  );
}

export function CollectKey({
  collectPath,
  keyPrefix,
  solutionName,
  environment,
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
          <p className="text-xs text-ink-muted">From now on your lane shows only the reference:</p>
          <MaskedKey prefix={keyPrefix} tail={key.tail} />
        </div>

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
