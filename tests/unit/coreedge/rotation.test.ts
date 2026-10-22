/**
 * Probe before swap, the pure half (P0.14, rotation.ts; wave 2 final review
 * round 3): the setting's modes, how SAP's answer to the new secret is
 * classified, when a save is refused, and what the person saving is told.
 *
 * The probe used to refuse whenever the new secret was unproven; every one of
 * those inferences refused correct rotations somewhere. Now a save is refused
 * only under enforce, and only on SAP's own refusal of the sign-in.
 */

import { describe, expect, it } from "vitest";

import { isCredentialRefusal } from "@/lib/sap-public/oauth-saml-bearer";
import {
  probeOutcome,
  rotationProbeMode,
  rotationProbeWarning,
  rotationRefusal,
  rotationRefused,
  type RotationProbeRecord,
} from "@/lib/sap-public/rotation";

describe("COREEDGE_ROTATION_PROBE", () => {
  it("observes by default, and for any word it does not recognise", () => {
    expect(rotationProbeMode({})).toBe("observe");
    expect(rotationProbeMode({ COREEDGE_ROTATION_PROBE: "" })).toBe("observe");
    expect(rotationProbeMode({ COREEDGE_ROTATION_PROBE: "on" })).toBe("observe");
    expect(rotationProbeMode({ COREEDGE_ROTATION_PROBE: "enforced" })).toBe("observe");
    expect(rotationProbeMode({ COREEDGE_ROTATION_PROBE: "observe" })).toBe("observe");
  });

  it("enforces or turns off only on the exact word", () => {
    expect(rotationProbeMode({ COREEDGE_ROTATION_PROBE: " Enforce " })).toBe("enforce");
    expect(rotationProbeMode({ COREEDGE_ROTATION_PROBE: "OFF" })).toBe("off");
  });
});

describe("what SAP's answer says about the new secret", () => {
  it("a metadata document: passed", () => {
    expect(probeOutcome({ status: "OK", httpStatus: 200, signedIn: true })).toEqual({ ran: true, outcome: "passed", reason: "metadata_ok" });
  });

  it("a refused sign-in: the tenant's 401, or the token endpoint's 400, 401 or 403: rejected", () => {
    expect(probeOutcome({ status: "UNAUTHORIZED", httpStatus: 401, signedIn: true })).toEqual({
      ran: true,
      outcome: "rejected",
      reason: "sap_http_401",
    });
    expect(probeOutcome({ status: "UNAUTHORIZED", httpStatus: 401, signedIn: false }).reason).toBe("token_http_401");
    expect(probeOutcome({ status: "UNAUTHORIZED", httpStatus: 403, signedIn: false }).outcome).toBe("rejected");
  });

  /*
   * Wave 2 final review round 1 (high). The tenant's 403 comes after a sign-in
   * it accepted: a service whose $metadata the arrangement does not release
   * answers it to a correct secret. It is recorded, never acted on.
   */
  it("the tenant's 403 is not a refused sign-in: noAnswer", () => {
    expect(probeOutcome({ status: "UNAUTHORIZED", httpStatus: 403, signedIn: true })).toEqual({
      ran: true,
      outcome: "noAnswer",
      reason: "sap_http_403",
    });
  });

  it("no answer, a failure or an answer about something else: noAnswer, never rejected", () => {
    expect(probeOutcome({ status: "TIMEOUT", httpStatus: null, signedIn: true }).reason).toBe("sap_timeout");
    expect(probeOutcome({ status: "TIMEOUT", httpStatus: null, signedIn: false }).reason).toBe("token_timeout");
    expect(probeOutcome({ status: "ERROR", httpStatus: 503, signedIn: true }).reason).toBe("sap_http_503");
    expect(probeOutcome({ status: "NOT_FOUND", httpStatus: 404, signedIn: true }).outcome).toBe("noAnswer");
    expect(probeOutcome({ status: "ERROR", httpStatus: null, signedIn: true }).reason).toBe("sap_unreachable");
    // The token endpoint failing, or a wrong token URL, is not a verdict on the credential.
    expect(probeOutcome({ status: "ERROR", httpStatus: 503, signedIn: false }).outcome).toBe("noAnswer");
    expect(probeOutcome({ status: "ERROR", httpStatus: 404, signedIn: false }).outcome).toBe("noAnswer");
    // The tenant's own 400 is about the request, not the sign-in.
    expect(probeOutcome({ status: "ERROR", httpStatus: 400, signedIn: true }).outcome).toBe("noAnswer");
  });

  /*
   * Wave 2 rotation probe review round 1. SuccessFactors answers an assertion,
   * a key or a company id it will not take with RFC 6749's 400 invalid_grant.
   * The probe draws the token step's line where the broker and the Test button
   * draw it, the shared isCredentialRefusal (TOKEN_REJECTED), not a list of
   * its own that recorded the refusal as no verdict.
   */
  it("the token endpoint's 400 is a refused sign-in, by the shared classifier: rejected", () => {
    expect(probeOutcome({ status: "UNAUTHORIZED", httpStatus: 400, signedIn: false })).toEqual({
      ran: true,
      outcome: "rejected",
      reason: "token_http_400",
    });
    for (const status of [400, 401, 403, 404, 405, 429, 500, 503]) {
      expect(probeOutcome({ status: "UNAUTHORIZED", httpStatus: status, signedIn: false }).outcome === "rejected").toBe(
        isCredentialRefusal(status),
      );
    }
    for (const mode of ["observe", "enforce"] as const) {
      const r: RotationProbeRecord = { mode, ...probeOutcome({ status: "UNAUTHORIZED", httpStatus: 400, signedIn: false }) };
      expect(rotationRefused(r, true)).toBe(mode === "enforce");
      expect(rotationProbeWarning(r, "oauth-saml-bearer", null)).toMatch(/^SAP refused the new credentials/);
    }
  });

  it("a credential that could not be built sent nothing: skipped, and never said to have run", () => {
    expect(probeOutcome({ status: "UNAUTHORIZED", httpStatus: null, signedIn: false })).toEqual({
      ran: false,
      outcome: "skipped",
      reason: "credentials_unusable",
    });
  });
});

const record = (over: Partial<RotationProbeRecord>): RotationProbeRecord => ({
  mode: "enforce",
  ran: true,
  outcome: "rejected",
  reason: "sap_http_401",
  ...over,
});

describe("when a save is refused", () => {
  it("only under enforce, only on a rejection SAP made, only while the stored secret works", () => {
    expect(rotationRefused(record({}), true)).toBe(true);
    expect(rotationRefused(record({ mode: "observe" }), true)).toBe(false);
    expect(rotationRefused(record({}), false)).toBe(false);
    for (const outcome of ["passed", "noAnswer", "skipped"] as const) {
      expect(rotationRefused(record({ outcome }), true)).toBe(false);
    }
    // No refusal is inferred without a request to SAP.
    expect(rotationRefused(record({ ran: false }), true)).toBe(false);
  });

  it("the refusal says SAP said no and nothing changed, never what was typed", () => {
    const text = rotationRefusal("basic", "SAP answered 401.");
    expect(text).toContain("SAP refused the new password");
    expect(text).toContain("nothing was changed");
    expect(text).toContain("SAP answered 401.");
  });
});

describe("what the form is told after a save", () => {
  it("a secret SAP refused: calls will fail until it is corrected", () => {
    expect(rotationProbeWarning(record({ mode: "observe" }), "basic", null)).toBe(
      "SAP refused the new password; calls through this connection will fail until it is corrected.",
    );
    expect(rotationProbeWarning(record({ mode: "observe" }), "oauth-client-credentials", null)).toMatch(
      /^SAP refused the new credentials; calls through this connection will fail until they are corrected\./,
    );
  });

  it("a secret that could not be checked: says so, and why", () => {
    const text = rotationProbeWarning(record({ outcome: "noAnswer", reason: "sap_timeout" }), "basic", "The tenant did not respond within 10000ms.");
    expect(text).toContain("could not be checked");
    expect(text).toContain("The tenant did not respond within 10000ms.");
    expect(rotationProbeWarning(record({ ran: false, outcome: "skipped", reason: "no_probe_path" }), "basic", "No probe path.")).toContain(
      "could not be checked",
    );
    expect(
      rotationProbeWarning(record({ ran: false, outcome: "skipped", reason: "probe_path_invalid" }), "basic", "Bad path."),
    ).toContain("could not be checked. Bad path.");
  });

  it("nothing when the probe passed or did not apply", () => {
    expect(rotationProbeWarning(record({ outcome: "passed", reason: "metadata_ok" }), "basic", null)).toBeNull();
    for (const reason of ["new_connection", "credentials_unchanged", "repointed", "probe_off", "not_known_working"]) {
      expect(rotationProbeWarning(record({ ran: false, outcome: "skipped", reason }), "basic", null)).toBeNull();
    }
  });
});
