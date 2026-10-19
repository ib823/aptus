/**
 * The four CoreEdge write paths: who may, who may not, and what refuses.
 *
 * THE POINT OF TESTING THE ROUTE AND NOT ONLY THE GATE. A screen that hides a
 * button is not a gate — the console's operator never sees Revoke, and that is
 * a courtesy, not a control. These assert the door itself refuses.
 *
 * Every verb gets the three the brief asks for: the allowed role, the refused
 * role, and the refused condition.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  grantFindFirst: vi.fn(),
  grantUpdateMany: vi.fn(),
  solutionFindFirst: vi.fn(),
  clientFindFirst: vi.fn(),
  revokeClientToken: vi.fn(),
  createClaimLink: vi.fn(),
  recheckOneLane: vi.fn(),
  checkRateLimit: vi.fn(),
  writeConfigAudit: vi.fn(),
  lockSolution: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => {
  const client = {
    apiAccessGrant: { findFirst: mocks.grantFindFirst, updateMany: mocks.grantUpdateMany },
    solution: { findFirst: mocks.solutionFindFirst },
    solutionClient: { findFirst: mocks.clientFindFirst },
    // The Solution row lock a decision takes (lib/studio/owner-lock.ts).
    $queryRaw: mocks.lockSolution,
  };
  return {
    prisma: {
      ...client,
      // A decision runs on these same mocks inside its transaction, so every
      // assertion below still sees its reads and its compare-and-set; `commit`
      // marks where the transaction — and the lock — ends.
      $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => {
        const out = await fn(client);
        mocks.commit();
        return out;
      },
    },
  };
});
vi.mock("@/lib/northbound/issue", () => ({ revokeClientToken: mocks.revokeClientToken }));
vi.mock("@/lib/northbound/claim-link", () => ({ createClaimLink: mocks.createClaimLink }));
vi.mock("@/lib/ops/lane-check-sweep", () => ({ recheckOneLane: mocks.recheckOneLane }));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: mocks.writeConfigAudit }));

import { CLAIM_LINK_COPY } from "@/lib/coreedge/copy";
import { POST as decide } from "@/app/api/coreedge/requests/[id]/decide/route";
import { POST as sendLink } from "@/app/api/coreedge/keys/claim-link/route";
import { POST as revoke } from "@/app/api/coreedge/keys/[clientId]/revoke/route";
import { POST as recheck } from "@/app/api/coreedge/lanes/recheck/route";

const ADMIN = { id: "admin1", role: "platform_admin", organizationId: "org1" };
const OPERATOR = { id: "op1", role: "support", organizationId: "org1" };
const FUTURE = new Date("2027-06-01T00:00:00Z");

function req(body: unknown): Request {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

const PENDING_GRANT = {
  id: "g1",
  organizationId: "org1",
  solutionId: "sol1",
  decision: "REQUESTED",
  operation: "READ",
  environment: "TEST",
  requestedById: "someone-else",
  expiresAt: FUTURE,
  // Owned by colleagues, not by the deciding admin.
  solution: { technicalOwnerId: "someone-else", businessOwnerId: "lead", supportOwnerId: null },
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 1, resetMs: 0 });
  mocks.writeConfigAudit.mockResolvedValue(undefined);
});

/* ── 1 · DECIDE A REQUEST ─────────────────────────────────────────────────── */

describe("POST /api/coreedge/requests/:id/decide", () => {
  it("records an approval for a platform admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue(PENDING_GRANT);
    mocks.grantUpdateMany.mockResolvedValue({ count: 1 });

    const res = await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }));

    expect(res.status).toBe(200);
    expect(mocks.grantUpdateMany).toHaveBeenCalledOnce();
    expect((await res.json()).data).toMatchObject({ id: "g1", decision: "APPROVED", decidedById: ADMIN.id });
    // Every verb writes an audit row, and it names the door it came through.
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DECISION", entityType: "ApiAccessGrant" }),
    );
    expect(mocks.writeConfigAudit.mock.calls[0]?.[0].after.decidedIn).toBe("coreedge");
  });

  it("refuses a viewer and writes nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, role: "viewer" });
    mocks.grantFindFirst.mockResolvedValue(PENDING_GRANT);

    const res = await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }));

    expect(res.status).toBe(403);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
  });

  it("refuses the requester deciding their own request", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue({ ...PENDING_GRANT, requestedById: ADMIN.id });

    const res = await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }));

    expect(res.status).toBe(403);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a request with no end date", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue({ ...PENDING_GRANT, expiresAt: null });

    expect((await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }))).status)
      .toBe(403);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses SANDBOX_ONLY as an input — D2", async () => {
    /*
     * The decision union still carries it so historical rows render as
     * "Approved for Sandbox (historical)". Accepting it HERE would quietly
     * reopen a door the design closed.
     */
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue(PENDING_GRANT);

    const res = await decide(req({ decision: "SANDBOX_ONLY" }) as never, params({ id: "g1" }));

    expect(res.status).toBe(400);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses re-deciding a settled grant", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue({ ...PENDING_GRANT, decision: "APPROVED" });

    expect((await decide(req({ decision: "REJECTED" }) as never, params({ id: "g1" }))).status)
      .toBe(409);
  });

  it("cannot reach another tenant's grant", async () => {
    // The organization is in the where clause, so a foreign id is not found
    // rather than found and then refused — which would leak that it exists.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue(null);

    expect((await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }))).status)
      .toBe(404);
    expect(mocks.grantFindFirst.mock.calls[0]?.[0].where.organizationId).toBe("org1");
  });

  it("refuses an app's owner approving a PROD write a colleague raised for it", async () => {
    // The audit's trigger: B raises, A owns all three slots, A approves.
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, role: "consultant" });
    mocks.grantFindFirst.mockResolvedValue({
      ...PENDING_GRANT,
      operation: "CREATE",
      environment: "PROD",
      solution: {
        technicalOwnerId: ADMIN.id,
        businessOwnerId: ADMIN.id,
        supportOwnerId: ADMIN.id,
      },
    });

    const res = await decide(
      req({ decision: "APPROVED", writeChecklistAcknowledged: true }) as never,
      params({ id: "g1" }),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe(
      "You own this app, so a colleague has to approve its access.",
    );
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
  });

  it("refuses READ_ONLY on a write request — it would authorise nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue({ ...PENDING_GRANT, operation: "CREATE", environment: "PROD" });

    const res = await decide(req({ decision: "READ_ONLY" }) as never, params({ id: "g1" }));

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/Read-only cannot narrow a write/);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("approves a write once the bar sends the checklist acknowledgement", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue({ ...PENDING_GRANT, operation: "CREATE", environment: "PROD" });
    mocks.grantUpdateMany.mockResolvedValue({ count: 1 });

    const res = await decide(
      req({ decision: "APPROVED", writeChecklistAcknowledged: true }) as never,
      params({ id: "g1" }),
    );

    expect(res.status).toBe(200);
  });

  /*
   * A DECISION IS A COMPARE-AND-SET. Two reviewers deciding together both read
   * REQUESTED and both pass NOT_PENDING; only the WHERE can tell them apart.
   */
  it("writes only while the grant is still REQUESTED, and in this tenant", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue(PENDING_GRANT);
    mocks.grantUpdateMany.mockResolvedValue({ count: 1 });

    await decide(req({ decision: "REJECTED" }) as never, params({ id: "g1" }));

    expect(mocks.grantUpdateMany.mock.calls[0]?.[0].where).toEqual({
      id: "g1",
      organizationId: "org1",
      decision: "REQUESTED",
    });
  });

  it("locks the app's Solution row before reading its owners, and holds it through the write", async () => {
    // OWN_APP reads the owners the Studio solutions PATCH writes — a different
    // row from this grant — so a reclaim fired together with this decision used
    // to pass on owners read a moment before it landed. The PATCH takes the same
    // lock; the read that decides must come after it.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue(PENDING_GRANT);
    mocks.grantUpdateMany.mockResolvedValue({ count: 1 });

    const res = await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }));

    expect(res.status).toBe(200);
    expect(mocks.lockSolution).toHaveBeenCalledOnce();
    const [sql, ...bound] = mocks.lockSolution.mock.calls[0] as [readonly string[], ...unknown[]];
    expect(sql.join("?")).toMatch(/FROM "Solution"[\s\S]*FOR UPDATE/);
    expect(bound).toEqual(["sol1", "org1"]);

    // Located first (to know which app to lock), then read again under the lock.
    const reads = mocks.grantFindFirst.mock.invocationCallOrder;
    const lock = mocks.lockSolution.mock.invocationCallOrder[0]!;
    expect(reads).toHaveLength(2);
    expect(reads[0]!).toBeLessThan(lock);
    expect(lock).toBeLessThan(reads[1]!);
    expect(mocks.grantFindFirst.mock.calls[1]?.[0].select.solution).toBeDefined();
    expect(reads[1]!).toBeLessThan(mocks.grantUpdateMany.mock.invocationCallOrder[0]!);
    expect(mocks.grantUpdateMany.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.commit.mock.invocationCallOrder[0]!,
    );
  });

  it("409s the second of two concurrent decisions, and audits nothing for it", async () => {
    // The read saw REQUESTED; by the time this write ran, another reviewer's
    // decision had landed, so the guarded write matched no row.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.grantFindFirst.mockResolvedValue(PENDING_GRANT);
    mocks.grantUpdateMany.mockResolvedValue({ count: 0 });

    const res = await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }));

    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/Someone else decided this request/);
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
  });
});

/* ── 2 · SEND A KEY ───────────────────────────────────────────────────────── */

describe("POST /api/coreedge/keys/claim-link", () => {
  /*
   * Owned, and by people other than the sender. The fixture used to be
   * `{ id, status }` alone, which is exactly the select that let an unowned
   * app — or its own sole owner — be sent a key: the route never read owners.
   */
  const OWNED_BY_OTHERS = {
    id: "s1",
    status: "ACTIVE",
    technicalOwnerId: "u_tech",
    businessOwnerId: "u_biz",
    supportOwnerId: "u_sup",
  };

  beforeEach(() => {
    mocks.solutionFindFirst.mockResolvedValue(OWNED_BY_OTHERS);
    mocks.createClaimLink.mockResolvedValue({
      id: "link1",
      rawToken: "cec_example",
      expiresAt: FUTURE,
    });
  });

  it("sends a link for a platform admin, and never returns a key", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const res = await sendLink(req({ solutionId: "s1", environment: "TEST" }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.claimPath).toBe("/claim/cec_example");
    // The KEY is minted only when the recipient opens the link. A key in a
    // response body is a key in a log, a proxy and a browser history.
    expect(JSON.stringify(body)).not.toContain("ce_");
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ISSUE" }),
    );
    // And the audit row does not carry the token either.
    expect(JSON.stringify(mocks.writeConfigAudit.mock.calls[0]?.[0])).not.toContain("cec_example");
  });

  it("refuses an operator", async () => {
    mocks.getCurrentUser.mockResolvedValue(OPERATOR);
    expect((await sendLink(req({ solutionId: "s1", environment: "TEST" }) as never)).status)
      .toBe(403);
    expect(mocks.createClaimLink).not.toHaveBeenCalled();
  });

  it("refuses a retired app, whose key would not work anyway", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.solutionFindFirst.mockResolvedValue({ ...OWNED_BY_OTHERS, status: "RETIRED" });

    expect((await sendLink(req({ solutionId: "s1", environment: "TEST" }) as never)).status)
      .toBe(409);
    expect(mocks.createClaimLink).not.toHaveBeenCalled();
  });

  it("refuses the app's own owner — the self-issuance Studio refuses", async () => {
    /*
     * A sole owner refused in Studio ("You own this solution, so you cannot
     * issue its runtime credential") could send themselves a link here and
     * collect a live PROD key with createdById = themselves.
     */
    const OWNER = { id: "u_me", role: "consultant", organizationId: "org1" };
    mocks.getCurrentUser.mockResolvedValue(OWNER);
    for (const slot of ["technicalOwnerId", "businessOwnerId", "supportOwnerId"] as const) {
      mocks.solutionFindFirst.mockResolvedValue({ ...OWNED_BY_OTHERS, [slot]: OWNER.id });

      const res = await sendLink(req({ solutionId: "s1", environment: "PROD" }) as never);

      expect(res.status, `${slot} must be refused`).toBe(403);
      expect((await res.json()).error.message).toBe(CLAIM_LINK_COPY.ownAppKey);
    }
    expect(mocks.createClaimLink).not.toHaveBeenCalled();
    // The gate needs the owners, so the lookup has to select them.
    expect(mocks.solutionFindFirst.mock.calls[0]?.[0].select).toMatchObject({
      technicalOwnerId: true,
      businessOwnerId: true,
      supportOwnerId: true,
    });
  });

  it("refuses an app that does not name all three owners, whoever sends it", async () => {
    // On an unowned app [null, null, null] contains nobody, so the owner check
    // alone passes for everyone — the reason ownership is asked first.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.solutionFindFirst.mockResolvedValue({
      ...OWNED_BY_OTHERS,
      technicalOwnerId: null,
      businessOwnerId: null,
      supportOwnerId: null,
    });

    const res = await sendLink(req({ solutionId: "s1", environment: "PROD" }) as never);

    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toBe(CLAIM_LINK_COPY.appNeedsOwners);
    expect(mocks.createClaimLink).not.toHaveBeenCalled();
  });
});

/* ── 3 · REVOKE A KEY ─────────────────────────────────────────────────────── */

describe("POST /api/coreedge/keys/:clientId/revoke", () => {
  const REASON = { reason: "Rotated after the contractor left the project." };

  beforeEach(() => {
    mocks.clientFindFirst.mockResolvedValue({
      id: "c1",
      solutionId: "s1",
      environment: "TEST",
      revokedAt: null,
    });
    mocks.revokeClientToken.mockResolvedValue({ id: "c1" });
  });

  it("revokes for a platform admin — D4", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const res = await revoke(req(REASON) as never, params({ clientId: "c1" }));

    expect(res.status).toBe(200);
    expect(mocks.revokeClientToken).toHaveBeenCalledOnce();
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REVOKE" }),
    );
    // The reason is recorded, because the calls that fail afterwards will need
    // explaining.
    expect(mocks.writeConfigAudit.mock.calls[0]?.[0].after.reason).toBe(REASON.reason);
  });

  it("refuses the operator in the words that say what they do instead", async () => {
    mocks.getCurrentUser.mockResolvedValue(OPERATOR);

    const res = await revoke(req(REASON) as never, params({ clientId: "c1" }));

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain("operator flags and notifies");
    expect(mocks.revokeClientToken).not.toHaveBeenCalled();
  });

  it("refuses a reason too short to mean anything", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    expect((await revoke(req({ reason: "no" }) as never, params({ clientId: "c1" }))).status)
      .toBe(400);
    expect(mocks.revokeClientToken).not.toHaveBeenCalled();
  });

  it("is idempotent on an already-revoked key", async () => {
    // Two people pressing revoke is not an error.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.clientFindFirst.mockResolvedValue({
      id: "c1",
      solutionId: "s1",
      environment: "TEST",
      revokedAt: FUTURE,
    });

    const res = await revoke(req(REASON) as never, params({ clientId: "c1" }));

    expect(res.status).toBe(200);
    expect((await res.json()).data.alreadyRevoked).toBe(true);
    expect(mocks.revokeClientToken).not.toHaveBeenCalled();
  });
});

/* ── 4 · RE-CHECK A LANE ──────────────────────────────────────────────────── */

describe("POST /api/coreedge/lanes/recheck", () => {
  const LANE = { solutionId: "s1", interfaceId: "f1", environment: "TEST" };

  it("runs for an operator, who is exactly who needs it", async () => {
    mocks.getCurrentUser.mockResolvedValue(OPERATOR);
    mocks.recheckOneLane.mockResolvedValue({ ok: true, readStatus: "OK", checkedAt: FUTURE });

    expect((await recheck(req(LANE) as never)).status).toBe(200);
    expect(mocks.recheckOneLane).toHaveBeenCalledOnce();
    // It reached a client's SAP system on demand. Someone asking why their
    // estate saw traffic needs a row naming who pressed it.
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "op1", action: "TEST_CONNECT", entityId: "f1" }),
    );
  });

  it("refuses a viewer", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, role: "viewer" });
    expect((await recheck(req(LANE) as never)).status).toBe(403);
    expect(mocks.recheckOneLane).not.toHaveBeenCalled();
  });

  it("refuses a second press inside the window, per lane", async () => {
    /*
     * The button reaches a CLIENT's SAP system. Without a limit it is an
     * amplifier pointed at someone else's production estate, and the key is
     * the lane rather than the user because ten operators on one lane is the
     * case that matters.
     */
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 42_000 });

    const res = await recheck(req(LANE) as never);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(mocks.recheckOneLane).not.toHaveBeenCalled();
    const key = String(mocks.checkRateLimit.mock.calls[0]?.[0]);
    expect(key).toContain("s1");
    expect(key).toContain("f1");
    expect(key).toContain("TEST");
    expect(key).toContain("org1");
  });

  it("reports a skip as a result, not an error", async () => {
    // A feed with no dataset has nothing to read, and no amount of re-checking
    // will change that. The screen already has words for it.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.recheckOneLane.mockResolvedValue({ ok: false, skipped: "noEntitySet" });

    const res = await recheck(req(LANE) as never);

    expect(res.status).toBe(200);
    expect((await res.json()).data.skipped).toBe("noEntitySet");
    // A skip is audited too: recording only the presses that reached SAP would
    // make the log agree with itself by leaving out the ones that did not.
    expect(mocks.writeConfigAudit.mock.calls[0]?.[0].after.skipped).toBe("noEntitySet");
  });
});

/* ── Every door, one rule ─────────────────────────────────────────────────── */

describe("no door serves an anonymous caller", () => {
  it("refuses all four with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }))).status).toBe(401);
    expect((await sendLink(req({ solutionId: "s1", environment: "TEST" }) as never)).status).toBe(401);
    expect((await revoke(req({ reason: "x".repeat(20) }) as never, params({ clientId: "c1" }))).status).toBe(401);
    expect((await recheck(req({ solutionId: "s1", interfaceId: "f1", environment: "TEST" }) as never)).status).toBe(401);
  });

  it("refuses a signed-in user with no organization", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, organizationId: null });
    expect((await decide(req({ decision: "APPROVED" }) as never, params({ id: "g1" }))).status).toBe(403);
    expect((await sendLink(req({ solutionId: "s1", environment: "TEST" }) as never)).status).toBe(403);
  });
});
