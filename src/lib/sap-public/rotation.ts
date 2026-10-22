/**
 * Probe before swap (P0.14): what a re-saved connection secret's probe found,
 * and what the save does about it. Pure; the network half is rotation-probe.ts.
 *
 * WHAT IT GUARDS. Re-saving a connection is how its secret is rotated, and the
 * save writes the new secret unconditionally. A mistyped password then takes
 * every lane on that system down, and the person who typed it finds out from
 * an outage. The probe sends the new credentials to SAP once, before they are
 * stored: the sign-in and the probe path's `$metadata`, the request the Test
 * button sends.
 *
 * WHAT IT MAY DO WITH THE ANSWER (wave 2 final review round 3). Every earlier
 * version refused a save on inference: SAP did not answer, answered slowly,
 * the dataset proven before was not proven again, the proof was too old. Each
 * of those refused correct rotations, and each fix added another inference.
 * So the probe now acts only on SAP's own answer about the new secret:
 *
 *   observe (the default, and any unrecognised value) — never refuses. The
 *             save stores what was sent; its response and its audit row say
 *             what SAP answered, and the form shows a warning when SAP refused
 *             the new secret or the probe could not check it.
 *   enforce — refuses one case only: SAP refused the sign-in with the new
 *             secret (its 401, or its token endpoint's 401 or 403) while the
 *             stored one is known to work. Everything else saves, as under
 *             observe.
 *   off     — no probe.
 *
 * No refusal is ever made without a request to SAP, and no audit row claims a
 * probe that did not reach it (`ran`).
 */

/** COREEDGE_ROTATION_PROBE. */
export type RotationProbeMode = "observe" | "enforce" | "off";

/** Only the exact words "enforce" and "off" change it; anything else observes. */
export function rotationProbeMode(env: Record<string, string | undefined> = process.env): RotationProbeMode {
  const raw = env.COREEDGE_ROTATION_PROBE?.trim().toLowerCase();
  if (raw === "enforce") return "enforce";
  if (raw === "off") return "off";
  return "observe";
}

/**
 *   passed    SAP answered the `$metadata` with a metadata document: it took the new secret.
 *   rejected  SAP refused the sign-in with the new secret: the tenant's 401,
 *             or the token endpoint's 401 or 403 (`probeOutcome`).
 *   noAnswer  a request was sent and SAP gave no verdict on the sign-in: it
 *             did not answer in time, failed (5xx), could not be reached, or
 *             answered something that is not about the credential (a 403 or
 *             404 from the service, a redirect, a page that is not a metadata
 *             document). `reason` says which.
 *   skipped   nothing was sent to SAP. `reason` says why.
 */
export type RotationProbeOutcome = "passed" | "rejected" | "noAnswer" | "skipped";

/**
 * What the save's audit row records (`rotationProbe`) and its response
 * carries. Facts only: never a secret, never SAP's own words.
 */
export interface RotationProbeRecord {
  readonly mode: RotationProbeMode;
  /** A request carrying the new credentials was sent to SAP or its token endpoint. */
  readonly ran: boolean;
  readonly outcome: RotationProbeOutcome;
  /** A bounded code: why it was skipped, or what SAP answered (`sap_http_401`, `token_timeout`, ...). */
  readonly reason: string;
}

/** Why a save was not probed: nothing was sent to SAP. */
export type RotationSkipReason =
  /** COREEDGE_ROTATION_PROBE=off. */
  | "probe_off"
  /** A new connection: no working secret to protect. */
  | "new_connection"
  /** A deactivated connection serves nothing. */
  | "deactivated"
  /** Served by the Tenant Twin: nothing is sent to the customer's SAP from here (transport.ts `reachedDirectly`). */
  | "tenant_twin"
  /** SAP refused the stored secret at its last probe: it is broken, which is when a secret is rotated. */
  | "last_probe_refused"
  /** No record that the stored secret works: no OK probe, no fresh lane read. */
  | "not_known_working"
  /** The save keeps the sign-in credentials (a label fix, Allow writes): nothing new to check. */
  | "credentials_unchanged"
  /** The save points the connection at another system: the old system's record says nothing about it. */
  | "repointed"
  /** No probe path, and the product has no default service (ECC without an API path): no request can be made. */
  | "no_probe_path"
  /** The new credentials could not be turned into a sign-in (a field missing, a key that cannot sign): nothing was sent. */
  | "credentials_unusable";

/** What the probe's one request came back with: connection-health.ts `fetchMetadataDocument`'s result. */
export interface ProbeAnswer {
  readonly status: string;
  readonly httpStatus: number | null;
  /** The credential step finished, so the tenant itself was called; false when the token endpoint is what answered. */
  readonly signedIn: boolean;
}

/**
 * The outcome of the probe's request, from what came back alone.
 *
 * REJECTED MEANS THE SIGN-IN WAS REFUSED: the token endpoint's 401 or 403
 * (it refused the client credentials or the assertion), or the tenant's 401
 * (it refused the user and password, or the token). The tenant's 403 is not:
 * it comes after a sign-in SAP accepted, and says the user may not read that
 * service, which is as often the communication arrangement not releasing
 * the probe path's `$metadata` as the credential (the Test button's own
 * words for it). Held against a correct secret probed at a service the
 * arrangement does not release, it refused correct rotations (wave 2 final
 * review round 1), so it is recorded, with its reason, as no verdict.
 */
export function probeOutcome(answer: ProbeAnswer): Pick<RotationProbeRecord, "ran" | "outcome" | "reason"> {
  const who = answer.signedIn ? "sap" : "token";
  if (answer.status === "OK") return { ran: true, outcome: "passed", reason: "metadata_ok" };
  const signInRefused = answer.signedIn
    ? answer.httpStatus === 401
    : answer.httpStatus === 401 || answer.httpStatus === 403;
  if (signInRefused) return { ran: true, outcome: "rejected", reason: `${who}_http_${answer.httpStatus}` };
  // The credential step refused before sending anything (connection-health.ts
  // maps a ConnectionConfigError or an unusable SAML key to UNAUTHORIZED with
  // no HTTP status): no request reached SAP.
  if (!answer.signedIn && answer.httpStatus === null && answer.status === "UNAUTHORIZED") {
    return { ran: false, outcome: "skipped", reason: "credentials_unusable" };
  }
  if (answer.status === "TIMEOUT") return { ran: true, outcome: "noAnswer", reason: `${who}_timeout` };
  if (answer.httpStatus !== null) return { ran: true, outcome: "noAnswer", reason: `${who}_http_${answer.httpStatus}` };
  return { ran: true, outcome: "noAnswer", reason: `${who}_unreachable` };
}

/**
 * Whether this save is refused: under enforce, and only when SAP refused the
 * sign-in with the new secret while the stored one is known to work.
 */
export function rotationRefused(record: RotationProbeRecord, storedKnownToWork: boolean): boolean {
  return record.mode === "enforce" && record.ran && record.outcome === "rejected" && storedKnownToWork;
}

function credentialWords(authType: string): { what: string; it: string; is: string } {
  return authType === "basic" ? { what: "password", it: "it", is: "is" } : { what: "credentials", it: "they", is: "are" };
}

/**
 * The warning the form shows after a save that stored a secret SAP refused,
 * or could not check. Null when there is nothing to warn about: the probe
 * passed, or did not apply. `detail` is the probe's own sentence
 * (connection-health.ts words it to be shown), never a secret.
 */
export function rotationProbeWarning(
  record: RotationProbeRecord,
  authType: string,
  detail: string | null,
): string | null {
  const { what, it, is } = credentialWords(authType);
  const why = detail ? ` ${detail}` : "";
  if (record.outcome === "rejected") {
    return `SAP refused the new ${what}; calls through this connection will fail until ${it} ${is} corrected.${why}`;
  }
  if (record.outcome === "noAnswer") {
    return `The new ${what} could not be checked: SAP did not say whether it accepts ${it === "it" ? "it" : "them"}.${why} It was saved; test the connection once SAP answers.`;
  }
  if (record.outcome === "skipped" && (record.reason === "no_probe_path" || record.reason === "credentials_unusable")) {
    return `The new ${what} could not be checked.${why} It was saved; test the connection to see whether SAP accepts ${it === "it" ? "it" : "them"}.`;
  }
  return null;
}

/** The refusal under enforce: SAP said no, and the working secret is still serving. */
export function rotationRefusal(authType: string, detail: string | null): string {
  const { what } = credentialWords(authType);
  return (
    `SAP refused the new ${what}, so nothing was changed and the current one is still serving. ` +
    `Check what was typed and save again.${detail ? ` ${detail}` : ""}`
  );
}
