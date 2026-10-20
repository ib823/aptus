// @vitest-environment node
/**
 * What a sandbox developer's invite rights reach (roadmap P0.13, review round 1).
 *
 * P0.13 handed invite rights to anyone who can verify one email address, so
 * three things that were harmless while only partner leads and client admins
 * could invite are pinned here, against real PostgreSQL:
 *
 *   · THE INVITATION TOKEN NEVER GOES BACK TO THE INVITER. The invite route
 *     returned the whole OrgInvitation row, token included, and the accept
 *     route takes an anonymous caller (the token in the email is the proof of
 *     the mailbox). Together that let a stranger create an unverified account
 *     for any address inside their own workspace, so its real owner later
 *     landed there and their employer could no longer invite them.
 *   · A DEVELOPER WORKSPACE HAS A SEND BUDGET. Revoking freed the pending
 *     "seat", so invite → revoke → invite mailed any number of addresses from
 *     this host's domain, carrying the inviter's own free-text name.
 *   · A SANDBOX DEVELOPER IN A CUSTOMER'S ORGANIZATION MANAGES SANDBOX
 *     DEVELOPER INVITATIONS ONLY. It could list every pending invitation and
 *     revoke the client admin's invitation of another client admin.
 *
 * Harness as tests/unit/auth/sandbox-developer-governance.test.ts: real routes,
 * real session lookup, real database with the tenant guard; the cookie jar,
 * the rate limiter and the mailbox are stood in. Opt-in on TEST_DATABASE_URL.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimitModule from "@/lib/security/rate-limit";

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
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimitModule>()),
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetMs: 0 }),
}));

const sent = vi.hoisted(() => [] as { to: { email: string } }[]);
vi.mock("@/lib/email/brevo", () => ({
  sendEmail: async (mail: { to: { email: string } }) => {
    sent.push(mail);
    return { messageId: `test-${sent.length}` };
  },
  sendEmailToMany: async () => ({ sent: 0, failed: [] }),
}));
vi.mock("@/lib/auth/send-magic-link", () => ({ sendMagicLink: async () => ({ sent: false }) }));

import { prisma } from "@/lib/db/prisma";
import { hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { DEVELOPER_WORKSPACE_INVITES_PER_DAY } from "@/lib/auth/org-invites";
import { POST as invite } from "@/app/api/organizations/[orgId]/users/route";
import { DELETE as revoke, GET as listInvitations } from "@/app/api/organizations/[orgId]/invitations/route";
import { POST as accept } from "@/app/api/invitations/[token]/accept/route";

const RUN = `sbx-inv-${randomUUID().slice(0, 8)}`;
const WORKSPACE = `${RUN}-ws`;
const CUSTOMER = `${RUN}-customer`;
const DEVELOPER = { id: `${RUN}-dev`, email: `${RUN}-dev@example.test`, role: "sandbox_developer", org: WORKSPACE };
const EMBEDDED = { id: `${RUN}-embedded`, email: `${RUN}-embedded@example.test`, role: "sandbox_developer", org: CUSTOMER };
const ADMIN = { id: `${RUN}-admin`, email: `${RUN}-admin@example.test`, role: "client_admin", org: CUSTOMER };
const PEOPLE = [DEVELOPER, EMBEDDED, ADMIN];
const tokens = new Map<string, string>();

function post(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });
const signInAs = (person: { id: string }) => {
  jar.clear();
  jar.set(SESSION_COOKIE_NAME, tokens.get(person.id)!);
};
const victim = (n: number | string) => `${RUN}-victim-${n}@victimcorp.test`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("a sandbox developer's invite rights (real PostgreSQL)", () => {
  beforeAll(async () => {
    for (const id of [WORKSPACE, CUSTOMER]) {
      await prisma.organization.create({
        data: { id, name: `${RUN} ${id}`, type: "client", orgType: "client", maxPartnerUsers: 50 },
      });
    }
    for (const person of PEOPLE) {
      await prisma.user.create({
        data: {
          id: person.id,
          email: person.email,
          name: "Visit evil.example to claim",
          role: person.role,
          organizationId: person.org,
          emailVerified: new Date(),
        },
      });
      const token = randomBytes(32).toString("hex");
      tokens.set(person.id, token);
      await prisma.session.create({
        data: { userId: person.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 86_400_000) },
      });
    }
  });

  afterAll(async () => {
    await prisma.orgInvitation.deleteMany({ where: { organizationId: { in: [WORKSPACE, CUSTOMER] } } });
    await prisma.session.deleteMany({ where: { userId: { in: PEOPLE.map((p) => p.id) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.organization.deleteMany({ where: { id: { in: [WORKSPACE, CUSTOMER] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    sent.length = 0;
    await prisma.orgInvitation.deleteMany({ where: { organizationId: { in: [WORKSPACE, CUSTOMER] } } });
    await prisma.user.deleteMany({ where: { email: { contains: "-victim-" , startsWith: RUN } } });
  });

  describe("the invitation token", () => {
    it("is not in the invite response, so the inviter cannot accept for the invitee", async () => {
      signInAs(DEVELOPER);
      const res = await invite(post({ email: victim("cto"), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      expect(res.status).toBe(201);
      const text = await res.text();

      const row = await prisma.orgInvitation.findFirst({ where: { organizationId: WORKSPACE, email: victim("cto") } });
      expect(row, "the invitation was created").not.toBeNull();
      expect(text).not.toContain(row!.token);
      expect((JSON.parse(text) as { data: { invitation: Record<string, unknown> } }).data.invitation).not.toHaveProperty(
        "token",
      );
      // What the form shows stays.
      expect(JSON.parse(text)).toMatchObject({ data: { invitation: { email: victim("cto") }, magicLinkSent: true } });
    });

    it("still lets the invitee accept from the link in their email, with no session", async () => {
      signInAs(DEVELOPER);
      await invite(post({ email: victim("real"), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      const row = await prisma.orgInvitation.findFirst({ where: { organizationId: WORKSPACE, email: victim("real") } });

      jar.clear();
      const res = await accept(post({}), params({ token: row!.token }));
      expect(res.status).toBe(200);
    });
  });

  describe("a developer workspace's send budget", () => {
    // Written out, so the test still drives the cycle where no budget exists.
    const BUDGET = 10;

    it("is ten a day", () => {
      expect(DEVELOPER_WORKSPACE_INVITES_PER_DAY).toBe(BUDGET);
    });

    it("stops invite → revoke cycles once the day's budget is spent, and sends nothing past it", async () => {
      signInAs(DEVELOPER);
      const statuses: number[] = [];
      for (let i = 0; i < BUDGET + 3; i++) {
        const res = await invite(post({ email: victim(i), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
        statuses.push(res.status);
        const row = await prisma.orgInvitation.findFirst({
          where: { organizationId: WORKSPACE, email: victim(i), status: "pending" },
          select: { id: true },
        });
        if (row) {
          const url = `http://localhost/api/organizations/${WORKSPACE}/invitations?invitationId=${row.id}`;
          expect((await revoke(new NextRequest(url, { method: "DELETE" }), params({ orgId: WORKSPACE }))).status).toBe(200);
        }
      }

      expect(statuses.slice(0, BUDGET).every((s) => s === 201)).toBe(true);
      expect(statuses.slice(BUDGET)).toEqual([429, 429, 429]);
      expect(sent).toHaveLength(BUDGET);
    });

    it("does not apply to an organization's administrators", async () => {
      signInAs(ADMIN);
      for (let i = 0; i < BUDGET + 1; i++) {
        const res = await invite(post({ email: victim(`a${i}`), role: "viewer" }), params({ orgId: CUSTOMER }));
        expect(res.status).toBe(201);
      }
    });
  });

  describe("a sandbox developer in a customer's organization", () => {
    async function adminInvitation(): Promise<string> {
      signInAs(ADMIN);
      const res = await invite(post({ email: victim("new-admin"), role: "client_admin" }), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(201);
      const row = await prisma.orgInvitation.findFirst({
        where: { organizationId: CUSTOMER, email: victim("new-admin") },
        select: { id: true },
      });
      return row!.id;
    }

    it("does not see the administrators' invitations", async () => {
      await adminInvitation();
      signInAs(EMBEDDED);
      const res = await listInvitations(new NextRequest("http://localhost/x"), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { email: string; role: string }[] };
      expect(body.data.map((i) => i.role)).not.toContain("client_admin");
    });

    it("cannot revoke an administrator's invitation", async () => {
      const id = await adminInvitation();
      signInAs(EMBEDDED);
      const url = `http://localhost/api/organizations/${CUSTOMER}/invitations?invitationId=${id}`;
      const res = await revoke(new NextRequest(url, { method: "DELETE" }), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(403);
      const row = await prisma.orgInvitation.findFirst({ where: { id, organizationId: CUSTOMER } });
      expect(row?.status).toBe("pending");
    });

    it("still sees and revokes a sandbox developer invitation", async () => {
      signInAs(EMBEDDED);
      await invite(post({ email: victim("peer"), role: "sandbox_developer" }), params({ orgId: CUSTOMER }));
      const listed = (await (
        await listInvitations(new NextRequest("http://localhost/x"), params({ orgId: CUSTOMER }))
      ).json()) as { data: { id: string; email: string }[] };
      const peer = listed.data.find((i) => i.email === victim("peer"));
      expect(peer).toBeDefined();

      const url = `http://localhost/api/organizations/${CUSTOMER}/invitations?invitationId=${peer!.id}`;
      expect((await revoke(new NextRequest(url, { method: "DELETE" }), params({ orgId: CUSTOMER }))).status).toBe(200);
    });

    it("leaves the administrator's own view of every invitation alone", async () => {
      await adminInvitation();
      signInAs(ADMIN);
      const res = await listInvitations(new NextRequest("http://localhost/x"), params({ orgId: CUSTOMER }));
      const body = (await res.json()) as { data: { role: string }[] };
      expect(body.data.map((i) => i.role)).toContain("client_admin");
    });
  });
});
