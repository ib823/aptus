// @vitest-environment node
/**
 * Two processes, one interface: no pair of concurrent PATCHes reaches ACTIVE
 * without the activation gates (P0.1, audit A46, review round 1). Against real
 * PostgreSQL.
 *
 * THE RACE. A builder has a DRAFT READ interface with an entity set and sends
 * PATCH {status: ACTIVE} and PATCH {operation: CREATE} at the same moment (two
 * tabs, two server instances). Both handlers read the row as DRAFT/READ. The
 * first is a READ promotion and passes the entity-set gate; the second is not
 * gated at all, because the interface is neither ACTIVE nor becoming ACTIVE.
 * Each then wrote unconditionally, and the two writes merged: ACTIVE from the
 * one, CREATE (mode WRITE) from the other. An ACTIVE write interface, with no
 * write grant, no write key, and a PROMOTE row that describes a READ.
 *
 * THE RULE. The write is conditional on the state the gates judged; a PATCH
 * that finds the interface changed under it writes nothing and answers 409.
 *
 * WHY TWO PRISMA CLIENTS: see owner-lock-two-process.test.ts. Every route call
 * runs on one of two independent clients, so only PostgreSQL orders them.
 *
 * Opt-in on TEST_DATABASE_URL. Rows are namespaced per run and removed after.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { PATCH as patchInterface } from "@/app/api/studio/interfaces/route";

const RUN = `iface-race-${randomUUID()}`;
const ORG = `${RUN}-org`;
const BUILDER = {
  id: `${RUN}-b`,
  email: "b@abeam.com",
  role: "consultant",
  organizationId: ORG,
  authMethod: "session",
};

const as = <T,>(which: "one" | "two", run: () => Promise<T>) => processes.as!(which, run);

const patch = (body: Record<string, unknown>) =>
  patchInterface(
    new Request("http://localhost/api/studio/interfaces", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }) as never,
  );

async function draftRead(): Promise<string> {
  const solution = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Partner portal",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Shows business partners to the client's portal.",
      dataClass: "INTERNAL",
    },
    select: { id: true },
  });
  const iface = await prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId: solution.id,
      name: "Business partners",
      sapProduct: "s4hana",
      externalId: "API_BUSINESS_PARTNER",
      operation: "READ",
      entitySet: "A_BusinessPartner",
      mode: "READ",
    },
    select: { id: true },
  });
  return iface.id;
}

const RUNS = 16;

describe.skipIf(!process.env.TEST_DATABASE_URL)("two processes editing one interface, against real PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Interface race test", type: "client" } });
  });

  afterAll(async () => {
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await processes.disconnect!();
  });

  beforeEach(() => {
    session.user = BUILDER;
  });

  const edits = [
    ["switched to CREATE", { operation: "CREATE" }],
    ["switched to UPDATE", { operation: "UPDATE" }],
    ["stripped of its entity set", { entitySet: null }],
  ] as const;

  for (const [what, edit] of edits) {
    it(`never ends ACTIVE and ungated when activated and ${what} at the same moment`, async () => {
      for (let run = 0; run < RUNS; run++) {
        const id = await draftRead();
        const [activated, edited] = await Promise.all([
          as("one", () => patch({ id, status: "ACTIVE" })),
          // Held back 0–3 ms, varying by run, so both orders of arrival occur.
          as("two", async () => {
            await new Promise((resolve) => setTimeout(resolve, run % 4));
            return patch({ id, ...edit });
          }),
        ]);

        const end = await prisma.interface.findFirst({
          where: { id, organizationId: ORG },
          select: { status: true, operation: true, mode: true, entitySet: true },
        });
        const ungated = end?.status === "ACTIVE" && (end.operation !== "READ" || end.entitySet === null);
        expect(ungated, `run ${run}: ${JSON.stringify({ end, activated: activated.status, edited: edited.status })}`).toBe(
          false,
        );
        // Whatever lands second either passes its own gates on what the first
        // wrote, or is refused; it never writes over a state it did not judge.
        for (const res of [activated, edited]) expect([200, 400, 409], `run ${run}`).toContain(res.status);
      }
    });
  }
});
