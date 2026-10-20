// @vitest-environment node
/**
 * A departed owner is no owner (P0.1, audit A69). Against real PostgreSQL.
 *
 * THE DEFECT. Ownership was "the three owner ids are non-null", and nothing
 * re-checked them against User. Dave claimed all three slots of an ACTIVE app
 * and left; a client admin deactivated him. The app stayed ACTIVE, Control
 * Tower counted it as owned, and any consultant who was not Dave could issue
 * or rotate its PROD key — the accountability record naming nobody who could
 * still answer for it.
 *
 * Pinned here: one nightly sweep moves an app whose owner was deactivated,
 * moved to another organization or deleted to RESTRICTED, with an audit row;
 * an app whose owners are all live is left alone; the credential gate counts
 * a departed owner's slot as empty; and so does the promotion gate, so a bare
 * "Promote to ACTIVE" cannot undo the sweep while the slot is still the
 * departed owner's (review round 1).
 *
 * Opt-in on TEST_DATABASE_URL. The sweep is run for this file's organization
 * only, so it cannot touch rows other test files are using.
 */

import { randomUUID } from "node:crypto";

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
import { POST as issue } from "@/app/api/studio/clients/route";
import { PATCH as patchSolution } from "@/app/api/studio/solutions/route";
import { OWNER_LIVENESS_ACTOR, applyLiveness, sweepOwnerLiveness } from "@/lib/studio/owner-liveness";

const RUN = `owner-live-${randomUUID()}`;
const ORG = `${RUN}-org`;
const OTHER_ORG = `${RUN}-elsewhere`;

const people = {
  dave: `${RUN}-dave`,
  erin: `${RUN}-erin`,
  finn: `${RUN}-finn`,
  issuer: `${RUN}-issuer`,
};

async function app(owners: [string | null, string | null, string | null]): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Order portal",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Raises sales orders from the client's portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      technicalOwnerId: owners[0],
      businessOwnerId: owners[1],
      supportOwnerId: owners[2],
    },
    select: { id: true },
  });
  return s.id;
}

const asIssuer = () => {
  session.user = {
    id: people.issuer,
    email: "issuer@abeam.com",
    role: "consultant",
    organizationId: ORG,
    authMethod: "session",
  };
};

const patch = (body: Record<string, unknown>) =>
  patchSolution(
    new Request("http://localhost/api/studio/solutions", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }) as never,
  );

const status = async (id: string) =>
  (await prisma.solution.findFirst({ where: { id, organizationId: ORG }, select: { status: true } }))?.status;

describe.skipIf(!process.env.TEST_DATABASE_URL)("owner liveness, against real PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Owner liveness test", type: "client" } });
    await prisma.organization.create({ data: { id: OTHER_ORG, name: "Elsewhere", type: "client" } });
    for (const [name, id] of Object.entries(people)) {
      await prisma.user.create({
        data: { id, email: `${id}@abeam.com`, name, role: "consultant", organizationId: ORG },
      });
    }
  });

  afterAll(async () => {
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(people) } } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.organization.delete({ where: { id: OTHER_ORG } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    session.user = null;
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    await prisma.user.updateMany({
      where: { id: { in: Object.values(people) } },
      data: { isActive: true, organizationId: ORG },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves an app whose three owners are live members alone", async () => {
    const id = await app([people.dave, people.erin, people.finn]);
    await sweepOwnerLiveness({ organizationIds: [ORG] });
    expect(await status(id)).toBe("ACTIVE");
  });

  it("moves an app to RESTRICTED within one sweep once an owner is deactivated, and audits why", async () => {
    const id = await app([people.dave, people.dave, people.erin]);
    await prisma.user.update({ where: { id: people.dave }, data: { isActive: false } });

    const result = await sweepOwnerLiveness({ organizationIds: [ORG] });
    expect(result.restricted).toBeGreaterThanOrEqual(1);
    expect(await status(id)).toBe("RESTRICTED");

    const audit = await prisma.configAudit.findFirst({
      where: { organizationId: ORG, entityType: "Solution", entityId: id },
      select: { actorId: true, action: true, after: true },
    });
    expect(audit).toMatchObject({
      actorId: OWNER_LIVENESS_ACTOR,
      action: "UPDATE",
      after: { status: "RESTRICTED", autoDropped: true, departedSlots: ["technicalOwnerId", "businessOwnerId"] },
    });
    // The stale ids stay in their slots, visible and recoverable.
    const row = await prisma.solution.findFirst({
      where: { id, organizationId: ORG },
      select: { technicalOwnerId: true },
    });
    expect(row?.technicalOwnerId).toBe(people.dave);
  });

  it("treats an owner moved to another organization, or deleted, as departed", async () => {
    const moved = await app([people.erin, people.finn, people.issuer]);
    const gone = await app([people.erin, `${RUN}-deleted-user`, people.finn]);
    await prisma.user.update({ where: { id: people.issuer }, data: { organizationId: OTHER_ORG } });

    await sweepOwnerLiveness({ organizationIds: [ORG] });
    expect(await status(moved)).toBe("RESTRICTED");
    expect(await status(gone)).toBe("RESTRICTED");
  });

  it("keeps a swept app RESTRICTED until a live member claims the departed slot: a bare promotion is refused", async () => {
    const id = await app([people.dave, people.erin, people.finn]);
    await prisma.user.update({ where: { id: people.dave }, data: { isActive: false } });
    await sweepOwnerLiveness({ organizationIds: [ORG] });
    expect(await status(id)).toBe("RESTRICTED");

    // Someone who owns nothing and claims nothing clicks "Promote to ACTIVE".
    asIssuer();
    const bare = await patch({ id, status: "ACTIVE" });
    expect(bare.status).toBe(409);
    const message = ((await bare.json()) as { error: { message: string } }).error.message;
    expect(message).toContain("Missing: technical owner");
    expect(message).toContain("deactivated or has left the organization");
    expect(await status(id)).toBe("RESTRICTED");

    // Recovery is what the runbook says: a live member claims the slot, then promotes.
    const claimed = await patch({ id, technicalOwnerId: people.issuer, status: "ACTIVE" });
    expect(claimed.status).toBe(200);
    expect(await status(id)).toBe("ACTIVE");
  });

  it("an edit to an ACTIVE app holding a departed owner moves it to RESTRICTED, as the sweep would", async () => {
    const id = await app([people.dave, people.erin, people.finn]);
    await prisma.user.update({ where: { id: people.dave }, data: { isActive: false } });

    asIssuer();
    const res = await patch({ id, name: "Order portal (EU)" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { autoDropped: boolean } }).data.autoDropped).toBe(true);
    expect(await status(id)).toBe("RESTRICTED");
  });

  it("refuses to issue a key when an owner slot is held by someone who has left", async () => {
    const id = await app([people.dave, people.erin, people.finn]);
    await prisma.user.update({ where: { id: people.dave }, data: { isActive: false } });

    session.user = {
      id: people.issuer,
      email: "issuer@abeam.com",
      role: "consultant",
      organizationId: ORG,
      authMethod: "session",
    };
    const res = await issue(
      new Request("http://localhost/api/studio/clients", {
        method: "POST",
        body: JSON.stringify({ solutionId: id, label: "Portal PROD", environment: "PROD" }),
        headers: { "Content-Type": "application/json" },
      }) as never,
    );
    expect(res.status).toBe(403);
    const message = ((await res.json()) as { error: { message: string } }).error.message;
    expect(message).toContain("This solution has no technical owner");
    expect(message).toContain("deactivated or has left the organization");
    expect(await prisma.solutionClient.count({ where: { organizationId: ORG, solutionId: id } })).toBe(0);
  });
});

describe("applyLiveness", () => {
  it("empties exactly the slots whose id is not live, and names them", () => {
    expect(
      applyLiveness({ technicalOwnerId: "a", businessOwnerId: "gone", supportOwnerId: null }, new Set(["a"])),
    ).toEqual({
      live: { technicalOwnerId: "a", businessOwnerId: null, supportOwnerId: null },
      departed: ["businessOwnerId"],
    });
  });
});
