"use client";

/**
 * The passkey prompt a governance action raises when its route answers
 * STEP_UP_REQUIRED (or STEP_UP_ENROLMENT_REQUIRED) — see lib/auth/step-up.ts
 * for the server side and lib/auth/step-up-client.ts for the retry.
 *
 * WHY A DIALOG AND NOT THE BROWSER PROMPT STRAIGHT AWAY. By the time the 403
 * comes back, the press that sent the request may no longer count as a user
 * gesture, and some browsers will not show a passkey prompt without one. The
 * "Use passkey" button here is a fresh gesture, and it also tells the person
 * why they are being asked.
 *
 * NO PASSKEY YET: the dialog offers enrolment in place, then the check, so
 * the person finishes the action they started instead of being sent to
 * another screen and having to find their way back.
 *
 * ONE DIALOG FOR ANY NUMBER OF ASKERS. Two controls refused together share the
 * one prompt and its answer, rather than the second silently replacing the
 * first and leaving its caller waiting forever.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Loader2, ShieldCheck } from "lucide-react";

import { PasskeyRegistrationButton } from "@/components/auth/PasskeyRegistrationButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STEP_UP_CODES, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up-codes";
import { registerStepUpPrompt, runStepUpCeremony } from "@/lib/auth/step-up-client";

type Phase = "confirm" | "enrol";

const WINDOW_MINUTES = Math.round(STEP_UP_MAX_AGE_SECONDS / 60);

export function StepUpDialog() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("confirm");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = useRef<((steppedUp: boolean) => void)[]>([]);

  useEffect(
    () =>
      registerStepUpPrompt(
        (code) =>
          new Promise<boolean>((resolve) => {
            waiting.current.push(resolve);
            // A second asker joins the open prompt; it does not restart it.
            if (waiting.current.length > 1) return;
            setError(null);
            setPhase(code === STEP_UP_CODES.required ? "confirm" : "enrol");
            setOpen(true);
          }),
      ),
    [],
  );

  const finish = useCallback((steppedUp: boolean) => {
    const resolvers = waiting.current;
    waiting.current = [];
    setOpen(false);
    setWorking(false);
    for (const resolve of resolvers) resolve(steppedUp);
  }, []);

  const confirm = useCallback(async () => {
    setWorking(true);
    setError(null);
    const result = await runStepUpCeremony();
    if (result.ok) {
      finish(true);
      return;
    }
    setWorking(false);
    if (result.reason === "enrol") setPhase("enrol");
    // A dismissed browser prompt says nothing; the button is there to retry.
    else if (result.message) setError(result.message);
  }, [finish]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : finish(false))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {phase === "confirm" ? "Confirm with your passkey" : "Add a passkey to continue"}
          </DialogTitle>
          <DialogDescription>
            {phase === "confirm"
              ? `Approving access, issuing or revoking keys and changing a connection's secrets need a passkey check from the last ${WINDOW_MINUTES} minutes. Confirm once and what you were doing goes through.`
              : "Approving access, issuing or revoking keys and changing a connection's secrets need a passkey, and your account has none yet. Add one on this device, then confirm with it."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {phase === "confirm" ? (
          <Button onClick={() => void confirm()} disabled={working} className="w-full">
            {working ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {working ? "Checking…" : "Use passkey"}
          </Button>
        ) : (
          <div className="space-y-2">
            <PasskeyRegistrationButton onSuccess={() => setPhase("confirm")} />
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Your passkey stays on your device. You can manage it under Settings → Security.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => finish(false)} disabled={working}>
            Cancel — nothing changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
