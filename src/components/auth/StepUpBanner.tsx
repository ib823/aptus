"use client";

/**
 * The console banner for the governance step-up (lib/auth/step-up.ts).
 *
 * WARN MODE IS A COUNTDOWN, AND THE BANNER IS WHAT SAYS SO. Actions go ahead
 * without a passkey and each one leaves a STEP_UP_MISSING row; the people
 * taking them need to hear, before enforcement, that a passkey is coming and
 * that they can add or use one now. Worded by whether they have a passkey
 * yet, because "add one" and "confirm with yours" are different requests.
 *
 * ENFORCE MODE shows it only to people with no passkey: they are the ones
 * about to be refused, and the dialog will offer enrolment anyway.
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up-codes";
import { runStepUpCeremony } from "@/lib/auth/step-up-client";

const ACTIONS =
  "Approving or revoking access, issuing, rotating or revoking keys, sending claim links and changing a connection's secrets or writes";

const WINDOW_MINUTES = Math.round(STEP_UP_MAX_AGE_SECONDS / 60);

export interface StepUpBannerProps {
  readonly mode: "warn" | "enforce";
  readonly hasPasskey: boolean;
}

export function StepUpBanner({ mode, hasPasskey }: StepUpBannerProps) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const confirmNow = useCallback(async () => {
    setState("working");
    setError(null);
    const result = await runStepUpCeremony();
    if (result.ok) {
      setState("done");
      return;
    }
    setState("idle");
    if (result.message) setError(result.message);
  }, []);

  const message =
    mode === "enforce"
      ? `${ACTIONS} need a passkey, and your account has none. Add one to take these actions.`
      : hasPasskey
        ? `${ACTIONS} will soon need a passkey check from the last ${WINDOW_MINUTES} minutes. Until then they go ahead and are recorded as taken without one.`
        : `${ACTIONS} will soon need a passkey, and your account has none. Add one now. Until then these actions go ahead and are recorded as taken without a passkey check.`;

  return (
    <div
      role="status"
      data-testid="step-up-banner"
      className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {state === "done"
          ? `Confirmed. Actions in the next ${WINDOW_MINUTES} minutes count as passkey-checked.`
          : message}
        {error && <span className="ml-1 font-medium">{error}</span>}
      </p>
      {hasPasskey ? (
        state !== "done" && (
          <Button size="sm" variant="outline" onClick={() => void confirmNow()} disabled={state === "working"}>
            {state === "working" ? "Checking…" : "Confirm with passkey now"}
          </Button>
        )
      ) : (
        <Button size="sm" variant="outline" asChild>
          <Link href="/settings/security">Add a passkey</Link>
        </Button>
      )}
    </div>
  );
}
