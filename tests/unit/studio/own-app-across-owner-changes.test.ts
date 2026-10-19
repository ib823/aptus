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
import { POST as raiseRequest } from "@/app/api/studio/access-grants/route";
import { PATCH as patchSolution } from "@/app/api/studio/solutions/route";

const RUN = `own-app-${randomUUID()}`;
const ORG = `${RUN}-org`;
const A = { id: `${RUN}-a`, email: "a@abeam.com", role: "consultant", organizationId: ORG };
const B = { id: `${RUN}-b`, email: "b@abeam.com", role: "consultant", organizationId: ORG };

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

const decideAs = (grantId: string) =>
  decide(
    json(
      { decision: "APPROVED", writeChecklistAcknowledged: true },
      "POST",
      `http://localhost/api/coreedge/requests/${grantId}/decide`,
    ),
    { params: Promise.resolve({ id: grantId }) },
  );

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

async function activeAppOwnedByA(): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Order portal",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Raises sales orders from the client's portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      technicalOwnerId: A.id,
      businessOwnerId: A.id,
      supportOwnerId: A.id,
    },
    select: { id: true },
  });
  return s.id;
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
    const grant = await prisma.apiAccessGrant.create({
      data: {
        organizationId: ORG,
        solutionId,
        externalId: "API_SALES_ORDER_SRV",
        operation: "CREATE",
        environment: "PROD",
        justification: "Raise sales orders from the portal.",
        requestedById: B.id,
        expiresAt: inDays(30),
      },
      select: { id: true },
    });

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
    const raised = await raiseRequest(
      json(
        {
          solutionId,
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
});
