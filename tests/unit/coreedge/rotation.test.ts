/**
 * Probe-before-swap rotation (PR-5, capability 7).
 *
 * The audit (F26) found the current path writes the new secret unconditionally:
 * save, then test. A mistyped password therefore takes EVERY lane on that system
 * down until someone notices, and the person who typed it finds out from an
 * outage rather than from a form. The design's claim on that screen is "no
 * downtime", and save-then-test cannot make it.
 *
 * The decision is pure so the part that must never be wrong is testable without
 * a network.
 */

import { describe, expect, it } from "vitest";

import {
  GRACE_WINDOW_MS,
  decideRotation,
  rotationRefusalHeadline,
  type RotationProbe,
} from "@/lib/sap-public/rotation";

const NOW = new Date("2026-09-12T12:00:00Z");

const pass = (step: RotationProbe["signIn"]["step"]) => ({ step, ok: true }) as const;
const fail = (step: RotationProbe["signIn"]["step"], detail: string) =>
  ({ step, ok: false, detail }) as const;

const allGood: RotationProbe = {
  signIn: pass("sign-in"),
  metadata: pass("metadata"),
  dataRead: pass("data-read"),
};

describe("nothing is written unless every step passes", () => {
  it("swaps when sign-in, metadata and a data read all succeed", () => {
    const d = decideRotation(allGood, NOW);
    expect(d.swap).toBe(true);
  });

  it("refuses on a bad password, and says nothing changed", () => {
    /*
     * THE CASE THE CAPABILITY EXISTS FOR. Under save-then-test this is an
     * outage; here it is a form error.
     */
    const d = decideRotation({ ...allGood, signIn: fail("sign-in", "HTTP 401.") }, NOW);
    expect(d.swap).toBe(false);
    if (!d.swap) {
      expect(d.failedAt).toBe("sign-in");
      expect(d.reason).toContain("Nothing was changed");
      expect(d.reason).toContain("still serving");
    }
  });

  it("refuses when metadata cannot be read", () => {
    const d = decideRotation({ ...allGood, metadata: fail("metadata", "HTTP 404.") }, NOW);
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.failedAt).toBe("metadata");
  });

  it("refuses when the data read is refused", () => {
    /*
     * The step that makes the probe worth running. A communication user can
     * authenticate and still be unauthorised for every entity set — the most
     * common failure in this system — so a rotation that probes only the
     * sign-in swaps in a credential that authenticates and cannot read, and
     * reports success.
     */
    const d = decideRotation({ ...allGood, dataRead: fail("data-read", "HTTP 403.") }, NOW);
    expect(d.swap).toBe(false);
    if (!d.swap) {
      expect(d.failedAt).toBe("data-read");
      expect(d.reason).toContain("every lane on this system unable to read");
    }
  });
});

describe("a step that never ran is not a step that failed", () => {
  it("does not swap when the data read was skipped", () => {
    // Unproven is not proven. Treating "not attempted" as "fine" is how an
    // unchecked credential reaches production.
    const d = decideRotation({ ...allGood, dataRead: null }, NOW);
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.reason).toContain("not optional");
  });

  it("does not blame the service when the password was the problem", () => {
    // If sign-in failed there is nothing to say about metadata, and reporting
    // it as failed sends the reader to the wrong place.
    const d = decideRotation(
      { signIn: fail("sign-in", "HTTP 401."), metadata: null, dataRead: null },
      NOW,
    );
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.failedAt).toBe("sign-in");
  });
});

describe("the grace window", () => {
  it("is five minutes, for calls already in flight", () => {
    const d = decideRotation(allGood, NOW);
    expect(d.swap).toBe(true);
    if (d.swap) {
      expect(d.graceUntil.getTime() - NOW.getTime()).toBe(GRACE_WINDOW_MS);
      expect(GRACE_WINDOW_MS).toBe(5 * 60 * 1000);
    }
  });

  it("exists only on a successful swap", () => {
    // There is nothing to keep when nothing was replaced.
    const d = decideRotation({ ...allGood, signIn: fail("sign-in", "x") }, NOW);
    expect(d).not.toHaveProperty("graceUntil");
  });
});

describe("the refusal reassures before it explains", () => {
  it("leads with 'nothing changed' on every failure", () => {
    /*
     * The person has just mistyped a production password. The thing they are
     * most afraid of — that they have broken the client's integration — is
     * exactly what did not happen, and that goes first.
     */
    for (const probe of [
      { ...allGood, signIn: fail("sign-in", "x") },
      { ...allGood, metadata: fail("metadata", "x") },
      { ...allGood, dataRead: fail("data-read", "x") },
    ]) {
      const headline = rotationRefusalHeadline(decideRotation(probe, NOW));
      expect(headline).toBeTruthy();
      expect(headline, JSON.stringify(probe)).toContain("Nothing changed.");
    }
  });

  it("has no headline when the rotation succeeded", () => {
    expect(rotationRefusalHeadline(decideRotation(allGood, NOW))).toBeNull();
  });

  it("distinguishes the three failures, because they have different fixes", () => {
    const headlines = new Set(
      [
        { ...allGood, signIn: fail("sign-in", "x") },
        { ...allGood, metadata: fail("metadata", "x") },
        { ...allGood, dataRead: fail("data-read", "x") },
      ].map((p) => rotationRefusalHeadline(decideRotation(p, NOW))),
    );
    expect(headlines.size).toBe(3);
  });
});
