// @vitest-environment node
/**
 * Two processes, one app: the owner check and the owner reclaim are serialised
 * (P0.1, the batch-1 residual races). Against real PostgreSQL.
 *
 * WHY TWO PRISMA CLIENTS. Production runs many server instances, each with its
 * own connection pool, and the race is between two of them. Here every route
 * call is routed to one of two independent PrismaClients — "process one" and
 * "process two" — so the two transactions share nothing but the database: no
 * pool, no engine, no in-process ordering. Only a row lock in PostgreSQL can
 * make them see each other.
 *
 * THE RACES:
 *
 *   1. Decision vs reclaim. A released every slot of the app (it sits
 *      RESTRICTED and unowned) and B raised a PROD write request. A fires the
 *      approval in one process and the reclaim of all three slots in the
 *      other. Each route used to read what the other had not yet written, and
 *      nine runs in ten ended with A the decider AND an owner: an
 *      owner-approved grant. Both doors a builder can decide in are raced.
 *
 *   2. Owner sweep vs reclaim. Dave left; the app's business slot is his. B
 *      claims it while the nightly owner sweep runs in the other process. A
 *      sweep that read the slot before the claim and wrote after it would
 *      leave a fully, live-owned app RESTRICTED. It must end ACTIVE.
 *
 * Opt-in on TEST_DATABASE_URL. Rows are namespaced per run and removed after.
 */

import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

const processes = vi.hoisted(() => ({
  as: null as null | (<T>(which: "one" | "two", run: () => Promise<T>) => Promise<T>),
  disconnect: null as null | (() => Promise<void>),
}));

vi.mock("@/lib/db/prisma", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused";
  const make = () => new PrismaClient({ datasourceUrl: url }).$extends(tenantScopeGuard());
  const clients = { one: make(), two: make() };
  const current = new AsyncLocalStorage<"one" | "two">();
  processes.as = (which, run) => current.run(which, run);
  processes.disconnect = async () => {
    await Promise.all([clients.one.$disconnect(), clients.two.$disconnect()]);
  };
  // Whatever process the calling context belongs to; setup and assertions use "one".
  const prisma = new Proxy(
    {},
    {
      get(_target, prop) {
        const client = clients[current.getStore() ?? "one"] as unknown as Record<string | symbol, unknown>;
        const value = client[prop];
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
      },
    },
  );
  return { prisma };
});

import { prisma } from "@/lib/db/prisma";
import { POST as decide } from "@/app/api/coreedge/requests/[id]/decide/route";
import { PATCH as decideInStudio } from "@/app/api/studio/access-grants/route";
import { PATCH as patchSolution } from "@/app/api/studio/solutions/route";
import { sweepOwnerLiveness } from "@/lib/studio/owner-liveness";

const RUN = `two-proc-${randomUUID()}`;
const ORG = `${RUN}-org`;
const user = (name: string) => ({
  id: `${RUN}-${name}`,
  email: `${name}@abeam.com`,
  role: "consultant",
  organizationId: ORG,
  authMethod: "session",
});
const A = user("a");
const B = user("b");
const C = user("c");
const D = user("dave");

const as = <T,>(which: "one" | "two", run: () => Promise<T>) => processes.as!(which, run);

function json(body: unknown, method: string, url: string) {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const patch = (body: Record<string, unknown>) =>
  patchSolution(json(body, "PATCH", "http://localhost/api/studio/solutions"));

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

async function app(
  owners: [string | null, string | null, string | null],
  status: "ACTIVE" | "RESTRICTED",
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

async function boundWriteRequest(solutionId: string): Promise<string> {
  const iface = await prisma.interface.create({
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
  const g = await prisma.apiAccessGrant.create({
    data: {
      organizationId: ORG,
      solutionId,
      interfaceId: iface.id,
      sapProduct: "s4hana",
      externalId: "API_SALES_ORDER_SRV",
      operation: "CREATE",
      environment: "PROD",
      justification: "Raise sales orders from the portal.",
      requestedById: B.id,
      expiresAt: inDays(30),
    },
    select: { id: true },
  });
  return g.id;
}

const RUNS = 12;

describe.skipIf(!process.env.TEST_DATABASE_URL)("two processes racing on one app, against real PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Two-process race test", type: "client" } });
    for (const u of [A, B, C, D]) {
      await prisma.user.create({
        data: { id: u.id, email: `${u.id}@abeam.com`, name: u.email, role: "consultant", organizationId: ORG },
      });
    }
  });

  afterAll(async () => {
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: [A, B, C, D].map((u) => u.id) } } });
    await processes.disconnect!();
  });

  beforeEach(() => {
    session.user = null;
    vi.stubEnv("COREEDGE_STEP_UP", "off");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const doors = [
    [
      "the CoreEdge console",
      (grantId: string) =>
        decide(
          json(
            { decision: "APPROVED", writeChecklistAcknowledged: true },
            "POST",
            `http://localhost/api/coreedge/requests/${grantId}/decide`,
          ),
          { params: Promise.resolve({ id: grantId }) },
        ),
    ],
    [
      "Developer Studio",
      (grantId: string) =>
        decideInStudio(
          json(
            { grantId, decision: "APPROVED", writeChecklistAcknowledged: true },
            "PATCH",
            "http://localhost/api/studio/access-grants",
          ),
        ),
    ],
  ] as const;

  for (const [door, decideThrough] of doors) {
    it(`never ends with an owner-approved grant when A approves through ${door} in one process and reclaims in the other`, async () => {
      for (let run = 0; run < RUNS; run++) {
        const solutionId = await app([null, null, null], "RESTRICTED");
        const grantId = await boundWriteRequest(solutionId);

        session.user = A;
        const [decided, reclaimed] = await Promise.all([
          as("one", () => decideThrough(grantId)),
          // Held back 0–3 ms, varying by run, so both orders of arrival occur.
          as("two", async () => {
            await new Promise((resolve) => setTimeout(resolve, run % 4));
            return patch({
              id: solutionId,
              technicalOwnerId: A.id,
              businessOwnerId: A.id,
              supportOwnerId: A.id,
              status: "ACTIVE",
            });
          }),
        ]);

        const [solution, grant] = await Promise.all([
          prisma.solution.findFirst({
            where: { id: solutionId, organizationId: ORG },
            select: { technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
          }),
          prisma.apiAccessGrant.findFirst({
            where: { id: grantId, organizationId: ORG },
            select: { decision: true, decidedById: true },
          }),
        ]);
        const approvedByA = grant?.decision === "APPROVED" && grant.decidedById === A.id;
        const ownedByA = [solution?.technicalOwnerId, solution?.businessOwnerId, solution?.supportOwnerId].includes(A.id);
        expect(approvedByA && ownedByA, `run ${run}: ${JSON.stringify({ solution, grant })}`).toBe(false);
        // Exactly one of the pair lands; the other reads what it wrote and is refused.
        expect([decided.status, reclaimed.status].sort(), `run ${run}`).toEqual([200, 403]);
      }
    });
  }

  it("never leaves a fully live-owned app RESTRICTED when the owner sweep races a reclaim", async () => {
    await prisma.user.update({ where: { id: D.id }, data: { isActive: false } });
    try {
      for (let run = 0; run < RUNS; run++) {
        const solutionId = await app([A.id, D.id, C.id], "ACTIVE");
        session.user = B;
        const [claimed] = await Promise.all([
          as("one", async () => {
            await new Promise((resolve) => setTimeout(resolve, run % 4));
            return patch({ id: solutionId, businessOwnerId: B.id, status: "ACTIVE" });
          }),
          as("two", () => sweepOwnerLiveness({ organizationIds: [ORG] })),
        ]);
        expect(claimed.status, `run ${run}`).toBe(200);
        const end = await prisma.solution.findFirst({
          where: { id: solutionId, organizationId: ORG },
          select: { status: true, businessOwnerId: true },
        });
        expect(end, `run ${run}`).toEqual({ status: "ACTIVE", businessOwnerId: B.id });
      }
    } finally {
      await prisma.user.update({ where: { id: D.id }, data: { isActive: true } });
    }
  });
});
