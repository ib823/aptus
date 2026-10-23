// @vitest-environment node
/**
 * A key's masked reference always names the CURRENT key (P0.3 A45, wave 2
 * integration review round 4), against a REAL PostgreSQL.
 *
 * The code before P0.3 does not know `SolutionClient.tokenTail`. Rolled back
 * to it (the release protocol's Instant Rollback keeps the migrations), a
 * rotation, a re-issue or a collected claim link wrote a new `tokenHash` and
 * left the previous key's tail, so after rolling forward every screen showed
 * the reference of a key that no longer existed. Migration
 * 20261025040000_token_tail_binding adds a trigger that clears the tail of a
 * key change that does not write one. Proven here by doing what that code
 * does, an UPDATE of `tokenHash` alone, and by the mint paths of this build.
 *
 * `prisma db push` (how the test database is built) does not create a
 * trigger, so this file installs the migration's own SQL for its run and
 * removes it after. Nothing else writes a tail without a mint, so the
 * trigger cannot change another test's rows. Opt-in like the other
 * integration tests: skipped without TEST_DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { listKeys } from "@/lib/coreedge/queries";
import { prisma } from "@/lib/db/prisma";
import { hashClientToken } from "@/lib/northbound/auth";
import { issueClientToken, rotateClientToken } from "@/lib/northbound/issue";
import { tokenTailOf } from "@/lib/northbound/key-policy";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const MIGRATION = readFileSync(
  path.resolve(process.cwd(), "prisma/migrations/20261025040000_token_tail_binding/migration.sql"),
  "utf8",
);

/** The migration's two statements: the function (its body holds semicolons), then the trigger. */
function migrationStatements(): string[] {
  const at = MIGRATION.indexOf("CREATE OR REPLACE TRIGGER");
  expect(at).toBeGreaterThan(0);
  const fn = MIGRATION.slice(MIGRATION.indexOf("CREATE OR REPLACE FUNCTION"), at).trim().replace(/;\s*$/, "");
  const trigger = MIGRATION.slice(at).trim().replace(/;\s*$/, "");
  return [fn, trigger];
}

const RUN = `tail-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const SCOPE = tenantScopeOf(ORG);

describe.skipIf(!process.env.TEST_DATABASE_URL)("the key tail is bound to the key", () => {
  let solutionId: string;

  beforeAll(async () => {
    for (const statement of migrationStatements()) await prisma.$executeRawUnsafe(statement);
    await prisma.organization.create({ data: { id: ORG, name: "Token tail", type: "client" } });
    solutionId = (
      await prisma.solution.create({
        data: {
          organizationId: ORG,
          name: "Tail app",
          slug: `${RUN}-app`,
          classification: "CLIENT_APP",
          businessProblem: "Token tail binding test.",
          dataClass: "INTERNAL",
          status: "ACTIVE",
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "SolutionClient_token_tail_binding" ON "SolutionClient"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "solution_client_token_tail_binding"()`);
    await prisma.keyClaimLink.deleteMany({ where: { organizationId: ORG } });
    await prisma.retiredClientToken.deleteMany({ where: { organizationId: ORG } });
    await prisma.solutionClient.deleteMany({ where: { organizationId: ORG } });
    await prisma.solution.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
  });

  const tailOf = async (id: string) =>
    (await prisma.solutionClient.findFirst({ where: { id, organizationId: ORG }, select: { tokenTail: true } }))?.tokenTail;

  it("this build's issue and rotation keep the new key's own tail", async () => {
    const issued = await issueClientToken(SCOPE, { solutionId, label: "Tail · DEV", environment: "DEV", createdById: "u_owner" });
    expect(await tailOf(issued.id)).toBe(tokenTailOf(issued.rawToken));
    const rotated = await rotateClientToken(SCOPE, issued.id);
    expect(rotated).not.toBeNull();
    expect(await tailOf(issued.id)).toBe(tokenTailOf(rotated!.rawToken));
  });

  it("a key changed by code that does not know the column loses the old tail, and every screen says so", async () => {
    const issued = await issueClientToken(SCOPE, { solutionId, label: "Tail · TEST", environment: "TEST", createdById: "u_owner" });
    const before = tokenTailOf(issued.rawToken);
    expect(await tailOf(issued.id)).toBe(before);

    // What the build before P0.3 writes on a rotation: a new hash, no tail.
    const newKey = `ce_test_${randomUUID().replace(/-/g, "")}`;
    await prisma.solutionClient.updateMany({
      where: { id: issued.id, organizationId: ORG },
      data: { tokenHash: hashClientToken(newKey) },
    });
    expect(await tailOf(issued.id)).toBeNull();

    const keys = await listKeys(ORG);
    expect(keys.find((k) => k.id === issued.id)?.tail).toBeNull();
    expect(keys.map((k) => k.tail)).not.toContain(before);
  });

  it("any other change to the row keeps the tail", async () => {
    const issued = await issueClientToken(SCOPE, { solutionId, label: "Tail · SANDBOX", environment: "SANDBOX", createdById: "u_owner" });
    await prisma.solutionClient.updateMany({ where: { id: issued.id, organizationId: ORG }, data: { lastUsedAt: new Date(), label: "Renamed" } });
    expect(await tailOf(issued.id)).toBe(tokenTailOf(issued.rawToken));
  });
});
