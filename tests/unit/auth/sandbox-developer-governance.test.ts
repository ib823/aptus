// @vitest-environment node
/**
 * The sandbox developer is refused by every governance route (roadmap P0.13).
 *
 * The role an open sign-up grants opens Studio to READ. This holds it to that,
 * route by route, against real PostgreSQL: deciding or requesting access,
 * issuing, rotating or revoking a key, minting a write key, sending a claim
 * link, saving a connection or turning its writes on, administering accounts
 * and creating organizations — and the builder mutations beside them.
 *
 * EACH ROW IS THE DEVELOPER'S OWN, so a refusal cannot be "not found" or "not
 * your organization": it is the role. And each is tried twice — with the
 * step-up off, and with it enforcing while the developer holds a FRESH passkey
 * assertion — so the refusal is never the step-up standing in for a role gate
 * that is not there.
 *
 * Harness as tests/unit/auth/step-up-governance-routes.test.ts: real routes,
 * real session lookup, real database with the tenant guard; the cookie jar and
 * the rate limiter are stood in. Opt-in on TEST_DATABASE_URL.
 */

import { randomBytes, randomUUID } from "node:crypto";
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

// No mail leaves a test; the admin-create route sends a sign-in link.
vi.mock("@/lib/auth/send-magic-link", () => ({ sendMagicLink: async () => ({ sent: false }) }));

import { prisma } from "@/lib/db/prisma";
import { hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { POST as coreedgeDecide } from "@/app/api/coreedge/requests/[id]/decide/route";
import { POST as coreedgeRevokeKey } from "@/app/api/coreedge/keys/[clientId]/revoke/route";
import { POST as coreedgeClaimLink } from "@/app/api/coreedge/keys/claim-link/route";
import { PATCH as studioDecide, POST as studioRequest } from "@/app/api/studio/access-grants/route";
import { PATCH as studioClientsPatch, POST as studioIssue } from "@/app/api/studio/clients/route";
import { POST as studioWriteKey } from "@/app/api/studio/clients/write-credential/route";
import { PATCH as studioConnectionsPatch, POST as studioConnectionsPost } from "@/app/api/studio/connections/route";
import { POST as studioSolutionsPost } from "@/app/api/studio/solutions/route";
import { POST as studioInterfacesPost } from "@/app/api/studio/interfaces/route";
import { PATCH as controlTowerDecide } from "@/app/api/control-tower/grants/route";
import { POST as controlTowerRevoke } from "@/app/api/control-tower/grants/[grantId]/revoke/route";
import { POST as adminCreateUser } from "@/app/api/admin/users/route";
import { PATCH as adminPatchUser } from "@/app/api/admin/users/[userId]/route";
import { POST as adminCreateOrganization } from "@/app/api/admin/organizations/route";
import { canPerformGovernanceActions } from "@/lib/auth/step-up";
import { canMutateControlTower, canMutateStudio } from "@/lib/studio/rbac";
import { refuseDecision, refuseRecheck, refuseRevokeKey, refuseSendClaimLink } from "@/lib/coreedge/authz";

const RUN = `sbx-gov-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DEVELOPER = { id: `${RUN}-dev`, email: `${RUN}-dev@example.test`, role: "sandbox_developer" };
const COLLEAGUE = { id: `${RUN}-colleague`, email: `${RUN}-colleague@example.test`, role: "sandbox_developer" };
const OWNERS = { technicalOwnerId: `${RUN}-t`, businessOwnerId: `${RUN}-b`, supportOwnerId: `${RUN}-s` };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
const ENCRYPTION_KEY = "b".repeat(64);

function post(body: unknown, method = "POST") {
  return new Request("http://localhost/x", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

async function solution(): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Sandbox app",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Reads sales orders from the sandbox.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      ...OWNERS,
    },
    select: { id: true },
  });
  return s.id;
}

async function grant(
  solutionId: string,
  shape: { decision?: "REQUESTED" | "APPROVED"; operation?: "READ" | "CREATE"; environment?: string } = {},
): Promise<string> {
  const g = await prisma.apiAccessGrant.create({
    data: {
      organizationId: ORG,
      solutionId,
      externalId: "API_SALES_ORDER_SRV",
      operation: shape.operation ?? "READ",
      environment: shape.environment ?? "PROD",
      justification: "Read sales orders.",
      requestedById: `${RUN}-requester`,
      expiresAt: inDays(30),
      decision: shape.decision ?? "REQUESTED",
      ...(shape.decision === "APPROVED" ? { decidedById: `${RUN}-approver`, decidedAt: new Date() } : {}),
    },
    select: { id: true },
  });
  return g.id;
}

async function client(solutionId: string, environment = "PROD"): Promise<string> {
  const c = await prisma.solutionClient.create({
    data: {
      organizationId: ORG,
      solutionId,
      label: "App",
      tokenHash: randomBytes(32).toString("hex"),
      environment,
      createdById: `${RUN}-issuer`,
    },
    select: { id: true },
  });
  return c.id;
}

const decided = async (grantId: string) =>
  (await prisma.apiAccessGrant.findFirst({ where: { id: grantId, organizationId: ORG } }))?.decision !== "REQUESTED";
const grantRevoked = async (grantId: string) =>
  (await prisma.apiAccessGrant.findFirst({ where: { id: grantId, organizationId: ORG } }))?.revokedAt != null;
const clientChanged = async (clientId: string, tokenHash: string) => {
  const row = await prisma.solutionClient.findFirst({ where: { id: clientId, organizationId: ORG } });
  return row?.revokedAt != null || row?.tokenHash !== tokenHash || row?.secretsCiphertext != null;
};

interface RouteCase {
  readonly name: string;
  readonly seed: () => Promise<Record<string, string>>;
  readonly call: (ctx: Record<string, string>) => Promise<Response>;
  readonly wrote: (ctx: Record<string, string>) => Promise<boolean>;
}

async function seededClient(environment = "PROD") {
  const solutionId = await solution();
  const clientId = await client(solutionId, environment);
  const row = await prisma.solutionClient.findFirst({ where: { id: clientId, organizationId: ORG } });
  return { solutionId, clientId, tokenHash: row?.tokenHash ?? "" };
}

const ROUTES: readonly RouteCase[] = [
  {
    name: "POST /api/coreedge/requests/[id]/decide (approve)",
    seed: async () => ({ grantId: await grant(await solution()) }),
    call: (ctx) => coreedgeDecide(post({ decision: "APPROVED" }), params({ id: ctx.grantId! })),
    wrote: (ctx) => decided(ctx.grantId!),
  },
  {
    name: "PATCH /api/studio/access-grants (approve)",
    seed: async () => ({ grantId: await grant(await solution()) }),
    call: (ctx) => studioDecide(post({ grantId: ctx.grantId, decision: "APPROVED" }, "PATCH")),
    wrote: (ctx) => decided(ctx.grantId!),
  },
  {
    name: "PATCH /api/control-tower/grants (approve)",
    seed: async () => ({ grantId: await grant(await solution()) }),
    call: (ctx) => controlTowerDecide(post({ grantId: ctx.grantId, decision: "APPROVED" }, "PATCH")),
    wrote: (ctx) => decided(ctx.grantId!),
  },
  {
    name: "POST /api/control-tower/grants/[grantId]/revoke",
    seed: async () => ({ grantId: await grant(await solution(), { decision: "APPROVED" }) }),
    call: (ctx) =>
      controlTowerRevoke(post({ reason: "The client withdrew consent today." }), params({ grantId: ctx.grantId! })),
    wrote: (ctx) => grantRevoked(ctx.grantId!),
  },
  {
    name: "POST /api/studio/access-grants (request access)",
    seed: async () => ({ solutionId: await solution() }),
    call: (ctx) =>
      studioRequest(
        post({
          solutionId: ctx.solutionId,
          externalId: "API_SALES_ORDER_SRV",
          operation: "READ",
          environment: "PROD",
          justification: "Read sales orders for the app.",
        }),
      ),
    wrote: async (ctx) =>
      (await prisma.apiAccessGrant.count({ where: { organizationId: ORG, solutionId: ctx.solutionId! } })) > 0,
  },
  {
    name: "POST /api/studio/clients (issue a PROD key)",
    seed: async () => ({ solutionId: await solution() }),
    call: (ctx) => studioIssue(post({ solutionId: ctx.solutionId, label: "App", environment: "PROD" })),
    wrote: async (ctx) =>
      (await prisma.solutionClient.count({ where: { organizationId: ORG, solutionId: ctx.solutionId! } })) > 0,
  },
  {
    name: "POST /api/studio/clients (issue a SANDBOX key)",
    seed: async () => ({ solutionId: await solution() }),
    call: (ctx) => studioIssue(post({ solutionId: ctx.solutionId, label: "App", environment: "SANDBOX" })),
    wrote: async (ctx) =>
      (await prisma.solutionClient.count({ where: { organizationId: ORG, solutionId: ctx.solutionId! } })) > 0,
  },
  {
    name: "PATCH /api/studio/clients (rotate)",
    seed: () => seededClient(),
    call: (ctx) => studioClientsPatch(post({ clientId: ctx.clientId, action: "rotate" }, "PATCH")),
    wrote: (ctx) => clientChanged(ctx.clientId!, ctx.tokenHash!),
  },
  {
    name: "PATCH /api/studio/clients (revoke)",
    seed: () => seededClient(),
    call: (ctx) => studioClientsPatch(post({ clientId: ctx.clientId, action: "revoke" }, "PATCH")),
    wrote: (ctx) => clientChanged(ctx.clientId!, ctx.tokenHash!),
  },
  {
    name: "POST /api/coreedge/keys/[clientId]/revoke",
    seed: () => seededClient(),
    call: (ctx) =>
      coreedgeRevokeKey(post({ reason: "Rotating after a suspected leak." }), params({ clientId: ctx.clientId! })),
    wrote: (ctx) => clientChanged(ctx.clientId!, ctx.tokenHash!),
  },
  {
    name: "POST /api/studio/clients/write-credential",
    seed: async () => {
      const seeded = await seededClient("DEV");
      await grant(seeded.solutionId, { decision: "APPROVED", operation: "CREATE", environment: "DEV" });
      return seeded;
    },
    call: (ctx) => studioWriteKey(post({ solutionId: ctx.solutionId, environment: "DEV" })),
    wrote: (ctx) => clientChanged(ctx.clientId!, ctx.tokenHash!),
  },
  {
    name: "POST /api/coreedge/keys/claim-link",
    seed: async () => ({ solutionId: await solution() }),
    call: (ctx) => coreedgeClaimLink(post({ solutionId: ctx.solutionId, environment: "PROD" })),
    wrote: async (ctx) =>
      (await prisma.keyClaimLink.count({ where: { organizationId: ORG, solutionId: ctx.solutionId! } })) > 0,
  },
  {
    name: "POST /api/studio/connections (save a PROD connection)",
    seed: async () => ({ key: `p${randomUUID().slice(0, 8)}` }),
    call: (ctx) =>
      studioConnectionsPost(
        post({
          product: "s4hana",
          key: ctx.key,
          label: "Client production",
          baseUrl: "https://my300000.s4hana.cloud.sap",
          environment: "PROD",
          authType: "basic",
          username: "COREEDGE_USER",
          password: "a-password-nobody-reads",
        }),
      ),
    wrote: async (ctx) => (await prisma.sapConnection.count({ where: { organizationId: ORG, key: ctx.key! } })) > 0,
  },
  {
    name: "POST /api/studio/connections (save a SANDBOX connection)",
    seed: async () => ({ key: `s${randomUUID().slice(0, 8)}` }),
    call: (ctx) =>
      studioConnectionsPost(
        post({
          product: "s4hana",
          key: ctx.key,
          label: "API Hub sandbox",
          baseUrl: "https://sandbox.api.sap.com/s4hanacloud",
          environment: "SANDBOX",
          authType: "api-key",
          apiKey: "an-api-hub-key",
        }),
      ),
    wrote: async (ctx) => (await prisma.sapConnection.count({ where: { organizationId: ORG, key: ctx.key! } })) > 0,
  },
  {
    name: "PATCH /api/studio/connections (turn writes on)",
    seed: async () => {
      const c = await prisma.sapConnection.create({
        data: {
          organizationId: ORG,
          product: "s4hana",
          key: `w${randomUUID().slice(0, 8)}`,
          label: "Writable, parked",
          baseUrl: "https://sandbox.api.sap.com/s4hanacloud",
          authType: "basic",
          secretsCiphertext: "sealed-elsewhere",
          writeEnabled: true,
          isActive: false,
        },
        select: { id: true },
      });
      return { connectionId: c.id };
    },
    call: (ctx) => studioConnectionsPatch(post({ id: ctx.connectionId, isActive: true }, "PATCH")),
    wrote: async (ctx) =>
      (await prisma.sapConnection.findFirst({ where: { id: ctx.connectionId!, organizationId: ORG } }))?.isActive === true,
  },
  {
    name: "POST /api/studio/solutions (register an app)",
    seed: async () => ({ slug: `${RUN}-new-${randomUUID().slice(0, 6)}` }),
    call: (ctx) =>
      studioSolutionsPost(
        post({
          name: "New app",
          slug: ctx.slug,
          classification: "CLIENT_APP",
          businessProblem: "Something worth solving.",
          dataClass: "INTERNAL",
        }),
      ),
    wrote: async (ctx) => (await prisma.solution.count({ where: { organizationId: ORG, slug: ctx.slug! } })) > 0,
  },
  {
    name: "POST /api/studio/interfaces (define a data feed)",
    seed: async () => ({ solutionId: await solution() }),
    call: (ctx) =>
      studioInterfacesPost(
        post({ solutionId: ctx.solutionId, name: "Orders", externalId: "API_SALES_ORDER_SRV", operation: "READ" }),
      ),
    wrote: async (ctx) =>
      (await prisma.interface.count({ where: { organizationId: ORG, solutionId: ctx.solutionId! } })) > 0,
  },
  {
    name: "POST /api/admin/users (create an approver)",
    seed: async () => ({ email: `${RUN}-made-${randomUUID().slice(0, 6)}@example.test` }),
    call: (ctx) => adminCreateUser(post({ email: ctx.email, name: "Approver", role: "consultant" })),
    wrote: async (ctx) => (await prisma.user.count({ where: { email: ctx.email! } })) > 0,
  },
  {
    name: "PATCH /api/admin/users/[userId] (promote a colleague)",
    seed: async () => ({ userId: COLLEAGUE.id }),
    call: (ctx) => adminPatchUser(post({ role: "platform_admin" }, "PATCH"), params({ userId: ctx.userId! })),
    wrote: async () => (await prisma.user.findUnique({ where: { id: COLLEAGUE.id } }))?.role !== "sandbox_developer",
  },
  {
    name: "POST /api/admin/organizations",
    seed: async () => ({ name: `${RUN} new organization ${randomUUID().slice(0, 6)}` }),
    call: (ctx) => adminCreateOrganization(post({ name: ctx.name })),
    wrote: async (ctx) => (await prisma.organization.count({ where: { name: ctx.name! } })) > 0,
  },
];

describe("the role itself", () => {
  it("holds no governance capability anywhere it is asked", () => {
    expect(canMutateStudio("sandbox_developer")).toBe(false);
    expect(canMutateControlTower("sandbox_developer")).toBe(false);
    expect(canPerformGovernanceActions("sandbox_developer")).toBe(false);
    expect(refuseSendClaimLink("sandbox_developer")).toBe("noPermission");
    expect(refuseRevokeKey("sandbox_developer")).toBe("noPermission");
    expect(refuseRecheck("sandbox_developer")).toBe("noPermission");
    expect(
      refuseDecision({ role: "sandbox_developer", userId: "u", requestedById: "x", ownerIds: [], expiresAt: new Date() }),
    ).toBe("noPermission");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("every governance route refuses a sandbox developer (real PostgreSQL)", () => {
  let token = "";

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Developer workspace", type: "client", orgType: "client" } });
    for (const person of [DEVELOPER, COLLEAGUE]) {
      await prisma.user.create({ data: { ...person, name: person.role, organizationId: ORG, emailVerified: new Date() } });
    }
    token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: { userId: DEVELOPER.id, tokenHash: hashSessionToken(token), expiresAt: inDays(1) },
    });
    // A passkey, so "enforce with a fresh assertion" is a step-up the person
    // really passed — the role is then the only thing left to refuse them.
    await prisma.webAuthnCredential.create({
      data: {
        userId: DEVELOPER.id,
        credentialId: `${DEVELOPER.id}-passkey`,
        publicKey: Buffer.from("not-a-real-key"),
        counter: 0,
        transports: [],
      },
    });
  });

  afterAll(async () => {
    const userIds = [DEVELOPER.id, COLLEAGUE.id];
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.platformGovernanceAudit.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.keyClaimLink.deleteMany({ where: { organizationId: ORG } });
    await prisma.solutionClient.deleteMany({ where: { organizationId: ORG } });
    await prisma.apiAccessGrant.deleteMany({ where: { organizationId: ORG } });
    await prisma.interface.deleteMany({ where: { organizationId: ORG } });
    await prisma.solution.deleteMany({ where: { organizationId: ORG } });
    await prisma.sapConnection.deleteMany({ where: { organizationId: ORG } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.webAuthnCredential.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.organization.deleteMany({ where: { OR: [{ id: ORG }, { name: { startsWith: RUN } }] } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    jar.clear();
    jar.set(SESSION_COOKIE_NAME, token);
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", ENCRYPTION_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each(ROUTES)("$name", (route) => {
    it("refuses with the step-up off, and writes nothing", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "off");
      const ctx = await route.seed();

      const res = await route.call(ctx);

      expect(res.status).toBe(403);
      expect(await route.wrote(ctx)).toBe(false);
    });

    it("refuses even with a fresh passkey assertion under enforce: the role, not the step-up, says no", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      await prisma.session.updateMany({ where: { userId: DEVELOPER.id }, data: { passkeyAssertedAt: new Date() } });
      const ctx = await route.seed();

      const res = await route.call(ctx);

      expect(res.status).toBe(403);
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
      expect(String(body.error?.code ?? "")).not.toMatch(/^STEP_UP_/);
      expect(await route.wrote(ctx)).toBe(false);
    });
  });
});
