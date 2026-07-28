/**
 * Write ledger, throttle and tokens — the second tranche.
 *
 * Same discipline as the first: each assertion pins one way a number can be
 * stated more confidently than its feed supports.
 *
 *   · an unobservable bucket rendered as a usage figure
 *   · a backend outage rendered as "throttled"
 *   · "no observation recorded" rendered as "never used"
 *   · two counts that deliberately do not sum, presented as if they should
 *   · an empty screen that is empty BY DESIGN, presented as an apology
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ThrottleClient } from "@/components/ops/ThrottleClient";
import { TokensClient } from "@/components/ops/TokensClient";
import { WriteLedgerClient } from "@/components/ops/WriteLedgerClient";

function serve(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: body }) })),
  );
}

const EMPTY_LEDGER = {
  windowHours: 24,
  reservations: { inFlight: 0, completed: 0, failed: 0, staleReservation: 0, total: 0 },
  fromAudit: { blocked: 0, conflicts: 0 },
  truncated: false,
  provenance: {
    sourcesDoNotReconcile: true,
    why: [
      "a write refused at the credential gate never reserves a key",
      "a write refused after reserving has its reservation deleted",
      "replayed and conflicted are computed at request time",
    ],
    emptyByDesign:
      "No write credential can be issued yet, so every write is refused at the credential gate before a key is reserved.",
    rowsAreAPage: {
      reservationRows: { returned: 0, of: 0 },
      auditRows: { returned: 0, of: 0 },
      limit: 100,
    },
  },
  reservationRows: [],
  auditRows: [],
};

const THROTTLE = {
  windowHours: 24,
  buckets: [
    {
      id: "edge-read",
      key: "api:GET:{clientIp}",
      keyedBy: "client IP",
      limit: 300,
      windowMs: 60000,
      observable: false,
      note: "Middleware bucket.",
    },
    {
      id: "northbound-read",
      key: "northbound:{clientId}",
      keyedBy: "credential",
      limit: 60,
      windowMs: 60000,
      observable: true,
      note: "Per credential.",
    },
  ],
  credentials: [
    {
      clientId: "cl_1",
      solutionId: "sol_1",
      label: "Acme · DEV",
      environment: "DEV",
      read: { known: true, remaining: 58, limit: 60 },
      write: { known: true, remaining: 60, limit: 60 },
      throttledInWindow: 0,
    },
  ],
  provenance: {
    nonConsumingRead: true,
    why: "Headroom is read with getRemaining, which does not spend a token.",
    edgeBucketsAreNotObservable: "The IP-keyed buckets fire before the route and persist nothing.",
    unknownRatherThanZero: null,
    backend: "shared",
    headroomIsPerInstance: false,
    backendNote: "Limits are enforced against a shared backend.",
    throttleCountsAreAFloor: "throttledInWindow counts audited 429s only.",
  },
};

const TOKENS = {
  counts: {
    listed: 1,
    active: 1,
    revoked: 7,
    expired: 0,
    expiringSoon: 0,
    neverObservedInUse: 1,
    withWriteCredential: 0,
  },
  provenance: {
    lastUsedUnderReports: true,
    countBasis:
      "`revoked` is counted over every credential in scope. The other counts are over the rows listed below, which exclude revoked credentials unless includeRevoked=1.",
    why: "lastUsedAt is written fire-and-forget and a serverless instance can freeze before it lands.",
    oneCredentialPerSolution: "Issuance upserts on solutionId.",
    writeCredentials: "Counted from stored credential presence, never by reading it.",
  },
  credentials: [
    {
      id: "cl_1",
      solutionId: "sol_1",
      solutionName: "Finance accelerator",
      solutionStatus: "DRAFT",
      label: "Finance accelerator · DEV",
      environment: "DEV",
      state: "active",
      lastObservedUseAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    },
  ],
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("write ledger — empty by design is a feature, not an apology", () => {
  it("names the control that produced the empty state", async () => {
    serve(EMPTY_LEDGER);
    render(<WriteLedgerClient />);

    await screen.findByText("No write has reserved a key — by design");
    expect(
      screen.getByText(/every write is refused at the credential gate before a key is reserved/),
    ).toBeTruthy();
  });

  it("never invents sample rows to fill the table", async () => {
    serve(EMPTY_LEDGER);
    render(<WriteLedgerClient />);

    await screen.findByText("No write has reserved a key — by design");
    // A sample row here would imply writes have happened. There are none.
    expect(screen.queryAllByRole("row")).toHaveLength(0);
  });

  it("states that the two sources do not reconcile, with all three reasons", async () => {
    serve(EMPTY_LEDGER);
    render(<WriteLedgerClient />);

    await screen.findByText(/Two sources, and they do not reconcile/i);
    for (const reason of EMPTY_LEDGER.provenance.why) {
      expect(screen.getByText(reason)).toBeTruthy();
    }
  });

  it("keeps the audit panel's empty state distinct from the reservation panel's", async () => {
    // They count different things; identical copy would imply one number.
    serve(EMPTY_LEDGER);
    render(<WriteLedgerClient />);

    await screen.findByText("No refused writes in this window");
    expect(screen.getByText("No write has reserved a key — by design")).toBeTruthy();
  });
});

describe("throttle — a bucket whose usage cannot be known shows no usage", () => {
  it("renders the IP-keyed bucket as not observable, never as a figure", async () => {
    serve(THROTTLE);
    render(<ThrottleClient />);

    await screen.findByText(/Not observable · limit 300 per client IP/);
    // The em-dash holds the slot; a zero would read as "no traffic", a bar at
    // 100% would read as "full headroom". Both would be invented.
    expect(screen.queryByText("0 of 300 left")).toBeNull();
  });

  it("shows real headroom for the per-credential bucket", async () => {
    serve(THROTTLE);
    render(<ThrottleClient />);

    await screen.findByText("58 of 60 left");
    expect(screen.getByText("2 used")).toBeTruthy();
  });

  it("reports a backend that did not answer as unknown, never as zero", async () => {
    // Zero would read as "this credential is throttled right now" — a claim
    // about a customer's traffic invented during our own outage.
    serve({
      ...THROTTLE,
      credentials: [
        {
          ...THROTTLE.credentials[0],
          read: { known: false, remaining: null, limit: 60 },
        },
      ],
      provenance: { ...THROTTLE.provenance, unknownRatherThanZero: "The backend did not answer." },
    });
    render(<ThrottleClient />);

    const chip = await screen.findByLabelText(/unknown/);
    expect(chip.getAttribute("aria-label")).toContain("not zero");
    expect(screen.queryByText("0 of 60 left")).toBeNull();
  });

  it("leads with the configuration fault when limits are per instance", async () => {
    // It changes what every number below it means, so it cannot be a footnote.
    serve({
      ...THROTTLE,
      provenance: {
        ...THROTTLE.provenance,
        backend: "in-memory",
        headroomIsPerInstance: true,
        backendNote: "NO SHARED RATE-LIMIT BACKEND IS CONFIGURED.",
      },
    });
    render(<ThrottleClient />);

    await screen.findByText(/NO SHARED RATE-LIMIT BACKEND IS CONFIGURED/);
    expect(screen.getByLabelText(/per instance/)).toBeTruthy();
  });

  it("does not show the fault banner when the backend is shared", async () => {
    serve(THROTTLE);
    render(<ThrottleClient />);

    await screen.findByText("58 of 60 left");
    expect(screen.queryByText(/NO SHARED RATE-LIMIT BACKEND/)).toBeNull();
  });
});

describe("tokens — an absent observation is not an absent call", () => {
  it("says never OBSERVED, not never used", async () => {
    // The dangerous inference is that a credential is dormant and safe to
    // revoke. The feed under-reports, so it cannot support that conclusion.
    serve(TOKENS);
    render(<TokensClient />);

    const pill = await screen.findByLabelText(/never observed/);
    expect(pill.getAttribute("aria-label")).toContain("not evidence the credential is dormant");
    expect(document.body.textContent).not.toMatch(/never used/i);
  });

  it("states why revoked does not sum with the other counts", async () => {
    // 7 revoked beside 1 listed looks like an arithmetic error until the basis
    // is given.
    serve(TOKENS);
    render(<TokensClient />);

    await screen.findByText("7");
    expect(screen.getByText("over every credential in scope")).toBeTruthy();
    expect(document.body.textContent).toContain("exclude revoked credentials unless includeRevoked=1");
  });

  it("carries the under-reporting claim permanently, not as a warning", async () => {
    serve(TOKENS);
    render(<TokensClient />);

    await screen.findByText(/Last use is under-reported/i);
  });

  it("explains an empty fleet by naming what it takes to fill it", async () => {
    serve({ ...TOKENS, counts: { ...TOKENS.counts, listed: 0, active: 0 }, credentials: [] });
    render(<TokensClient />);

    await screen.findByText("No runtime credential issued");
    expect(document.body.textContent).toContain("second person to issue it");
  });
});
