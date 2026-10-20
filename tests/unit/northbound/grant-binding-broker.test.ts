// @vitest-environment node
/**
 * One approval authorises ONE interface, on ONE SAP product (P0.1, audit A47).
 * Against real PostgreSQL, through the real Studio and CoreEdge routes and the
 * broker's own access check.
 *
 * THE DEFECT. A grant stored (solution, externalId, operation, environment)
 * and the broker matched on that tuple. Carol approved Bob's PROD read of
 * API_BUSINESS_PARTNER on the app's S/4HANA Cloud interface; Bob then added an
 * interface for the same service on the client's on-premise system, and the
 * PROD token read it at once — on an approval nobody gave for that system.
 *
 * Also pinned: the P0.1 backfill binds a legacy grant to the one interface it
 * matched and flags the rest; an unbound grant keeps working under
 * COREEDGE_GRANT_BINDING=legacy (and leaves the durable signal), and is
 * refused under strict; a decision binds the request it settles, and an
 * unbound request that matches several interfaces can be rejected but not
 * approved.
 *
 * Opt-in on TEST_DATABASE_URL, like the other real-PostgreSQL tests. Rows are
 * namespaced per run and removed after.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { POST as decide } from "@/app/api/coreedge/requests/[id]/decide/route";
import { POST as raiseRequest } from "@/app/api/studio/access-grants/route";
import { POST as createInterface } from "@/app/api/studio/interfaces/route";
import { listGrantsNeedingReapproval, listOpenRequests } from "@/lib/coreedge/queries";
import { resolveReadableInterface } from "@/lib/northbound/access";
import { GRANT_BINDING_BACKFILL_SQL } from "@/lib/studio/grant-binding";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const RUN = `grant-binding-${randomUUID()}`;
const ORG = `${RUN}-org`;
const SCOPE = tenantScopeOf(ORG);
const BOB = { id: `${RUN}-bob`, email: "bob@abeam.com", role: "consultant", organizationId: ORG, authMethod: "session" };
const CAROL = { id: `${RUN}-carol`, email: "carol@abeam.com", role: "consultant", organizationId: ORG, authMethod: "session" };

const as = (user: typeof BOB) => {
  session.user = user;
};

function json(body: unknown, method: string, url: string) {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

async function app(): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Partner portal",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Shows business partners to the client's portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      // Neither Bob nor Carol owns it, so either may decide.
      technicalOwnerId: `${RUN}-dana`,
      businessOwnerId: `${RUN}-dana`,
      supportOwnerId: `${RUN}-dana`,
    },
    select: { id: true },
  });
  return s.id;
}

async function addInterface(solutionId: string, sapProduct: string): Promise<string> {
  as(BOB);
  const res = await createInterface(
    json(
      {
        solutionId,
        sapProduct,
        externalId: "API_BUSINESS_PARTNER",
        name: `Business partners (${sapProduct})`,
        operation: "READ",
        entitySet: "A_BusinessPartner",
      },
      "POST",
      "http://localhost/api/studio/interfaces",
    ),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

/** A legacy grant, written the way every grant was before P0.1: no interface. */
async function legacyGrant(solutionId: string, decision = "APPROVED"): Promise<string> {
  const g = await prisma.apiAccessGrant.create({
    data: {
      organizationId: ORG,
      solutionId,
      externalId: "API_BUSINESS_PARTNER",
      operation: "READ",
      environment: "PROD",
      justification: "Show partners in the portal.",
      decision: decision as never,
      requestedById: BOB.id,
      decidedById: CAROL.id,
      decidedAt: new Date(),
      expiresAt: inDays(30),
    },
    select: { id: true },
  });
  return g.id;
}

const read = (solutionId: string, interfaceId: string) =>
  resolveReadableInterface(SCOPE, solutionId, interfaceId, "PROD");

describe.skipIf(!process.env.TEST_DATABASE_URL)("grant binding, against real PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Grant binding test", type: "client" } });
  });

  afterAll(async () => {
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    session.user = null;
    vi.stubEnv("COREEDGE_STEP_UP", "off");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const mode of ["legacy", "strict"]) {
    it(`a grant approved for interface X never authorises Y on another product (${mode})`, async () => {
      vi.stubEnv("COREEDGE_GRANT_BINDING", mode);
      const solutionId = await app();
      const cloud = await addInterface(solutionId, "s4hana");

      // Bob asks against the S/4HANA Cloud interface; Carol approves.
      as(BOB);
      const raised = await raiseRequest(
        json(
          {
            solutionId,
            interfaceId: cloud,
            externalId: "API_BUSINESS_PARTNER",
            operation: "READ",
            environment: "PROD",
            justification: "Show partners in the portal.",
            expiresAt: inDays(30).toISOString(),
          },
          "POST",
          "http://localhost/api/studio/access-grants",
        ),
      );
      expect(raised.status).toBe(201);
      const grantId = ((await raised.json()) as { data: { id: string } }).data.id;
      as(CAROL);
      const decided = await decide(
        json({ decision: "APPROVED" }, "POST", `http://localhost/api/coreedge/requests/${grantId}/decide`),
        { params: Promise.resolve({ id: grantId }) },
      );
      expect(decided.status).toBe(200);

      expect(await prisma.apiAccessGrant.findFirst({
        where: { id: grantId, organizationId: ORG },
        select: { interfaceId: true, sapProduct: true },
      })).toEqual({ interfaceId: cloud, sapProduct: "s4hana" });
      expect((await read(solutionId, cloud)).ok).toBe(true);

      // The trigger: the same service, added on the client's on-premise system.
      const onPrem = await addInterface(solutionId, "s4hana-onprem");
      const refused = await read(solutionId, onPrem);
      expect(refused).toMatchObject({ ok: false, reason: "NO_APPROVED_GRANT" });
    });
  }

  it("binds a request raised the old way (externalId only) to the one interface it names", async () => {
    const solutionId = await app();
    const cloud = await addInterface(solutionId, "s4hana");
    as(BOB);
    const raised = await raiseRequest(
      json(
        {
          solutionId,
          externalId: "API_BUSINESS_PARTNER",
          operation: "READ",
          environment: "PROD",
          justification: "Show partners in the portal.",
          expiresAt: inDays(30).toISOString(),
        },
        "POST",
        "http://localhost/api/studio/access-grants",
      ),
    );
    expect(raised.status).toBe(201);
    const { id } = ((await raised.json()) as { data: { id: string } }).data;
    expect(
      await prisma.apiAccessGrant.findFirst({ where: { id, organizationId: ORG }, select: { interfaceId: true } }),
    ).toEqual({ interfaceId: cloud });
  });

  it("refuses a request that names no interface while two match, and one naming another app's interface", async () => {
    const solutionId = await app();
    await addInterface(solutionId, "s4hana");
    await addInterface(solutionId, "s4hana-onprem");
    const otherApp = await app();
    const foreign = await addInterface(otherApp, "s4hana");
    as(BOB);
    const base = {
      solutionId,
      externalId: "API_BUSINESS_PARTNER",
      operation: "READ",
      environment: "PROD",
      justification: "Show partners in the portal.",
      expiresAt: inDays(30).toISOString(),
    };
    const ambiguous = await raiseRequest(json(base, "POST", "http://localhost/api/studio/access-grants"));
    expect(ambiguous.status).toBe(400);
    expect(((await ambiguous.json()) as { error: { message: string } }).error.message).toMatch(/more than one/i);
    const crossApp = await raiseRequest(
      json({ ...base, interfaceId: foreign }, "POST", "http://localhost/api/studio/access-grants"),
    );
    expect(crossApp.status).toBe(404);
  });

  it("backfills: binds a legacy grant to its only interface, flags none and several", async () => {
    const single = await app();
    const singleIface = await addInterface(single, "s4hana");
    const singleGrant = await legacyGrant(single);

    const several = await app();
    await addInterface(several, "s4hana");
    await addInterface(several, "s4hana-onprem");
    const severalGrant = await legacyGrant(several);

    const none = await app();
    const noneGrant = await legacyGrant(none);

    await prisma.$executeRawUnsafe(GRANT_BINDING_BACKFILL_SQL);
    // Idempotent: a second run changes nothing.
    await prisma.$executeRawUnsafe(GRANT_BINDING_BACKFILL_SQL);

    const rows = await prisma.apiAccessGrant.findMany({
      where: { organizationId: ORG, id: { in: [singleGrant, severalGrant, noneGrant] } },
      select: { id: true, interfaceId: true, sapProduct: true, unboundReason: true },
    });
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get(singleGrant)).toMatchObject({ interfaceId: singleIface, sapProduct: "s4hana", unboundReason: null });
    expect(by.get(severalGrant)).toMatchObject({ interfaceId: null, sapProduct: null, unboundReason: "AMBIGUOUS" });
    expect(by.get(noneGrant)).toMatchObject({ interfaceId: null, sapProduct: null, unboundReason: "NO_MATCH" });
  });

  it("an unbound legacy grant keeps working under legacy and records that it was used; strict refuses it", async () => {
    const solutionId = await app();
    const cloud = await addInterface(solutionId, "s4hana");
    const onPrem = await addInterface(solutionId, "s4hana-onprem");
    const grantId = await legacyGrant(solutionId);
    await prisma.$executeRawUnsafe(GRANT_BINDING_BACKFILL_SQL);

    vi.stubEnv("COREEDGE_GRANT_BINDING", "legacy");
    expect((await read(solutionId, cloud)).ok).toBe(true);
    expect((await read(solutionId, onPrem)).ok).toBe(true);
    const stamped = await prisma.apiAccessGrant.findFirst({
      where: { id: grantId, organizationId: ORG },
      select: { unboundLastUsedAt: true },
    });
    expect(stamped?.unboundLastUsedAt).toBeInstanceOf(Date);

    vi.stubEnv("COREEDGE_GRANT_BINDING", "strict");
    expect(await read(solutionId, cloud)).toMatchObject({ ok: false, reason: "GRANT_NEEDS_REAPPROVAL" });
    expect(await read(solutionId, onPrem)).toMatchObject({ ok: false, reason: "GRANT_NEEDS_REAPPROVAL" });

    // Flagged where approvers look: the CoreEdge requests board.
    const flagged = await listGrantsNeedingReapproval(ORG);
    expect(flagged.find((r) => r.id === grantId)).toMatchObject({
      feedLabel: "API_BUSINESS_PARTNER · READ",
      reason: "Needs re-approval: covers several interfaces on different SAP systems",
    });
    expect(flagged.find((r) => r.id === grantId)?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("names the bound SAP system on the requests board, and never flags a bound grant", async () => {
    const solutionId = await app();
    const onPrem = await addInterface(solutionId, "s4hana-onprem");
    as(BOB);
    const raised = await raiseRequest(
      json(
        {
          solutionId,
          interfaceId: onPrem,
          externalId: "API_BUSINESS_PARTNER",
          operation: "READ",
          environment: "PROD",
          justification: "Show partners in the portal.",
          expiresAt: inDays(30).toISOString(),
        },
        "POST",
        "http://localhost/api/studio/access-grants",
      ),
    );
    const { id } = ((await raised.json()) as { data: { id: string } }).data;
    const row = (await listOpenRequests(ORG)).find((r) => r.id === id);
    expect(row?.feedLabel).toMatch(/^API_BUSINESS_PARTNER · READ · /);
    expect(row?.feedLabel).not.toContain("s4hana-onprem");
    expect((await listGrantsNeedingReapproval(ORG)).some((r) => r.id === id)).toBe(false);
  });

  it("a decision binds the request it settles; an ambiguous one can be rejected but not approved", async () => {
    const solutionId = await app();
    await addInterface(solutionId, "s4hana");
    await addInterface(solutionId, "s4hana-onprem");
    const pending = await legacyGrant(solutionId, "REQUESTED");
    await prisma.apiAccessGrant.update({
      where: { id: pending, organizationId: ORG },
      data: { decidedById: null, decidedAt: null },
    });

    as(CAROL);
    const approve = await decide(
      json({ decision: "APPROVED" }, "POST", `http://localhost/api/coreedge/requests/${pending}/decide`),
      { params: Promise.resolve({ id: pending }) },
    );
    expect(approve.status).toBe(409);
    expect(((await approve.json()) as { error: { message: string } }).error.message).toMatch(/more than one/i);

    const reject = await decide(
      json({ decision: "REJECTED" }, "POST", `http://localhost/api/coreedge/requests/${pending}/decide`),
      { params: Promise.resolve({ id: pending }) },
    );
    expect(reject.status).toBe(200);
  });
});

describe("the migration's backfill is the command's backfill", () => {
  it("holds the same statement, so the operator's re-run binds exactly as the deploy did", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "prisma/migrations/20261022000000_grant_interface_binding/migration.sql"),
      "utf8",
    );
    expect(migration).toContain(GRANT_BINDING_BACKFILL_SQL);
  });
});
