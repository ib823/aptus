// @vitest-environment node
/**
 * Every governance route, end to end, against real PostgreSQL: the passkey
 * step-up (roadmap P0.12, lib/auth/step-up.ts).
 *
 * WHAT IS REAL. The routes, the session lookup from the cookie, the database
 * (with the tenant guard the application's client carries), the step-up
 * options and verify routes, the challenge cookie and the audit rows. What is
 * not: the cookie jar (`next/headers` has no request outside Next), the rate
 * limiter (every case here comes from one address), and the WebAuthn
 * SIGNATURE check — there is no authenticator in a test process, so
 * `verifyAuthenticationResponse` answers "verified". Everything around that
 * one call, including which credential may answer for which person, is the
 * shipped code.
 *
 * PER ROUTE, THE ACCEPTANCE THE ROADMAP STATES:
 *   enforce, no assertion          → 403 STEP_UP_REQUIRED, nothing written
 *   enforce, an assertion too old  → 403, nothing written
 *   enforce, after a step-up       → the route's success status, the write lands
 *   warn (the default), none       → success, plus a StepUp/STEP_UP_MISSING row
 *   a personal or CI token         → 403 STEP_UP_TOKEN_REFUSED in EVERY mode,
 *                                    off included, even with a fresh assertion
 *
 * Opt-in on TEST_DATABASE_URL, like the other real-PostgreSQL tests; never an
 * application's DATABASE_URL. Rows are namespaced per run and removed after.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionModule from "@/lib/auth/session";
import type * as WebAuthnModule from "@/lib/auth/webauthn";
import type * as RateLimitModule from "@/lib/security/rate-limit";

/* ── the request scope Next would provide ─────────────────────────────────── */

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

vi.mock("@/lib/auth/webauthn", async (importOriginal) => ({
  ...(await importOriginal<typeof WebAuthnModule>()),
  // The one stand-in: no authenticator, so the signature is taken as good.
  verifyAuthenticationResponse: async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }),
}));

/*
 * A TOKEN CALLER, when a test asks for one. Today every caller is a cookie
 * session; the token features (P2.11a, P3.2, P3.3) will produce a SessionUser
 * with another `authMethod`, and this is where such a caller is stood in.
 */
const tokenCaller = vi.hoisted(() => ({ kind: null as null | "personal_token" | "ci_token" }));
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const real = await importOriginal<typeof SessionModule>();
  return {
    ...real,
    getCurrentUser: async () => {
      const user = await real.getCurrentUser();
      if (!user || tokenCaller.kind === null) return user;
      return { ...user, authMethod: tokenCaller.kind, passkeyAssertedAt: new Date() };
    },
  };
});

import { prisma } from "@/lib/db/prisma";
import { hashSessionToken, markSessionPasskeyAsserted, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { POST as stepUpOptions } from "@/app/api/auth/webauthn/step-up/options/route";
import { POST as stepUpVerify } from "@/app/api/auth/webauthn/step-up/verify/route";
import { POST as coreedgeDecide } from "@/app/api/coreedge/requests/[id]/decide/route";
import { POST as coreedgeRevokeKey } from "@/app/api/coreedge/keys/[clientId]/revoke/route";
import { POST as coreedgeClaimLink } from "@/app/api/coreedge/keys/claim-link/route";
import { PATCH as studioDecide } from "@/app/api/studio/access-grants/route";
import { PATCH as studioClientsPatch, POST as studioIssue } from "@/app/api/studio/clients/route";
import { POST as studioWriteKey } from "@/app/api/studio/clients/write-credential/route";
import { PATCH as studioConnectionsPatch, POST as studioConnectionsPost } from "@/app/api/studio/connections/route";
import { PATCH as controlTowerDecide } from "@/app/api/control-tower/grants/route";
import { POST as controlTowerRevoke } from "@/app/api/control-tower/grants/[grantId]/revoke/route";
import { POST as adminCreateOrganization } from "@/app/api/admin/organizations/route";

const RUN = `step-up-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const BUILDER = { id: `${RUN}-builder`, email: `${RUN}-builder@abeam.test`, role: "consultant" };
const ADMIN = { id: `${RUN}-admin`, email: `${RUN}-admin@abeam.test`, role: "platform_admin" };
const NO_PASSKEY = { id: `${RUN}-nopk`, email: `${RUN}-nopk@abeam.test`, role: "consultant" };
type Person = typeof BUILDER;

const OWNERS = { technicalOwnerId: `${RUN}-t`, businessOwnerId: `${RUN}-b`, supportOwnerId: `${RUN}-s` };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
const ENCRYPTION_KEY = "a".repeat(64);

/* ── sessions ─────────────────────────────────────────────────────────────── */

const tokens = new Map<string, string>();

async function signIn(person: Person): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { userId: person.id, tokenHash: hashSessionToken(token), expiresAt: inDays(1) },
  });
  tokens.set(person.id, token);
}

function as(person: Person): void {
  jar.clear();
  jar.set(SESSION_COOKIE_NAME, tokens.get(person.id) ?? "");
}

/** Set this person's last passkey assertion directly (null, or seconds ago). */
async function assertedSecondsAgo(person: Person, seconds: number | null): Promise<void> {
  await prisma.session.updateMany({
    where: { userId: person.id },
    data: { passkeyAssertedAt: seconds === null ? null : new Date(Date.now() - seconds * 1000) },
  });
}

/**
 * The console's step-up, through the shipped routes: options (which sets the
 * challenge cookie), then verify (which stamps the session and rotates its
 * token — the jar takes the new cookie, as a browser would).
 */
async function stepUp(): Promise<void> {
  const options = await stepUpOptions(post("http://localhost/api/auth/webauthn/step-up/options", {}));
  expect(options.status).toBe(200);
  const credential = await prisma.webAuthnCredential.findFirst({
    where: { user: { email: BUILDER.email } },
    select: { credentialId: true },
  });
  const verified = await stepUpVerify(
    post("http://localhost/api/auth/webauthn/step-up/verify", {
      response: { id: credential?.credentialId, rawId: credential?.credentialId, type: "public-key" },
    }),
  );
  expect(verified.status).toBe(200);
  const rotated = verified.cookies.get(SESSION_COOKIE_NAME)?.value;
  expect(rotated).toBeTruthy();
  jar.set(SESSION_COOKIE_NAME, rotated ?? "");
  tokens.set(BUILDER.id, rotated ?? "");
}

function post(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

/* ── seed rows ────────────────────────────────────────────────────────────── */

async function solution(): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Order portal",
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Raises sales orders from the client's portal.",
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
  // Bound to an interface, as every grant is since P0.1 (lib/studio/grant-binding.ts).
  const operation = shape.operation ?? "READ";
  const iface = await prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId,
      name: "Sales orders",
      sapProduct: "s4hana",
      externalId: "API_SALES_ORDER_SRV",
      operation,
      entitySet: "A_SalesOrder",
      mode: operation === "READ" ? "READ" : "WRITE",
    },
    select: { id: true },
  });
  const g = await prisma.apiAccessGrant.create({
    data: {
      organizationId: ORG,
      solutionId,
      interfaceId: iface.id,
      sapProduct: "s4hana",
      externalId: "API_SALES_ORDER_SRV",
      operation,
      environment: shape.environment ?? "TEST",
      justification: "Read sales orders for the portal.",
      requestedById: `${RUN}-requester`,
      expiresAt: inDays(30),
      decision: shape.decision ?? "REQUESTED",
      ...(shape.decision === "APPROVED" ? { decidedById: `${RUN}-approver`, decidedAt: new Date() } : {}),
    },
    select: { id: true },
  });
  return g.id;
}

async function client(solutionId: string, environment = "TEST"): Promise<string> {
  const c = await prisma.solutionClient.create({
    data: {
      organizationId: ORG,
      solutionId,
      label: "Portal",
      tokenHash: randomBytes(32).toString("hex"),
      environment,
      createdById: `${RUN}-issuer`,
    },
    select: { id: true },
  });
  return c.id;
}

/* ── the routes, each with how to tell whether it wrote ───────────────────── */

interface RouteCase {
  readonly name: string;
  readonly action: string;
  readonly person: Person;
  readonly okStatus: number;
  readonly seed: () => Promise<Record<string, string>>;
  readonly call: (ctx: Record<string, string>) => Promise<Response>;
  readonly wrote: (ctx: Record<string, string>) => Promise<boolean>;
}

const decided = async (grantId: string) =>
  (await prisma.apiAccessGrant.findFirst({ where: { id: grantId, organizationId: ORG } }))?.decision !== "REQUESTED";
const grantRevoked = async (grantId: string) =>
  (await prisma.apiAccessGrant.findFirst({ where: { id: grantId, organizationId: ORG } }))?.revokedAt != null;
const clientRevoked = async (clientId: string) =>
  (await prisma.solutionClient.findFirst({ where: { id: clientId, organizationId: ORG } }))?.revokedAt != null;

const ROUTES: readonly RouteCase[] = [
  {
    name: "POST /api/coreedge/requests/[id]/decide",
    action: "grant.decide",
    person: BUILDER,
    okStatus: 200,
    seed: async () => ({ grantId: await grant(await solution()) }),
    call: (ctx) =>
      coreedgeDecide(post("http://localhost/x", { decision: "APPROVED" }), params({ id: ctx.grantId! })),
    wrote: (ctx) => decided(ctx.grantId!),
  },
  {
    name: "PATCH /api/studio/access-grants",
    action: "grant.decide",
    person: BUILDER,
    okStatus: 200,
    seed: async () => ({ grantId: await grant(await solution()) }),
    call: (ctx) => studioDecide(post("http://localhost/x", { grantId: ctx.grantId, decision: "APPROVED" }, "PATCH")),
    wrote: (ctx) => decided(ctx.grantId!),
  },
  {
    name: "PATCH /api/control-tower/grants",
    action: "grant.decide",
    person: ADMIN,
    okStatus: 200,
    seed: async () => ({ grantId: await grant(await solution()) }),
    call: (ctx) =>
      controlTowerDecide(post("http://localhost/x", { grantId: ctx.grantId, decision: "APPROVED" }, "PATCH")),
    wrote: (ctx) => decided(ctx.grantId!),
  },
  {
    name: "POST /api/control-tower/grants/[grantId]/revoke",
    action: "grant.revoke",
    person: ADMIN,
    okStatus: 200,
    seed: async () => ({ grantId: await grant(await solution(), { decision: "APPROVED" }) }),
    call: (ctx) =>
      controlTowerRevoke(
        post("http://localhost/x", { reason: "The client withdrew consent today." }),
        params({ grantId: ctx.grantId! }),
      ),
    wrote: (ctx) => grantRevoked(ctx.grantId!),
  },
  {
    name: "POST /api/studio/clients (issue)",
    action: "credential.issue",
    person: BUILDER,
    okStatus: 201,
    seed: async () => ({ solutionId: await solution() }),
    call: (ctx) =>
      studioIssue(post("http://localhost/x", { solutionId: ctx.solutionId, label: "Portal", environment: "TEST" })),
    wrote: async (ctx) =>
      (await prisma.solutionClient.count({ where: { organizationId: ORG, solutionId: ctx.solutionId! } })) > 0,
  },
  {
    name: "PATCH /api/studio/clients (rotate)",
    action: "credential.rotate",
    person: BUILDER,
    okStatus: 200,
    seed: async () => {
      const clientId = await client(await solution());
      const row = await prisma.solutionClient.findFirst({ where: { id: clientId, organizationId: ORG } });
      return { clientId, tokenHash: row?.tokenHash ?? "" };
    },
    call: (ctx) => studioClientsPatch(post("http://localhost/x", { clientId: ctx.clientId, action: "rotate" }, "PATCH")),
    wrote: async (ctx) =>
      (await prisma.solutionClient.findFirst({ where: { id: ctx.clientId!, organizationId: ORG } }))?.tokenHash !==
      ctx.tokenHash,
  },
  {
    name: "PATCH /api/studio/clients (revoke)",
    action: "credential.revoke",
    person: BUILDER,
    okStatus: 200,
    seed: async () => ({ clientId: await client(await solution()) }),
    call: (ctx) => studioClientsPatch(post("http://localhost/x", { clientId: ctx.clientId, action: "revoke" }, "PATCH")),
    wrote: (ctx) => clientRevoked(ctx.clientId!),
  },
  {
    name: "POST /api/coreedge/keys/[clientId]/revoke",
    action: "credential.revoke",
    person: BUILDER,
    okStatus: 200,
    seed: async () => ({ clientId: await client(await solution()) }),
    call: (ctx) =>
      coreedgeRevokeKey(
        post("http://localhost/x", { reason: "Rotating after a suspected leak." }),
        params({ clientId: ctx.clientId! }),
      ),
    wrote: (ctx) => clientRevoked(ctx.clientId!),
  },
  {
    name: "POST /api/studio/clients/write-credential",
    action: "write_key.issue",
    person: BUILDER,
    okStatus: 201,
    seed: async () => {
      const solutionId = await solution();
      const clientId = await client(solutionId, "DEV");
      await grant(solutionId, { decision: "APPROVED", operation: "CREATE", environment: "DEV" });
      return { solutionId, clientId };
    },
    call: (ctx) => studioWriteKey(post("http://localhost/x", { solutionId: ctx.solutionId, environment: "DEV" })),
    wrote: async (ctx) =>
      (await prisma.solutionClient.findFirst({ where: { id: ctx.clientId!, organizationId: ORG } }))
        ?.secretsCiphertext != null,
  },
  {
    name: "POST /api/coreedge/keys/claim-link",
    action: "claim_link.send",
    person: BUILDER,
    okStatus: 200,
    seed: async () => ({ solutionId: await solution() }),
    call: (ctx) => coreedgeClaimLink(post("http://localhost/x", { solutionId: ctx.solutionId, environment: "TEST" })),
    wrote: async (ctx) =>
      (await prisma.keyClaimLink.count({ where: { organizationId: ORG, solutionId: ctx.solutionId! } })) > 0,
  },
  {
    name: "POST /api/studio/connections (save secrets)",
    action: "connection.save_secrets",
    person: BUILDER,
    okStatus: 200,
    seed: async () => ({ key: `k${randomUUID().slice(0, 8)}` }),
    call: (ctx) =>
      studioConnectionsPost(
        post("http://localhost/x", {
          product: "s4hana",
          key: ctx.key,
          label: "Client sandbox",
          baseUrl: "https://sandbox.api.sap.com/s4hanacloud",
          authType: "basic",
          username: "COREEDGE_USER",
          password: "a-password-nobody-reads",
        }),
      ),
    wrote: async (ctx) => (await prisma.sapConnection.count({ where: { organizationId: ORG, key: ctx.key! } })) > 0,
  },
  {
    name: "PATCH /api/studio/connections (turns writes back on)",
    action: "connection.enable_writes",
    person: BUILDER,
    okStatus: 200,
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
    call: (ctx) => studioConnectionsPatch(post("http://localhost/x", { id: ctx.connectionId, isActive: true }, "PATCH")),
    wrote: async (ctx) =>
      (await prisma.sapConnection.findFirst({ where: { id: ctx.connectionId!, organizationId: ORG } }))?.isActive === true,
  },
  {
    // P0.3: the Connections form's "Allow writes" — a save that turns writes
    // on is the governance action it is, not a secret save.
    name: "POST /api/studio/connections (a save that allows writes)",
    action: "connection.enable_writes",
    person: BUILDER,
    okStatus: 200,
    seed: async () => ({ key: `aw${randomUUID().slice(0, 8)}` }),
    call: (ctx) =>
      studioConnectionsPost(
        post("http://localhost/x", {
          product: "s4hana",
          key: ctx.key,
          label: "Client DEV, writing",
          baseUrl: "https://sandbox.api.sap.com/s4hanacloud",
          authType: "basic",
          username: "COREEDGE_USER",
          password: "a-password-nobody-reads",
          // No environment: every case in this table seeds its own row, and
          // two active rows may not both claim one environment for a product.
          writeEnabled: true,
          writeSecret: "a-write-secret-nobody-reads",
        }),
      ),
    wrote: async (ctx) =>
      (await prisma.sapConnection.findFirst({ where: { organizationId: ORG, key: ctx.key! } }))?.writeEnabled === true,
  },
  {
    // P0.13: creating a tenant is a platform-level governance act.
    name: "POST /api/admin/organizations",
    action: "org.create",
    person: ADMIN,
    okStatus: 201,
    seed: async () => ({ name: `${RUN} organization ${randomUUID().slice(0, 8)}` }),
    call: (ctx) => adminCreateOrganization(post("http://localhost/x", { name: ctx.name, orgType: "client" })),
    wrote: async (ctx) => (await prisma.organization.count({ where: { name: ctx.name! } })) > 0,
  },
];

async function stepUpMissingRows(action: string, targetActor: string) {
  return prisma.configAudit.findMany({
    where: {
      organizationId: ORG,
      action: "STEP_UP_MISSING",
      actorId: targetActor,
      after: { path: ["governanceAction"], equals: action },
    },
    orderBy: { at: "asc" },
  });
}

/* ── the suite ────────────────────────────────────────────────────────────── */

describe.skipIf(!process.env.TEST_DATABASE_URL)("governance routes need a fresh passkey (real PostgreSQL)", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Step-up test", type: "client" } });
    for (const person of [BUILDER, ADMIN, NO_PASSKEY]) {
      await prisma.user.create({ data: { ...person, name: person.role, organizationId: ORG } });
      await signIn(person);
    }
    // The app's owners are live members: a departed owner fills no slot (A69).
    for (const id of Object.values(OWNERS)) {
      await prisma.user.create({ data: { id, email: `${id}@abeam.test`, name: "Owner", role: "consultant", organizationId: ORG } });
    }
    for (const person of [BUILDER, ADMIN]) {
      await prisma.webAuthnCredential.create({
        data: {
          userId: person.id,
          credentialId: `${person.id}-passkey`,
          publicKey: Buffer.from("not-a-real-key"),
          counter: 0,
          transports: [],
        },
      });
    }
  });

  afterAll(async () => {
    const userIds = [BUILDER.id, ADMIN.id, NO_PASSKEY.id, ...Object.values(OWNERS)];
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.webAuthnCredential.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.keyClaimLink.deleteMany({ where: { organizationId: ORG } });
    await prisma.platformGovernanceAudit.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.organization.deleteMany({ where: { name: { startsWith: RUN } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    tokenCaller.kind = null;
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", ENCRYPTION_KEY);
    for (const person of [BUILDER, ADMIN, NO_PASSKEY]) await assertedSecondsAgo(person, null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each(ROUTES)("$name", (route) => {
    it("enforce: 403 without an assertion, and nothing is written", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      const ctx = await route.seed();
      as(route.person);

      const res = await route.call(ctx);

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string; message: string; stepUp: { action: string } } };
      expect(body.error.code).toBe("STEP_UP_REQUIRED");
      expect(body.error.stepUp.action).toBe(route.action);
      expect(body.error.message).toMatch(/passkey/);
      expect(await route.wrote(ctx)).toBe(false);
    });

    it("enforce: 403 when the last assertion is older than five minutes", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      const ctx = await route.seed();
      await assertedSecondsAgo(route.person, 6 * 60);
      as(route.person);

      const res = await route.call(ctx);

      expect(res.status).toBe(403);
      expect(await route.wrote(ctx)).toBe(false);
    });

    it("enforce: succeeds once the person has stepped up, and records no missing step-up", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      const ctx = await route.seed();
      as(route.person);
      if (route.person === BUILDER) {
        await stepUp(); // through the shipped options and verify routes
      } else {
        await assertedSecondsAgo(route.person, 10);
      }

      const res = await route.call(ctx);

      expect(res.status).toBe(route.okStatus);
      expect(await route.wrote(ctx)).toBe(true);
    });

    it("warn (the default): succeeds, and leaves a durable step-up-missing audit row", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      const before = (await stepUpMissingRows(route.action, route.person.id)).length;
      const ctx = await route.seed();
      as(route.person);

      const res = await route.call(ctx);

      expect(res.status).toBe(route.okStatus);
      expect(await route.wrote(ctx)).toBe(true);
      const rows = await stepUpMissingRows(route.action, route.person.id);
      expect(rows).toHaveLength(before + 1);
      expect(rows.at(-1)?.after).toMatchObject({
        event: "step_up_missing",
        governanceAction: route.action,
        mode: "warn",
        reason: "never_asserted",
      });
      // Filed under the row acted on, which the trail returns (it never
      // returns `after`), so a reviewer can tie it to that grant, key or
      // connection. Only a route with no row yet files it as StepUp.
      const last = rows.at(-1);
      const targetId = (last?.after as { targetId?: string | null } | undefined)?.targetId;
      if (targetId) {
        expect(last?.entityId).toBe(targetId);
        expect(last?.entityType).not.toBe("StepUp");
      } else {
        expect(last).toMatchObject({ entityType: "StepUp", entityId: route.action });
      }
    });

    it.each(["off", "warn", "enforce"])("a personal or CI token is refused with COREEDGE_STEP_UP=%s", async (mode) => {
      vi.stubEnv("COREEDGE_STEP_UP", mode);
      for (const kind of ["personal_token", "ci_token"] as const) {
        tokenCaller.kind = kind;
        const ctx = await route.seed();
        as(route.person);

        const res = await route.call(ctx);

        expect(res.status).toBe(403);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe("STEP_UP_TOKEN_REFUSED");
        expect(await route.wrote(ctx)).toBe(false);
      }
    });
  });

  it("a person with no passkey is asked to enrol, not to verify", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    const grantId = await grant(await solution());
    as(NO_PASSKEY);

    const res = await coreedgeDecide(post("http://localhost/x", { decision: "APPROVED" }), params({ id: grantId }));

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("STEP_UP_ENROLMENT_REQUIRED");
    // And the step-up itself says the same, rather than offering a challenge no
    // authenticator can answer.
    const options = await stepUpOptions(post("http://localhost/api/auth/webauthn/step-up/options", {}));
    expect(options.status).toBe(409);
    expect(((await options.json()) as { error: { code: string } }).error.code).toBe("STEP_UP_ENROLMENT_REQUIRED");
  });

  it("warn mode records the reason a person with no passkey could not step up", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    const grantId = await grant(await solution());
    as(NO_PASSKEY);

    const res = await coreedgeDecide(post("http://localhost/x", { decision: "REJECTED" }), params({ id: grantId }));

    expect(res.status).toBe(200);
    const rows = await stepUpMissingRows("grant.decide", NO_PASSKEY.id);
    expect(rows.at(-1)?.after).toMatchObject({ reason: "no_passkey", targetId: grantId });
    expect(rows.at(-1)).toMatchObject({ entityType: "ApiAccessGrant", entityId: grantId });
  });

  it("a fresh assertion in warn mode records nothing", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    const grantId = await grant(await solution());
    await assertedSecondsAgo(BUILDER, 30);
    as(BUILDER);
    const before = (await stepUpMissingRows("grant.decide", BUILDER.id)).length;

    const res = await studioDecide(post("http://localhost/x", { grantId, decision: "APPROVED" }, "PATCH"));

    expect(res.status).toBe(200);
    expect(await stepUpMissingRows("grant.decide", BUILDER.id)).toHaveLength(before);
  });

  it("off: nothing is asked and nothing is recorded", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    const grantId = await grant(await solution());
    as(BUILDER);
    const before = await prisma.configAudit.count({ where: { organizationId: ORG, entityType: "StepUp" } });

    const res = await studioDecide(post("http://localhost/x", { grantId, decision: "APPROVED" }, "PATCH"));

    expect(res.status).toBe(200);
    expect(await prisma.configAudit.count({ where: { organizationId: ORG, entityType: "StepUp" } })).toBe(before);
  });

  it("the step-up verify refuses another person's passkey, and stamps nothing", async () => {
    as(BUILDER);
    await stepUpOptions(post("http://localhost/api/auth/webauthn/step-up/options", {}));

    const res = await stepUpVerify(
      post("http://localhost/api/auth/webauthn/step-up/verify", {
        response: { id: `${ADMIN.id}-passkey`, rawId: `${ADMIN.id}-passkey`, type: "public-key" },
      }),
    );

    expect(res.status).toBe(403);
    const session = await prisma.session.findFirst({ where: { userId: BUILDER.id } });
    expect(session?.passkeyAssertedAt).toBeNull();
  });

  it("the step-up verify needs a challenge it issued, once", async () => {
    as(BUILDER);
    // No options call, so no challenge cookie: a replayed assertion has nothing to match.
    const res = await stepUpVerify(
      post("http://localhost/api/auth/webauthn/step-up/verify", {
        response: { id: `${BUILDER.id}-passkey`, rawId: `${BUILDER.id}-passkey`, type: "public-key" },
      }),
    );

    expect(res.status).toBe(400);
    const session = await prisma.session.findFirst({ where: { userId: BUILDER.id } });
    expect(session?.passkeyAssertedAt).toBeNull();
  });

  it("a passkey sign-in counts as a step-up for the next five minutes", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    const grantId = await grant(await solution());
    // What /api/auth/webauthn/authenticate/verify does to the session it mints.
    await markSessionPasskeyAsserted(tokens.get(BUILDER.id) ?? "");
    as(BUILDER);

    const res = await studioDecide(post("http://localhost/x", { grantId, decision: "APPROVED" }, "PATCH"));

    expect(res.status).toBe(200);
  });

  it("creating an organization is admin-only and leaves a platform audit row naming who made it", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    const name = `${RUN} audited organization`;

    as(BUILDER);
    expect((await adminCreateOrganization(post("http://localhost/x", { name }))).status).toBe(403);
    expect(await prisma.organization.count({ where: { name } })).toBe(0);

    as(ADMIN);
    const res = await adminCreateOrganization(post("http://localhost/x", { name, contactEmail: "IT@Acme.example" }));
    expect(res.status).toBe(201);
    const org = ((await res.json()) as { data: { id: string; slug: string; orgType: string } }).data;
    expect(org.orgType).toBe("client");
    expect(org.slug).toMatch(/audited-organization/);
    const row = await prisma.organization.findUnique({ where: { id: org.id } });
    expect(row).toMatchObject({ type: "client", orgType: "client", contactEmail: "it@acme.example" });

    const audit = await prisma.platformGovernanceAudit.findFirst({
      where: { entityType: "Organization", entityId: org.id, action: "CREATE" },
    });
    expect(audit).toMatchObject({ actorId: ADMIN.id, after: expect.objectContaining({ name }) });
  });

  it("the step-up routes need a session", async () => {
    jar.clear();
    expect((await stepUpOptions(post("http://localhost/x", {}))).status).toBe(401);
    expect((await stepUpVerify(post("http://localhost/x", { response: {} }))).status).toBe(401);
  });
});
