/**
 * The admin decision path — Control Tower's one permitted mutation.
 *
 * WHAT MAKES THIS WORTH ITS OWN FILE. Developer Studio already decides grants,
 * behind `canMutateStudio`, which returns FALSE for `platform_admin`
 * deliberately. The obvious way to let an admin decide is to widen that
 * predicate — and it would hand the admin every other builder mutation as a
 * side effect, silently, in a function used right across the workspace.
 *
 * So there are two doors onto one piece of logic, and the tests here pin both
 * halves of that arrangement:
 *
 *   · the new door is gated correctly, and does not open for a reader
 *   · the logic behind it is the SAME logic — segregation, the write checklist
 *     and mandatory expiry all still hold, because `evaluateDecision` is
 *     imported rather than reimplemented
 *
 * A reimplementation would pass a superficial test suite and drift on exactly
 * the control that makes the ledger worth keeping.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  grantFindFirst: vi.fn(),
  grantUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  // GET-side, unused here but the module imports them.
  grantFindMany: vi.fn(),
  grantCount: vi.fn(),
  grantGroupBy: vi.fn(),
  solutionFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    apiAccessGrant: {
      findFirst: mocks.grantFindFirst,
      updateMany: mocks.grantUpdateMany,
      findMany: mocks.grantFindMany,
      count: mocks.grantCount,
      groupBy: mocks.grantGroupBy,
    },
    solution: { findMany: mocks.solutionFindMany },
    configAudit: { create: mocks.auditCreate },
  },
}));

import { PATCH } from "@/app/api/control-tower/grants/route";
import { canMutateStudio } from "@/lib/studio/rbac";

const ADMIN = { id: "u_admin", email: "admin@abeam.test", role: "platform_admin", organizationId: "org_a" };
const PARTNER_LEAD = { id: "u_pl", email: "pl@abeam.test", role: "partner_lead", organizationId: "org_a" };
const SUPPORT = { id: "u_s", email: "s@abeam.test", role: "support", organizationId: "org_a" };
const ADMIN_NO_ORG = { ...ADMIN, organizationId: null };

const FUTURE = new Date("2027-01-01T00:00:00Z");

function pendingGrant(over: Record<string, unknown> = {}) {
  return {
    id: "g1",
    organizationId: "org_a",
    decision: "REQUESTED",
    operation: "READ",
    environment: "PROD",
    requestedById: "u_requester",
    externalId: "API_BP",
    solutionId: "sol_1",
    // Bounded by default: the expiry rule now covers reads, so a null here would
    // make every test that is not about expiry fail for a reason it never meant
    // to assert. Tests probing the unbounded path pass null explicitly.
    expiresAt: FUTURE,
    // Owned by the requester and a colleague — never by the deciding admin.
    solution: { technicalOwnerId: "u_requester", businessOwnerId: "u_lead", supportOwnerId: null },
    ...over,
  };
}

function decide(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest("https://x.test/api/control-tower/grants", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.grantFindFirst.mockResolvedValue(pendingGrant());
  // A compare-and-set reports how many rows matched its guard; one means this
  // decision is the one that landed.
  mocks.grantUpdateMany.mockResolvedValue({ count: 1 });
  mocks.auditCreate.mockResolvedValue({});
});

describe("the gate — reading this workspace is not deciding in it", () => {
  it("refuses an unauthenticated caller", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await decide({ grantId: "g1", decision: "APPROVED" })).status).toBe(401);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a partner lead, who may READ every grant on this screen", async () => {
    // The sharp case. They are entitled to the workspace and to this very
    // endpoint's GET; they are not entitled to settle a request.
    mocks.getCurrentUser.mockResolvedValue(PARTNER_LEAD);
    const res = await decide({ grantId: "g1", decision: "APPROVED" });
    expect(res.status).toBe(403);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses the support persona outright", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPPORT);
    expect((await decide({ grantId: "g1", decision: "APPROVED" })).status).toBe(403);
  });

  it("refuses BEFORE looking the grant up, so a 403 reveals no ids", async () => {
    mocks.getCurrentUser.mockResolvedValue(PARTNER_LEAD);
    await decide({ grantId: "g_does_not_exist", decision: "APPROVED" });
    expect(mocks.grantFindFirst).not.toHaveBeenCalled();
  });

  it("admits a platform admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    expect((await decide({ grantId: "g1", decision: "APPROVED" })).status).toBe(200);
  });
});

describe("canMutateStudio was NOT widened to make this work", () => {
  it("still refuses platform_admin, exactly as before", () => {
    // The whole reason this second path exists. If this ever returns true, the
    // admin has silently acquired every builder mutation in Studio.
    expect(canMutateStudio("platform_admin")).toBe(false);
    expect(canMutateStudio("consultant")).toBe(true);
  });
});

describe("the governance controls are the same controls, not a second copy", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("refuses self-approval even for an admin", async () => {
    // Seniority is not an exemption. This is the single control that makes the
    // ledger worth keeping.
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ requestedById: ADMIN.id }));
    const res = await decide({ grantId: "g1", decision: "APPROVED" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/cannot decide your own request/i);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("409s a re-decision of a settled grant rather than rewriting history", async () => {
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ decision: "APPROVED" }));
    const res = await decide({ grantId: "g1", decision: "REJECTED" });
    expect(res.status).toBe(409);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("demands the write checklist before a write is approved", async () => {
    mocks.grantFindFirst.mockResolvedValue(
      pendingGrant({ operation: "CREATE", expiresAt: FUTURE }),
    );
    const res = await decide({ grantId: "g1", decision: "APPROVED" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/write checklist/i);
  });

  it("refuses an unbounded write grant — there is no revocation to fall back on", async () => {
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ operation: "CREATE", expiresAt: null }));
    const res = await decide({
      grantId: "g1",
      decision: "APPROVED",
      writeChecklistAcknowledged: true,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/must have an expiry/i);
  });

  it("allows a bounded, checklisted write", async () => {
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ operation: "CREATE", expiresAt: FUTURE }));
    const res = await decide({
      grantId: "g1",
      decision: "APPROVED",
      writeChecklistAcknowledged: true,
    });
    expect(res.status).toBe(200);
  });

  it("takes the expiry from the REQUEST, never from the decision payload", async () => {
    // An approver may not invent the boundary on a write they are approving.
    // Passing one here must not rescue an unbounded request.
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ operation: "CREATE", expiresAt: null }));
    const res = await decide({
      grantId: "g1",
      decision: "APPROVED",
      writeChecklistAcknowledged: true,
      expiresAt: FUTURE.toISOString(),
    });
    expect(res.status).toBe(403);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a decision that cannot be set by hand", async () => {
    const res = await decide({ grantId: "g1", decision: "EXPIRED" });
    expect(res.status).toBe(400);
  });
});

describe("the write is tenant-anchored and audited", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("carries the organization — and the pending state — in the update itself", async () => {
    // UPDATED with the compare-and-set: this asserted the WHERE was exactly
    // { id, organizationId }, which is the shape that let a second concurrent
    // decision overwrite the first. The tenant is still asserted here; the
    // `decision: "REQUESTED"` guard is now part of the same WHERE.
    await decide({ grantId: "g1", decision: "READ_ONLY" });
    expect(mocks.grantUpdateMany.mock.calls[0]?.[0]?.where).toEqual({
      id: "g1",
      organizationId: "org_a",
      decision: "REQUESTED",
    });
  });

  it("409s the second of two concurrent decisions, and audits nothing for it", async () => {
    // Both read REQUESTED and passed NOT_PENDING; the other decision landed
    // first, so this guarded write matched no row.
    mocks.grantUpdateMany.mockResolvedValue({ count: 0 });
    const res = await decide({ grantId: "g1", decision: "APPROVED" });
    expect(res.status).toBe(409);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("anchors on the ROW's organization, not the actor's, for a global admin", async () => {
    // A global admin has no organization. Taking the tenant from the actor
    // would produce an unscoped write; taking it from the row is the only
    // correct source.
    mocks.getCurrentUser.mockResolvedValue(ADMIN_NO_ORG);
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ organizationId: "org_other" }));
    await decide({ grantId: "g1", decision: "READ_ONLY" });
    expect(mocks.grantUpdateMany.mock.calls[0]?.[0]?.where?.organizationId).toBe("org_other");
    expect(mocks.auditCreate.mock.calls[0]?.[0]?.data?.organizationId).toBe("org_other");
  });

  it("writes a DECISION audit entry naming the workspace it came from", async () => {
    await decide({ grantId: "g1", decision: "READ_ONLY" });
    const entry = mocks.auditCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(entry.action).toBe("DECISION");
    expect(entry.entityType).toBe("ApiAccessGrant");
    expect(entry.actorId).toBe(ADMIN.id);
    // The same decision from two workspaces is two different governance events.
    expect((entry.after as Record<string, unknown>).decidedIn).toBe("control-tower");
  });

  it("records the prior decision so the trail shows what changed", async () => {
    await decide({ grantId: "g1", decision: "READ_ONLY" });
    const entry = mocks.auditCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect((entry.before as Record<string, unknown>).decision).toBe("REQUESTED");
  });
});

describe("the response says what the decision now authorises", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("reports a READ_ONLY decision as permitting a read and not a write", async () => {
    const body = await (await decide({ grantId: "g1", decision: "READ_ONLY" })).json();
    expect(body.data.authorises).toEqual({ read: true, write: false });
  });

  it("reports SANDBOX_ONLY on a PROD grant as authorising nothing", async () => {
    // The label alone would read as a permission. It is not one here.
    const body = await (await decide({ grantId: "g1", decision: "SANDBOX_ONLY" })).json();
    expect(body.data.authorises).toEqual({ read: false, write: false });
  });

  it("reports a rejection as authorising nothing", async () => {
    const body = await (await decide({ grantId: "g1", decision: "REJECTED" })).json();
    expect(body.data.authorises).toEqual({ read: false, write: false });
  });

  it("never reports a read on a write grant — the broker matches on operation", async () => {
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ operation: "CREATE" }));
    const body = await (
      await decide({ grantId: "g1", decision: "APPROVED", writeChecklistAcknowledged: true })
    ).json();
    expect(body.data.authorises).toEqual({ read: false, write: true });
  });
});

describe("the owner rule and read-only on writes hold at this door too", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("refuses an admin who owns the app, on a request someone else raised", async () => {
    // Seniority is no more an exemption here than it is for self-approval.
    mocks.grantFindFirst.mockResolvedValue(
      pendingGrant({
        operation: "CREATE",
        solution: { technicalOwnerId: null, businessOwnerId: null, supportOwnerId: ADMIN.id },
      }),
    );
    const res = await decide({ grantId: "g1", decision: "APPROVED", writeChecklistAcknowledged: true });
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/You own this app/);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses READ_ONLY on a CREATE request rather than storing a grant that permits nothing", async () => {
    mocks.grantFindFirst.mockResolvedValue(pendingGrant({ operation: "CREATE" }));
    const res = await decide({ grantId: "g1", decision: "READ_ONLY", writeChecklistAcknowledged: true });
    expect(res.status).toBe(403);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });
});
