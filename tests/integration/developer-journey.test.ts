// @vitest-environment node
/**
 * P2.12 time to first real call, end to end against real PostgreSQL: every
 * milestone is fired by the shipped route at the place it happens, exactly
 * once, and the Control Tower endpoint turns them into the tile.
 *
 *   register an interface   POST /api/studio/interfaces        INTERFACE_REGISTERED
 *   ask for DEV access      POST /api/studio/access-grants     GRANT_REQUESTED
 *   a colleague approves    PATCH /api/studio/access-grants    GRANT_DECIDED
 *   a key is issued         POST /api/studio/clients           KEY_ISSUED
 *   the SAP system is saved POST /api/studio/connections       CONNECTION_SAVED
 *   its test passes         POST /api/studio/connections/:id/test  CONNECTION_PROBE_OK
 *   the app calls           GET /api/northbound/interfaces/:id/data  FIRST_CALL
 *
 * and the other doors to the same milestones: a decision from the CoreEdge
 * console and from Control Tower, a key collected through a claim link,
 * Operations' "Probe now", and a passing Test Console run. (The sign-up and
 * the sandbox read are in developer-onboarding.test.ts, the nightly sweep in
 * cron-sweep-idempotency.test.ts, the write route in
 * tests/unit/northbound/write-route-key-fate.test.ts.)
 *
 * WHAT IS REAL. Every route above, the grant gate, the key, the connection's
 * sealing and binding, the broker read and probe code, the tenant guard in
 * throw mode, and PostgreSQL. WHAT IS STOOD IN: the session (a stub user) and
 * SAP itself (`fetch` answers 200 with one record), because tests never reach
 * a live SAP system.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
import { GET as journeyFeed } from "@/app/api/control-tower/journey/route";
import { GET as northboundRead } from "@/app/api/northbound/interfaces/[id]/data/route";
import { PATCH as decideGrant, POST as requestGrant } from "@/app/api/studio/access-grants/route";
import { POST as issueKey } from "@/app/api/studio/clients/route";
import { POST as testConnection } from "@/app/api/studio/connections/[id]/test/route";
import { POST as saveConnection } from "@/app/api/studio/connections/route";
import { POST as registerInterface } from "@/app/api/studio/interfaces/route";
import { POST as brokerRun } from "@/app/api/studio/test/broker-run/route";
import { PATCH as decideInControlTower } from "@/app/api/control-tower/grants/route";
import { POST as decideInConsole } from "@/app/api/coreedge/requests/[id]/decide/route";
import { forgetRecordedJourneyMilestones, loadJourneySummary } from "@/lib/coreedge/journey";
import { claimKey, createClaimLink } from "@/lib/northbound/claim-link";
import { probeOneConnection } from "@/lib/ops/connection-probe-sweep";

const RUN = `p212-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const HOUR = 60 * 60 * 1000;

const user = (name: string, role = "consultant") => ({
  id: `${RUN}-${name}`,
  email: `${RUN}-${name}@abeam.com`,
  name,
  role,
  organizationId: ORG,
  authMethod: "session",
});
/** Owns the app, builds it, and asks for access. */
const DEVELOPER = user("dev");
const OWNERS = [DEVELOPER, user("biz"), user("sup")] as const;
/** Owns nothing: may approve the request and issue the key. */
const APPROVER = user("approver");
/** Reads Control Tower for this organization. */
const ADMIN = user("admin", "platform_admin");

function body(value: unknown, method = "POST", url = "http://localhost/api/studio") {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  });
}

async function ok<T = Record<string, unknown>>(res: Response, status = [200, 201]): Promise<T> {
  const json = (await res.json()) as { data?: T; error?: { message?: string } };
  expect(status, JSON.stringify(json)).toContain(res.status);
  return json.data as T;
}

const events = () =>
  prisma.developerJourneyEvent.findMany({
    where: { organizationId: ORG },
    orderBy: { at: "asc" },
    select: { kind: true, scopeKey: true, solutionId: true, environment: true, subjectId: true, detail: true, at: true },
  });

describe.skipIf(!process.env.TEST_DATABASE_URL)("time to first real call, through the real routes (P2.12)", () => {
  let solutionId = "";
  let interfaceId = "";
  let grantId = "";
  let connectionId = "";
  let token = "";

  beforeAll(async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "");
    // SAP answers a probe with a metadata document and a read with one record.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("$metadata")
          ? new Response(
              '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>',
              { status: 200, headers: { "content-type": "application/xml" } },
            )
          : new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
      ),
    );
    forgetRecordedJourneyMilestones();

    await prisma.organization.create({ data: { id: ORG, name: "Journey test", type: "client" } });
    for (const u of [...OWNERS, APPROVER, ADMIN]) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
    }
    const solution = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Purchase order portal",
        slug: `${RUN}-portal`,
        classification: "CLIENT_APP",
        businessProblem: "Shows suppliers their open purchase orders.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
        technicalOwnerId: OWNERS[0].id,
        businessOwnerId: OWNERS[1].id,
        supportOwnerId: OWNERS[2].id,
      },
      select: { id: true },
    });
    solutionId = solution.id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    // Cascades: solutions, interfaces, grants, clients, connections, journey events.
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: [...OWNERS, APPROVER, ADMIN].map((u) => u.id) } } });
  });

  it("1 · registering the app's first interface is a milestone; the second is not", async () => {
    session.user = DEVELOPER;
    const created = await ok<{ id: string }>(
      await registerInterface(
        body({
          solutionId,
          name: "Open purchase orders",
          sapProduct: "s4hana",
          externalId: "purchase-orders",
          operation: "READ",
          entitySet: "A_PurchaseOrder",
        }),
      ),
    );
    interfaceId = created.id;
    await ok(
      await registerInterface(
        body({ solutionId, name: "Second feed", sapProduct: "s4hana", externalId: "purchase-orders", operation: "READ" }),
      ),
    );

    const rows = (await events()).filter((e) => e.kind === "INTERFACE_REGISTERED");
    expect(rows).toEqual([
      expect.objectContaining({ scopeKey: `solution:${solutionId}`, solutionId, subjectId: interfaceId }),
    ]);
  });

  it("2 · a DEV request starts the clock; a colleague's decision ends the approver wait", async () => {
    session.user = DEVELOPER;
    const requested = await ok<{ id: string; createdAt: string }>(
      await requestGrant(
        body({
          solutionId,
          interfaceId,
          externalId: "purchase-orders",
          operation: "READ",
          environment: "DEV",
          justification: "The portal reads open purchase orders from DEV.",
          expiresAt: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
        }),
      ),
    );
    grantId = requested.id;

    session.user = APPROVER;
    const decided = await ok<{ decidedAt: string }>(
      await decideGrant(body({ grantId, decision: "APPROVED" }, "PATCH")),
    );

    const rows = await events();
    const request = rows.find((e) => e.kind === "GRANT_REQUESTED");
    const decision = rows.find((e) => e.kind === "GRANT_DECIDED");
    expect(request).toMatchObject({ scopeKey: `grant:${grantId}`, environment: "DEV", solutionId, subjectId: grantId });
    // The domain facts' own instants, not the time the row was written.
    expect(request?.at.toISOString()).toBe(new Date(requested.createdAt).toISOString());
    expect(decision).toMatchObject({ scopeKey: `grant:${grantId}`, detail: "APPROVED", environment: "DEV" });
    expect(decision?.at.toISOString()).toBe(new Date(decided.decidedAt).toISOString());
  });

  it("3 · the lane's first key is a milestone; a re-issue does not move it", async () => {
    session.user = APPROVER;
    await ok(await issueKey(body({ solutionId, label: "DEV key", environment: "DEV" })));
    const first = (await events()).find((e) => e.kind === "KEY_ISSUED");
    const reissued = await ok<{ token: string }>(await issueKey(body({ solutionId, label: "DEV key", environment: "DEV" })));
    token = reissued.token;

    const keys = (await events()).filter((e) => e.kind === "KEY_ISSUED");
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ scopeKey: `key:${solutionId}:DEV`, environment: "DEV" });
    expect(keys[0]!.at.getTime()).toBe(first!.at.getTime());
  });

  it("4 · saving the SAP system starts its set-up wait; its first passing test ends it", async () => {
    session.user = DEVELOPER;
    const saved = await ok<{ connection: { id: string } }>(
      await saveConnection(
        body({
          product: "s4hana",
          key: `${RUN}-dev`,
          label: "S/4HANA DEV",
          baseUrl: "https://my000001-api.s4hana.cloud.sap",
          authType: "basic",
          username: "COMM_USER",
          password: "not-a-real-password",
          environment: "DEV",
        }),
      ),
    );
    connectionId = saved.connection.id;

    for (let i = 0; i < 2; i++) {
      const tested = await ok<{ validated: boolean }>(
        await testConnection(body({}), { params: Promise.resolve({ id: connectionId }) }),
      );
      expect(tested.validated).toBe(true);
    }

    const rows = await events();
    expect(rows.filter((e) => e.kind === "CONNECTION_SAVED")).toEqual([
      expect.objectContaining({ scopeKey: `connection:${connectionId}`, environment: "DEV", subjectId: connectionId }),
    ]);
    expect(rows.filter((e) => e.kind === "CONNECTION_PROBE_OK")).toHaveLength(1);
  });

  it("5 · the app's first successful broker call ends the journey, once", async () => {
    const read = () =>
      northboundRead(
        new NextRequest(`http://localhost/api/northbound/interfaces/${interfaceId}/data`, {
          headers: { authorization: `Bearer ${token}` },
        }),
        { params: Promise.resolve({ id: interfaceId }) },
      );

    const first = await read();
    expect(first.status, await first.clone().text()).toBe(200);
    const recorded = (await events()).filter((e) => e.kind === "FIRST_CALL");
    expect(recorded).toEqual([
      expect.objectContaining({ scopeKey: `call:${solutionId}:DEV`, environment: "DEV", detail: "broker", solutionId }),
    ]);

    // Another instance (a cold start forgets what this one remembered) and
    // another call: still one row, still the first instant.
    forgetRecordedJourneyMilestones();
    expect((await read()).status).toBe(200);
    const after = (await events()).filter((e) => e.kind === "FIRST_CALL");
    expect(after).toHaveLength(1);
    expect(after[0]!.at.getTime()).toBe(recorded[0]!.at.getTime());
  });

  it("6 · Control Tower shows the journey on the time-to-first-real-call tile", async () => {
    session.user = ADMIN;
    const feed = await ok<{
      scope: string;
      ttfrc: { completed: number; open: number; stats: { n: number }; verdict: string; targetMs: number };
      funnel: { step: string; organizations: number }[];
    }>(await journeyFeed());

    expect(feed.scope).toBe("scoped");
    expect(feed.ttfrc).toMatchObject({ completed: 1, open: 0, stats: { n: 1 }, verdict: "tooFew", targetMs: 24 * HOUR });
    const reached = Object.fromEntries(feed.funnel.map((f) => [f.step, f.organizations]));
    expect(reached).toMatchObject({
      INTERFACE_REGISTERED: 1,
      GRANT_REQUESTED: 1,
      GRANT_DECIDED: 1,
      KEY_ISSUED: 1,
      CONNECTION_SAVED: 1,
      CONNECTION_PROBE_OK: 1,
      FIRST_CALL: 1,
      FIRST_REAL_CALL: 1,
      WORKSPACE_CREATED: 0,
    });
  });

  it("7 · the three parts split the business time between the milestones", async () => {
    // Pin the milestones to a known Monday so the split can be stated exactly:
    // request 09:00, connection saved 10:00, decision 11:00, probe passes
    // 14:00, first call 15:00.
    const monday = Date.parse("2026-10-19T09:00:00Z");
    const at = (hours: number) => new Date(monday + hours * HOUR);
    const pin = async (kind: string, hours: number) =>
      prisma.developerJourneyEvent.updateMany({ where: { organizationId: ORG, kind }, data: { at: at(hours) } });
    await pin("GRANT_REQUESTED", 0);
    await pin("CONNECTION_SAVED", 1);
    await pin("GRANT_DECIDED", 2);
    await pin("CONNECTION_PROBE_OK", 5);
    await pin("FIRST_CALL", 6);

    const summary = await loadJourneySummary(ORG, at(48));
    expect(summary.ttfrc.stats.median).toBe(6 * HOUR);
    // Approver: 09:00-11:00. Set-up: 10:00-14:00 less the approver's hour.
    expect(summary.ttfrc.parts.approverWait.median).toBe(2 * HOUR);
    expect(summary.ttfrc.parts.sapSetupWait.median).toBe(3 * HOUR);
    expect(summary.ttfrc.parts.developerTime.median).toBe(1 * HOUR);
  });

  describe("the other doors to the same milestones", () => {
    let testGrantId = "";
    let testConnectionId = "";

    const raise = async (environment: string) => {
      session.user = DEVELOPER;
      const raised = await ok<{ id: string }>(
        await requestGrant(
          body({
            solutionId,
            interfaceId,
            externalId: "purchase-orders",
            operation: "READ",
            environment,
            justification: `The portal reads open purchase orders from ${environment}.`,
            expiresAt: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
          }),
        ),
      );
      return raised.id;
    };

    it("8 · a decision from the CoreEdge console or Control Tower ends the approver wait too", async () => {
      testGrantId = await raise("TEST");
      const prodGrantId = await raise("PROD");

      session.user = APPROVER;
      const viaConsole = await decideInConsole(body({ decision: "APPROVED" }), {
        params: Promise.resolve({ id: testGrantId }),
      });
      expect(viaConsole.status, await viaConsole.clone().text()).toBe(200);

      session.user = ADMIN;
      await ok(await decideInControlTower(body({ grantId: prodGrantId, decision: "REJECTED" }, "PATCH")));

      const decided = (await events()).filter((e) => e.kind === "GRANT_DECIDED");
      expect(decided).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ subjectId: testGrantId, environment: "TEST", detail: "APPROVED" }),
          expect.objectContaining({ subjectId: prodGrantId, environment: "PROD", detail: "REJECTED" }),
        ]),
      );
    });

    it("9 · a key collected through a claim link is the lane's first key", async () => {
      const link = await createClaimLink({ organizationId: ORG, solutionId, environment: "TEST", createdById: APPROVER.id });
      const claimed = await claimKey(link.rawToken);
      expect(claimed.ok).toBe(true);

      expect((await events()).filter((e) => e.kind === "KEY_ISSUED" && e.environment === "TEST")).toEqual([
        expect.objectContaining({ scopeKey: `key:${solutionId}:TEST`, detail: "claim_link" }),
      ]);
    });

    it("10 · Probe now proves a connection as the Studio test does", async () => {
      session.user = DEVELOPER;
      const saved = await ok<{ connection: { id: string } }>(
        await saveConnection(
          body({
            product: "s4hana",
            key: `${RUN}-test`,
            label: "S/4HANA TEST",
            baseUrl: "https://my000002-api.s4hana.cloud.sap",
            authType: "basic",
            username: "COMM_USER",
            password: "not-a-real-password",
            environment: "TEST",
          }),
        ),
      );
      testConnectionId = saved.connection.id;
      expect(await probeOneConnection(ORG, testConnectionId, "manual")).toMatchObject({ outcome: "probed", status: "OK" });

      expect(
        (await events()).filter((e) => e.kind === "CONNECTION_PROBE_OK" && e.subjectId === testConnectionId),
      ).toEqual([expect.objectContaining({ environment: "TEST" })]);
    });

    it("11 · a passing Test Console run is the app's first governed call in that environment", async () => {
      const testKey = await prisma.solutionClient.findFirst({
        where: { organizationId: ORG, solutionId, environment: "TEST" },
        select: { id: true },
      });
      session.user = DEVELOPER;
      const run = await ok<{ outcome: string; httpStatus: number }>(
        await brokerRun(body({ interfaceId, clientId: testKey!.id })),
      );
      expect(run).toMatchObject({ outcome: "ran", httpStatus: 200 });

      expect((await events()).filter((e) => e.kind === "FIRST_CALL" && e.environment === "TEST")).toEqual([
        expect.objectContaining({ scopeKey: `call:${solutionId}:TEST`, detail: "test-console" }),
      ]);
    });
  });
});
