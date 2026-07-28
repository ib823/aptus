/**
 * The Operations Center screens, tested for the things that fail silently.
 *
 * Not "does it render". These three screens exist to avoid a specific kind of
 * lie — a number stated more confidently than the feed behind it supports — and
 * every assertion below pins one of the ways that lie gets told:
 *
 *   · an empty feed presented as health
 *   · a failed fetch presented as an empty feed
 *   · a page length presented as a total
 *   · a sampled figure presented as a window-wide one
 *   · an absence rendered as a blank cell, which reads as a bug
 *   · a refused call counted as a successful environment binding
 *
 * All six shipped in some form before being caught, which is why they are here
 * rather than in a snapshot.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { BrokerTrafficClient } from "@/components/ops/BrokerTrafficClient";
import { ConnectionsHealthClient } from "@/components/ops/ConnectionsHealthClient";
import { IncidentsClient } from "@/components/ops/IncidentsClient";

/** Serve one payload per endpoint; anything unstubbed is a test bug, not a 404. */
function serve(byPath: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const body = byPath[input];
      if (body === undefined) throw new Error(`unstubbed fetch: ${input}`);
      return { ok: true, status: 200, json: async () => ({ data: body }) };
    }),
  );
}

function serveFailure(status: number, message: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      json: async () => ({ error: { code: "FORBIDDEN", message } }),
    })),
  );
}

const NO_INCIDENTS = {
  windowHours: 24,
  counts: { total: 0, critical: 0, major: 0, minor: 0 },
  incidents: [],
  rules: [
    {
      id: "binding-mismatch",
      severity: "critical",
      title: "A call was served from a different landscape",
      firesWhen: "at least 1 audited call in the window disagrees",
    },
    {
      id: "upstream-errors",
      severity: "major",
      title: "The upstream SAP system is returning errors",
      firesWhen: "at least 5 audited calls in the window returned 5xx",
    },
  ],
  thresholds: { bindingMismatch: 1, upstreamErrors: 5 },
  provenance: {
    emptyIsNotHealthy:
      "An empty list means nothing crossed a threshold in what the audit feed recorded.",
    severitiesAreReproducible: "Every severity comes from a named rule.",
  },
};

const EMPTY_TRAFFIC = {
  windowHours: 24,
  counts: { total: 0, byStatus: {} },
  latency: { medianMs: null, measured: 0, unmeasured: 0, basis: "returnedPage", sampleSize: 0 },
  environmentBinding: { agreed: 0, unverified: 0, mismatch: 0, notApplicable: 0 },
  truncated: false,
  provenance: {
    floorNotCensus: true,
    missing: ["calls throttled at the edge leave no record"],
    eventsAreAPage: { returned: 0, limit: 100, of: 0 },
  },
  events: [],
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("incidents — an empty list is not a claim of health", () => {
  it("never says all clear, and states what empty actually means", async () => {
    serve({ "/api/ops/incidents": NO_INCIDENTS });
    render(<IncidentsClient />);

    await screen.findByText("Nothing crossed a threshold");

    // The specific phrasings that would turn a floor into a claim.
    //
    // Note the health check matches AFFIRMATIVE forms only: the strip says
    // "Empty is not healthy", which is the sentence this screen exists to
    // carry. A blanket ban on the word would fail on the fix.
    const page = document.body.textContent ?? "";
    expect(page).not.toMatch(/all clear/i);
    expect(page).not.toMatch(/\b(is|are|all|looks?)\s+healthy\b/i);
    expect(page).not.toMatch(/no issues/i);
    expect(page).not.toMatch(/everything is/i);
    // And no success iconography standing in for the claim.
    expect(page).not.toMatch(/[✅✓✔]/);

    expect(screen.getByText(/Empty is not healthy/i)).toBeTruthy();
    expect(page).toContain("nothing crossed a threshold in what the audit feed recorded");
  });

  it("lists the rules being watched, so an empty screen is falsifiable", async () => {
    // Without this a reader cannot tell "nothing is wrong" from "nothing is
    // being watched" — and those look identical.
    serve({ "/api/ops/incidents": NO_INCIDENTS });
    render(<IncidentsClient />);

    await screen.findByText("What is being watched");
    expect(screen.getByText(/2 rules are being watched/)).toBeTruthy();
    expect(screen.getAllByText(/A call was served from a different landscape/).length).toBeGreaterThan(0);
  });

  it("shows the observed count beside the threshold that judged it", async () => {
    serve({
      "/api/ops/incidents": {
        ...NO_INCIDENTS,
        counts: { total: 1, critical: 1, major: 0, minor: 0 },
        incidents: [
          {
            id: "binding-mismatch",
            severity: "critical",
            title: "A call was served from a different landscape",
            observed: 3,
            threshold: 1,
            firesWhen: "at least 1 audited call disagrees",
            whyThisSeverity: "Past tense and unrepeatable.",
            remediation: "Check the connection's declared environment.",
          },
        ],
      },
    });
    render(<IncidentsClient />);

    // The number and the rule that judged it are meaningless apart.
    await screen.findByText(/observed 3 · fires at 1/);
    expect(screen.getByText(/Past tense and unrepeatable/)).toBeTruthy();
    expect(screen.getByText(/Check the connection's declared environment/)).toBeTruthy();
  });

  it("a failed fetch is an error, never an empty feed", async () => {
    // On a monitoring screen this is the difference between "your integration
    // is quiet" and "we cannot see your integration".
    serveFailure(403, "Operations Center is role-gated.");
    render(<IncidentsClient />);

    await screen.findByText("The incident feed could not be read");
    expect(screen.getByText("Operations Center is role-gated.")).toBeTruthy();
    expect(screen.queryByText("Nothing crossed a threshold")).toBeNull();
  });
});

describe("connections — health and binding are separate questions", () => {
  const HEALTHY_BUT_UNDECLARED = {
    counts: { total: 1, healthy: 1, needsAttention: 0, unknown: 0, neverTested: 0 },
    // Mirrors the real payload: this organization has its own connection, so
    // the deployment fallback is not in use.
    deploymentFallback: { inUse: false, tenants: [] },
    provenance: {
      activeOnly: true,
      excludedInactive: 2,
      why: "A deactivated connection serves no traffic.",
      fallbackIsShared: null,
      noHealthForFallback: null,
    },
    bindingBacklog: {
      undeclaredEnvironment: 1,
      remediation: "Declare the environment on each connection in Studio.",
      consequence: "Reads are served but marked unverified; writes are refused outright.",
    },
    prodConnections: 0,
    connections: [
      {
        id: "c1",
        product: "s4hana",
        key: "sbx",
        label: "Acme sandbox",
        environment: null,
        writeEnabled: false,
        status: "OK",
        lastValidatedAt: new Date().toISOString(),
        neverTested: false,
      },
    ],
  };

  it("renders an undeclared environment as a stated absence, not a blank cell", async () => {
    // The product rule is that an unknown environment renders no chip. Correct,
    // and it leaves a gap that reads as a rendering fault.
    serve({ "/api/ops/connections-health": HEALTHY_BUT_UNDECLARED });
    render(<ConnectionsHealthClient />);

    await screen.findByText("environment not declared");
  });

  it("shows a connection as healthy AND unverified at the same time", async () => {
    // Collapsing the two axes would tell an operator to fix a connection that
    // is working perfectly.
    serve({ "/api/ops/connections-health": HEALTHY_BUT_UNDECLARED });
    render(<ConnectionsHealthClient />);

    await screen.findByText("environment not declared");
    expect(screen.getByText("OK")).toBeTruthy();
  });

  it("shows the backlog with a target, not a bare count", async () => {
    serve({ "/api/ops/connections-health": HEALTHY_BUT_UNDECLARED });
    render(<ConnectionsHealthClient />);

    await screen.findByText("Binding backlog");
    // A count that can sit constant forever is how a permissive rule becomes
    // permanent; the target is what makes a stalled backlog visible.
    expect(screen.getByText(/0 of 1 declared · target 0/)).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("declares the connections it excluded rather than silently filtering", async () => {
    serve({ "/api/ops/connections-health": HEALTHY_BUT_UNDECLARED });
    render(<ConnectionsHealthClient />);

    await screen.findByText(/Active connections only/i);
    expect(document.body.textContent).toContain("2 deactivated connections are not listed");
  });

  it("renders never-tested as an absence, outside the probe scale", async () => {
    serve({
      "/api/ops/connections-health": {
        ...HEALTHY_BUT_UNDECLARED,
        connections: [
          { ...HEALTHY_BUT_UNDECLARED.connections[0], status: "NEVER_TESTED", neverTested: true, lastValidatedAt: null },
        ],
      },
    });
    render(<ConnectionsHealthClient />);

    await screen.findByText("never tested");
  });

  it("frames NO_PROBE_PATH as our gap, not the tenant's failure", async () => {
    serve({
      "/api/ops/connections-health": {
        ...HEALTHY_BUT_UNDECLARED,
        connections: [{ ...HEALTHY_BUT_UNDECLARED.connections[0], status: "NO_PROBE_PATH" }],
      },
    });
    render(<ConnectionsHealthClient />);

    const chip = await screen.findByLabelText(/NO_PROBE_PATH/);
    // The accessible description carries the framing, so it is not colour-only.
    expect(chip.getAttribute("aria-label")).toContain("our gap");
  });

  it("distinguishes no connections from a feed it could not read", async () => {
    serve({
      "/api/ops/connections-health": {
        ...HEALTHY_BUT_UNDECLARED,
        counts: { total: 0, healthy: 0, needsAttention: 0, unknown: 0, neverTested: 0 },
        bindingBacklog: { ...HEALTHY_BUT_UNDECLARED.bindingBacklog, undeclaredEnvironment: 0 },
        connections: [],
      },
    });
    render(<ConnectionsHealthClient />);

    await screen.findByText("This organization has no stored SAP connection");
    expect(document.body.textContent).not.toMatch(/could not be read/i);
  });
});

describe("broker traffic — the counts and the page are different things", () => {
  it("shows the window total, not the number of rows it listed", async () => {
    // The defect this endpoint shipped with: a window holding 5,000 calls
    // reported `total: 100` because every count came from the page.
    serve({
      "/api/ops/broker-traffic": {
        ...EMPTY_TRAFFIC,
        counts: { total: 5000, byStatus: { ok: 5000 } },
        provenance: { ...EMPTY_TRAFFIC.provenance, eventsAreAPage: { returned: 2, limit: 100, of: 5000 } },
        events: [1, 2].map((n) => ({
          id: `e${n}`,
          at: new Date().toISOString(),
          solutionId: "sol_1",
          operation: "READ",
          externalId: "API_BP",
          credentialEnvironment: "DEV",
          connectionEnvironment: "DEV",
          connectionId: "c1",
          status: 200,
          outcome: "ok",
          rowCount: 3,
          durationMs: 120,
          clientTokenId: "cl_1",
        })),
      },
    });
    render(<BrokerTrafficClient />);

    await screen.findByText("5,000");
    expect(screen.getByText(/Showing 2 of 5,000 calls/)).toBeTruthy();
  });

  it("never prints a latency figure without what it is over", async () => {
    serve({
      "/api/ops/broker-traffic": {
        ...EMPTY_TRAFFIC,
        counts: { total: 4182, byStatus: { ok: 4182 } },
        latency: { medianMs: 412, measured: 100, unmeasured: 0, basis: "returnedPage", sampleSize: 100 },
        provenance: { ...EMPTY_TRAFFIC.provenance, eventsAreAPage: { returned: 100, limit: 100, of: 4182 } },
      },
    });
    render(<BrokerTrafficClient />);

    await screen.findByText("412");
    // A median over 100 rows and one over 4,182 must never render identically.
    expect(screen.getByText(/over 100 of 4,182 · 0 unmeasured/)).toBeTruthy();
  });

  it("reports an unmeasured median as a dash, never as zero", async () => {
    // A zero would read as "instantaneous" rather than "not measured".
    serve({ "/api/ops/broker-traffic": EMPTY_TRAFFIC });
    render(<BrokerTrafficClient />);

    await screen.findByText("Median latency");
    expect(document.body.textContent).not.toMatch(/0 ms/);
  });

  it("counts a refused call as no-connection-reached, never as an agreed binding", async () => {
    // The defect: `agreed = total - unverified - mismatch`, so every 401, 403
    // and 429 landed in `agreed`. A window of pure failure reported a wall of
    // agreement.
    serve({
      "/api/ops/broker-traffic": {
        ...EMPTY_TRAFFIC,
        counts: { total: 12, byStatus: { needs_setup: 12 } },
        environmentBinding: { agreed: 0, unverified: 0, mismatch: 0, notApplicable: 12 },
        provenance: { ...EMPTY_TRAFFIC.provenance, eventsAreAPage: { returned: 0, limit: 100, of: 12 } },
      },
    });
    render(<BrokerTrafficClient />);

    await screen.findByText("agreed · 0");
    expect(screen.getByText("no connection reached · 12")).toBeTruthy();
  });

  it("carries all three reasons the feed is a floor", async () => {
    serve({
      "/api/ops/broker-traffic": {
        ...EMPTY_TRAFFIC,
        provenance: {
          ...EMPTY_TRAFFIC.provenance,
          missing: ["throttled at the edge", "timed out before an audit write", "audit write failed"],
        },
      },
    });
    render(<BrokerTrafficClient />);

    await screen.findByText(/Floor, not census/i);
    for (const reason of ["throttled at the edge", "timed out before an audit write", "audit write failed"]) {
      expect(screen.getByText(reason)).toBeTruthy();
    }
  });

  it("labels every binding chip, so colour is never the only carrier", async () => {
    serve({ "/api/ops/broker-traffic": EMPTY_TRAFFIC });
    render(<BrokerTrafficClient />);

    await screen.findByText(/agreed · 0/);
    for (const label of ["agreed", "unverified", "mismatch", "no connection reached"]) {
      expect(document.body.textContent).toContain(label);
    }
  });

  it("distinguishes a quiet window from a feed it could not read", async () => {
    serve({ "/api/ops/broker-traffic": EMPTY_TRAFFIC });
    render(<BrokerTrafficClient />);

    await screen.findByText("No calls in this window");
    expect(document.body.textContent).not.toMatch(/could not be read/i);
  });

  it("shows an error state when the feed fails, with the server's own message", async () => {
    serveFailure(500, "The feed is unavailable.");
    render(<BrokerTrafficClient />);

    await waitFor(() => expect(screen.getByText("Broker traffic could not be read")).toBeTruthy());
    expect(screen.getByText("The feed is unavailable.")).toBeTruthy();
    expect(screen.queryByText("No calls in this window")).toBeNull();
  });
});
