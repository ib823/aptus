// @vitest-environment node
/**
 * The post-deploy check (P0.17) against the real broker: the shipped routes
 * (/api/build, /api/health, northbound discovery and data), the real grant
 * gate, key, connection binding and audit writer, and PostgreSQL. The canary
 * is set up the way the runbook says an operator sets it up: an app with a
 * SAP-standard interface and a YY1_* interface, both granted for DEV, a third
 * interface with no grant, a DEV key and a DEV connection.
 *
 * What it proves: the check's expectations are the routes' real answers (the
 * correlation header, `data.count`, `service.source`, the refusal codes), and
 * the audit lookup the CLI makes (a plain client, by correlation id) finds the
 * row each call wrote. SAP itself is stood in for by `fetch`.
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

import { PrismaClient } from "@prisma/client";

import { GET as buildStamp } from "@/app/api/build/route";
import { GET as health } from "@/app/api/health/route";
import { GET as northboundRead } from "@/app/api/northbound/interfaces/[id]/data/route";
import { GET as discovery } from "@/app/api/northbound/interfaces/route";
import { PATCH as decideGrant, POST as requestGrant } from "@/app/api/studio/access-grants/route";
import { POST as issueKey } from "@/app/api/studio/clients/route";
import { POST as saveConnection } from "@/app/api/studio/connections/route";
import { POST as registerInterface } from "@/app/api/studio/interfaces/route";
import { prisma } from "@/lib/db/prisma";

import { type AuditRow, formatMarkdown, runPostDeployCheck } from "../../scripts/lib/post-deploy-check";

const RUN = `p017-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const BASE_URL = "https://release-canary.example.test";
const SAP_HOST = "https://my000001-api.s4hana.cloud.sap";
const DAY = 24 * 60 * 60 * 1000;

const user = (name: string) => ({
  id: `${RUN}-${name}`,
  email: `${RUN}-${name}@abeam.com`,
  name,
  role: "consultant",
  organizationId: ORG,
  authMethod: "session",
});
const OWNERS = [user("dev"), user("biz"), user("sup")] as const;
const APPROVER = user("approver");

function body(value: unknown, method = "POST") {
  return new NextRequest("http://localhost/api/studio", {
    method,
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  });
}

async function ok<T = Record<string, unknown>>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T };
  expect([200, 201], JSON.stringify(json)).toContain(res.status);
  return json.data as T;
}

/** The deployment: each request goes to the shipped route handler. */
async function deployment(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const req = new NextRequest(url, { headers: init?.headers ?? {} });
  if (url.pathname === "/api/build") return buildStamp();
  if (url.pathname === "/api/health") return health();
  if (url.pathname === "/api/northbound/interfaces") return discovery(req);
  const m = /^\/api\/northbound\/interfaces\/([^/]+)\/data$/.exec(url.pathname);
  if (m) return northboundRead(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) });
  return new Response("not found", { status: 404 });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the post-deploy check against the real broker (P0.17)", () => {
  const ids = { standard: "", custom: "", refused: "" };
  let key = "";
  const sapCalls: string[] = [];
  // The CLI's own audit lookup: a plain client, by correlation id.
  const reader = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });

  beforeAll(async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        sapCalls.push(String(url));
        return new Response(JSON.stringify({ d: { results: [{ Key: "SAP-RECORD-NOT-FOR-PRINTING" }] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await prisma.organization.create({ data: { id: ORG, name: "Release canary test", type: "client" } });
    for (const u of [...OWNERS, APPROVER]) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
    }
    const solution = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Release canary",
        slug: `${RUN}-canary`,
        classification: "CLIENT_APP",
        businessProblem: "Proves each production deploy can read through the broker.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
        technicalOwnerId: OWNERS[0].id,
        businessOwnerId: OWNERS[1].id,
        supportOwnerId: OWNERS[2].id,
      },
      select: { id: true },
    });

    session.user = OWNERS[0];
    const register = async (payload: Record<string, unknown>) =>
      ok<{ id: string; externalId: string }>(
        await registerInterface(body({ solutionId: solution.id, operation: "READ", sapProduct: "s4hana", ...payload })),
      );
    const standard = await register({ name: "Purchase orders", externalId: "purchase-orders", entitySet: "A_PurchaseOrder" });
    const custom = await register({ name: "Travel (YY1)", servicePath: "/sap/opu/odata/sap/YY1_TRAVEL_CDS", odataVersion: "V2", entitySet: "YY1_Travel" });
    ids.standard = standard.id;
    ids.custom = custom.id;
    ids.refused = (await register({ name: "Purchase orders, no grant", externalId: "purchase-orders", entitySet: "A_PurchaseOrder" })).id;

    for (const { id: interfaceId, externalId } of [standard, custom]) {
      session.user = OWNERS[0];
      const requested = await ok<{ id: string }>(
        await requestGrant(
          body({
            solutionId: solution.id,
            interfaceId,
            externalId,
            operation: "READ",
            environment: "DEV",
            justification: "The release canary reads one record after each deploy.",
            expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
          }),
        ),
      );
      session.user = APPROVER;
      await ok(await decideGrant(body({ grantId: requested.id, decision: "APPROVED" }, "PATCH")));
    }

    session.user = APPROVER;
    key = (await ok<{ token: string }>(await issueKey(body({ solutionId: solution.id, label: "Release canary DEV", environment: "DEV" })))).token;

    session.user = OWNERS[0];
    await ok(
      await saveConnection(
        body({
          product: "s4hana",
          key: `${RUN}-dev`,
          label: "S/4HANA DEV",
          baseUrl: SAP_HOST,
          authType: "basic",
          username: "COMM_USER",
          password: "not-a-real-password",
          environment: "DEV",
        }),
      ),
    );
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: [...OWNERS, APPROVER].map((u) => u.id) } } });
    await reader.$disconnect();
  });

  it("passes every line, finds every call's audit row, and prints no record and no key", async () => {
    const report = await runPostDeployCheck(
      {
        baseUrl: BASE_URL,
        key,
        customKey: key,
        standardInterfaceId: ids.standard,
        customInterfaceId: ids.custom,
        refusedInterfaceId: ids.refused,
        expectCommit: "0123456",
        protectionBypass: null,
        auditDatabaseUrl: process.env.TEST_DATABASE_URL ?? "",
        timeoutMs: 10_000,
      },
      {
        fetch: deployment as typeof fetch,
        findAuditRows: async (correlationIds): Promise<AuditRow[]> =>
          reader.northboundAuditEvent.findMany({
            where: { correlationId: { in: [...correlationIds] } },
            select: { correlationId: true, status: true, interfaceId: true },
          }),
      },
    );

    expect(report.lines.map((l) => `${l.id} ${l.status} ${l.detail}`)).toEqual([
      expect.stringMatching(/^build PASS commit 0123456789abcdef0123456789abcdef01234567, production environment/),
      "health PASS healthy",
      expect.stringMatching(/^discovery PASS the SAP-standard interface is catalogue and callable; the Z\* interface is custom and callable; the refused interface is listed as not callable/),
      expect.stringMatching(/^standard-read PASS HTTP 200, 1 record \[correlation [0-9a-f-]{36}\]$/),
      expect.stringMatching(/^custom-read PASS HTTP 200, 1 record \[correlation [0-9a-f-]{36}\]$/),
      expect.stringMatching(/^refused PASS HTTP 403 FORBIDDEN \[correlation [0-9a-f-]{36}\]$/),
      "audit PASS 4 rows found by correlation id, statuses match",
    ]);
    expect(report.ok).toBe(true);

    // One read of each granted interface reached SAP, on its own service, for one record.
    expect(sapCalls).toEqual([
      expect.stringMatching(/\/A_PurchaseOrder\?\$top=1&/),
      expect.stringMatching(/^https:\/\/my000001-api\.s4hana\.cloud\.sap\/sap\/opu\/odata\/sap\/YY1_TRAVEL_CDS\/YY1_Travel\?\$top=1&/),
    ]);

    const record = formatMarkdown(report);
    expect(record).not.toContain("SAP-RECORD-NOT-FOR-PRINTING");
    expect(record).not.toContain(key);
  });

  it("fails the audit line when a call's row is missing", async () => {
    const report = await runPostDeployCheck(
      {
        baseUrl: BASE_URL,
        key,
        customKey: key,
        standardInterfaceId: ids.standard,
        customInterfaceId: ids.custom,
        refusedInterfaceId: null,
        expectCommit: null,
        protectionBypass: null,
        auditDatabaseUrl: "unused",
        timeoutMs: 10_000,
      },
      {
        fetch: deployment as typeof fetch,
        // A database the deployment does not write to: no row is ever found.
        findAuditRows: async () => [],
        sleep: async () => {},
      },
    );
    expect(report.lines.find((l) => l.id === "refused")).toMatchObject({ status: "PASS", detail: expect.stringMatching(/^HTTP 404 NOT_FOUND/) });
    expect(report.lines.find((l) => l.id === "audit")).toMatchObject({ status: "FAIL", detail: expect.stringMatching(/standard-read: no audit row/) });
    expect(report.ok).toBe(false);
  });
});
