// @vitest-environment node
/**
 * P0.11 credential hygiene, against real PostgreSQL, through the real routes.
 *
 * The acceptance, one test each:
 *   1. A PROD key without an expiry is refused with 400.
 *   2. Zero failed calls across a rotation inside the overlap: calls made with
 *      the old key while the rotation runs, and after it, all succeed; both
 *      keys work; the old one is refused once the window has closed; and the
 *      ROTATE audit row records when the window closes.
 *   3. Revoke kills both hashes at once — the current key and the one still
 *      inside its overlap — and a re-issue afterwards brings neither back.
 *   4. An expired key never shows as live: not to authentication, not on
 *      Operations > Tokens, the Control Tower register or portfolio, the
 *      throttle view, the CoreEdge keys screen or the passport.
 *
 * The client carries the tenant guard in its default test mode (throw), so the
 * lookup by `previousTokenHash` succeeding here is also the proof that its
 * isUnscopedByDesign entry is registered: without it, test 2 throws.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 * Rows are namespaced per run and removed afterwards.
 */

import { randomBytes, randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
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
import { GET as portfolio } from "@/app/api/control-tower/portfolio/route";
import { GET as registerTokens } from "@/app/api/control-tower/tokens/route";
import { GET as throttle } from "@/app/api/ops/throttle/route";
import { GET as opsTokens } from "@/app/api/ops/tokens/route";
import { PATCH as patchClients, POST as issueClients } from "@/app/api/studio/clients/route";
import { keySuggestion, listKeys, listPassport } from "@/lib/coreedge/queries";
import { authenticateClientToken, hashClientToken } from "@/lib/northbound/auth";

const RUN = `p011-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);

const user = (name: string, role = "consultant") => ({
  id: `${RUN}-${name}`,
  email: `${name}@abeam.com`,
  role,
  organizationId: ORG,
  authMethod: "session",
});
/** Owns nothing, so may mint keys for the app the others own. */
const ISSUER = user("issuer");
const OWNERS = [user("tech"), user("biz"), user("sup")] as const;
/** Reads the Operations Center and Control Tower for this organization. */
const ADMIN = user("admin", "platform_admin");

function json(body: unknown, method: string) {
  return new Request("http://localhost/api/studio/clients", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

async function app(name: string): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name,
      slug: `${RUN}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Reads sales orders for the client's portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      technicalOwnerId: OWNERS[0].id,
      businessOwnerId: OWNERS[1].id,
      supportOwnerId: OWNERS[2].id,
    },
    select: { id: true },
  });
  return s.id;
}

/** Issue through the Studio route, as the non-owner. */
async function issue(solutionId: string, environment: string, expiresAt?: Date) {
  session.user = ISSUER;
  const res = await issueClients(
    json(
      { solutionId, label: `${environment} key`, environment, ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) },
      "POST",
    ),
  );
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown>; error?: { message: string } } };
}

async function patch(body: Record<string, unknown>) {
  session.user = ISSUER;
  const res = await patchClients(json(body, "PATCH"));
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown> } };
}

const authOk = async (token: string, now?: Date) => (await authenticateClientToken(token, now)).ok;

describe.skipIf(!process.env.TEST_DATABASE_URL)("credential hygiene against real PostgreSQL (P0.11)", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Credential hygiene test", type: "client" } });
    for (const u of [ISSUER, ...OWNERS, ADMIN]) {
      await prisma.user.create({
        data: { id: u.id, email: `${u.id}@abeam.com`, name: u.email, role: u.role, organizationId: ORG },
      });
    }
  });

  afterAll(async () => {
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: [ISSUER, ...OWNERS, ADMIN].map((u) => u.id) } } });
  });

  beforeEach(() => {
    session.user = null;
    vi.stubEnv("COREEDGE_STEP_UP", "off");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("1 · refuses a PROD key without an expiry with 400, and mints ce_live_ with one", async () => {
    const solutionId = await app("Order portal");

    const refused = await issue(solutionId, "PROD");
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toContain("PROD key must have an expiry");
    expect(await prisma.solutionClient.count({ where: { organizationId: ORG, solutionId } })).toBe(0);

    const issued = await issue(solutionId, "PROD", inDays(30));
    expect(issued.status).toBe(201);
    expect(String(issued.body.data?.token)).toMatch(/^ce_live_[A-Za-z0-9_-]{43}$/);
    const row = await prisma.solutionClient.findFirst({
      where: { organizationId: ORG, solutionId },
      select: { tokenPrefix: true, expiresAt: true },
    });
    expect(row?.tokenPrefix).toBe("ce_live_");
    expect(row?.expiresAt?.getTime()).toBe(new Date(String(issued.body.data?.expiresAt)).getTime());
  });

  it("2 · zero failed calls across a rotation inside the overlap; the old key fails after the window", async () => {
    const solutionId = await app("Invoice sync");
    const first = await issue(solutionId, "PROD", inDays(30));
    const oldToken = String(first.body.data?.token);
    const clientId = String(first.body.data?.id);
    expect(await authOk(oldToken)).toBe(true);

    // A deployment still holding the old key keeps calling while the rotation
    // runs, and for a while after it.
    let stop = false;
    let calls = 0;
    const failures: string[] = [];
    const traffic = (async () => {
      while (!stop) {
        const r = await authenticateClientToken(oldToken);
        calls++;
        if (!r.ok) failures.push(r.reason);
      }
    })();

    const rotated = await patch({ clientId, action: "rotate" });
    expect(rotated.status).toBe(200);
    const newToken = String(rotated.body.data?.token);
    // Let the old deployment make calls after the rotation committed too.
    const afterRotation = calls;
    while (calls < afterRotation + 20) await new Promise((r) => setTimeout(r, 1));
    stop = true;
    await traffic;

    expect(failures).toEqual([]);
    expect(calls).toBeGreaterThan(20);
    // Both keys work inside the window; they are one credential.
    const viaOld = await authenticateClientToken(oldToken);
    const viaNew = await authenticateClientToken(newToken);
    expect(viaOld).toMatchObject({ ok: true, client: { clientId } });
    expect(viaNew).toMatchObject({ ok: true, client: { clientId } });

    const row = await prisma.solutionClient.findFirst({
      where: { organizationId: ORG, id: clientId },
      select: { previousTokenHash: true, previousValidUntil: true, expiresAt: true, tokenPrefix: true },
    });
    expect(row?.previousTokenHash).toBe(hashClientToken(oldToken));
    const until = row!.previousValidUntil!;
    expect(Math.abs(until.getTime() - (Date.now() + 24 * HOUR))).toBeLessThan(5 * 60 * 1000);
    expect(rotated.body.data?.previousValidUntil).toBe(until.toISOString());
    // Rotation renewed the PROD key for the default lifetime.
    expect(Math.abs(row!.expiresAt!.getTime() - (Date.now() + 90 * DAY))).toBeLessThan(5 * 60 * 1000);

    // The ROTATE audit row records when the overlap ends.
    const audit = await prisma.configAudit.findFirst({
      where: { organizationId: ORG, entityId: clientId, action: "ROTATE" },
      orderBy: { at: "desc" },
      select: { after: true },
    });
    expect((audit?.after as { previousValidUntil?: string }).previousValidUntil).toBe(until.toISOString());

    // After the window: the old key is refused, the new one is not.
    const later = new Date(until.getTime() + 1);
    expect(await authenticateClientToken(oldToken, later)).toEqual({ ok: false, reason: "ROTATED_OUT" });
    expect(await authOk(newToken, later)).toBe(true);
  });

  it("3 · revoke kills both hashes immediately, and a re-issue brings neither back", async () => {
    const solutionId = await app("Stock levels");
    const first = await issue(solutionId, "PROD", inDays(30));
    const oldToken = String(first.body.data?.token);
    const clientId = String(first.body.data?.id);
    const newToken = String((await patch({ clientId, action: "rotate" })).body.data?.token);
    expect(await authOk(oldToken)).toBe(true);
    expect(await authOk(newToken)).toBe(true);

    const revoked = await patch({ clientId, action: "revoke" });
    expect(revoked.status).toBe(200);

    expect(await authenticateClientToken(oldToken)).toEqual({ ok: false, reason: "REVOKED" });
    expect(await authenticateClientToken(newToken)).toEqual({ ok: false, reason: "REVOKED" });
    const row = await prisma.solutionClient.findFirst({
      where: { organizationId: ORG, id: clientId },
      select: { previousValidUntil: true, revokedAt: true },
    });
    expect(row?.previousValidUntil?.getTime()).toBeLessThanOrEqual(row!.revokedAt!.getTime());

    // A deliberate re-key afterwards gives the revoked keys no overlap.
    const again = await issue(solutionId, "PROD", inDays(30));
    expect(again.status).toBe(201);
    expect(await authOk(String(again.body.data?.token))).toBe(true);
    expect(await authOk(oldToken)).toBe(false);
    expect(await authOk(newToken)).toBe(false);
    expect(again.body.data?.previousValidUntil).toBeNull();
  });

  /*
   * Review round 1. The code before P0.11 (088036ac) never writes the overlap
   * columns, so after a rotation, a code rollback, and a revoke or rotation
   * made under the old code, the row still held the replaced key and an open
   * window — and the roll-forward accepted it again. These are the old code's
   * writes, copied from `git show 088036ac:src/lib/northbound/issue.ts`.
   */
  it("3b · a key changed by the pre-P0.11 code after a rollback ends the overlap it left", async () => {
    for (const oldCodeRevokes of [true, false]) {
      const solutionId = await app(`Rollback ${oldCodeRevokes ? "revoke" : "rotate"}`);
      const first = await issue(solutionId, "PROD", inDays(30));
      const keyA = String(first.body.data?.token);
      const clientId = String(first.body.data?.id);
      const keyB = String((await patch({ clientId, action: "rotate" })).body.data?.token);
      expect(await authOk(keyA)).toBe(true);

      // Rolled back. Under the old code an operator revokes (A leaked) and then
      // rotates, or simply rotates to cut over at once.
      const where = { id: clientId, organizationId: ORG };
      if (oldCodeRevokes) {
        await prisma.solutionClient.update({
          where,
          data: { isActive: false, revokedAt: new Date(), secretsCiphertext: null },
        });
      }
      const keyC = `ce_${randomBytes(32).toString("base64url")}`;
      await prisma.solutionClient.update({
        where,
        data: { tokenHash: hashClientToken(keyC), isActive: true, revokedAt: null },
      });

      // Rolled forward, inside A's old window.
      expect(await authenticateClientToken(keyA)).toEqual({ ok: false, reason: "ROTATED_OUT" });
      expect(await authOk(keyB)).toBe(false);
      expect(await authOk(keyC)).toBe(true);
    }
  });

  it("4 · an expired key never shows as live, anywhere", async () => {
    const expiredApp = await app("Expired app");
    const legacyApp = await app("Legacy app");
    const expiredToken = `ce_live_${randomBytes(32).toString("base64url")}`;
    const expired = await prisma.solutionClient.create({
      data: {
        organizationId: ORG,
        solutionId: expiredApp,
        label: "Expired · PROD",
        tokenHash: hashClientToken(expiredToken),
        tokenPrefix: "ce_live_",
        environment: "PROD",
        createdById: ISSUER.id,
        expiresAt: new Date(Date.now() - HOUR),
        // Used recently: traffic must not make an expired key "in active use".
        lastUsedAt: new Date(Date.now() - 2 * HOUR),
      },
      select: { id: true },
    });
    // Issued before P0.11: TEST, no expiry, legacy prefix. Live, and flagged.
    const legacy = await prisma.solutionClient.create({
      data: {
        organizationId: ORG,
        solutionId: legacyApp,
        label: "Legacy · TEST",
        tokenHash: hashClientToken(`ce_${randomBytes(32).toString("base64url")}`),
        environment: "TEST",
        createdById: ISSUER.id,
      },
      select: { id: true },
    });
    await prisma.apiAccessGrant.create({
      data: {
        organizationId: ORG,
        solutionId: expiredApp,
        sapProduct: "s4hana",
        externalId: "API_SALES_ORDER_SRV",
        operation: "READ",
        environment: "PROD",
        justification: "Read sales orders for the portal.",
        requestedById: ISSUER.id,
        decision: "APPROVED",
        decidedById: OWNERS[0].id,
        decidedAt: new Date(),
        expiresAt: inDays(60),
      },
    });

    // Authentication.
    expect(await authenticateClientToken(expiredToken)).toEqual({ ok: false, reason: "EXPIRED" });

    // The CoreEdge keys screen.
    const keys = await listKeys(ORG);
    const expiredKey = keys.find((k) => k.id === expired.id)!;
    expect(expiredKey.state).toBe("expired");
    expect(keySuggestion(expiredKey, new Date())).not.toMatch(/active use/i);
    expect(keys.find((k) => k.id === legacy.id)).toMatchObject({ state: "noExpiry", tokenPrefix: "ce_" });

    // The passport.
    const passport = await listPassport(ORG);
    expect(passport.find((r) => r.appName === "Expired app")?.keyState).toBe("expired");

    session.user = ADMIN;
    // Operations > Tokens.
    const ops = (await (await opsTokens(new NextRequest("http://localhost/api/ops/tokens"))).json()) as {
      data: { counts: { active: number; expired: number; noExpiry: number }; credentials: { id: string; state: string }[] };
    };
    expect(ops.data.credentials.find((c) => c.id === expired.id)?.state).toBe("expired");
    expect(ops.data.credentials.find((c) => c.id === legacy.id)?.state).toBe("no-expiry");
    expect(ops.data.counts.expired).toBeGreaterThanOrEqual(1);
    expect(ops.data.counts.noExpiry).toBeGreaterThanOrEqual(1);
    expect(ops.data.counts.active).toBe(
      ops.data.credentials.filter((c) => c.state !== "expired" && c.state !== "revoked").length,
    );

    // The throttle view lists live credentials only.
    const throttled = JSON.stringify(await (await throttle(new NextRequest("http://localhost/api/ops/throttle"))).json());
    expect(throttled).not.toContain(expired.id);
    expect(throttled).toContain(legacy.id);

    // Control Tower: the credential register and the portfolio.
    const register = (await (await registerTokens(new NextRequest("http://localhost/api/control-tower/tokens"))).json()) as {
      data: { credentials: { id: string; state: string; lacksRequiredExpiry: boolean }[] };
    };
    expect(register.data.credentials.find((c) => c.id === expired.id)?.state).toBe("expired");
    expect(register.data.credentials.find((c) => c.id === legacy.id)).toMatchObject({
      state: "active",
      lacksRequiredExpiry: true,
    });

    const folio = (await (await portfolio(new NextRequest("http://localhost/api/control-tower/portfolio"))).json()) as {
      data: { solutions: { id: string; hasLiveCredential: boolean }[] };
    };
    expect(folio.data.solutions.find((s) => s.id === expiredApp)?.hasLiveCredential).toBe(false);
    expect(folio.data.solutions.find((s) => s.id === legacyApp)?.hasLiveCredential).toBe(true);
  });
});
