// @vitest-environment node
/**
 * An app's owner cannot approve their own app's access — across owner-slot
 * changes, not only at the instant of the decision. Checked against real
 * PostgreSQL through the real Studio solutions PATCH and CoreEdge decide routes.
 *
 * THE DEFECT. OWN_APP compared the decider with the owners the solution row
 * held when the decision was made, and both halves of a slot change are
 * self-service. A, owning all three slots of an ACTIVE app, released them (the
 * app auto-dropped to RESTRICTED), approved colleague B's PROD CREATE request
 * as a "non-owner", then claimed all three slots back and re-promoted the app:
 * every call allowed, and A ended as both the decider and the owner of the
 * write grant. The same three calls with the release made before B asked
 * reached the same end.
 *
 * A sequence across two routes is the defect, so this drives the routes in
 * order against rows that persist between them; the per-refusal assertions
 * live in solutions-route.test.ts.
 *
 * THE RACE. With both refusals in place, A could still fire the decision and
 * the reclaim at the same moment: each route read what the other had not yet
 * written (they write different rows), and nine runs in ten ended with A the
 * decider AND the owner. Both now lock the Solution row first
 * (lib/studio/owner-lock.ts); the race test below fires the pair together many
 * times, through each door a builder can decide in, and needs a real database
 * because a lock is the thing under test.
 *
 * Also pinned here: a pending request freezes only an owner stepping down from
 * their last slot, not the recovery of a departed owner's slot; and release →
 * reject → reclaim is allowed, because a rejection authorises nothing.
 *
 * Opt-in on TEST_DATABASE_URL, like the other real-PostgreSQL tests; never an
 * application's DATABASE_URL. Rows are namespaced per run and removed after.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  // The guard the application's client carries, so an unscoped query fails here too.
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { POST as decide } from "@/app/api/coreedge/requests/[id]/decide/route";
import { PATCH as decideInStudio, POST as raiseRequest } from "@/app/api/studio/access-grants/route";
import { PATCH as patchSolution } from "@/app/api/studio/solutions/route";

const RUN = `own-app-${randomUUID()}`;
const ORG = `${RUN}-org`;
const A = { id: `${RUN}-a`, email: "a@abeam.com", role: "consultant", organizationId: ORG, authMethod: "session" };
const B = { id: `${RUN}-b`, email: "b@abeam.com", role: "consultant", organizationId: ORG, authMethod: "session" };
const C = { id: `${RUN}-c`, email: "c@abeam.com", role: "consultant", organizationId: ORG, authMethod: "session" };

const as = (user: typeof A) => {
  session.user = user;
};

function json(body: unknown, method: string, url: string) {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const patch = (body: Record<string, unknown>) =>
  patchSolution(json(body, "PATCH", "http://localhost/api/studio/solutions"));

const decideAs = (grantId: string, decision = "APPROVED") =>
  decide(
    json(
      { decision, writeChecklistAcknowledged: true },
      "POST",
      `http://localhost/api/coreedge/requests/${grantId}/decide`,
    ),
    { params: Promise.resolve({ id: grantId }) },
  );

const decideInStudioAs = (grantId: string) =>
  decideInStudio(
    json(
      { grantId, decision: "APPROVED", writeChecklistAcknowledged: true },
      "PATCH",
      "http://localhost/api/studio/access-grants",
    ),
  );

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

async function appOwnedBy(
  owners: [string | null, string | null, string | null],
  status: "ACTIVE" | "RESTRICTED" = "ACTIVE",
): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Order portal",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Raises sales orders from the client's portal.",
      dataClass: "INTERNAL",
      status,
      technicalOwnerId: owners[0],
      businessOwnerId: owners[1],
      supportOwnerId: owners[2],
    },
    select: { id: true },
  });
  return s.id;
}

const activeAppOwnedByA = () => appOwnedBy([A.id, A.id, A.id]);

/** The app's sales-order CREATE interface, which every request here is raised against. */
async function salesOrderInterface(solutionId: string): Promise<string> {
  const existing = await prisma.interface.findFirst({
    where: { organizationId: ORG, solutionId, externalId: "API_SALES_ORDER_SRV" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const i = await prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId,
      name: "Sales orders",
      sapProduct: "s4hana",
      externalId: "API_SALES_ORDER_SRV",
      operation: "CREATE",
      entitySet: "A_SalesOrder",
      mode: "WRITE",
    },
    select: { id: true },
  });
  return i.id;
}

/** A PROD write request, raised straight into the ledger by `requester`, bound to its interface (P0.1). */
async function prodWriteRequest(solutionId: string, requester: typeof A): Promise<string> {
  const interfaceId = await salesOrderInterface(solutionId);
  const g = await prisma.apiAccessGrant.create({
    data: {
      organizationId: ORG,
      solutionId,
      interfaceId,
      sapProduct: "s4hana",
      externalId: "API_SALES_ORDER_SRV",
      operation: "CREATE",
      environment: "PROD",
      justification: "Raise sales orders from the portal.",
      requestedById: requester.id,
      expiresAt: inDays(30),
    },
    select: { id: true },
  });
  return g.id;
}

async function state(solutionId: string, grantId: string) {
  const [solution, grant] = await Promise.all([
    prisma.solution.findFirst({
      where: { id: solutionId, organizationId: ORG },
      select: { status: true, technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
    }),
    prisma.apiAccessGrant.findFirst({
      where: { id: grantId, organizationId: ORG },
      select: { decision: true, decidedById: true },
    }),
  ]);
  return { solution, grant };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("own-app across owner-slot changes, against real PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Own-app test", type: "client" } });
  });

  afterAll(async () => {
    // ConfigAudit has no relation to cascade through, so it goes first, by tenant.
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    session.user = null;
  });

  it("refuses the release while B's request waits, so A is still an owner when A decides", async () => {
    const solutionId = await activeAppOwnedByA();
    const grant = { id: await prodWriteRequest(solutionId, B) };

    as(A);
    // The original trigger: blocked.
    expect((await decideAs(grant.id)).status).toBe(403);

    // Release every slot. This used to answer 200 and drop the app to RESTRICTED.
    const release = await patch({ id: solutionId, technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null });
    expect(release.status).toBe(409);

    // …so A is still an owner, and still refused.
    expect((await decideAs(grant.id)).status).toBe(403);

    expect(await state(solutionId, grant.id)).toEqual({
      solution: { status: "ACTIVE", technicalOwnerId: A.id, businessOwnerId: A.id, supportOwnerId: A.id },
      grant: { decision: "REQUESTED", decidedById: null },
    });
  });

  it("refuses the reclaim after A, released before B asked, approves B's request", async () => {
    const solutionId = await activeAppOwnedByA();

    // A steps down while nothing is pending — allowed, and the app drops.
    as(A);
    const release = await patch({ id: solutionId, technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null });
    expect(release.status).toBe(200);

    // B asks for PROD write access through Studio.
    as(B);
    const interfaceId = await salesOrderInterface(solutionId);
    const raised = await raiseRequest(
      json(
        {
          solutionId,
          interfaceId,
          externalId: "API_SALES_ORDER_SRV",
          operation: "CREATE",
          environment: "PROD",
          justification: "Raise sales orders from the portal.",
          expiresAt: inDays(30).toISOString(),
        },
        "POST",
        "http://localhost/api/studio/access-grants",
      ),
    );
    expect(raised.status).toBe(201);
    const grantId = ((await raised.json()) as { data: { id: string } }).data.id;

    // A owns nothing now and did not raise it, so the decision is A's to make.
    as(A);
    expect((await decideAs(grantId)).status).toBe(200);

    // Reclaiming every slot and re-promoting used to answer 200, leaving A
    // the decider AND the owner of the PROD write grant.
    const reclaim = await patch({
      id: solutionId,
      technicalOwnerId: A.id,
      businessOwnerId: A.id,
      supportOwnerId: A.id,
      status: "ACTIVE",
    });
    expect(reclaim.status).toBe(403);

    expect(await state(solutionId, grantId)).toEqual({
      solution: { status: "RESTRICTED", technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null },
      grant: { decision: "APPROVED", decidedById: A.id },
    });

    // A colleague who decided nothing may still take the slots.
    as(B);
    expect((await patch({ id: solutionId, technicalOwnerId: B.id })).status).toBe(200);
  });

  /*
   * THE SAME THREE CALLS, WITH THE LAST TWO FIRED TOGETHER. A has already
   * released every slot while nothing was pending (the app sits RESTRICTED and
   * unowned), and B has raised an ordinary PROD write request. A alone then
   * sends the approval and the reclaim at once. Without the lock both answered
   * 200 in nine runs out of ten. With it, exactly one lands, whichever order
   * they arrive in — and the end state is never A deciding an app A owns.
   */
  const RACE_RUNS = 15;
  const doors = [
    ["the CoreEdge console", decideAs],
    ["Developer Studio", decideInStudioAs],
  ] as const;

  for (const [door, decideThrough] of doors) {
    it(`never ends with A the decider and the owner when A approves through ${door} and reclaims at once`, async () => {
      for (let run = 0; run < RACE_RUNS; run++) {
        const solutionId = await appOwnedBy([null, null, null], "RESTRICTED");
        const grantId = await prodWriteRequest(solutionId, B);

        as(A);
        const [decided, reclaimed] = await Promise.all([
          decideThrough(grantId),
          // Held back 0–3 ms, varying by run: with no head start the reclaim
          // nearly always reaches the database first, and both orders of
          // arrival are what the lock has to get right.
          new Promise((resolve) => setTimeout(resolve, run % 4)).then(() =>
            patch({
              id: solutionId,
              technicalOwnerId: A.id,
              businessOwnerId: A.id,
              supportOwnerId: A.id,
              status: "ACTIVE",
            }),
          ),
        ]);

        const end = await state(solutionId, grantId);
        const decidedByA = end.grant?.decision === "APPROVED" && end.grant.decidedById === A.id;
        const ownedByA = [end.solution?.technicalOwnerId, end.solution?.businessOwnerId, end.solution?.supportOwnerId]
          .includes(A.id);
        expect(decidedByA && ownedByA, `run ${run}: ${JSON.stringify(end)}`).toBe(false);

        // Exactly one of the pair lands; the other reads what it wrote.
        expect([decided.status, reclaimed.status].sort(), `run ${run}`).toEqual([200, 403]);
        expect(end).toEqual(
          decided.status === 200
            ? {
                solution: { status: "RESTRICTED", technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null },
                grant: { decision: "APPROVED", decidedById: A.id },
              }
            : {
                solution: { status: "ACTIVE", technicalOwnerId: A.id, businessOwnerId: A.id, supportOwnerId: A.id },
                grant: { decision: "REQUESTED", decidedById: null },
              },
        );
      }
    });
  }

  it("lets a departed owner's slot be recovered while a colleague's request waits; only A's last slot is held", async () => {
    // Any builder may raise a request on any app, and a REQUESTED grant never
    // expires and cannot be withdrawn — so freezing every slot change behind it
    // left 'u-left-company' accountable for the app until a non-owner decided.
    const solutionId = await appOwnedBy([A.id, "u-left-company", A.id]);
    const grantId = await prodWriteRequest(solutionId, C);

    as(A);
    expect((await patch({ id: solutionId, businessOwnerId: null })).status).toBe(200);
    as(B);
    expect((await patch({ id: solutionId, businessOwnerId: B.id })).status).toBe(200);
    as(A);
    // Stepping down from one of two slots: A still owns the app.
    expect((await patch({ id: solutionId, supportOwnerId: null })).status).toBe(200);
    // Stepping down from the last: refused, or A could decide C's request.
    const lastSlot = await patch({ id: solutionId, technicalOwnerId: null });
    expect(lastSlot.status).toBe(409);
    expect(((await lastSlot.json()) as { error: { message: string } }).error.message).toContain(
      "step down from your last owner slot",
    );
    expect((await decideAs(grantId)).status).toBe(403);

    expect(await state(solutionId, grantId)).toEqual({
      solution: { status: "RESTRICTED", technicalOwnerId: A.id, businessOwnerId: B.id, supportOwnerId: null },
      grant: { decision: "REQUESTED", decidedById: null },
    });
  });

  it("allows release → reject → reclaim: a rejection authorises nothing, so owning the app after it is no escalation", async () => {
    // Exempt by decision (OWNER_CLAIM_BY_DECIDER). This pins the exemption so
    // it cannot be narrowed — or widened to approvals — without this failing.
    const solutionId = await activeAppOwnedByA();

    as(A);
    expect(
      (await patch({ id: solutionId, technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null })).status,
    ).toBe(200);
    const grantId = await prodWriteRequest(solutionId, B);
    expect((await decideAs(grantId, "REJECTED")).status).toBe(200);
    const reclaim = await patch({
      id: solutionId,
      technicalOwnerId: A.id,
      businessOwnerId: A.id,
      supportOwnerId: A.id,
      status: "ACTIVE",
    });
    expect(reclaim.status).toBe(200);

    expect(await state(solutionId, grantId)).toEqual({
      solution: { status: "ACTIVE", technicalOwnerId: A.id, businessOwnerId: A.id, supportOwnerId: A.id },
      grant: { decision: "REJECTED", decidedById: A.id },
    });

    // What it does not open: B raises the request again, and A — an owner
    // again — is refused it like any other owner.
    const again = await prodWriteRequest(solutionId, B);
    expect((await decideAs(again)).status).toBe(403);
  });
});
