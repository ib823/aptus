"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { ACTIONS, RECHECK_COPY } from "@/lib/coreedge/copy";
import type { LaneEnvironment } from "@/lib/coreedge/lanes";

import { useVerb } from "./useVerb";

/**
 * "Re-check now" — the sweep's per-lane work, on demand.
 *
 * THE ROW KEEPS ITS STATUS AND ITS AGE WHILE THIS RUNS. PR-2's contract:
 * loading never blanks a known state. So this renders a busy button and a
 * sentence beside it, and touches nothing else on the page — the chip above it
 * goes on saying what was last proven, which remains true until a new answer
 * replaces it. A spinner where the status used to be would throw away the one
 * fact the person is looking at.
 *
 * A SKIP IS A RESULT. The lane may have nothing to check — no dataset, no
 * system, a secret that will not open — and each of those has its own sentence
 * rather than a shared failure. Pressing again will not change any of them.
 */

export interface RecheckLaneProps {
  readonly solutionId: string;
  readonly interfaceId: string;
  readonly environment: LaneEnvironment;
  readonly blockedBecause?: string | undefined;
  readonly idPrefix: string;
}

type RecheckResult =
  | { readonly ok: true; readonly readStatus: string }
  | { readonly ok: false; readonly skipped: keyof typeof RECHECK_COPY.skipped };

export function RecheckLane({
  solutionId,
  interfaceId,
  environment,
  blockedBecause,
  idPrefix,
}: RecheckLaneProps): ReactNode {
  const router = useRouter();
  const onDone = useCallback(() => router.refresh(), [router]);
  const verb = useVerb<RecheckResult>("/api/coreedge/lanes/recheck", onDone);
  const reasonId = `${idPrefix}-recheck-reason`;

  if (blockedBecause !== undefined) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          aria-disabled="true"
          aria-describedby={reasonId}
          className="text-left text-sm text-ink-disabled"
        >
          {ACTIONS.recheck.button}
        </button>
        <span id={reasonId} className="text-xs text-ink-muted">
          {blockedBecause}
        </span>
      </span>
    );
  }

  const skipped = verb.data !== null && !verb.data.ok ? verb.data.skipped : null;

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        aria-busy={verb.pending}
        onClick={() => verb.run({ solutionId, interfaceId, environment })}
        className="rounded-[var(--radius-input)] border border-[color:var(--border-default)] px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
      >
        {verb.pending ? RECHECK_COPY.running : ACTIONS.recheck.button}
      </button>
      {verb.error === null ? null : (
        <span role="status" className="text-xs text-gate-bad-fg">
          {verb.error}
        </span>
      )}
      {skipped === null ? null : (
        <span role="status" className="text-xs text-ink-soft">
          {RECHECK_COPY.skipped[skipped]}
        </span>
      )}
    </span>
  );
}
