// @vitest-environment node
/**
 * The step-up against the attacker it exists for: someone holding a copy of a
 * person's session cookie (roadmap P0.12, lib/auth/step-up.ts).
 *
 * WHAT IS REAL. All of it that can be: the routes, the session lookup, the
 * database (with the tenant guard), the challenge cookie and the WebAuthn
 * verification itself. The passkeys are software authenticators — a P-256 key
 * pair each — that sign genuine registration and assertion payloads, so
 * `@simplewebauthn/server` checks real signatures and nothing in
 * `@/lib/auth/webauthn` is stood in. What is not real: the cookie jar
 * (`next/headers` has no request outside Next), the rate limiter, and the mail
 * transport.
 *
 * THE ATTACKS, each of which passed the step-up before this suite:
 *   - enrol a passkey of the attacker's own on the stolen session, which
 *     counted as an assertion, or then step up with it;
 *   - remove the person's passkeys, so the attacker's is the first;
 *   - replay a captured step-up (challenge cookie and body) onto the stolen
 *     session: the cookie is stateless, so deleting it proves nothing.
 *
 * Opt-in on TEST_DATABASE_URL, like the other real-PostgreSQL tests. Rows are
 * namespaced per run and removed after.
 */

import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ messageId: "test" })));
vi.mock("@/lib/email/brevo", () => ({ sendEmail }));

import { isoCBOR } from "@simplewebauthn/server/helpers";

import { prisma } from "@/lib/db/prisma";
import { hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { POST as authenticateOptions } from "@/app/api/auth/webauthn/authenticate/options/route";
import { POST as authenticateVerify } from "@/app/api/auth/webauthn/authenticate/verify/route";
import { DELETE as deletePasskey } from "@/app/api/auth/webauthn/credentials/[credentialId]/route";
import { GET as registerOptions } from "@/app/api/auth/webauthn/register/options/route";
import { POST as registerVerify } from "@/app/api/auth/webauthn/register/verify/route";
import { POST as stepUpOptions } from "@/app/api/auth/webauthn/step-up/options/route";
import { POST as stepUpVerify } from "@/app/api/auth/webauthn/step-up/verify/route";
import { PATCH as studioClientsPatch } from "@/app/api/studio/clients/route";

const RUN = `pk-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const VICTIM = { id: `${RUN}-victim`, email: `${RUN}-victim@abeam.test`, role: "consultant" };
const NEWCOMER = { id: `${RUN}-new`, email: `${RUN}-new@abeam.test`, role: "consultant" };
const ORIGIN = "http://localhost:3003";
const RP_ID = "localhost";
const CHALLENGE_COOKIE = "webauthn-challenge";
const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");

/** A software authenticator: a P-256 key whoever holds it controls. */
function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credId = randomBytes(16);
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x ?? "", "base64url")],
      [-3, Buffer.from(jwk.y ?? "", "base64url")],
    ]),
  );
  const rpIdHash = createHash("sha256").update(RP_ID).digest();
  return {
    id: b64u(credId),
    register(challenge: string) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(credId.length);
      const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([0x45]), // UP | UV | AT
        Buffer.alloc(4),
        Buffer.alloc(16),
        len,
        credId,
        Buffer.from(cose),
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ]) as never,
      );
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: "webauthn.create", challenge, origin: ORIGIN, crossOrigin: false }),
      );
      return {
        id: b64u(credId),
        rawId: b64u(credId),
        type: "public-key",
        response: {
          clientDataJSON: b64u(clientDataJSON),
          attestationObject: b64u(attestationObject),
          transports: ["internal"],
        },
        clientExtensionResults: {},
      };
    },
    assert(challenge: string) {
      // Counter 0, as synced passkeys (iCloud, Google) report: the counter
      // cannot catch a replay, so nothing here may rely on it.
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x05]), Buffer.alloc(4)]);
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN, crossOrigin: false }),
      );
      const signer = createSign("SHA256");
      signer.update(Buffer.concat([authData, createHash("sha256").update(clientDataJSON).digest()]));
      return {
        id: b64u(credId),
        rawId: b64u(credId),
        type: "public-key",
        response: {
          clientDataJSON: b64u(clientDataJSON),
          authenticatorData: b64u(authData),
          signature: b64u(signer.sign(privateKey)),
        },
        clientExtensionResults: {},
      };
    },
  };
}
type Authenticator = ReturnType<typeof authenticator>;

function req(body: unknown, method = "POST") {
  return new Request("http://localhost/x", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

/** A fresh session for this person, with no passkey assertion on it. */
async function newSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 86_400_000) },
  });
  return token;
}

function use(token: string): void {
  jar.clear();
  jar.set(SESSION_COOKIE_NAME, token);
}

/** Take the rotated session cookie a response sets, as a browser would. */
function follow(res: Response): void {
  const rotated = (res as unknown as { cookies: { get(n: string): { value: string } | undefined } }).cookies.get(
    SESSION_COOKIE_NAME,
  )?.value;
  if (rotated) jar.set(SESSION_COOKIE_NAME, rotated);
}

async function sessionRow() {
  return prisma.session.findUnique({ where: { tokenHash: hashSessionToken(jar.get(SESSION_COOKIE_NAME) ?? "") } });
}

/** Register a passkey on the current session, through the shipped routes. */
async function enrol(key: Authenticator): Promise<Response> {
  const options = await registerOptions();
  if (options.status !== 200) return options;
  const { data } = (await options.json()) as { data: { challenge: string } };
  const res = await registerVerify(req({ response: key.register(data.challenge) }));
  follow(res);
  return res;
}

/** Step up on the current session with this passkey, through the shipped routes. */
async function stepUpWith(key: Authenticator): Promise<Response> {
  const options = await stepUpOptions(req({}));
  expect(options.status).toBe(200);
  const { data } = (await options.json()) as { data: { challenge: string } };
  const res = await stepUpVerify(req({ response: key.assert(data.challenge) }));
  follow(res);
  return res;
}

async function prodClient(): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: "Portal",
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
  const c = await prisma.solutionClient.create({
    data: {
      organizationId: ORG,
      solutionId: s.id,
      label: "Portal",
      tokenHash: randomBytes(32).toString("hex"),
      environment: "PROD",
      createdById: `${RUN}-issuer`,
    },
    select: { id: true },
  });
  return c.id;
}

/** A governance action: revoke a PROD runtime credential. */
async function revokeProdKey(): Promise<number> {
  const clientId = await prodClient();
  return (await studioClientsPatch(req({ clientId, action: "revoke" }, "PATCH"))).status;
}

const passkeysOf = (userId: string) => prisma.webAuthnCredential.count({ where: { userId } });

describe.skipIf(!process.env.TEST_DATABASE_URL)("passkey enrolment and the step-up (real WebAuthn, real PostgreSQL)", () => {
  const victimPasskey = authenticator();

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Passkey step-up test", type: "client" } });
    for (const person of [VICTIM, NEWCOMER]) {
      await prisma.user.create({ data: { ...person, name: person.role, organizationId: ORG } });
    }
    // The victim enrols a passkey on their own session. No passkey yet, so no
    // step-up is asked: first enrolment is trust on first use.
    use(await newSession(VICTIM.id));
    expect((await enrol(victimPasskey)).status).toBe(200);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    sendEmail.mockClear();
  });

  afterAll(async () => {
    const userIds = [VICTIM.id, NEWCOMER.id];
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.webAuthnCredential.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.solutionClient.deleteMany({ where: { organizationId: ORG } });
    await prisma.solution.deleteMany({ where: { organizationId: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.$disconnect();
  });

  describe("enrolling a passkey is not a step-up", () => {
    it("a first passkey leaves the session unasserted, so enforce still refuses until it is used", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      use(await newSession(NEWCOMER.id));
      const own = authenticator();

      expect((await enrol(own)).status).toBe(200);

      expect((await sessionRow())?.passkeyAssertedAt).toBeNull();
      expect(await revokeProdKey()).toBe(403);

      // The dialog's next step: confirm with the passkey just added.
      expect((await stepUpWith(own)).status).toBe(200);
      expect(await revokeProdKey()).toBe(200);
    });

    it("a stolen session cannot add the attacker's passkey to someone who has one", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      use(await newSession(VICTIM.id)); // the attacker's copy of the cookie
      expect(await revokeProdKey()).toBe(403);
      const before = await passkeysOf(VICTIM.id);

      const options = await registerOptions();
      expect(options.status).toBe(403);
      expect(((await options.json()) as { error: { code: string } }).error.code).toBe("STEP_UP_REQUIRED");

      // Nor by skipping the options route with a challenge minted elsewhere:
      // the public sign-in options set the same cookie.
      const signInOptions = await authenticateOptions(req({}));
      const { data } = (await signInOptions.json()) as { data: { challenge: string } };
      const attackerKey = authenticator();
      const verify = await registerVerify(req({ response: attackerKey.register(data.challenge) }));
      expect(verify.status).toBe(403);

      expect(await passkeysOf(VICTIM.id)).toBe(before);
      expect((await sessionRow())?.passkeyAssertedAt).toBeNull();
      expect(await revokeProdKey()).toBe(403);
    });

    it("with a fresh step-up on an existing passkey, a second one can be added", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      use(await newSession(VICTIM.id));
      expect((await stepUpWith(victimPasskey)).status).toBe(200);
      const before = await passkeysOf(VICTIM.id);

      expect((await enrol(authenticator())).status).toBe(200);

      expect(await passkeysOf(VICTIM.id)).toBe(before + 1);
    });

    it("warn: an unconfirmed addition goes ahead and is recorded as a missing step-up", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      use(await newSession(VICTIM.id));

      expect((await enrol(authenticator())).status).toBe(200);

      expect((await sessionRow())?.passkeyAssertedAt).toBeNull();
      const rows = await prisma.configAudit.findMany({
        where: { organizationId: ORG, entityType: "StepUp", entityId: "passkey.add", actorId: VICTIM.id },
      });
      expect(rows.length).toBeGreaterThan(0);
    });

    it("every passkey added is recorded durably and the person is emailed", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      use(await newSession(VICTIM.id));
      expect((await stepUpWith(victimPasskey)).status).toBe(200);
      const key = authenticator();

      expect((await enrol(key)).status).toBe(200);

      const rows = await prisma.configAudit.findMany({
        where: { organizationId: ORG, entityType: "Passkey", action: "CREATE", actorId: VICTIM.id },
      });
      expect(rows.map((r) => (r.after as { credentialId?: string }).credentialId)).toContain(key.id);
      await vi.waitFor(() =>
        expect(sendEmail).toHaveBeenCalledWith(
          expect.objectContaining({ to: expect.objectContaining({ email: VICTIM.email }) }),
        ),
      );
    });
  });

  describe("removing a passkey", () => {
    it("enforce: a stolen session cannot remove the person's passkeys", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      use(await newSession(VICTIM.id));
      const before = await passkeysOf(VICTIM.id);

      const res = await deletePasskey(req({}, "DELETE"), { params: Promise.resolve({ credentialId: victimPasskey.id }) });

      expect(res.status).toBe(403);
      expect(await passkeysOf(VICTIM.id)).toBe(before);
    });

    it("enforce: after a step-up the person can remove one, and it is recorded", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      use(await newSession(VICTIM.id));
      expect((await stepUpWith(victimPasskey)).status).toBe(200);
      const spare = authenticator();
      expect((await enrol(spare)).status).toBe(200);

      const res = await deletePasskey(req({}, "DELETE"), { params: Promise.resolve({ credentialId: spare.id }) });

      expect(res.status).toBe(200);
      const rows = await prisma.configAudit.findMany({
        where: { organizationId: ORG, entityType: "Passkey", action: "REVOKE", entityId: spare.id },
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe("a step-up counts once, on the session it was issued to", () => {
    it("a captured step-up replayed onto another session of the same person is refused", async () => {
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      use(await newSession(VICTIM.id));
      const options = await stepUpOptions(req({}));
      const { data } = (await options.json()) as { data: { challenge: string } };
      const capturedCookie = jar.get(CHALLENGE_COOKIE) ?? "";
      const capturedBody = { response: victimPasskey.assert(data.challenge) };
      expect((await stepUpVerify(req(capturedBody))).status).toBe(200);

      use(await newSession(VICTIM.id)); // the attacker's session
      jar.set(CHALLENGE_COOKIE, capturedCookie);
      const replay = await stepUpVerify(req(capturedBody));
      follow(replay);

      expect(replay.status).toBe(400);
      expect((await sessionRow())?.passkeyAssertedAt).toBeNull();
      expect(await revokeProdKey()).toBe(403);
    });

    it("the same step-up replayed onto its own session is refused", async () => {
      use(await newSession(VICTIM.id));
      const options = await stepUpOptions(req({}));
      const { data } = (await options.json()) as { data: { challenge: string } };
      const capturedCookie = jar.get(CHALLENGE_COOKIE) ?? "";
      const capturedBody = { response: victimPasskey.assert(data.challenge) };
      const first = await stepUpVerify(req(capturedBody));
      expect(first.status).toBe(200);
      follow(first);
      const stampedAt = (await sessionRow())?.passkeyAssertedAt;

      jar.set(CHALLENGE_COOKIE, capturedCookie);
      const replay = await stepUpVerify(req(capturedBody));

      expect(replay.status).toBe(400);
      expect((await sessionRow())?.passkeyAssertedAt).toEqual(stampedAt);
    });

    it("a sign-in challenge is not a step-up challenge", async () => {
      use(await newSession(VICTIM.id));
      const signIn = await authenticateOptions(req({}));
      const { data } = (await signIn.json()) as { data: { challenge: string } };

      const res = await stepUpVerify(req({ response: victimPasskey.assert(data.challenge) }));

      expect(res.status).toBe(400);
      expect((await sessionRow())?.passkeyAssertedAt).toBeNull();
    });
  });

  it("a passkey sign-in still counts as a step-up for the session it mints", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    jar.clear();
    const options = await authenticateOptions(req({}));
    const { data } = (await options.json()) as { data: { challenge: string } };

    const res = await authenticateVerify(req({ response: victimPasskey.assert(data.challenge) }));
    expect(res.status).toBe(200);
    follow(res);

    expect((await sessionRow())?.passkeyAssertedAt).not.toBeNull();
    expect(await revokeProdKey()).toBe(200);
  });
});
