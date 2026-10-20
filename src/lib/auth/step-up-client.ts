/**
 * The browser half of the governance step-up (roadmap P0.12).
 *
 * A governance route refused with STEP_UP_REQUIRED is not a "no", it is "not
 * without your passkey". `fetchWithStepUp` turns that refusal into a passkey
 * prompt and sends the same request again, so every console control that
 * performs a governance action keeps its own fetch and its own error handling
 * and gains the step-up by changing one call.
 *
 * WHO ASKS. The console layouts mount <StepUpDialog />, which registers itself
 * here and asks in a dialog: the person presses "Use passkey" there, which is
 * the user gesture some browsers require before they will show a passkey
 * prompt — the original button press may have expired by the time the 403
 * arrives. With no dialog mounted, the ceremony runs directly.
 *
 * RETRIED ONCE, with the same `init`. Every caller sends a JSON string body,
 * which can be sent twice; a stream body could not, and nothing here sends one.
 * If the retry is refused again, that response is what the caller sees.
 */

import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

import { isPromptableStepUpCode, STEP_UP_CODES } from "@/lib/auth/step-up-codes";
import { humanizeWebAuthnError } from "@/lib/errors";

export type PromptableStepUpCode = "STEP_UP_REQUIRED" | "STEP_UP_ENROLMENT_REQUIRED";

export type StepUpCeremonyResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** enrol: no passkey to use. cancelled: the person dismissed the prompt. */
      readonly reason: "enrol" | "cancelled" | "failed";
      /** A sentence to show, or null when there is nothing to say (cancelled). */
      readonly message: string | null;
    };

function errorOf(body: unknown): { code?: string; message?: string } {
  if (typeof body !== "object" || body === null || !("error" in body)) return {};
  const error = (body as { error?: unknown }).error;
  return typeof error === "object" && error !== null ? (error as { code?: string; message?: string }) : {};
}

/**
 * Ask the browser for this person's passkey and record the assertion on their
 * session. Never throws: every outcome is a result the dialog can render.
 */
export async function runStepUpCeremony(): Promise<StepUpCeremonyResult> {
  try {
    const optionsRes = await fetch("/api/auth/webauthn/step-up/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const optionsBody: unknown = await optionsRes.json().catch(() => null);
    if (!optionsRes.ok) {
      const { code, message } = errorOf(optionsBody);
      if (code === STEP_UP_CODES.enrolmentRequired) {
        return { ok: false, reason: "enrol", message: message ?? null };
      }
      return { ok: false, reason: "failed", message: message ?? "Couldn't start the passkey check. Try again." };
    }
    const options = (optionsBody as { data: PublicKeyCredentialRequestOptionsJSON }).data;

    const assertion = await startAuthentication({ optionsJSON: options });

    const verifyRes = await fetch("/api/auth/webauthn/step-up/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: assertion }),
    });
    if (!verifyRes.ok) {
      const { message } = errorOf(await verifyRes.json().catch(() => null));
      return { ok: false, reason: "failed", message: message ?? "The passkey check failed. Try again." };
    }
    return { ok: true };
  } catch (err) {
    // null means the person dismissed the browser's prompt: not an error.
    const friendly = humanizeWebAuthnError(err);
    return friendly === null
      ? { ok: false, reason: "cancelled", message: null }
      : { ok: false, reason: "failed", message: friendly };
  }
}

/**
 * Resolves true once the person has stepped up (retry), false when they did
 * not (show the refusal as it came).
 */
export type StepUpPrompt = (code: PromptableStepUpCode) => Promise<boolean>;

let registeredPrompt: StepUpPrompt | null = null;

/** Register the dialog that asks. Returns the unregister function. */
export function registerStepUpPrompt(prompt: StepUpPrompt): () => void {
  registeredPrompt = prompt;
  return () => {
    if (registeredPrompt === prompt) registeredPrompt = null;
  };
}

/** No dialog mounted: try the passkey directly; enrolment needs a screen. */
async function promptWithoutDialog(code: PromptableStepUpCode): Promise<boolean> {
  if (code !== STEP_UP_CODES.required) return false;
  return (await runStepUpCeremony()).ok;
}

/**
 * `fetch`, plus: a 403 carrying a step-up code asks for the passkey and, once
 * given, sends the request again.
 */
export async function fetchWithStepUp(input: string, init?: RequestInit): Promise<Response> {
  const first = await fetch(input, init);
  if (first.status !== 403) return first;

  // Read a clone, so the caller can still read the refusal itself.
  const { code } = errorOf(await first.clone().json().catch(() => null));
  if (!isPromptableStepUpCode(code)) return first;

  const steppedUp = await (registeredPrompt ?? promptWithoutDialog)(code);
  if (!steppedUp) return first;
  return fetch(input, init);
}
