// @vitest-environment node
/**
 * A warn-mode decision on a one-connection pool (roadmap P0.12).
 *
 * THE DEADLOCK THIS PINS. The three decision routes run their rules inside a
 * transaction that holds a pooled connection and the Solution row lock
 * (lib/studio/owner-lock.ts). Under COREEDGE_STEP_UP=warn — the production
 * default — the step-up gate writes a STEP_UP_MISSING audit row. Written from
 * inside that transaction on the application's client, the row needs a SECOND
 * connection; with the pool exhausted by decisions queued on the same lock,
 * it waits for itself until the transaction times out, and every decision
 * fails. One connection is the smallest pool that shows it, deterministically:
 * the pool is the transaction's.
 *
 * The other route suites cannot see this: tests/setup.ts turns the step-up off,
 * and the step-up suite's client has the default pool.
 *
 * Opt-in on TEST_DATABASE_URL, like the other real-PostgreSQL tests.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused");
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "10");
  const base = new PrismaClient({ datasourceUrl: url.toString() });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { POST as coreedgeDecide } from "@/app/api/coreedge/requests/[id]/decide/route";
import { PATCH as studioDecide } from "@/app/api/studio/access-grants/route";
import { PATCH as controlTowerDecide } from "@/app/api/control-tower/grants/route";

const RUN = `step-up-pool-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const BUILDER = { id: `${RUN}-builder`, email: `${RUN}-builder@abeam.test`, role: "consultant" };
const ADMIN = { id: `${RUN}-admin`, email: `${RUN}-admin@abeam.test`, role: "platform_admin" };
type Person = typeof BUILDER;

const tokens = new Map<string, string>();

function as(person: Person): void {
  jar.clear();
  jar.set(SESSION_COOKIE_NAME, tokens.get(person.id) ?? "");
}

function body(value: unknown, method: string) {
  return new Request("http://localhost/x", {
    method,
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

async function pendingGrant(): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Order portal",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Raises sales orders from the client's portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      technicalOwnerId: `${RUN}-t`,
      businessOwnerId: `${RUN}-b`,
      supportOwnerId: `${RUN}-s`,
    },
    select: { id: true },
  });
  // Bound to an interface, as every grant is since P0.1 (lib/studio/grant-binding.ts).
  const iface = await prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId: s.id,
      name: "Sales orders",
      sapProduct: "s4hana",
      externalId: "API_SALES_ORDER_SRV",
      operation: "READ",
      entitySet: "A_SalesOrder",
      mode: "READ",
    },
    select: { id: true },
  });
  const g = await prisma.apiAccessGrant.create({
    data: {
      organizationId: ORG,
      solutionId: s.id,
      interfaceId: iface.id,
      sapProduct: "s4hana",
      externalId: "API_SALES_ORDER_SRV",
      operation: "READ",
      environment: "TEST",
      justification: "Read sales orders for the portal.",
      requestedById: `${RUN}-requester`,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      decision: "REQUESTED",
    },
    select: { id: true },
  });
  return g.id;
}

const DOORS: readonly {
  readonly name: string;
  readonly person: Person;
  readonly decide: (grantId: string) => Promise<Response>;
}[] = [
  {
    name: "POST /api/coreedge/requests/[id]/decide",
    person: BUILDER,
    decide: (grantId) =>
      coreedgeDecide(body({ decision: "APPROVED" }, "POST"), { params: Promise.resolve({ id: grantId }) }),
  },
  {
    name: "PATCH /api/studio/access-grants",
    person: BUILDER,
    decide: (grantId) => studioDecide(body({ grantId, decision: "APPROVED" }, "PATCH")),
  },
  {
    name: "PATCH /api/control-tower/grants",
    person: ADMIN,
    decide: (grantId) => controlTowerDecide(body({ grantId, decision: "APPROVED" }, "PATCH")),
  },
];

describe.skipIf(!process.env.TEST_DATABASE_URL)("a warn-mode decision on a one-connection pool", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Step-up pool test", type: "client" } });
    for (const person of [BUILDER, ADMIN]) {
      await prisma.user.create({ data: { ...person, name: person.role, organizationId: ORG } });
      const token = randomBytes(32).toString("hex");
      await prisma.session.create({
        data: { userId: person.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 86_400_000) },
      });
      tokens.set(person.id, token);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    const userIds = [BUILDER.id, ADMIN.id];
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.$disconnect();
  });

  it.each(DOORS)(
    "$name: decides, and records the missing step-up after the lock is released",
    async (door) => {
      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      const grantId = await pendingGrant();
      as(door.person);

      const res = await door.decide(grantId);

      expect(res.status).toBe(200);
      const grant = await prisma.apiAccessGrant.findFirst({ where: { id: grantId, organizationId: ORG } });
      expect(grant?.decision).toBe("APPROVED");
      const missing = await prisma.configAudit.findMany({
        where: { organizationId: ORG, action: "STEP_UP_MISSING", actorId: door.person.id },
      });
      // Filed under the grant decided, beside its DECISION entry.
      expect(missing).toContainEqual(
        expect.objectContaining({ entityType: "ApiAccessGrant", entityId: grantId }),
      );
    },
    30_000,
  );
});
