/**
 * The circuit breaker (PR-5, capability 4).
 *
 * The status "Circuit open" is a promise about WHERE THE CALL STOPPED — nothing
 * was sent to SAP. These assertions are mostly about keeping that promise true,
 * and about the one distinction that decides whether the breaker helps or makes
 * things worse: a 403 is a healthy system saying no, not a sick one.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  COOLDOWN_MS,
  FAILURE_THRESHOLD,
  __resetAllCircuits,
  beforeCall,
  closeEarly,
  recordOutcome,
  snapshot,
} from "@/lib/northbound/circuit-breaker";

const KEY = "conn-1";
const T0 = 1_000_000;

beforeEach(() => {
  __resetAllCircuits();
});

function failTimes(n: number, at: number = T0): void {
  for (let i = 0; i < n; i++) {
    beforeCall(KEY, at);
    recordOutcome(KEY, "timeout", at);
  }
}

describe("closed is the resting state", () => {
  it("allows a call and stays closed on success", () => {
    expect(beforeCall(KEY, T0).allowed).toBe(true);
    recordOutcome(KEY, "ok", T0);
    expect(snapshot(KEY, T0).state).toBe("closed");
  });

  it("does not open on failures below the threshold", () => {
    failTimes(FAILURE_THRESHOLD - 1);
    expect(snapshot(KEY, T0).state).toBe("closed");
    expect(beforeCall(KEY, T0).allowed).toBe(true);
  });

  it("resets the count on any success", () => {
    // A system that fails twice, works, then fails twice is not failing
    // sustainedly — the threshold is about a run, not a tally.
    failTimes(FAILURE_THRESHOLD - 1);
    beforeCall(KEY, T0);
    recordOutcome(KEY, "ok", T0);
    expect(snapshot(KEY, T0).consecutiveFailures).toBe(0);
    failTimes(FAILURE_THRESHOLD - 1);
    expect(snapshot(KEY, T0).state).toBe("closed");
  });
});

describe("open refuses fast, and says for how long", () => {
  it("opens at the threshold", () => {
    failTimes(FAILURE_THRESHOLD);
    expect(snapshot(KEY, T0).state).toBe("open");
  });

  it("refuses without allowing a call", () => {
    /*
     * The promise. If an open circuit ever returned allowed:true, the status
     * "Nothing was sent to SAP" would be false and the chip decorative.
     */
    failTimes(FAILURE_THRESHOLD);
    const d = beforeCall(KEY, T0 + 1000);
    expect(d.allowed).toBe(false);
    expect(d.state).toBe("open");
  });

  it("reports a retry time the caller can act on", () => {
    failTimes(FAILURE_THRESHOLD);
    const d = beforeCall(KEY, T0 + 10_000);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
    expect(d.retryAfterSeconds).toBeLessThanOrEqual(COOLDOWN_MS / 1000);
  });
});

describe("half-open lets exactly one call through", () => {
  it("allows one probe after the cooldown", () => {
    failTimes(FAILURE_THRESHOLD);
    const d = beforeCall(KEY, T0 + COOLDOWN_MS + 1);
    expect(d.allowed).toBe(true);
    expect(d.state).toBe("half-open");
  });

  it("refuses everything else while the probe is in flight", () => {
    /*
     * The point of half-open. Letting the whole backlog through the moment the
     * cooldown expires slams a recovering system with exactly the load that
     * broke it.
     */
    failTimes(FAILURE_THRESHOLD);
    const first = beforeCall(KEY, T0 + COOLDOWN_MS + 1);
    const second = beforeCall(KEY, T0 + COOLDOWN_MS + 2);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });

  it("closes on a successful probe", () => {
    failTimes(FAILURE_THRESHOLD);
    const at = T0 + COOLDOWN_MS + 1;
    beforeCall(KEY, at);
    recordOutcome(KEY, "ok", at);
    expect(snapshot(KEY, at).state).toBe("closed");
  });

  it("re-opens with a FRESH cooldown on a failed probe", () => {
    /*
     * Not back to counting from zero toward the threshold: the system has just
     * demonstrated it is not ready, and sending four more calls to prove it is
     * the amplification the breaker exists to stop.
     */
    failTimes(FAILURE_THRESHOLD);
    const at = T0 + COOLDOWN_MS + 1;
    beforeCall(KEY, at);
    recordOutcome(KEY, "timeout", at);

    const s = snapshot(KEY, at);
    expect(s.state).toBe("open");
    expect(s.retryAfterSeconds).toBe(COOLDOWN_MS / 1000);
    expect(beforeCall(KEY, at + 1000).allowed).toBe(false);
  });
});

describe("a refusal is a healthy answer", () => {
  it("never opens the circuit on a 403", () => {
    /*
     * THE ASSERTION THAT MATTERS MOST HERE. SAP signed us in, understood the
     * request and said no — one lane's authorisation problem. Counting it would
     * take every other lane on the system down with it, and would attribute the
     * outage to the client's Basis team when it belongs to their SAP admin.
     */
    for (let i = 0; i < FAILURE_THRESHOLD * 3; i++) {
      beforeCall(KEY, T0);
      recordOutcome(KEY, "refused", T0);
    }
    expect(snapshot(KEY, T0).state).toBe("closed");
    expect(snapshot(KEY, T0).consecutiveFailures).toBe(0);
  });

  it("does not let a refusal clear a run of real failures either", () => {
    // It is not a success. It says nothing about the system's health in either
    // direction, so it moves nothing.
    failTimes(FAILURE_THRESHOLD - 1);
    beforeCall(KEY, T0);
    recordOutcome(KEY, "refused", T0);
    expect(snapshot(KEY, T0).consecutiveFailures).toBe(FAILURE_THRESHOLD - 1);
  });
});

describe("circuits are per system", () => {
  it("does not let one system's outage refuse another's calls", () => {
    failTimes(FAILURE_THRESHOLD);
    expect(snapshot(KEY, T0).state).toBe("open");
    expect(beforeCall("conn-2", T0).allowed).toBe(true);
    expect(snapshot("conn-2", T0).state).toBe("closed");
  });
});

describe("an operator can close it early", () => {
  it("resets to closed so the next call is tried for real", () => {
    failTimes(FAILURE_THRESHOLD);
    closeEarly(KEY);
    expect(snapshot(KEY, T0).state).toBe("closed");
    expect(beforeCall(KEY, T0).allowed).toBe(true);
  });

  it("is not a way to disable the breaker", () => {
    // If the system is still down it opens again on its own.
    failTimes(FAILURE_THRESHOLD);
    closeEarly(KEY);
    failTimes(FAILURE_THRESHOLD, T0 + 1);
    expect(snapshot(KEY, T0 + 1).state).toBe("open");
  });
});

describe("the snapshot does not overclaim", () => {
  it("is named and documented as one instance's view", () => {
    // In-process state presented as fleet-wide is the same class of lie the
    // audit found elsewhere: a sampled figure rendered as a total.
    const s = snapshot(KEY, T0);
    expect(s.key).toBe(KEY);
    expect(s).toHaveProperty("consecutiveFailures");
    expect(s.lastOutcomeAt).toBeNull();
  });

  it("reports no retry time when the circuit is not open", () => {
    expect(snapshot(KEY, T0).retryAfterSeconds).toBeNull();
  });
});
