// @vitest-environment node
/**
 * P0.3 truthful registers, against real PostgreSQL, through the real routes
 * and queries the screens render. One block per finding:
 *
 *   A45  the masked key reference the claim page shows is the one every
 *        console shows: the key's own last four characters, not the label's;
 *   A58  the passport lists only access in force that reaches the client's
 *        SAP: never an expired or revoked approval, never SANDBOX — and the
 *        SAP systems list counts its bound lanes the same way;
 *   A61  an expired credential is not "live" on the portfolio or the throttle
 *        view (fixed by P0.11; pinned here with the rest);
 *   A62  Operations > Tokens counts write keys on live credentials only, and
 *        no longer says no code path issues one; Control Tower's credential
 *        register counts them the same way (review round 3), leaving out a
 *        retired app's, which authentication refuses (review round 4).
 *
 * WHAT IS REAL: the routes, the queries, the key policy, the tenant guard in
 * throw mode and PostgreSQL. WHAT IS STOOD IN: the session. Opt-in like the
 * other integration tests: skipped without TEST_DATABASE_URL. Rows are
 * namespaced per run and removed afterwards.
 */

import { randomUUID } from "node:crypto";

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
import { GET as ctTokens } from "@/app/api/control-tower/tokens/route";
import { GET as throttle } from "@/app/api/ops/throttle/route";
import { GET as opsTokens } from "@/app/api/ops/tokens/route";
import { PATCH as patchClients, POST as issueClients } from "@/app/api/studio/clients/route";
import { POST as issueWriteKey } from "@/app/api/studio/clients/write-credential/route";
import { listKeys, listPassport, listSapSystemDetails } from "@/lib/coreedge/queries";
import { claimKey, createClaimLink } from "@/lib/northbound/claim-link";

const RUN = `p03-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);

const user = (name: string, role = "consultant") => ({
  id: `${RUN}-${name}`,
  email: `${RUN}-${name}@abeam.com`,
  name,
  role,
  organizationId: ORG,
  authMethod: "session",
});
/** Owns nothing, so may mint keys for the apps the others own. */
const ISSUER = user("issuer");
const OWNERS = [user("tech"), user("biz"), user("sup")] as const;
/** Reads the Operations Center and Control Tower, scoped to this organization. */
const ADMIN = user("admin", "platform_admin");

function req(body: unknown, method = "POST", url = "http://localhost/api/studio/clients") {
  return new NextRequest(url, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

async function data<T = Record<string, unknown>>(res: Response, status: number[] = [200, 201]): Promise<T> {
  const json = (await res.json()) as { data?: T; error?: { message?: string } };
  expect(status, JSON.stringify(json)).toContain(res.status);
  return json.data as T;
}

async function app(name: string): Promise<string> {
  const s = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name,
      slug: `${RUN}-${randomUUID().slice(0, 8)}`,
      classification: "CLIENT_APP",
      businessProblem: "Keeps the client's portal in step with SAP.",
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

async function issue(solutionId: string, environment: string, expiresAt?: Date) {
  session.user = ISSUER;
  return data<{ id: string; token: string }>(
    await issueClients(
      req({ solutionId, environment, label: `${environment} key`, ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) }),
    ),
  );
}

async function grant(solutionId: string, g: { environment: string; operation?: string; decision?: string; expiresAt?: Date | null; revokedAt?: Date | null }) {
  return prisma.apiAccessGrant.create({
    data: {
      organizationId: ORG,
      solutionId,
      externalId: "API_SALES_ORDER_SRV",
      operation: g.operation ?? "READ",
      environment: g.environment,
      justification: "Regression fixture.",
      decision: (g.decision ?? "APPROVED") as never,
      decidedById: ADMIN.id,
      decidedAt: new Date(),
      expiresAt: g.expiresAt ?? null,
      revokedAt: g.revokedAt ?? null,
    },
    select: { id: true },
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("truthful registers against real PostgreSQL (P0.3)", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Truthful registers test", type: "client" } });
    for (const u of [ISSUER, ...OWNERS, ADMIN]) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
    }
  });

  afterAll(async () => {
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    // Cascades: solutions, grants, credentials, claim links, connections.
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: [ISSUER, ...OWNERS, ADMIN].map((u) => u.id) } } });
  });

  beforeEach(() => {
    session.user = null;
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    // The write key is sealed like every secret; a test key, never a real one.
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "a".repeat(64));
  });
  afterEach(() => vi.unstubAllEnvs());

  describe("A45 · one masked reference, the key's own", () => {
    it("issue, rotate and claim each leave the console showing the last four of the key actually held", async () => {
      const solutionId = await app("Order portal");

      // Issued in Studio, labelled "TEST key": the old reference was "TEST key".slice(-4) = " key".
      const issued = await issue(solutionId, "TEST", inDays(30));
      const tailOf = async (id: string) => (await listKeys(ORG)).find((k) => k.id === id)?.tail;
      expect(await tailOf(issued.id)).toBe(issued.token.slice(-4));

      // Rotated: the reference follows the new key.
      session.user = ISSUER;
      const rotated = await data<{ token: string }>(
        await patchClients(req({ clientId: issued.id, action: "rotate" }, "PATCH")),
      );
      expect(await tailOf(issued.id)).toBe(rotated.token.slice(-4));
      expect(await tailOf(issued.id)).not.toBe(issued.token.slice(-4));

      // Collected through a claim link: the reference the claim page promises
      // (the same one "on the Keys screen and in the app's settings") is the one shown.
      const link = await createClaimLink({ organizationId: ORG, solutionId, environment: "DEV", createdById: ISSUER.id });
      const claimed = await claimKey(link.rawToken);
      if (!claimed.ok) throw new Error(`claim refused: ${claimed.refusal}`);
      const dev = (await listKeys(ORG)).find((k) => k.solutionId === solutionId && k.environmentRaw === "DEV")!;
      expect(claimed.tail).toBe(claimed.rawToken.slice(-4));
      expect(dev.tail).toBe(claimed.tail);
      expect(dev.tokenPrefix).toBe(claimed.tokenPrefix);
    });

    it("says a key minted before the tail was recorded has none, rather than inventing one from its label", async () => {
      const solutionId = await app("Legacy app");
      const legacy = await prisma.solutionClient.create({
        data: {
          organizationId: ORG,
          solutionId,
          label: "Legacy app · DEV",
          tokenHash: `${RUN}-legacy-hash`,
          environment: "DEV",
          createdById: ISSUER.id,
        },
        select: { id: true },
      });
      expect((await listKeys(ORG)).find((k) => k.id === legacy.id)?.tail).toBeNull();
    });
  });

  describe("A58 · the passport shows access in force that reaches the client's SAP", () => {
    it("leaves out an expired PROD approval, a revoked one and a SANDBOX approval; keeps the live one", async () => {
      const solutionId = await app("Passport app");
      await grant(solutionId, { environment: "PROD", expiresAt: new Date(Date.now() - DAY) });
      await grant(solutionId, { environment: "TEST", revokedAt: new Date(Date.now() - DAY) });
      // Since D2 the decide route stores APPROVED for a sandbox request.
      await grant(solutionId, { environment: "SANDBOX" });
      await grant(solutionId, { environment: "DEV", expiresAt: inDays(10) });

      const rows = (await listPassport(ORG)).filter((r) => r.appName === "Passport app");
      expect(rows.map((r) => r.environmentRaw)).toEqual(["DEV"]);
    });

    it("gives a READ and a CREATE approval for one feed and environment a row each, keyed apart", async () => {
      const solutionId = await app("Two approvals app");
      await grant(solutionId, { environment: "DEV", operation: "READ" });
      await grant(solutionId, { environment: "DEV", operation: "CREATE", expiresAt: inDays(5) });

      const rows = (await listPassport(ORG)).filter((r) => r.appName === "Two approvals app");
      expect(rows.map((r) => r.operation).sort()).toEqual(["CREATE", "READ"]);
      // The screen keys rows by this id; app, feed and environment are shared.
      expect(new Set(rows.map((r) => r.id)).size).toBe(2);
      // And tells them apart: only the CREATE writes into SAP (review round 1).
      expect(Object.fromEntries(rows.map((r) => [r.operation, r.writesIntoSap]))).toEqual({ READ: false, CREATE: true });
    });

    it("does not call a write approval decided READ_ONLY a write into SAP", async () => {
      const solutionId = await app("Read-only write app");
      await grant(solutionId, { environment: "DEV", operation: "CREATE", decision: "READ_ONLY" });

      const rows = (await listPassport(ORG)).filter((r) => r.appName === "Read-only write app");
      expect(rows.map((r) => [r.operation, r.writesIntoSap])).toEqual([["CREATE", false]]);
    });

    it("counts a system's bound lanes from live grants only", async () => {
      const solutionId = await app("Systems app");
      await grant(solutionId, { environment: "PROD", expiresAt: new Date(Date.now() - DAY) });
      for (const environment of ["PROD", "TEST"] as const) {
        await prisma.sapConnection.create({
          data: {
            organizationId: ORG,
            product: "s4hana",
            key: `${RUN}-${environment.toLowerCase()}`,
            label: `${environment} system`,
            baseUrl: "https://my000000-api.s4hana.cloud.sap",
            authType: "basic",
            environment,
            secretsCiphertext: "not-a-real-ciphertext",
          },
        });
      }
      await grant(solutionId, { environment: "TEST" });

      const systems = await listSapSystemDetails(ORG);
      expect(systems.find((s) => s.environmentRaw === "PROD")?.boundLanes).toBe(0);
      expect(systems.find((s) => s.environmentRaw === "TEST")?.boundLanes).toBeGreaterThanOrEqual(1);
    });
  });

  describe("A61 and A62 · live means authenticates now, on every register", () => {
    it("an expired credential holding a write key is not live, not callable, and not counted as a write key", async () => {
      const solutionId = await app("Write app");
      const issued = await issue(solutionId, "TEST", inDays(30));
      await grant(solutionId, { environment: "TEST", operation: "CREATE" });

      // The write key, minted the way the API Access screen mints it.
      session.user = ISSUER;
      const minted = await data<{ writeKey: string; clientId: string }>(
        await issueWriteKey(req({ solutionId, environment: "TEST" }, "POST", "http://localhost/api/studio/clients/write-credential")),
      );
      expect(minted.clientId).toBe(issued.id);

      session.user = ADMIN;
      const tokensBefore = await data<{ counts: { withWriteCredential: number }; provenance: { writeCredentials: string } }>(
        await opsTokens(new NextRequest("http://localhost/api/ops/tokens")),
      );
      expect(tokensBefore.counts.withWriteCredential).toBe(1);
      // The old provenance said a zero was "by design" because nothing could issue one.
      expect(tokensBefore.provenance.writeCredentials).not.toMatch(/no code path issues/i);
      expect(tokensBefore.provenance.writeCredentials).toMatch(/Issue write key/);
      type CtRegister = { counts: { withWriteSecret: number; expired: number }; provenance: { writeSecrets: string } };
      const ctBefore = await data<CtRegister>(await ctTokens(new NextRequest("http://localhost/api/control-tower/tokens")));
      expect(ctBefore.counts.withWriteSecret).toBe(1);
      expect(ctBefore.provenance.writeSecrets).toMatch(/live credentials only/);

      // The credential expires. Its sealed write key stays in the row.
      await prisma.solutionClient.updateMany({
        where: { id: issued.id, organizationId: ORG },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const tokensAfter = await data<{ counts: { withWriteCredential: number } }>(
        await opsTokens(new NextRequest("http://localhost/api/ops/tokens")),
      );
      expect(tokensAfter.counts.withWriteCredential).toBe(0);
      // The governance register agrees with the operational one (review round 3).
      const ctAfter = await data<CtRegister>(await ctTokens(new NextRequest("http://localhost/api/control-tower/tokens")));
      expect(ctAfter.counts.expired).toBe(1);
      expect(ctAfter.counts.withWriteSecret).toBe(0);

      const folio = await data<{ solutions: { id: string; hasLiveCredential: boolean }[] }>(
        await portfolio(new NextRequest("http://localhost/api/control-tower/portfolio")),
      );
      expect(folio.solutions.find((s) => s.id === solutionId)?.hasLiveCredential).toBe(false);

      const budgets = await data<{ credentials: { clientId: string }[] }>(
        await throttle(new NextRequest("http://localhost/api/ops/throttle")),
      );
      expect(budgets.credentials.some((c) => c.clientId === issued.id)).toBe(false);
    });

    it("a retired app's write key is not counted on either register: authentication refuses it (review round 4)", async () => {
      const solutionId = await app("Retired write app");
      const issued = await issue(solutionId, "TEST", inDays(30));
      await grant(solutionId, { environment: "TEST", operation: "CREATE" });
      session.user = ISSUER;
      await data(
        await issueWriteKey(req({ solutionId, environment: "TEST" }, "POST", "http://localhost/api/studio/clients/write-credential")),
      );

      session.user = ADMIN;
      type Counts = { counts: { withWriteCredential?: number; withWriteSecret?: number } };
      const opsBefore = await data<Counts>(await opsTokens(new NextRequest("http://localhost/api/ops/tokens")));
      const ctBefore = await data<Counts>(await ctTokens(new NextRequest("http://localhost/api/control-tower/tokens")));

      // Retiring the app does not revoke the credential: its row is still live
      // and still holds the sealed write key.
      await prisma.solution.updateMany({ where: { id: solutionId, organizationId: ORG }, data: { status: "RETIRED" } });
      const row = await prisma.solutionClient.findFirst({
        where: { id: issued.id, organizationId: ORG },
        select: { isActive: true, revokedAt: true, secretsCiphertext: true },
      });
      expect(row).toMatchObject({ isActive: true, revokedAt: null });
      expect(row?.secretsCiphertext).not.toBeNull();

      const opsAfter = await data<Counts & { provenance: { writeCredentials: string } }>(
        await opsTokens(new NextRequest("http://localhost/api/ops/tokens")),
      );
      const ctAfter = await data<Counts & { provenance: { writeSecrets: string } }>(
        await ctTokens(new NextRequest("http://localhost/api/control-tower/tokens")),
      );
      expect(opsAfter.counts.withWriteCredential).toBe((opsBefore.counts.withWriteCredential ?? 0) - 1);
      expect(ctAfter.counts.withWriteSecret).toBe((ctBefore.counts.withWriteSecret ?? 0) - 1);
      expect(opsAfter.provenance.writeCredentials).toMatch(/not retired/);
      expect(ctAfter.provenance.writeSecrets).toMatch(/not retired/);
    });
  });
});
