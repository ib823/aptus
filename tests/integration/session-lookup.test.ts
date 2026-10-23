// @vitest-environment node
/**
 * The session lookup is ONE statement and answers what the Prisma select it
 * replaced answered (P0.14b review round 4), against a REAL PostgreSQL.
 *
 * `validateSession` read the session, its user, the user's organization and
 * the user's passkey count through a nested Prisma `select`: three statements
 * on every signed-in request, six on a Workbench console read that validated
 * its session twice. It is now one joined statement (auth/session.ts
 * `sessionLookup`). This file holds it to the reference — the old select and
 * the old mapping, verbatim — for every shape a session can have: a member of
 * an organization with each MFA policy, a user with no organization, with and
 * without passkeys, revoked, expired, a deactivated user, an unknown token, a
 * legacy role name. And on a database session in another time zone, the
 * timestamps read are the same instants.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const q = vi.hoisted(() => ({ on: false, log: [] as string[] }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
    log: [{ emit: "event", level: "query" }],
  });
  base.$on("query", (e) => {
    if (q.on) q.log.push(e.query.trim().slice(0, 80));
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { mapLegacyRole } from "@/lib/auth/role-migration";
import { generateSessionToken, hashSessionToken, sessionLookup, validateSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/assessment";

/** The select `validateSession` made before review round 4, and its mapping, verbatim. */
async function reference(token: string): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      isRevoked: true,
      expiresAt: true,
      lastActiveAt: true,
      mfaVerified: true,
      passkeyAssertedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          organizationId: true,
          mfaEnabled: true,
          isActive: true,
          organization: { select: { mfaPolicy: true } },
          _count: { select: { webauthnCredentials: true } },
        },
      },
    },
  });
  if (!session) return null;
  if (session.isRevoked) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    role: mapLegacyRole(session.user.role),
    organizationId: session.user.organizationId,
    organizationMfaPolicy: session.user.organization?.mfaPolicy ?? null,
    mfaEnabled: session.user.mfaEnabled,
    mfaVerified: session.mfaVerified,
    hasWebAuthn: session.user._count.webauthnCredentials > 0,
    passkeyAssertedAt: session.passkeyAssertedAt,
    authMethod: "session",
  };
}

// Opt in explicitly; never fall back to an application's DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("the session lookup (one statement) on real PostgreSQL", () => {
  const RUN = `p014b-session-${randomUUID().slice(0, 8)}`;
  const DAY = 86_400_000;
  const tokens: Record<string, string> = {};
  const users: string[] = [];
  const orgs: string[] = [];

  beforeAll(async () => {
    for (const policy of ["required", "optional"]) {
      orgs.push((await prisma.organization.create({ data: { id: `${RUN}-${policy}`, name: `Session ${policy}`, type: "client", mfaPolicy: policy } })).id);
    }
    const user = async (key: string, data: Record<string, unknown>) => {
      const id = `${RUN}-${key}`;
      await prisma.user.create({ data: { id, email: `${id}@abeam.test`, name: key, role: "consultant", ...data } });
      users.push(id);
      return id;
    };
    const session = async (key: string, userId: string, data: Record<string, unknown> = {}) => {
      tokens[key] = generateSessionToken();
      await prisma.session.create({
        data: { userId, tokenHash: hashSessionToken(tokens[key]!), expiresAt: new Date(Date.now() + DAY), lastActiveAt: new Date(), ...data },
      });
    };
    const member = await user("member", { organizationId: orgs[0], mfaEnabled: true, image: "https://example.invalid/a.png" });
    await prisma.webAuthnCredential.create({ data: { userId: member, credentialId: `${RUN}-cred`, publicKey: Buffer.from([1, 2, 3]) } });
    await session("member", member, { mfaVerified: true, passkeyAssertedAt: new Date(Date.now() - 60_000) });
    await session("optional", await user("optional", { organizationId: orgs[1], role: "admin" }));
    await session("orgless", await user("orgless", { organizationId: null }));
    const revoked = await user("revoked", { organizationId: orgs[1] });
    await session("revoked", revoked, { isRevoked: true, revokedAt: new Date() });
    await session("expired", await user("expired", { organizationId: orgs[1] }), { expiresAt: new Date(Date.now() - 1000) });
    await session("inactive", await user("inactive", { organizationId: orgs[1], isActive: false }));
    tokens.unknown = generateSessionToken();
  });

  afterAll(async () => {
    // Test-database housekeeping for this run's namespace only.
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.webAuthnCredential.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  });

  it.each(["member", "optional", "orgless", "revoked", "expired", "inactive", "unknown"])(
    "answers what the Prisma select answered for a %s session",
    async (key) => {
      const expected = await reference(tokens[key]!);
      expect(await validateSession(tokens[key]!)).toEqual(expected);
      if (["member", "optional", "orgless"].includes(key)) expect(expected).not.toBeNull();
      else expect(expected).toBeNull();
    },
  );

  it("reads the organization, the passkey and the legacy role as the select did", async () => {
    const member = await validateSession(tokens.member!);
    expect(member).toMatchObject({ organizationMfaPolicy: "required", hasWebAuthn: true, mfaVerified: true, mfaEnabled: true });
    expect(member?.passkeyAssertedAt).toBeInstanceOf(Date);
    expect((await validateSession(tokens.orgless!))?.organizationMfaPolicy).toBeNull();
    expect((await validateSession(tokens.optional!))?.role).toBe(mapLegacyRole("admin"));
  });

  it("is one statement (and no write while the session was active in the last five minutes)", async () => {
    q.log = [];
    q.on = true;
    await validateSession(tokens.member!);
    await new Promise((r) => setTimeout(r, 20));
    q.on = false;
    expect(q.log).toHaveLength(1);
    expect(q.log[0]).toContain("auth:session-lookup");
  });

  it("reads the same instants on a database session in another time zone", async () => {
    const lookup = sessionLookup(hashSessionToken(tokens.member!));
    const [utc] = await prisma.$queryRaw<Array<{ expiresAt: Date; passkeyAssertedAt: Date }>>(lookup);
    const [tokyo] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Asia/Tokyo'`);
      return tx.$queryRaw<Array<{ expiresAt: Date; passkeyAssertedAt: Date }>>(lookup);
    });
    expect(tokyo!.expiresAt.getTime()).toBe(utc!.expiresAt.getTime());
    expect(tokyo!.passkeyAssertedAt.getTime()).toBe(utc!.passkeyAssertedAt.getTime());
    const row = await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(tokens.member!) }, select: { expiresAt: true } });
    expect(utc!.expiresAt.getTime()).toBe(row!.expiresAt.getTime());
  });
});
