// @vitest-environment node
/**
 * A connection served by the Tenant Twin is never reached with its stored
 * credentials from outside the pipeline (wave 2 integration review round 3).
 *
 * The broker keeps a TWIN connection off the customer's SAP (transport.ts),
 * but a builder's Test, Ops "Probe now" and the rotation probe on the save
 * path called `fetch` directly and kept sending the connection's stored (or
 * new) credentials to its base URL. Each now skips a connection that is not
 * reached DIRECT and sends nothing. So does an interface's Verify service
 * (integration review round 4), which also records no verification: the
 * write route's custom-service gate accepts that stamp. The pure consumers
 * (the lane board, the lane sweep's plan, discovery, the console) are
 * tests/unit/governed/twin-transport-predicate.test.ts and
 * tests/unit/governed/console.test.ts.
 *
 * Through the real routes against real PostgreSQL, SAP stood in for by
 * `fetch`. Opt-in like the other integration tests: skipped without
 * TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { POST as testConnection } from "@/app/api/studio/connections/[id]/test/route";
import { POST as saveConnection } from "@/app/api/studio/connections/route";
import { POST as verifyService } from "@/app/api/studio/interfaces/[id]/verify-service/route";
import { probeOneConnection } from "@/lib/ops/connection-probe-sweep";
import { resolveSapConnection } from "@/lib/sap-public/connection-resolver";

const RUN = `twin-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const USER = { id: `${RUN}-dev`, email: `${RUN}-dev@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG, authMethod: "session" };
const KEY = `${RUN}-dev`;

const sap = { password: "Pw-1" };
const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';
const fakeSap = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  if (auth !== `Basic ${Buffer.from(`COMM_USER:${sap.password}`).toString("base64")}`) return new Response("", { status: 401 });
  if (String(url).includes("$metadata")) return new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } });
  return new Response(JSON.stringify({ d: { results: [] } }), { status: 200, headers: { "content-type": "application/json" } });
});

const save = (password: string) =>
  saveConnection(
    new NextRequest("http://localhost/api/studio/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product: "s4hana",
        key: KEY,
        label: "S/4HANA DEV",
        baseUrl: "https://my000001-api.s4hana.cloud.sap",
        authType: "basic",
        username: "COMM_USER",
        password,
        environment: "DEV",
      }),
    }),
  );

const test = (id: string) =>
  testConnection(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id }) });

describe.skipIf(!process.env.TEST_DATABASE_URL)("a TWIN connection is not reached with its credentials", () => {
  let id: string;
  let interfaceId: string;

  beforeAll(async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubGlobal("fetch", fakeSap);
    await prisma.organization.create({ data: { id: ORG, name: "Twin transport", type: "client" } });
    await prisma.user.create({ data: { id: USER.id, email: USER.email, name: USER.name, role: USER.role, organizationId: ORG } });
    session.user = USER;
    expect((await save("Pw-1")).status).toBe(200);
    const row = await prisma.sapConnection.findFirst({ where: { organizationId: ORG, key: KEY }, select: { id: true } });
    id = row!.id;
    // Proven working while DIRECT: the next re-save would be probed.
    expect(((await (await test(id)).json()) as { data: { validated: boolean } }).data.validated).toBe(true);
    // Then moved to the twin, as P1.6 (or an operator, today) marks it.
    await prisma.sapConnection.updateMany({ where: { id, organizationId: ORG }, data: { transport: "TWIN" } });
    // A customer-built service the builder will verify in DEV.
    const solution = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Twin app",
        slug: `${RUN}-app`,
        classification: "CLIENT_APP",
        businessProblem: "Twin transport test.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    interfaceId = (
      await prisma.interface.create({
        data: {
          organizationId: ORG,
          solutionId: solution.id,
          name: "Travel",
          sapProduct: "s4hana",
          operation: "CREATE",
          mode: "WRITE",
          status: "ACTIVE",
          externalId: "custom:/sap/opu/odata/sap/ZUI_TRAVEL_O2",
          servicePath: "/sap/opu/odata/sap/ZUI_TRAVEL_O2",
          odataVersion: "V2",
          entitySet: "A_Travel",
        },
        select: { id: true },
      })
    ).id;
  });
  beforeEach(() => fakeSap.mockClear());
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.interface.deleteMany({ where: { organizationId: ORG } });
    await prisma.solution.deleteMany({ where: { organizationId: ORG } });
    await prisma.sapConnection.deleteMany({ where: { organizationId: ORG } });
    await prisma.user.delete({ where: { id: USER.id } });
    await prisma.organization.delete({ where: { id: ORG } });
  });

  it("a builder's Test sends nothing and says why", async () => {
    const res = await test(id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/Tenant Twin/);
    expect(fakeSap).not.toHaveBeenCalled();
  });

  it("Ops Probe now sends nothing and records nothing", async () => {
    const before = await prisma.sapConnectionProbeEvent.count({ where: { organizationId: ORG, connectionId: id } });
    expect(await probeOneConnection(ORG, id, "manual")).toMatchObject({ outcome: "servedByTwin" });
    expect(fakeSap).not.toHaveBeenCalled();
    expect(await prisma.sapConnectionProbeEvent.count({ where: { organizationId: ORG, connectionId: id } })).toBe(before);
  });

  it("an interface's Verify service sends nothing and records no verification (integration review round 4)", async () => {
    const res = await verifyService(
      new NextRequest(`http://localhost/api/studio/interfaces/${interfaceId}/verify-service`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ environment: "DEV" }),
      }),
      { params: Promise.resolve({ id: interfaceId }) },
    );
    expect(res.status).toBe(200);
    const data = ((await res.json()) as { data: { status: string; verified: boolean; bindingRefusal?: string } }).data;
    expect(data).toMatchObject({ status: "BINDING_REFUSED", verified: false, bindingRefusal: "TRANSPORT_UNAVAILABLE" });
    expect(fakeSap).not.toHaveBeenCalled();
    const iface = await prisma.interface.findFirst({
      where: { id: interfaceId, organizationId: ORG },
      select: { serviceVerifications: true, serviceVerifiedAt: true },
    });
    expect(iface).toEqual({ serviceVerifications: null, serviceVerifiedAt: null });
    // Audited both ways, as every other outcome is.
    expect(
      await prisma.northboundAuditEvent.count({ where: { organizationId: ORG, connectionId: id, status: 503, dryRun: true } }),
    ).toBe(1);
  });

  it("a re-save is not probed against the customer's SAP: the new credentials are not sent there", async () => {
    // DIRECT, this typo would have been sent to SAP and refused (connection-rotation-probe.test.ts).
    expect((await save("Pw-typo")).status).toBe(200);
    expect(fakeSap).not.toHaveBeenCalled();
    expect((await resolveSapConnection(ORG, "s4hana", KEY))?.secrets.password).toBe("Pw-typo");
  });
});
