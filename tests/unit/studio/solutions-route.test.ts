/**
 * /api/studio/solutions — that the route actually applies the ownership gate.
 *
 * The rules are proved in solutions.test.ts. What matters here is that the gate
 * lives on the WRITE PATH: a control that only exists in the form is one API
 * call away from being bypassed, and this is the test that would fail if someone
 * moved it there.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstSolution: vi.fn(),
  createSolution: vi.fn(),
  updateSolution: vi.fn(),
  createAudit: vi.fn(),
  closeLinks: vi.fn(),
  findFirstGrant: vi.fn(),
  findManyGrants: vi.fn(),
  lockSolution: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => {
  const client = {
    solution: {
      findFirst: mocks.findFirstSolution,
      create: mocks.createSolution,
      update: mocks.updateSolution,
      findMany: vi.fn().mockResolvedValue([]),
    },
    configAudit: { create: mocks.createAudit },
    keyClaimLink: { updateMany: mocks.closeLinks },
    apiAccessGrant: { findFirst: mocks.findFirstGrant, findMany: mocks.findManyGrants },
    // The Solution row lock (lib/studio/owner-lock.ts), the only raw query here.
    $queryRaw: mocks.lockSolution,
  };
  return {
    prisma: {
      ...client,
      // The transaction runs on these same mocks, so every assertion below still
      // sees what the PATCH reads and writes inside it; `commit` marks where it
      // ends, so a test can tell what happened while the lock was held.
      $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => {
        const out = await fn(client);
        mocks.commit();
        return out;
      },
    },
  };
});

import { PATCH, POST } from "@/app/api/studio/solutions/route";

const BUILDER = { id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };

function req(body: unknown, method = "POST") {
  return new Request("http://localhost:3003/api/studio/solutions", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const VALID_CREATE = {
  name: "Finance Accelerator",
  classification: "INTERNAL_ACCELERATOR",
  businessProblem: "Speeds up the finance close for mid-market clients.",
  dataClass: "INTERNAL",
};

const ACTIVE_COMPLETE = {
  id: "sol_1",
  name: "Finance Accelerator",
  status: "ACTIVE",
  technicalOwnerId: "u_tech",
  businessOwnerId: "u_biz",
  supportOwnerId: "u_sup",
  repoUrl: null,
  packagingNote: null,
  reuseIntent: null,
  businessProblem: "x",
  dataClass: "INTERNAL",
  classification: "INTERNAL_ACCELERATOR",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstSolution.mockResolvedValue(null); // no slug clash by default
  mocks.createSolution.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "sol_1", ...data }),
  );
  mocks.updateSolution.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "sol_1", ...data }),
  );
  mocks.createAudit.mockResolvedValue({ id: "a1" });
  // No request awaiting a decision, and nothing the caller decided, by default.
  mocks.findFirstGrant.mockResolvedValue(null);
  mocks.findManyGrants.mockResolvedValue([]);
});

describe("registering a solution", () => {
  it("always creates a DRAFT — nothing arrives already ACTIVE", async () => {
    const res = await POST(req(VALID_CREATE));
    expect(res.status).toBe(201);
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("DRAFT");
  });

  it("stamps the caller's organization", async () => {
    await POST(req(VALID_CREATE));
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.organizationId).toBe("org_a");
  });

  it("derives a slug from the name", async () => {
    await POST(req(VALID_CREATE));
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.slug).toBe("finance-accelerator");
  });

  it("suffixes a clashing slug rather than failing the save", async () => {
    // A second "Finance Accelerator" is a normal thing to want.
    mocks.findFirstSolution.mockResolvedValueOnce({ id: "existing" }).mockResolvedValueOnce(null);
    await POST(req(VALID_CREATE));
    const data = mocks.createSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.slug).toBe("finance-accelerator-2");
  });

  it("refuses a name with no usable slug rather than inventing an identifier", async () => {
    expect((await POST(req({ ...VALID_CREATE, name: "!!!" }))).status).toBe(400);
  });

  it("403s a role that cannot author", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    expect((await POST(req(VALID_CREATE))).status).toBe(403);
  });

  it("writes a ConfigAudit entry", async () => {
    await POST(req(VALID_CREATE));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: "Solution", action: "CREATE" }),
      }),
    );
  });
});

describe("the ownership gate lives on the write path", () => {
  it("409s a promotion to ACTIVE with a missing owner", async () => {
    mocks.findFirstSolution.mockResolvedValue({
      ...ACTIVE_COMPLETE,
      status: "DRAFT",
      supportOwnerId: null,
    });
    const res = await PATCH(req({ id: "sol_1", status: "ACTIVE" }, "PATCH"));
    expect(res.status).toBe(409);
    expect(mocks.updateSolution).not.toHaveBeenCalled();
  });

  it("allows promotion when all three owners are present", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "DRAFT" });
    const res = await PATCH(req({ id: "sol_1", status: "ACTIVE" }, "PATCH"));
    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("ACTIVE");
  });

  it("records a promotion as PROMOTE, distinct from an ordinary edit", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "DRAFT" });
    await PATCH(req({ id: "sol_1", status: "ACTIVE" }, "PATCH"));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "PROMOTE" }) }),
    );
  });

  it("auto-drops an ACTIVE solution to RESTRICTED when an owner is cleared", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    const res = await PATCH(req({ id: "sol_1", businessOwnerId: null }, "PATCH"));
    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    // The record must never sit ACTIVE with nobody accountable.
    expect(data.status).toBe("RESTRICTED");
    expect(data.businessOwnerId).toBeNull();
  });

  it("tells the caller the drop happened, and why", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    const res = await PATCH(req({ id: "sol_1", supportOwnerId: null }, "PATCH"));
    const json = (await res.json()) as { data: { autoDropped: boolean; autoDropReason?: string } };
    expect(json.data.autoDropped).toBe(true);
    expect(json.data.autoDropReason).toContain("support owner");
  });

  it("leaves an ACTIVE solution active when an unrelated field changes", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    await PATCH(req({ id: "sol_1", dataClass: "CLIENT_CONFIDENTIAL" }, "PATCH"));
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("ACTIVE");
  });

  it("distinguishes 'not mentioned' from 'explicitly cleared'", async () => {
    // Omitting an owner must not silently wipe it — that distinction is what
    // makes the auto-drop expressible without booby-trapping every edit.
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    await PATCH(req({ id: "sol_1", name: "Renamed" }, "PATCH"));
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.technicalOwnerId).toBe("u_tech");
    expect(data.status).toBe("ACTIVE");
  });
});

describe("cross-tenant", () => {
  it("scopes the lookup to the caller's organization", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    await PATCH(req({ id: "sol_1", name: "Renamed solution" }, "PATCH"));
    expect(mocks.findFirstSolution).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sol_1", organizationId: "org_a" } }),
    );
  });

  it("404s a solution in another tenant", async () => {
    mocks.findFirstSolution.mockResolvedValue(null);
    expect((await PATCH(req({ id: "sol_other", name: "Renamed solution" }, "PATCH"))).status).toBe(404);
    expect(mocks.updateSolution).not.toHaveBeenCalled();
  });
});

describe("ownership is claimed on the write path, not just in the form", () => {
  // The form only ever offered claim (set to self) and clear (set to null), so
  // the product behaved correctly while the route accepted any id. That gap is
  // exactly what this file's header exists to catch — a control that lives in
  // the client is one API call away from not existing.

  it("refuses a PATCH that names someone else as an owner", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    const res = await PATCH(req({ id: "sol_1", technicalOwnerId: "u_someone_else" }, "PATCH"));
    expect(res.status).toBe(403);
    expect(mocks.updateSolution).not.toHaveBeenCalled();
  });

  it("refuses the bypass — three colleagues named, caller left a non-owner", async () => {
    // With this accepted, the caller is not an owner, so POST /api/studio/clients
    // would let them issue the credential alone. The two-human rule becomes one
    // human plus three unwitting names on the audit record.
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    const res = await PATCH(
      req(
        { id: "sol_1", technicalOwnerId: "u_a", businessOwnerId: "u_b", supportOwnerId: "u_c" },
        "PATCH",
      ),
    );
    expect(res.status).toBe(403);
    expect(mocks.updateSolution).not.toHaveBeenCalled();
  });

  it("refuses BEFORE looking the solution up, so the refusal leaks nothing", async () => {
    // A 403 that depended on the row would tell a caller whether a solution id
    // exists in another tenant.
    mocks.findFirstSolution.mockClear();
    const res = await PATCH(req({ id: "sol_unknown", supportOwnerId: "u_x" }, "PATCH"));
    expect(res.status).toBe(403);
    expect(mocks.findFirstSolution).not.toHaveBeenCalled();
  });

  it("allows claiming a slot for yourself", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, technicalOwnerId: null, status: "DRAFT" });
    const res = await PATCH(req({ id: "sol_1", technicalOwnerId: "u1" }, "PATCH"));
    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.technicalOwnerId).toBe("u1");
  });

  it("allows clearing someone else's slot — the orphan recovery path", async () => {
    // Clearing never makes anyone accountable, so it cannot manufacture the
    // record the bypass needs. It leaves the solution visibly unowned.
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    const res = await PATCH(req({ id: "sol_1", technicalOwnerId: null }, "PATCH"));
    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.technicalOwnerId).toBeNull();
    // …and the solution drops out of ACTIVE rather than sitting there unowned.
    expect(data.status).toBe("RESTRICTED");
  });

  it("applies the same rule at registration", async () => {
    // Otherwise the bypass just moves to create time.
    const res = await POST(req({ ...VALID_CREATE, businessOwnerId: "u_someone_else" }));
    expect(res.status).toBe(403);
    expect(mocks.createSolution).not.toHaveBeenCalled();
  });

  it("allows registering with slots claimed for yourself", async () => {
    mocks.createSolution.mockResolvedValue({ id: "sol_new", name: "x", slug: "x", status: "DRAFT", classification: "INTERNAL_ACCELERATOR" });
    const res = await POST(req({ ...VALID_CREATE, technicalOwnerId: "u1" }));
    expect(res.status).toBe(201);
  });
});

describe("retiring a solution closes the key links still out for it", () => {
  /*
   * Retirement changed only the Solution row, so a claim link sent while the
   * app was live stayed live for its whole window and, opened afterwards,
   * minted a key for a retired app — one that works again the moment the app
   * is set back to DRAFT.
   */
  beforeEach(() => {
    mocks.closeLinks.mockResolvedValue({ count: 1 });
  });

  it("closes every environment's pending links, before the status is written", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);

    const res = await PATCH(req({ id: "sol_1", status: "RETIRED" }, "PATCH"));

    expect(res.status).toBe(200);
    const close = mocks.closeLinks.mock.calls[0]?.[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(close.where).toEqual({
      organizationId: "org_a",
      solutionId: "sol_1",
      claimedAt: null,
      revokedAt: null,
    });
    expect(close.data.revokedReason).toBe("The app was retired.");
    expect(mocks.closeLinks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateSolution.mock.invocationCallOrder[0]!,
    );
  });

  it("leaves links alone on an ordinary edit, and on re-saving an already retired app", async () => {
    mocks.findFirstSolution.mockResolvedValue(ACTIVE_COMPLETE);
    await PATCH(req({ id: "sol_1", name: "Renamed" }, "PATCH"));

    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "RETIRED" });
    await PATCH(req({ id: "sol_1", name: "Renamed again" }, "PATCH"));

    expect(mocks.closeLinks).not.toHaveBeenCalled();
  });
});

describe("own-app holds across owner-slot changes", () => {
  /*
   * OWN_APP is checked against the owners the row holds when a decision is
   * made, and both halves of a slot change are self-service. So an owner could
   * release every slot, approve their own app's PROD write as a "non-owner",
   * and reclaim the slots — ending as both the decider and the owner of the
   * grant, with every call allowed. The scenario itself, through the real
   * decide route, is own-app-across-owner-changes.test.ts; this pins each
   * refusal on the write path.
   */
  const OWNED_BY_CALLER = {
    ...ACTIVE_COMPLETE,
    technicalOwnerId: "u1",
    businessOwnerId: "u1",
    supportOwnerId: "u1",
  };

  it("refuses releasing a slot while a request on the app awaits a decision", async () => {
    mocks.findFirstSolution.mockResolvedValue(OWNED_BY_CALLER);
    mocks.findFirstGrant.mockResolvedValue({ id: "g_pending" });

    const res = await PATCH(
      req({ id: "sol_1", technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null }, "PATCH"),
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("waiting for a decision");
    expect(mocks.updateSolution).not.toHaveBeenCalled();
    // The pending request is looked for on THIS app, in THIS tenant.
    expect(mocks.findFirstGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_a", solutionId: "sol_1", decision: "REQUESTED" },
      }),
    );
  });

  it("refuses an owner stepping down from their last slot while a request waits, even with others named", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, technicalOwnerId: "u1" });
    mocks.findFirstGrant.mockResolvedValue({ id: "g_pending" });

    const res = await PATCH(req({ id: "sol_1", technicalOwnerId: null }, "PATCH"));

    expect(res.status).toBe(409);
    expect(mocks.updateSolution).not.toHaveBeenCalled();
  });

  /*
   * ONLY THE CALLER STEPPING DOWN WAITS. Any colleague may raise a request on
   * any app, and a REQUESTED grant has no withdraw route — so freezing every
   * slot change behind it froze the app's ownership until a non-owner decided,
   * including the clear that recovers a departed owner's slot. None of these
   * saves makes the caller a non-owner, so none opens the self-service path.
   */
  it("lets anyone clear a departed owner's slot while a request waits — the orphan recovery path", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, businessOwnerId: "u_left_company" });
    mocks.findFirstGrant.mockResolvedValue({ id: "g_pending" });

    const res = await PATCH(req({ id: "sol_1", businessOwnerId: null }, "PATCH"));

    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.businessOwnerId).toBeNull();
    expect(data.status).toBe("RESTRICTED");
  });

  it("lets a colleague claim over a stale slot while a request waits — they gain a slot, nobody steps down", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, businessOwnerId: "u_left_company" });
    mocks.findFirstGrant.mockResolvedValue({ id: "g_pending" });

    const res = await PATCH(req({ id: "sol_1", businessOwnerId: "u1" }, "PATCH"));

    expect(res.status).toBe(200);
    const data = mocks.updateSolution.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.businessOwnerId).toBe("u1");
  });

  it("lets an owner move between slots, or step down from one of several, while a request waits", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, technicalOwnerId: "u1", supportOwnerId: "u1" });
    mocks.findFirstGrant.mockResolvedValue({ id: "g_pending" });

    const swap = await PATCH(req({ id: "sol_1", technicalOwnerId: null, businessOwnerId: "u1" }, "PATCH"));
    const stepDownFromOne = await PATCH(req({ id: "sol_1", supportOwnerId: null }, "PATCH"));

    expect(swap.status).toBe(200);
    expect(stepDownFromOne.status).toBe(200);
    // The caller still owns the app after either save, so the pending request
    // is never even consulted.
    expect(mocks.findFirstGrant).not.toHaveBeenCalled();
  });

  it("takes the Solution row lock before it reads the app or the caller's decisions, and holds it through the write", async () => {
    // A decision fired together with a reclaim used to pass both: each read
    // what the other had not yet written. The decision routes take this lock
    // too; here it must come before every read the refusals depend on.
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "DRAFT", technicalOwnerId: null });

    const res = await PATCH(req({ id: "sol_1", technicalOwnerId: "u1" }, "PATCH"));

    expect(res.status).toBe(200);
    expect(mocks.lockSolution).toHaveBeenCalledOnce();
    const [sql, ...bound] = mocks.lockSolution.mock.calls[0] as [readonly string[], ...unknown[]];
    expect(sql.join("?")).toMatch(/FROM "Solution"[\s\S]*FOR UPDATE/);
    expect(bound).toEqual(["sol_1", "org_a"]);

    const order = (m: { mock: { invocationCallOrder: number[] } }) => m.mock.invocationCallOrder[0]!;
    expect(order(mocks.lockSolution)).toBeLessThan(order(mocks.findFirstSolution));
    expect(order(mocks.findFirstSolution)).toBeLessThan(order(mocks.findManyGrants));
    expect(order(mocks.findManyGrants)).toBeLessThan(order(mocks.updateSolution));
    expect(order(mocks.updateSolution)).toBeLessThan(order(mocks.commit));
  });

  it("still lets a release through when nothing awaits a decision", async () => {
    mocks.findFirstSolution.mockResolvedValue(OWNED_BY_CALLER);

    const res = await PATCH(req({ id: "sol_1", supportOwnerId: null }, "PATCH"));

    expect(res.status).toBe(200);
  });

  it("still lets an empty slot be claimed while a request waits — it adds an owner", async () => {
    // OWN_APP then refuses the new owner's decision, so nothing opens.
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "DRAFT", technicalOwnerId: null });
    mocks.findFirstGrant.mockResolvedValue({ id: "g_pending" });

    const res = await PATCH(req({ id: "sol_1", technicalOwnerId: "u1" }, "PATCH"));

    expect(res.status).toBe(200);
    expect(mocks.findFirstGrant).not.toHaveBeenCalled();
  });

  it("refuses claiming a slot on an app whose live access the caller decided", async () => {
    mocks.findFirstSolution.mockResolvedValue({
      ...ACTIVE_COMPLETE,
      status: "RESTRICTED",
      technicalOwnerId: null,
      businessOwnerId: null,
      supportOwnerId: null,
    });
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null },
    ]);

    const res = await PATCH(
      req(
        { id: "sol_1", technicalOwnerId: "u1", businessOwnerId: "u1", supportOwnerId: "u1", status: "ACTIVE" },
        "PATCH",
      ),
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("You decided access for this app");
    expect(mocks.updateSolution).not.toHaveBeenCalled();
    expect(mocks.findManyGrants).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_a", solutionId: "sol_1", decidedById: "u1" },
      }),
    );
  });

  it("lets the claim through once that access has lapsed, been revoked, or was a rejection", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...ACTIVE_COMPLETE, status: "DRAFT", technicalOwnerId: null });
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: new Date(Date.now() - 86_400_000), revokedAt: null },
      { decision: "APPROVED", expiresAt: new Date(Date.now() + 86_400_000), revokedAt: new Date() },
      { decision: "REJECTED", expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null },
    ]);

    const res = await PATCH(req({ id: "sol_1", technicalOwnerId: "u1" }, "PATCH"));

    expect(res.status).toBe(200);
  });
});
