/**
 * The Control Tower screens.
 *
 * Governance answers a different question from operations, and the assertions
 * follow that difference. Where the Ops tests pin "do not overstate an
 * incomplete feed", these pin:
 *
 *   · a decision label is not a permission
 *   · a permission that ends by lapsing reads as a runway, not a date
 *   · a control that belongs to somebody else is disabled, not hidden or live
 *   · a control that belongs to nobody here is hidden, not disabled
 *   · "unknowable" is not "passing"
 *   · a complete record says it is complete, so a reader does not carry the
 *     Operations Center's floor-shaped doubt onto a census
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AuditClient } from "@/components/control-tower/AuditClient";
import { decisionTone } from "@/components/control-tower/GovernanceChrome";
import { GrantsClient } from "@/components/control-tower/GrantsClient";
import { PortfolioClient } from "@/components/control-tower/PortfolioClient";
import {
  ConnectionRegisterClient,
  CredentialRegisterClient,
} from "@/components/control-tower/RegistersClient";
import { formatDate } from "@/lib/format/date";

function serve(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: body }) })),
  );
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const GRANTS = {
  expiryRunwayDays: 14,
  // The lifecycle counts are DATABASE aggregates, not page arithmetic — the
  // payload carries revoked/unbounded and the page-vs-total provenance too.
  counts: { total: 3, byDecision: {}, pending: 1, expiringSoon: 1, lapsed: 1, revoked: 0, unbounded: 0 },
  truncated: false,
  provenance: {
    howAGrantEnds: "A grant lapses at its expiry, or an admin revokes it.",
    whyExpiryIsStillRequired: "Expiry remains mandatory on any granting decision.",
    restrictionsAreEnforced: "READ_ONLY and SANDBOX_ONLY are enforced at runtime.",
    emptyByDesign: null,
    decisionsAreAudited: "Every decision writes a ConfigAudit entry.",
    grantsAreAPage: { returned: 3, limit: 200, of: 3 },
  },
  grants: [
    {
      id: "g_pending",
      solutionId: "sol_1",
      solutionName: "Order portal",
      externalId: "API_SALES_ORDER",
      operation: "CREATE",
      environment: "TEST",
      justification: "x",
      decision: "REQUESTED",
      requestedById: "u1",
      decidedById: null,
      decidedAt: null,
      expiresAt: null,
      createdAt: inDays(-2),
      authorises: { read: false, write: false },
      lifecycle: "pending",
      unbounded: false,
    },
    {
      id: "g_sandbox",
      solutionId: "sol_2",
      solutionName: "Catalogue sync",
      externalId: "API_PRODUCT",
      operation: "READ",
      environment: "PROD",
      justification: "x",
      decision: "SANDBOX_ONLY",
      requestedById: "u1",
      decidedById: "u2",
      decidedAt: inDays(-5),
      expiresAt: inDays(6),
      createdAt: inDays(-9),
      // A SANDBOX_ONLY decision on a PROD grant authorises NOTHING.
      authorises: { read: false, write: false },
      lifecycle: "expiring-soon",
      unbounded: false,
    },
    {
      id: "g_lapsed",
      solutionId: "sol_3",
      solutionName: "Legacy pilot",
      externalId: "API_BP",
      operation: "READ",
      environment: "PROD",
      justification: "x",
      decision: "APPROVED",
      requestedById: "u1",
      decidedById: "u2",
      decidedAt: inDays(-90),
      expiresAt: inDays(-12),
      createdAt: inDays(-95),
      authorises: { read: false, write: false },
      lifecycle: "lapsed",
      unbounded: false,
    },
  ],
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("grants — a decision label is not a permission", () => {
  it("shows SANDBOX_ONLY on a PROD grant as authorising nothing", async () => {
    // The defect #168 fixed at runtime, closed here from the reading side.
    serve(GRANTS);
    render(<GrantsClient canDecide={false} />);

    await screen.findByText("sandbox only");
    // The decision is displayed AND its real effect is displayed beside it.
    expect(screen.getAllByLabelText(/authorises no call at all/).length).toBeGreaterThan(0);
  });

  it("renders time remaining as a runway with the remedy, not a date", async () => {
    serve(GRANTS);
    render(<GrantsClient canDecide={false} />);

    // "6 days" needs no arithmetic against today; "Ends 3 Aug" does.
    await screen.findByText(/6 days/);
    // The only remedy: there is nothing to extend.
    expect(screen.getByText("re-request to extend")).toBeTruthy();
  });

  it("keeps a lapsed grant's decision chip and removes its authority", async () => {
    // A decision does not un-happen because time passed, so the chip still
    // reads "approved" — what it loses is force, not history.
    serve(GRANTS);
    render(<GrantsClient canDecide={false} />);

    const lapsedChip = await screen.findByLabelText(/decided, and since lapsed/);
    expect(lapsedChip.textContent).toContain("approved");
    /*
     * Derive the expected label from the fixture rather than matching a digit
     * range. This asserted /lapsed 1[0-9] / — a day-of-month between 10 and 19
     * — against a date computed as "12 days before whenever the suite runs", so
     * it passed only on the ~10 days a month when today-minus-12 happens to
     * land in that window, and failed the rest of the time with no code change.
     * A test that depends on the calendar is not testing the component.
     */
    // Formatted with the SAME helper the component uses, so a change to the
    // product's date format updates both sides at once instead of failing here.
    const lapsedOn = formatDate(GRANTS.grants[2]!.expiresAt!);
    expect(screen.getByText(`lapsed ${lapsedOn}`)).toBeTruthy();
  });

  it("mutes a lapsed decision without changing what it says", async () => {
    // Asserted on the tone function directly. The rendering test above checks
    // the LABEL, which is unaffected by tone — so on its own it would pass
    // against a lapsed grant still rendered in full approval green.
    expect(decisionTone("APPROVED", false)).toBe("good");
    expect(decisionTone("APPROVED", true)).toBe("muted");
    expect(decisionTone("REJECTED", true)).toBe("muted");
    // …and a live decision keeps the tone its meaning deserves.
    expect(decisionTone("REJECTED", false)).toBe("bad");
    expect(decisionTone("SANDBOX_ONLY", false)).toBe("neutral");
  });

  it("hides the decision controls from a reader, rather than disabling them", async () => {
    // Deciding is not somewhere else — it is here, and it is not theirs. A
    // disabled Approve button would imply the action exists for them somewhere.
    serve(GRANTS);
    render(<GrantsClient canDecide={false} />);

    await screen.findByText("sandbox only");
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Refuse")).toBeNull();
  });

  it("offers the decision controls to an admin, with the write checklist", async () => {
    serve(GRANTS);
    render(<GrantsClient canDecide />);

    await screen.findByText("Approve");
    // The pending row is a CREATE, so approving it demands the checklist.
    expect(screen.getByText(/worked through the write checklist/i)).toBeTruthy();
  });

  it("flags an unbounded settled grant as a defect, not a variation", async () => {
    serve({
      ...GRANTS,
      // The panel keys off the DATABASE count, not the page's rows — an
      // unbounded grant past the page limit must still raise it.
      counts: { ...GRANTS.counts, unbounded: 1 },
      grants: [{ ...GRANTS.grants[2], id: "g_unb", lifecycle: "live", expiresAt: null, unbounded: true, operation: "CREATE", authorises: { read: true, write: true } }],
    });
    render(<GrantsClient canDecide={false} />);

    await screen.findByLabelText(/cannot be ended/);
    // The remedy is no longer "raise a replacement and wait" — the grant can
    // be withdrawn now, and the panel has to say so.
    expect(screen.getByText(/Revoke each one/)).toBeTruthy();
  });

  it("says an empty queue means nothing was asked for", async () => {
    serve({ ...GRANTS, counts: { ...GRANTS.counts, total: 0 }, grants: [], provenance: { ...GRANTS.provenance, emptyByDesign: "No grant has been requested yet." } });
    render(<GrantsClient canDecide={false} />);

    await screen.findByText("Nothing has been asked for");
  });
});

describe("portfolio — declared is not enforced", () => {
  const PORTFOLIO = {
    counts: { total: 1, byStatus: { DRAFT: 1 }, unowned: 1, withLiveCredential: 0 },
    provenance: {
      dataClassIsNotEnforced: "dataClass is a free-text declaration. Nothing reads it and no gate depends on it.",
      ownershipGatesIssuance: "A solution cannot be promoted until all three owner slots are filled.",
      countsAreComplete: "Every solution in scope is listed. There is no sampling and no page.",
    },
    solutions: [
      {
        id: "sol_1",
        name: "Finance accelerator",
        slug: "fin",
        status: "DRAFT",
        classification: "INTERNAL_ACCELERATOR",
        dataClass: "confidential",
        ownership: { missing: ["business owner", "support owner"], complete: false },
        interfaces: 0,
        hasLiveCredential: false,
      },
    ],
  };

  it("names which owner slots are missing, not how many", async () => {
    serve(PORTFOLIO);
    render(<PortfolioClient />);

    // "2 of 3 owners" tells a reviewer nothing about who to chase.
    await screen.findByText("no business owner, no support owner");
  });

  it("says dataClass gates nothing", async () => {
    serve(PORTFOLIO);
    render(<PortfolioClient />);

    await screen.findByText(/Declared, not enforced/i);
    expect(document.body.textContent).toContain("no gate depends on it");
  });

  it("states that the count is a census, not a floor", async () => {
    // A reader who learned "these numbers are a floor" in Operations would
    // otherwise under-trust a complete count.
    serve(PORTFOLIO);
    render(<PortfolioClient />);

    await screen.findByText(/Declared, not enforced/i);
    expect(document.body.textContent).toContain("no sampling and no page");
  });
});

describe("registers — a control that belongs to somebody else", () => {
  const CREDENTIALS = {
    counts: { total: 1, active: 1, revoked: 0, expired: 0, withWriteSecret: 0, issuedByAnOwner: 0, neverExpires: 1 },
    delegatedActions: [
      {
        id: "credential-rotate-revoke",
        label: "Rotate or revoke",
        availableTo: "consultant",
        where: "Developer Studio",
        why: "Rotation is the builder's action on their own solution.",
      },
    ],
    provenance: {
      oneCredentialPerSolution: "Issuance upserts on the solution, so re-issuing replaces the previous token.",
      segregationIsRecorded: "issuedBy is checked against the solution's three owner slots.",
      lastUsedUnderReports: "lastUsedAt is written fire-and-forget.",
      countsAreComplete: "Every credential in scope is listed.",
    },
    credentials: [
      {
        id: "cl_1",
        solutionId: "sol_1",
        solutionName: "Finance accelerator",
        label: "Finance accelerator · DEV",
        environment: "DEV",
        state: "active",
        segregation: { issuerWasAnOwner: false, ownershipComplete: true },
        lastObservedUseAt: null,
        expiresAt: null,
        createdAt: inDays(-2),
      },
    ],
  };

  it("renders the delegated action disabled, with its real label", async () => {
    // "Unavailable" would discard what a reviewer needs: which capability
    // exists, and who holds it.
    serve(CREDENTIALS);
    render(<CredentialRegisterClient />);

    const button = (await screen.findByText("Rotate or revoke")) as HTMLButtonElement;
    expect(button.getAttribute("disabled")).not.toBeNull();
    // The reason is in the strip, not only in a tooltip — a tooltip needs a
    // hover to find and is unreachable by keyboard on a disabled control.
    expect(screen.getByText(/Rotate or revoke lives in Developer Studio/i)).toBeTruthy();
  });

  it("renders segregation as a verdict rather than an id", async () => {
    serve(CREDENTIALS);
    render(<CredentialRegisterClient />);

    await screen.findByText("issuer was not an owner");
    expect(document.body.textContent).not.toContain("createdById");
  });

  it("reports an out-of-scope solution as unknowable, not as passing", async () => {
    serve({
      ...CREDENTIALS,
      credentials: [{ ...CREDENTIALS.credentials[0], segregation: null }],
    });
    render(<CredentialRegisterClient />);

    const pill = await screen.findByLabelText(/could not be performed/);
    expect(pill.getAttribute("aria-label")).toContain("not the same as passing");
  });

  it("shows issued-by-an-owner as a finding, since it means a control failed", async () => {
    serve({
      ...CREDENTIALS,
      counts: { ...CREDENTIALS.counts, issuedByAnOwner: 1 },
      credentials: [
        { ...CREDENTIALS.credentials[0], segregation: { issuerWasAnOwner: true, ownershipComplete: true } },
      ],
    });
    render(<CredentialRegisterClient />);

    const chip = await screen.findByLabelText(/the control did not hold/);
    expect(chip.textContent).toContain("issued by an owner");
  });

  it("the connection register includes deactivated connections and says so", async () => {
    serve({
      deploymentFallback: { inUse: false, tenants: [] },
      counts: { total: 2, active: 1, inactive: 1, writeEnabled: 0, prod: 0, undeclaredEnvironment: 1 },
      delegatedActions: [
        {
          id: "connection-write-enablement",
          label: "Enable or revoke write",
          availableTo: "consultant",
          where: "Developer Studio",
          why: "Write-enablement is a builder's action.",
        },
      ],
      provenance: {
        fallbackIsShared: null,
        includesInactive: "Deactivated connections ARE listed here, unlike the Operations health view.",
        everyConnectionIsSealed: "secretsCiphertext is a required column.",
        secretsAreNeverRead: "The ciphertext is not selected by this query.",
        environmentGatesWrites: "A connection with no declared environment refuses writes.",
        countsAreComplete: "Every connection in scope is listed.",
      },
      connections: [
        {
          id: "c1", product: "s4hana", key: "prod", label: "Acme S/4", environment: "PROD",
          authType: "basic", writeEnabled: false, isActive: true, status: "OK",
          neverTested: false, lastValidatedAt: inDays(-1),
        },
        {
          id: "c2", product: "s4hana", key: "old", label: "Retired sandbox", environment: null,
          authType: "basic", writeEnabled: false, isActive: false, status: "NEVER_TESTED",
          neverTested: true, lastValidatedAt: null,
        },
      ],
    });
    render(<ConnectionRegisterClient />);

    await screen.findByText("Retired sandbox");
    expect(document.body.textContent).toContain("Deactivated connections ARE listed here");
    expect(screen.getByText("not declared")).toBeTruthy();
  });
});

describe("audit — the event, not its contents", () => {
  const AUDIT = {
    windowHours: 720,
    counts: { total: 1, byAction: { DECISION: 1 }, byEntity: { ApiAccessGrant: 1 } },
    knownActions: ["CREATE", "UPDATE", "PROMOTE", "DECISION", "TEST_CONNECT"],
    truncated: false,
    provenance: {
      appendOnly: "ConfigAudit has no update or delete path anywhere in the platform.",
      diffsNotReturned: "The before/after snapshots are stored but not returned.",
      coversGovernedConfigOnly: "This records governed configuration. It is not an application log.",
      entriesAreAPage: { returned: 1, limit: 100, of: 1 },
    },
    entries: [
      { id: "a1", at: inDays(-1), actorId: "u_admin", entityType: "ApiAccessGrant", entityId: "g1", action: "DECISION" },
    ],
  };

  it("states that the snapshots exist and are withheld", async () => {
    // A reviewer who expects a diff and finds none concludes the record is
    // thin; one who is told they are withheld knows to ask deliberately.
    serve(AUDIT);
    render(<AuditClient />);

    await screen.findByText(/The event, not its contents/i);
    expect(document.body.textContent).toContain("stored but not returned");
  });

  it("says an empty window means no configuration changed, not that nothing happened", async () => {
    serve({ ...AUDIT, counts: { total: 0, byAction: {}, byEntity: {} }, entries: [] });
    render(<AuditClient />);

    await screen.findByText("No governed change in this window");
    expect(document.body.textContent).toContain("does not record reads");
  });

  it("states the trail cannot be amended", async () => {
    serve(AUDIT);
    render(<AuditClient />);

    await screen.findByText(/The event, not its contents/i);
    expect(document.body.textContent).toContain("no update or delete path");
  });
});
