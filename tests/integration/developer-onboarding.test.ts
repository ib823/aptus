// @vitest-environment node
/**
 * The whole developer onboarding path, with no database access (roadmap
 * P0.13): with COREEDGE_DEVELOPER_SIGNUP=open, a new email address signs up,
 * clicks its link, lands in Discover on the shared host, and invites a
 * colleague, who accepts and signs in — every step through the shipped routes.
 *
 * WHAT IS REAL. The sign-up route; NextAuth's own email callback (the
 * `AuthHandler` the [...nextauth] route wraps) with this app's authOptions and
 * Prisma adapter, so the account and its workspace are created exactly as a
 * click creates them; the session bridge; the WORKBENCH_ONLY middleware; the
 * Studio layout and the Discover page; the invite, accept and member-list
 * routes; PostgreSQL with the tenant guard.
 *
 * WHAT IS STOOD IN. The mailbox (sendEmail records what would be sent, and the
 * test follows the links in it, as a person would); the cookie jar
 * (`next/headers` has no request outside Next); `getServerSession`, which reads
 * the jar's NextAuth cookie with NextAuth's own `decode`; and the rate limiter
 * (every request here comes from one address).
 *
 * The test reads the database only to ASSERT what the routes did and to clean
 * up — never to make a step work.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as NextAuthModule from "next-auth";
import type * as RateLimitModule from "@/lib/security/rate-limit";

const SECRET = "developer-onboarding-test-secret-0123456789";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
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

interface Mail {
  to: { email: string } | { email: string }[];
  subject: string;
  textContent?: string;
}
const outbox = vi.hoisted(() => [] as Mail[]);
vi.mock("@/lib/email/brevo", () => ({
  sendEmail: async (mail: Mail) => {
    outbox.push(mail);
    return { messageId: `test-${outbox.length}` };
  },
  sendEmailToMany: async () => ({ sent: 0, failed: [] }),
}));

vi.mock("next-auth", async (importOriginal) => {
  const real = await importOriginal<typeof NextAuthModule>();
  const { decode } = await import("next-auth/jwt");
  return {
    ...real,
    getServerSession: async () => {
      const raw = jar.get("next-auth.session-token");
      if (!raw) return null;
      const token = await decode({ token: raw, secret: SECRET });
      return token?.userId ? { user: { id: token.userId }, expires: "" } : null;
    },
  };
});

import path from "node:path";

import { prisma } from "@/lib/db/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { POST as signup } from "@/app/api/auth/signup/route";
import { GET as bridge } from "@/app/api/auth/bridge/route";
import { GET as listMembers, POST as invite } from "@/app/api/organizations/[orgId]/users/route";
import { POST as acceptInvitation } from "@/app/api/invitations/[token]/accept/route";

/*
 * NextAuth's request handler, the one its [...nextauth] route wraps. The
 * package does not export "./core", so it is loaded by file path; the route
 * wrapper itself cannot be used here, because it reads `next/headers` with a
 * CommonJS require that no test can stand in for.
 */
interface InternalResponse {
  readonly redirect?: string;
  readonly cookies?: readonly { name: string; value: string }[];
}
const { AuthHandler } = (await import(
  /* @vite-ignore */ path.join(process.cwd(), "node_modules/next-auth/core/index.js")
)) as { AuthHandler: (params: { req: Request; options: unknown }) => Promise<InternalResponse> };

const RUN = `onboard-${randomUUID().slice(0, 8)}`;
const DEV_EMAIL = `${RUN}-dev@example.test`;
const COLLEAGUE_EMAIL = `${RUN}-colleague@example.test`;

/* ── a person's side of the conversation ─────────────────────────────────── */

function mailTo(address: string): Mail[] {
  return outbox.filter((m) => (Array.isArray(m.to) ? m.to : [m.to]).some((r) => r.email === address));
}

function linkIn(mail: Mail | undefined, pattern: RegExp): string {
  const match = pattern.exec(mail?.textContent ?? "");
  expect(match, `no link in ${mail?.subject ?? "(no mail)"}`).not.toBeNull();
  return match![0];
}

const SIGN_IN_LINK = /http:\/\/localhost\/api\/auth\/callback\/email\?\S+/;
const INVITE_LINK = /http:\/\/localhost\/invitations\/[0-9a-f]+/;

/** Click a sign-in link: NextAuth's own callback, then the session bridge. */
async function clickSignInLink(link: string): Promise<string> {
  jar.clear();
  const callback = await AuthHandler({
    req: new Request(link, { method: "GET" }),
    options: { ...authOptions, secret: SECRET },
  });
  expect(callback.redirect, "NextAuth refused the link").toBeTruthy();
  expect(callback.redirect).not.toMatch(/error=/);
  for (const cookie of callback.cookies ?? []) jar.set(cookie.name, cookie.value);
  expect(jar.has("next-auth.session-token")).toBe(true);

  const bridged = await bridge(new NextRequest(new URL(callback.redirect!, "http://localhost")));
  const session = bridged.cookies.get(SESSION_COOKIE_NAME)?.value;
  expect(session, "the bridge minted no session").toBeTruthy();
  jar.set(SESSION_COOKIE_NAME, session!);
  return new URL(bridged.headers.get("location")!).pathname;
}

function json(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

/** Depth-first search of a rendered tree for the first element of a type. */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === type) return element;
  for (const value of Object.values(element.props)) {
    const hit = find(value as ReactNode, type);
    if (hit) return hit;
  }
  return null;
}

/* ── the suite ────────────────────────────────────────────────────────────── */

describe.skipIf(!process.env.TEST_DATABASE_URL)("a developer onboards on the shared host (real PostgreSQL)", () => {
  let workspaceId = "";
  let developerSession = "";

  beforeAll(() => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "open");
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP_DOMAINS", "");
    // Production restricts the ordinary registration policy; the developer
    // sign-up must work regardless, and must not loosen it.
    vi.stubEnv("AUTH_INVITATION_ONLY", "true");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost");
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
    vi.stubEnv("SMTP_USER", "mailer");
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("WORKBENCH_HOST", "");
    // The shared host's deployment tenants: a real system declared TEST, and
    // the SAP API Hub sandbox. A developer may use only the second.
    vi.stubEnv("S4_TDD_BASE_URL", "");
    vi.stubEnv(
      "S4_TDD_TENANTS_JSON",
      JSON.stringify([
        { key: "tdd", label: "S/4HANA TDD", baseUrl: "https://my300000.s4hana.cloud.sap", environment: "TEST" },
        { key: "hub", label: "SAP API Hub sandbox", baseUrl: "https://sandbox.api.sap.com/s4hanacloud", environment: "SANDBOX" },
      ]),
    );
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    const users = await prisma.user.findMany({ where: { email: { startsWith: RUN } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: RUN } } });
    if (workspaceId) await prisma.orgInvitation.deleteMany({ where: { organizationId: workspaceId } });
    await prisma.decisionLogEntry.deleteMany({ where: { actor: { startsWith: RUN } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (workspaceId) await prisma.organization.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it("1. a new address asks for a workspace and gets a link — nothing exists yet", async () => {
    const res = await signup(json({ workspace: "developer", email: DEV_EMAIL }));

    expect(res.status).toBe(200);
    expect(mailTo(DEV_EMAIL)).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: DEV_EMAIL } })).toBe(0);
  });

  it("2. clicking it creates the account and its own workspace, and lands on Discover", async () => {
    const landed = await clickSignInLink(linkIn(mailTo(DEV_EMAIL)[0], SIGN_IN_LINK));

    expect(landed).toBe("/studio/discover");
    const account = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
    expect(account).toMatchObject({ role: "sandbox_developer", isActive: true });
    expect(account?.emailVerified).toBeInstanceOf(Date);
    expect(account?.organizationId).toBeTruthy();
    workspaceId = account!.organizationId!;
    developerSession = jar.get(SESSION_COOKIE_NAME)!;
  });

  it("3. Studio admits the developer and Discover opens on the sandbox tenant only", async () => {
    jar.clear();
    jar.set(SESSION_COOKIE_NAME, developerSession);
    const { default: StudioLayout } = await import("@/app/(studio)/layout");
    const { default: DiscoverPage } = await import("@/app/(studio)/studio/discover/page");
    const { DiscoverClient } = await import("@/components/studio/DiscoverClient");
    const { RoleGatedEmptyState } = await import("@/components/studio/RoleGatedEmptyState");
    const { StudioShell } = await import("@/components/studio/StudioShell");

    const layout = await StudioLayout({ children: "discover" });
    expect(find(layout, RoleGatedEmptyState)).toBeNull();
    const shell = find(layout, StudioShell);
    expect(shell?.props.accessibleWorkspaces).toEqual(["developer-studio"]);
    expect((shell?.props.tenants as { key: string }[]).map((t) => t.key)).toEqual(["hub"]);

    const discover = await DiscoverPage();
    const client = find(discover, DiscoverClient);
    expect(client?.props).toMatchObject({ tenant: "hub", canAuthor: false });
  });

  it("4. the developer invites a colleague — as a sandbox developer, and as nothing more", async () => {
    jar.clear();
    jar.set(SESSION_COOKIE_NAME, developerSession);
    const ctx = { params: Promise.resolve({ orgId: workspaceId }) };

    const escalate = await invite(json({ email: COLLEAGUE_EMAIL, role: "consultant" }), ctx);
    expect(escalate.status).toBe(403);

    const res = await invite(json({ email: COLLEAGUE_EMAIL, role: "sandbox_developer" }), ctx);
    expect(res.status).toBe(201);
    expect(mailTo(COLLEAGUE_EMAIL)).toHaveLength(1);

    const { default: MembersPage } = await import("@/app/(coreedge)/coreedge/members/page");
    const { InviteMember } = await import("@/components/coreedge/actions/InviteMember");
    const members = await MembersPage();
    expect(find(members, InviteMember)?.props).toMatchObject({
      organizationId: workspaceId,
      blockedBecause: null,
      roles: [{ value: "sandbox_developer", label: "Sandbox Developer" }],
    });
  });

  it("5. the colleague accepts from the email, signs in, and lands in the same workspace", async () => {
    jar.clear();
    const token = linkIn(mailTo(COLLEAGUE_EMAIL)[0], INVITE_LINK).split("/").pop()!;

    const accepted = await acceptInvitation(json({}), { params: Promise.resolve({ token }) });
    expect(accepted.status).toBe(200);

    const signInMail = mailTo(COLLEAGUE_EMAIL).find((m) => SIGN_IN_LINK.test(m.textContent ?? ""));
    const landed = await clickSignInLink(linkIn(signInMail, SIGN_IN_LINK));
    expect(landed).toBe("/studio/discover");

    const colleague = await prisma.user.findUnique({ where: { email: COLLEAGUE_EMAIL } });
    expect(colleague).toMatchObject({ role: "sandbox_developer", organizationId: workspaceId });
  });

  it("6. both appear on the member list", async () => {
    jar.clear();
    jar.set(SESSION_COOKIE_NAME, developerSession);

    const res = await listMembers(
      new NextRequest(`http://localhost/api/organizations/${workspaceId}/users`),
      { params: Promise.resolve({ orgId: workspaceId }) },
    );

    expect(res.status).toBe(200);
    const emails = ((await res.json()) as { data: { email: string }[] }).data.map((u) => u.email).sort();
    expect(emails).toEqual([COLLEAGUE_EMAIL, DEV_EMAIL].sort());
  });

  /*
   * LAST, because it resets the module registry: the middleware reads
   * WORKBENCH_ONLY once, when it is loaded, so it has to be loaded afresh with
   * the setting on. Nothing after this step may depend on module identity.
   */
  it("7. on a WORKBENCH_ONLY host, each screen on that path is reachable", async () => {
    vi.stubEnv("WORKBENCH_ONLY", "true");
    vi.resetModules();
    const { middleware } = await import("@/middleware");
    const page = (path: string) =>
      middleware(new NextRequest(`http://localhost${path}`, { headers: { cookie: `${SESSION_COOKIE_NAME}=x` } }));

    for (const path of [
      "/signup/developer",
      "/studio/discover",
      "/coreedge/members",
      "/invitations/abc",
      "/coreedge/bootstrap",
    ]) {
      const location = (await page(path)).headers.get("location");
      expect(location ?? "", `${path} was redirected`).not.toMatch(/\/workbench$/);
    }
    // The control: a portal page is still kept out on this host.
    expect((await page("/organization/users")).headers.get("location")).toMatch(/\/workbench$/);
  });
});
