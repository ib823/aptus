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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { GET as listMembers, POST as invite } from "@/app/api/organizations/[orgId]/users/route";
import { DELETE as revoke, GET as listInvitations } from "@/app/api/organizations/[orgId]/invitations/route";
import { POST as accept } from "@/app/api/invitations/[token]/accept/route";

const RUN = `sbx-inv-${randomUUID().slice(0, 8)}`;
const WORKSPACE = `${RUN}-ws`;
const CUSTOMER = `${RUN}-customer`;
const DEVELOPER = { id: `${RUN}-dev`, email: `${RUN}-dev@example.test`, role: "sandbox_developer", org: WORKSPACE };
const EMBEDDED = { id: `${RUN}-embedded`, email: `${RUN}-embedded@example.test`, role: "sandbox_developer", org: CUSTOMER };
const ADMIN = { id: `${RUN}-admin`, email: `${RUN}-admin@example.test`, role: "client_admin", org: CUSTOMER };
// A second sandbox developer in the same workspace, whom a platform admin has
// deactivated (review round 2).
const BANNED = { id: `${RUN}-banned`, email: `${RUN}-banned@example.test`, role: "sandbox_developer", org: WORKSPACE };
// A workspace of its own for the concurrency test, so its budget is untouched.
const RACE_WS = `${RUN}-race`;
const RACER = { id: `${RUN}-racer`, email: `${RUN}-racer@example.test`, role: "sandbox_developer", org: RACE_WS };
const PEOPLE = [DEVELOPER, EMBEDDED, ADMIN, BANNED, RACER];
const ORGS = [WORKSPACE, CUSTOMER, RACE_WS];
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
    for (const id of ORGS) {
      await prisma.organization.create({
        // ENTERPRISE, so the plan's seats never decide a test about the budget;
        // the concurrency test sets its own plan.
        data: { id, name: `${RUN} ${id}`, type: "client", orgType: "client", maxPartnerUsers: 50, plan: "ENTERPRISE" },
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
    await prisma.orgInvitation.deleteMany({ where: { organizationId: { in: ORGS } } });
    await prisma.session.deleteMany({ where: { userId: { in: PEOPLE.map((p) => p.id) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.organization.deleteMany({ where: { id: { in: ORGS } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    sent.length = 0;
    await prisma.orgInvitation.deleteMany({ where: { organizationId: { in: ORGS } } });
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
    // Review round 2: invite and member-list rights are a developer
    // WORKSPACE's, not the role's wherever it sits. A client admin may offer a
    // contractor the sandbox; that must not let the contractor bring in
    // outsiders who then read the customer's members and Studio.
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

    it("cannot invite anyone into it", async () => {
      signInAs(EMBEDDED);
      const res = await invite(post({ email: victim("outsider"), role: "sandbox_developer" }), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(403);
      expect(await prisma.orgInvitation.count({ where: { organizationId: CUSTOMER } })).toBe(0);
      expect(sent).toHaveLength(0);
    });

    it("cannot read its member list", async () => {
      signInAs(EMBEDDED);
      const res = await listMembers(new NextRequest("http://localhost/x"), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(ADMIN.email);
    });

    it("does not see the administrators' invitations", async () => {
      await adminInvitation();
      signInAs(EMBEDDED);
      const res = await listInvitations(new NextRequest("http://localhost/x"), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(victim("new-admin"));
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

    it("leaves a developer in its own workspace its rights", async () => {
      signInAs(DEVELOPER);
      expect((await invite(post({ email: victim("peer"), role: "sandbox_developer" }), params({ orgId: WORKSPACE }))).status).toBe(201);
      expect((await listMembers(new NextRequest("http://localhost/x"), params({ orgId: WORKSPACE }))).status).toBe(200);
      const listed = (await (
        await listInvitations(new NextRequest("http://localhost/x"), params({ orgId: WORKSPACE }))
      ).json()) as { data: { id: string; email: string }[] };
      const peer = listed.data.find((i) => i.email === victim("peer"));
      expect(peer).toBeDefined();
      const url = `http://localhost/api/organizations/${WORKSPACE}/invitations?invitationId=${peer!.id}`;
      expect((await revoke(new NextRequest(url, { method: "DELETE" }), params({ orgId: WORKSPACE }))).status).toBe(200);
    });

    it("leaves the administrator's own view of every invitation alone", async () => {
      await adminInvitation();
      signInAs(ADMIN);
      const res = await listInvitations(new NextRequest("http://localhost/x"), params({ orgId: CUSTOMER }));
      const body = (await res.json()) as { data: { role: string }[] };
      expect(body.data.map((i) => i.role)).toContain("client_admin");
    });
  });

  describe("an account a platform admin deactivated", () => {
    // Review round 2: a peer in the same workspace invited the deactivated
    // account, its owner accepted from their own mailbox with no session, and
    // accepting wrote isActive: true — a stranger overriding a platform
    // admin's decision.
    beforeEach(async () => {
      await prisma.user.update({ where: { id: BANNED.id }, data: { isActive: false } });
    });

    it("is not reactivated by a workspace peer's invitation", async () => {
      signInAs(DEVELOPER);
      const res = await invite(post({ email: BANNED.email, role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      expect(res.status).toBe(201);

      // Even with the token in hand (the test reads it from the table), the
      // accept refuses to bring the account back.
      const row = await prisma.orgInvitation.findFirst({ where: { organizationId: WORKSPACE, email: BANNED.email } });
      jar.clear();
      const accepted = await accept(post({}), params({ token: row!.token }));
      expect(accepted.status).toBe(409);
      const after = await prisma.user.findUnique({ where: { id: BANNED.id }, select: { isActive: true } });
      expect(after?.isActive).toBe(false);
    });

    it("is not mailed the token in the first place", async () => {
      signInAs(DEVELOPER);
      await invite(post({ email: BANNED.email, role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      expect(sent.map((m) => m.to.email)).not.toContain(BANNED.email);
    });
  });

  describe("probing which addresses are registered", () => {
    // Review round 2: an address with an account elsewhere answered 400 "User
    // already belongs to another organization", one without answered 201, and
    // only the 201s spent the budget — a free, unlimited oracle.
    const registered = (n: number) => `${RUN}-victim-reg-${n}@bigclient.test`;

    beforeEach(async () => {
      for (let i = 0; i < 12; i++) {
        await prisma.user.create({
          data: { email: registered(i), name: "Registered", role: "client_admin", organizationId: CUSTOMER },
        });
      }
    });

    it("answers a registered address exactly as an unregistered one, and mails neither more than the invitee", async () => {
      signInAs(DEVELOPER);
      const known = await invite(post({ email: registered(0), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      const unknown = await invite(post({ email: victim("fresh"), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));

      expect(known.status).toBe(unknown.status);
      expect(known.status).toBe(201);
      const shape = (body: unknown) => JSON.stringify(body, (_k, v: unknown) => (typeof v === "string" ? "s" : v));
      expect(shape(await known.json())).toBe(shape(await unknown.json()));
      expect(sent.map((m) => m.to.email)).toEqual([victim("fresh")]);
      // The registered account is untouched.
      const user = await prisma.user.findUnique({ where: { email: registered(0) }, select: { organizationId: true } });
      expect(user?.organizationId).toBe(CUSTOMER);
    });

    it("charges every probe to the day's budget", async () => {
      signInAs(DEVELOPER);
      for (let i = 0; i < DEVELOPER_WORKSPACE_INVITES_PER_DAY; i++) {
        await invite(post({ email: registered(i), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      }
      const next = await invite(post({ email: victim("after-probes"), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      expect(next.status).toBe(429);
    });

    it("leaves an administrator's refusal of another organization's member as it was", async () => {
      signInAs(ADMIN);
      const res = await invite(post({ email: DEVELOPER.email, role: "viewer" }), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(400);
    });
  });

  describe("concurrent invitations", () => {
    // Review round 2: the seat and budget checks were separate reads with
    // nothing serialising them, so 25 parallel invites all passed and all sent.
    async function race(): Promise<number[]> {
      signInAs(RACER);
      return Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          invite(post({ email: victim(`race-${i}`), role: "sandbox_developer" }), params({ orgId: RACE_WS })).then(
            (r) => r.status,
          ),
        ),
      );
    }

    it("send no more than the day's budget however many arrive at once", async () => {
      await prisma.organization.update({ where: { id: RACE_WS }, data: { plan: "ENTERPRISE" } });
      const statuses = await race();
      expect(statuses.filter((s) => s === 201)).toHaveLength(DEVELOPER_WORKSPACE_INVITES_PER_DAY);
      expect(statuses.filter((s) => s !== 201).every((s) => s === 429)).toBe(true);
      expect(await prisma.orgInvitation.count({ where: { organizationId: RACE_WS } })).toBe(
        DEVELOPER_WORKSPACE_INVITES_PER_DAY,
      );
      expect(sent).toHaveLength(DEVELOPER_WORKSPACE_INVITES_PER_DAY);
    });

    it("hold no more pending invitations than the plan has seats", async () => {
      // TRIAL: five seats, one of them the racer's own.
      await prisma.organization.update({ where: { id: RACE_WS }, data: { plan: "TRIAL" } });
      const statuses = await race();
      expect(statuses.filter((s) => s === 201)).toHaveLength(4);
      expect(await prisma.orgInvitation.count({ where: { organizationId: RACE_WS, status: "pending" } })).toBe(4);
      expect(sent).toHaveLength(4);
    });
  });

  /*
   * WAVE 1A FINAL REVIEW. Neither the invite route nor the accept route asked
   * the sign-up policy, so with sign-up turned off — and AUTH_INVITATION_ONLY
   * and a domain list set, after abuse — any existing workspace still invited
   * a stranger, and accepting created an active account for them.
   */
  describe("closing sign-up", () => {
    const closed = () => {
      vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "off");
      vi.stubEnv("AUTH_INVITATION_ONLY", "true");
      vi.stubEnv("AUTH_ALLOWED_DOMAINS", "abeam.com");
    };
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("stops a workspace inviting an address the host would not admit by itself", async () => {
      closed();
      signInAs(DEVELOPER);
      const res = await invite(post({ email: victim("closed"), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      expect(res.status).toBe(403);
      expect(await prisma.orgInvitation.count({ where: { organizationId: WORKSPACE } })).toBe(0);
      expect(sent).toHaveLength(0);
    });

    it("refuses a new account from a workspace invitation sent before sign-up closed", async () => {
      signInAs(DEVELOPER);
      const sentBefore = await invite(
        post({ email: victim("in-flight"), role: "sandbox_developer" }),
        params({ orgId: WORKSPACE }),
      );
      expect(sentBefore.status).toBe(201);
      const row = await prisma.orgInvitation.findFirst({ where: { organizationId: WORKSPACE, email: victim("in-flight") } });

      closed();
      jar.clear();
      const res = await accept(post({}), params({ token: row!.token }));
      expect(res.status).toBe(403);
      expect(await prisma.user.findUnique({ where: { email: victim("in-flight") } })).toBeNull();
    });

    it("holds a workspace to the developer domain list while sign-up is open", async () => {
      vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "open");
      vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP_DOMAINS", "example.test");
      vi.stubEnv("AUTH_INVITATION_ONLY", "true");
      signInAs(DEVELOPER);
      const outside = await invite(post({ email: victim("outside"), role: "sandbox_developer" }), params({ orgId: WORKSPACE }));
      expect(outside.status).toBe(403);
      const inside = await invite(
        post({ email: `${RUN}-colleague@example.test`, role: "sandbox_developer" }),
        params({ orgId: WORKSPACE }),
      );
      expect(inside.status).toBe(201);
    });

    it("leaves an administrator's invitation as it was: the way past the registration policy", async () => {
      closed();
      signInAs(ADMIN);
      const res = await invite(post({ email: victim("hired"), role: "sandbox_developer" }), params({ orgId: CUSTOMER }));
      expect(res.status).toBe(201);
      const row = await prisma.orgInvitation.findFirst({ where: { organizationId: CUSTOMER, email: victim("hired") } });
      jar.clear();
      expect((await accept(post({}), params({ token: row!.token }))).status).toBe(200);
    });
  });
});
