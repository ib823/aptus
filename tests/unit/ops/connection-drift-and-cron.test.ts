/**
 * The probe sweep's two load-bearing decisions, tested without a database.
 *
 * 1. THE TRANSITION IS THE DEDUPE. An alert (and the connection-drift incident)
 *    fires on healthy→failing — not on every failing sweep, not on the first
 *    observation of a connection that has never been probed, and not on
 *    recovery. Get this wrong in either direction and the alert channel is
 *    either silent or ignored.
 *
 * 2. A CRON WITH NO SECRET REFUSES EVERYONE. `authorizeCron` returning true on
 *    an unset CRON_SECRET would turn every scheduled endpoint into an open,
 *    unauthenticated route that deletes rows and probes tenants.
 */

import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { authorizeCron } from "@/lib/ops/cron";
import {
  countDriftingConnections,
  deriveIncidents,
  INCIDENT_RULES,
  INCIDENT_THRESHOLDS,
  isDriftTransition,
  PROBE_FAILING_STATUSES,
  type IncidentSignals,
} from "@/lib/ops/incidents";

const NONE: IncidentSignals = {
  bindingRefusals: 0,
  unhealthyConnections: 0,
  upstreamErrors: 0,
  throttled: 0,
  expiringCredentials: 0,
  undeclaredEnvironmentConnections: 0,
  unboundedGrants: 0,
  credentialsWithoutExpiry: 0,
  unaccountableProdGrants: 0,
  driftingConnections: 0,
};

describe("isDriftTransition — the alert fires on the change, once", () => {
  it("fires on healthy→failing, for every failing status", () => {
    for (const failing of PROBE_FAILING_STATUSES) {
      expect(isDriftTransition("OK", failing), `OK → ${failing}`).toBe(true);
    }
  });

  it("does not fire on the first observation — nobody's integration just broke", () => {
    expect(isDriftTransition(null, "ERROR")).toBe(false);
  });

  it("does not fire while a connection stays down — down for a week alerts once", () => {
    expect(isDriftTransition("TIMEOUT", "TIMEOUT")).toBe(false);
    expect(isDriftTransition("UNAUTHORIZED", "ERROR")).toBe(false);
  });

  it("does not fire on recovery — 'recovered' mail trains an inbox to ignore 'failed' mail", () => {
    expect(isDriftTransition("ERROR", "OK")).toBe(false);
  });

  it("treats NO_PROBE_PATH as not-failing on either side, matching the screen's UNKNOWN rollup", () => {
    expect(isDriftTransition("NO_PROBE_PATH", "ERROR")).toBe(true);
    expect(isDriftTransition("OK", "NO_PROBE_PATH")).toBe(false);
  });
});

describe("countDriftingConnections — window plus the event before it", () => {
  it("counts a connection whose transition happened inside the window", () => {
    const events = [
      { connectionId: "a", status: "OK" },
      { connectionId: "a", status: "ERROR" },
    ];
    expect(countDriftingConnections(events, [])).toBe(1);
  });

  it("uses the latest event BEFORE the window, so an edge-straddling transition is not missed", () => {
    // The only in-window event is failing; whether that is a drift depends
    // entirely on what the connection looked like before the window started.
    const events = [{ connectionId: "a", status: "TIMEOUT" }];
    expect(countDriftingConnections(events, [{ connectionId: "a", status: "OK" }])).toBe(1);
    expect(countDriftingConnections(events, [{ connectionId: "a", status: "ERROR" }])).toBe(0);
    // No prior event at all → first observation, not a drift.
    expect(countDriftingConnections(events, [])).toBe(0);
  });

  it("counts a flapping connection once — the question is how many integrations broke", () => {
    const events = [
      { connectionId: "a", status: "OK" },
      { connectionId: "a", status: "ERROR" },
      { connectionId: "a", status: "OK" },
      { connectionId: "a", status: "ERROR" },
    ];
    expect(countDriftingConnections(events, [])).toBe(1);
  });

  it("counts connections independently", () => {
    const events = [
      { connectionId: "a", status: "OK" },
      { connectionId: "b", status: "OK" },
      { connectionId: "a", status: "ERROR" },
      { connectionId: "b", status: "OK" },
    ];
    expect(countDriftingConnections(events, [])).toBe(1);
  });
});

describe("the connection-drift rule", () => {
  it("fires as major at one drifted connection, distinct from the standing-state rule", () => {
    const out = deriveIncidents({ ...NONE, driftingConnections: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(INCIDENT_RULES.connectionDrift.id);
    expect(out[0]?.severity).toBe("major");
    expect(INCIDENT_THRESHOLDS.connectionDrift).toBe(1);
    // The standing state is a different rule with a different remediation —
    // the pair must never collapse into one.
    expect(INCIDENT_RULES.connectionDrift.id).not.toBe(INCIDENT_RULES.connectionUnhealthy.id);
  });
});

describe("authorizeCron — the one shared gate for every scheduled route", () => {
  const previous = process.env.CRON_SECRET;
  afterEach(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  function requestWithAuth(value: string | null): NextRequest {
    const headers = new Headers();
    if (value !== null) headers.set("authorization", value);
    return { headers } as unknown as NextRequest;
  }

  it("refuses every caller when CRON_SECRET is unset — never an open endpoint", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(requestWithAuth("Bearer anything"))).toBe(false);
    expect(authorizeCron(requestWithAuth(null))).toBe(false);
  });

  it("accepts exactly the bearer secret, and nothing near it", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(requestWithAuth("Bearer s3cret"))).toBe(true);
    // Same length, one character off — the compare, not the length check.
    expect(authorizeCron(requestWithAuth("Bearer s3creT"))).toBe(false);
    expect(authorizeCron(requestWithAuth("Bearer s3cretX"))).toBe(false);
    expect(authorizeCron(requestWithAuth("s3cret"))).toBe(false);
    expect(authorizeCron(requestWithAuth(null))).toBe(false);
  });
});
