/**
 * Probe before swap: rotating a SAP connection's secret without downtime.
 *
 * WHAT IT REPLACES. `upsertSapConnection` writes the new secret unconditionally
 * — save, then test. So a mistyped password takes EVERY lane on that system down
 * until someone notices and fixes it, and the person who typed it finds out from
 * an outage rather than from a form. The design's claim on that screen is "no
 * downtime", and save-then-test cannot make it.
 *
 * THE ORDER IS THE WHOLE CAPABILITY:
 *
 *   1. Sign in with the NEW secret while the old one still serves traffic.
 *   2. Read metadata with it, and one row from one service, so the probe proves
 *      what a real call needs rather than only that a password is accepted.
 *   3. Swap ONLY if every step passed. On failure nothing is written and the old
 *      secret keeps working — the system stays up and the form says why.
 *
 * WHY A DATA READ AND NOT JUST A SIGN-IN. A communication user can authenticate
 * and still be unauthorised for every entity set, which is the single most common
 * failure in this system. A rotation that probes only the sign-in swaps in a
 * credential that authenticates and cannot read — and reports success.
 *
 * THE GRACE WINDOW, and why it is NOT the overlap `issue.ts` refuses. That module
 * says of the northbound client token: "There is deliberately no grace period
 * where both work: an overlap window is exactly how a leaked credential survives
 * its own rotation." That is right, and it is a different situation. A client
 * token is an app's credential TO US, and we decide when it stops working — so an
 * overlap is a decision to keep accepting a possibly-leaked secret. A connection
 * secret is OUR credential TO SAP, and SAP decides which passwords work; keeping
 * our copy briefly does not extend the old secret's life by one second. It only
 * lets a call that already read the old value finish. The window is therefore
 * about in-flight requests, not about access.
 */

export const GRACE_WINDOW_MS = 5 * 60 * 1000;

export type ProbeStep = "sign-in" | "metadata" | "data-read";

export type ProbeStepResult =
  | { readonly step: ProbeStep; readonly ok: true }
  | { readonly step: ProbeStep; readonly ok: false; readonly detail: string };

export interface RotationProbe {
  readonly signIn: ProbeStepResult;
  readonly metadata: ProbeStepResult | null;
  readonly dataRead: ProbeStepResult | null;
}

export type RotationDecision =
  | {
      readonly swap: true;
      readonly probe: RotationProbe;
      /** When the previous secret may be discarded. */
      readonly graceUntil: Date;
    }
  | {
      readonly swap: false;
      readonly probe: RotationProbe;
      /** Which step stopped it, and what the person who typed it should do. */
      readonly failedAt: ProbeStep;
      readonly reason: string;
    };

/**
 * Decide from the probe results alone.
 *
 * Pure on purpose: the network calls belong to the caller, and the DECISION —
 * which is the part that must never be wrong — is testable without any of them.
 *
 * A step that was never attempted is `null`, not a failure. If sign-in fails
 * there is nothing to say about metadata, and reporting it as failed would blame
 * the service for a password.
 */
export function decideRotation(probe: RotationProbe, now: Date = new Date()): RotationDecision {
  if (!probe.signIn.ok) {
    return {
      swap: false,
      probe,
      failedAt: "sign-in",
      reason:
        "SAP rejected the new credential. Nothing was changed and the current secret is still " +
        `serving. ${probe.signIn.detail}`,
    };
  }

  if (probe.metadata === null) {
    return {
      swap: false,
      probe,
      failedAt: "metadata",
      reason:
        "The metadata check did not run, so the new credential is unproven. Nothing was changed.",
    };
  }
  if (!probe.metadata.ok) {
    return {
      swap: false,
      probe,
      failedAt: "metadata",
      reason:
        "The new credential signed in but could not read the service metadata. Nothing was " +
        `changed and the current secret is still serving. ${probe.metadata.detail}`,
    };
  }

  if (probe.dataRead === null) {
    return {
      swap: false,
      probe,
      failedAt: "data-read",
      reason:
        "The data read did not run, so the new credential is unproven. A credential can sign in " +
        "and still be unauthorised for every entity set, so this check is not optional. Nothing " +
        "was changed.",
    };
  }
  if (!probe.dataRead.ok) {
    return {
      swap: false,
      probe,
      failedAt: "data-read",
      reason:
        "The new credential signed in and read metadata, but SAP refused a data read — so " +
        "swapping it would leave every lane on this system unable to read. Nothing was changed. " +
        probe.dataRead.detail,
    };
  }

  return {
    swap: true,
    probe,
    graceUntil: new Date(now.getTime() + GRACE_WINDOW_MS),
  };
}

/**
 * The sentence shown beside a refused rotation.
 *
 * It always says that nothing changed, because that is the reassurance the
 * person needs first: they mistyped a production password and the thing they are
 * most afraid of — that they have just broken the client's integration — did not
 * happen.
 */
export function rotationRefusalHeadline(decision: RotationDecision): string | null {
  if (decision.swap) return null;
  switch (decision.failedAt) {
    case "sign-in":
      return "That credential didn't work. Nothing changed.";
    case "metadata":
      return "The credential signed in but couldn't read the service. Nothing changed.";
    case "data-read":
      return "The credential signed in but SAP refused a read. Nothing changed.";
  }
}
