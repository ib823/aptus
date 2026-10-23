// @vitest-environment node
/**
 * P1.2, acceptance A1 against PostgreSQL and the shipped routes, with no live
 * lab: the tenant's own Gateway catalogue is a fake that answers with the
 * synthetic lab-shape page (tests/fixtures/tenant-discovery/
 * catalogservice-v2.lab-shape.json), on the connection's own host.
 *
 *   - the live listing (POST /api/sap/tdd/tenant-services) stores the lab's
 *     Z* and YY1_* services as customer-built, with the paths CoreEdge may
 *     store, and writes ONE console row (externalId -tenant-catalogue-, its
 *     rowCount the services listed) and ONE platform row, with the listing's
 *     correlation id;
 *   - its stored read (GET /api/studio/tenant-services) answers the same
 *     groups with no request to the tenant;
 *   - a PROD connection without a grant is refused by the environment
 *     ceiling, audited, and nothing is stored;
 *   - a second listing within two minutes is a 429 that sends nothing and
 *     writes no row;
 *   - a catalogue the user may not read is stored as UNAUTHORIZED;
 *   - a deployment tenant is a platform admin's to list, and never stored.
 *
 * WHAT IS REAL: the routes, the console pipeline, the connection resolver and
 * sealing, the connector, the classifier's two statements, the audit
 * inserts, the tenant guard in throw mode. WHAT IS STOOD IN: the session and
 * SAP itself (`fetch`). Skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | Record<string, unknown>, requests: [] as string[] }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { POST as listRoute } from "@/app/api/sap/tdd/tenant-services/route";
import { GET as storedRoute } from "@/app/api/studio/tenant-services/route";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import type { ListingEntry } from "@/lib/sap-public/tenant-discovery";

const RUN = `p12td-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DEV_HOST = "https://my000011-api.s4hana.cloud.sap";
const PROD_HOST = "https://my000012-api.s4hana.cloud.sap";
const SANDBOX_HOST = "https://my000013-api.s4hana.cloud.sap";
const ENV_TENANT = `${RUN}-env`;
const ENV_HOST = "https://my000014-api.s4hana.cloud.sap";
const LAB = readFileSync(join(process.cwd(), "tests/fixtures/tenant-discovery/catalogservice-v2.lab-shape.json"), "utf8");

const users = {
  dev: { id: `${RUN}-dev`, email: `${RUN}-dev@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG, authMethod: "session" },
  admin: { id: `${RUN}-admin`, email: `${RUN}-admin@abeam.com`, name: "Admin", role: "platform_admin", organizationId: null, authMethod: "session" },
  sandbox: { id: `${RUN}-sbx`, email: `${RUN}-sbx@abeam.com`, name: "Sandbox", role: "sandbox_developer", organizationId: ORG, authMethod: "session" },
};
const USER_IDS = Object.values(users).map((u) => u.id);

/** The tenant's Gateway: the lab-shape page on the connection's own host, a 403 on the SANDBOX one. */
async function fakeGateway(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  h.requests.push(url);
  const origin = new URL(url).origin;
  if (origin === SANDBOX_HOST) return new Response("", { status: 403 });
  if (!url.includes("CATALOGSERVICE")) return new Response("", { status: 404 });
  return new Response(LAB.split("https://lab.example.invalid").join(origin), { status: 200, headers: { "content-type": "application/json" } });
}

const list = (tenant: string) =>
  listRoute(
    new NextRequest("http://localhost/api/sap/tdd/tenant-services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product: "s4hana", tenant }),
    }),
  );
const stored = (tenant: string) => storedRoute(new NextRequest(`http://localhost/api/studio/tenant-services?product=s4hana&tenant=${tenant}`));

const ids = { dev: "", prod: "", sandbox: "" };

describe.skipIf(!process.env.TEST_DATABASE_URL)("tenant service discovery (P1.2, A1)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubEnv("S4_TDD_TENANTS_JSON", JSON.stringify([{ key: ENV_TENANT, label: "Env", baseUrl: ENV_HOST, environment: "DEV" }]));
    vi.stubEnv("S4_TDD_AUTH_TYPE", "basic");
    vi.stubEnv("S4_TDD_USERNAME", "ENV_USER");
    vi.stubEnv("S4_TDD_PASSWORD", "not-a-real-password");
    vi.stubGlobal("fetch", vi.fn(fakeGateway));
    await prisma.organization.create({ data: { id: ORG, name: "Tenant discovery", type: "client" } });
    for (const u of Object.values(users)) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: u.organizationId } });
    }
    const connection = async (key: string, environment: "DEV" | "PROD" | "SANDBOX", baseUrl: string) =>
      (
        await upsertSapConnection({
          organizationId: ORG,
          product: "s4hana",
          key: `${RUN}-${key}`,
          label: `Lab ${environment}`,
          baseUrl,
          authType: "basic",
          secrets: { username: "COMM_USER", password: "not-a-real-password" },
          environment,
        })
      ).id;
    ids.dev = await connection("dev", "DEV", DEV_HOST);
    ids.prod = await connection("prod", "PROD", PROD_HOST);
    ids.sandbox = await connection("sbx", "SANDBOX", SANDBOX_HOST);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.platformConsoleRead.deleteMany({ where: { actorUserId: { in: USER_IDS } } });
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: { in: [ORG, "-deployment-"] }, actorUserId: { in: USER_IDS } } });
    await prisma.tenantServiceListing.deleteMany({ where: { organizationId: ORG } });
    await prisma.sapConnection.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  });

  it("lists the lab's Z* and YY1_* services as customer-built, and stores them", async () => {
    h.user = users.dev;
    h.requests = [];
    const res = await list(`${RUN}-dev`);
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { stored: boolean; correlationId: string; groups: Record<string, ListingEntry[]> };
    expect(body.stored).toBe(true);
    // One page, from CoreEdge's own $skip, on the connection's own host.
    expect(h.requests).toEqual([`${DEV_HOST}/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection?$format=json&$top=500&$skip=0`]);

    const row = await prisma.tenantServiceListing.findFirst({ where: { organizationId: ORG, connectionId: ids.dev } });
    expect(row).not.toBeNull();
    expect(row!.catalogueStatus).toBe("OK");
    expect(row!.correlationId).toBe(body.correlationId);
    const byName = new Map((row!.entries as unknown as ListingEntry[]).map((e) => [e.technicalName, e]));
    expect(byName.get("ZUI_TRAVEL_O2")).toMatchObject({ class: "CUSTOMER_DEVELOPER", path: "/sap/opu/odata/sap/ZUI_TRAVEL_O2" });
    expect(byName.get("Z_BONUS_PLAN")).toMatchObject({ class: "CUSTOMER_DEVELOPER", path: null });
    expect(byName.get("YY1_SALESBONUS_CDS")).toMatchObject({ class: "CUSTOMER_KEY_USER", path: "/sap/opu/odata/sap/YY1_SALESBONUS_CDS" });
    expect(byName.get("/ACME/ORDERS_SRV")?.class).toBe("UNKNOWN_NAMESPACE");
    // No host and no URL is stored.
    expect(JSON.stringify(row!.entries)).not.toMatch(/https?:|s4hana\.cloud\.sap/);

    // ONE console row and ONE platform row, joined by the listing's correlation id.
    const consoleRows = await prisma.northboundAuditEvent.findMany({ where: { organizationId: ORG, correlationId: body.correlationId } });
    expect(consoleRows).toHaveLength(1);
    expect(consoleRows[0]).toMatchObject({ externalId: "-tenant-catalogue-", dryRun: true, status: 200, rowCount: 8, connectionId: ids.dev });
    const platformRows = await prisma.platformConsoleRead.findMany({ where: { correlationId: body.correlationId } });
    expect(platformRows).toHaveLength(1);
    expect(platformRows[0]).toMatchObject({ serviceKey: "-tenant-catalogue-", outcome: "SUCCEEDED" });
    expect((platformRows[0]!.detail as { route: string }).route).toBe("/api/sap/tdd/tenant-services");
  });

  it("reads the stored listing back with no request to the tenant", async () => {
    h.user = users.dev;
    h.requests = [];
    const res = await stored(`${RUN}-dev`);
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { listing: { listedBy: string; groups: { customerBuilt: ListingEntry[] } } };
    expect(h.requests).toEqual([]);
    expect(body.listing.listedBy).toBe("Dev");
    expect(body.listing.groups.customerBuilt.map((e) => e.technicalName).sort()).toEqual(["YY1_SALESBONUS_CDS", "ZUI_TRAVEL_O2", "Z_BONUS_PLAN"]);
  });

  it("a second listing within two minutes sends nothing and writes no row", async () => {
    h.user = users.dev;
    h.requests = [];
    const before = await prisma.northboundAuditEvent.count({ where: { organizationId: ORG } });
    const res = await list(`${RUN}-dev`);
    expect(res.status).toBe(429);
    expect(h.requests).toEqual([]);
    expect(await prisma.northboundAuditEvent.count({ where: { organizationId: ORG } })).toBe(before);
  });

  it("refuses a PROD connection without a grant, audits the refusal, and stores nothing", async () => {
    h.user = users.dev;
    h.requests = [];
    const res = await list(`${RUN}-prod`);
    expect(res.status).toBe(403);
    const { error } = (await res.json()) as { error: { code: string; correlationId: string } };
    expect(error.code).toBe("FORBIDDEN");
    expect(h.requests).toEqual([]);
    expect(await prisma.northboundAuditEvent.count({ where: { organizationId: ORG, correlationId: error.correlationId } })).toBe(1);
    expect(await prisma.platformConsoleRead.findFirst({ where: { correlationId: error.correlationId } })).toMatchObject({ outcome: "BLOCKED" });
    expect(await prisma.tenantServiceListing.count({ where: { organizationId: ORG, connectionId: ids.prod } })).toBe(0);
  });

  it("stores a catalogue the user may not read as UNAUTHORIZED, with no entries", async () => {
    h.user = users.dev;
    const res = await list(`${RUN}-sbx`);
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { catalogueStatus: string; sentence: string };
    expect(body.catalogueStatus).toBe("UNAUTHORIZED");
    // Q1: said plainly, the upload offered, no communication scenario named to activate.
    expect(body.sentence).toMatch(/cannot read the system's service catalogue/);
    expect(body.sentence).not.toMatch(/SAP_COM_/);
    const row = await prisma.tenantServiceListing.findFirst({ where: { organizationId: ORG, connectionId: ids.sandbox } });
    expect(row).toMatchObject({ catalogueStatus: "UNAUTHORIZED", entryCount: 0 });
  });

  it("leaves a deployment tenant to a platform admin, and never stores its listing", async () => {
    h.user = users.dev;
    expect((await list(ENV_TENANT)).status).toBe(403);
    h.user = users.admin;
    const res = await list(ENV_TENANT);
    expect(res.status).toBe(200);
    expect(((await res.json()).data as { stored: boolean }).stored).toBe(false);
    expect(await prisma.tenantServiceListing.count({ where: { organizationId: ORG, product: "s4hana", connectionId: { notIn: [ids.dev, ids.sandbox] } } })).toBe(0);
  });

  it("refuses a sandbox developer, whose workspace reads Sandbox systems only through the console it may open", async () => {
    h.user = users.sandbox;
    expect((await list(`${RUN}-sbx`)).status).toBe(403);
  });
});
