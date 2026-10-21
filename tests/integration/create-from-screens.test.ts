// @vitest-environment node
/**
 * A CREATE interface reaches its first audited 201 using only what the
 * screens offer (P0.3, acceptance) — against real PostgreSQL, through the
 * real routes, with SAP stood in.
 *
 * WHY THIS COULD NOT PASS BEFORE. Every step below had a route, and three of
 * them had no screen: no component called POST
 * /api/studio/clients/write-credential, the Connections form had no
 * write-secret field (so no screen could allow writes on a connection), and a
 * re-save — how credentials are rotated — sent no `writeEnabled` and switched
 * a writing connection's writes off. The Interfaces screen meanwhile told
 * builders to issue the write credential "under API Access", where there was
 * no such action.
 *
 * "ONLY WHAT THE SCREENS OFFER" IS CHECKED, NOT ASSUMED. Each request is the
 * one the screen sends: the connection body comes from the form's own
 * `connectionSaveBody`, and the first test asserts that every Studio route
 * used here is called by a component under src/components — so the journey
 * cannot quietly lean on an API door no screen has.
 *
 * THE PEOPLE. A developer who owns the app builds it; a colleague who does not
 * own it approves the write grant and issues the keys (segregation of duties,
 * as the routes enforce it). The application then writes.
 *
 * WHAT IS REAL: the routes, the gates (grant, binding, write switch, write
 * key, idempotency), sealing, the tenant guard in throw mode and PostgreSQL.
 * WHAT IS STOOD IN: the session, and SAP (`fetch` issues a CSRF token and
 * answers the create with 201). Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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
import { POST as northboundWrite } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { PATCH as decideGrant, POST as requestGrant } from "@/app/api/studio/access-grants/route";
import { POST as issueKey } from "@/app/api/studio/clients/route";
import { POST as issueWriteKey } from "@/app/api/studio/clients/write-credential/route";
import { POST as saveConnection } from "@/app/api/studio/connections/route";
import { PATCH as editInterface, POST as registerInterface } from "@/app/api/studio/interfaces/route";
import { connectionSaveBody, type ConnectionFormFields } from "@/lib/studio/connection-form";
import { writeKeyAction } from "@/components/studio/ClientCredentials";

const RUN = `p03e2e-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 24 * 60 * 60 * 1000;

const user = (name: string, role = "consultant") => ({
  id: `${RUN}-${name}`,
  email: `${RUN}-${name}@abeam.com`,
  name,
  role,
  organizationId: ORG,
  authMethod: "session",
});
/** Owns the app and builds it. */
const DEVELOPER = user("dev");
const OWNERS = [DEVELOPER, user("biz"), user("sup")] as const;
/** Owns nothing: approves the write grant and issues the keys. */
const COLLEAGUE = user("colleague");

const ROUTES_USED = [
  "/api/studio/interfaces",
  "/api/studio/connections",
  "/api/studio/access-grants",
  "/api/studio/clients",
  "/api/studio/clients/write-credential",
] as const;

function req(value: unknown, method = "POST", url = "http://localhost/api/studio") {
  return new NextRequest(url, { method, body: JSON.stringify(value), headers: { "Content-Type": "application/json" } });
}

async function ok<T = Record<string, unknown>>(res: Response, status = [200, 201]): Promise<T> {
  const json = (await res.json()) as { data?: T; error?: { message?: string } };
  expect(status, JSON.stringify(json)).toContain(res.status);
  return json.data as T;
}

/** The Connections form, filled in as a builder fills it. */
function form(over: Partial<ConnectionFormFields>): ConnectionFormFields {
  return {
    product: "s4hana",
    client: "",
    key: `${RUN}-dev`,
    label: "S/4HANA DEV",
    baseUrl: "https://my000001-api.s4hana.cloud.sap",
    environment: "DEV",
    authType: "basic",
    apiKey: "",
    apiKeyHeader: "apikey",
    username: "COMM_USER",
    password: "not-a-real-password",
    bearerToken: "",
    clientId: "",
    clientSecret: "",
    oauthTokenUrl: "",
    companyId: "",
    samlAssertion: "",
    samlSigning: "key",
    samlPrivateKey: "",
    samlUserId: "",
    apiPath: "",
    timeoutMs: "",
    allowWrites: false,
    writeSecret: "",
    ...over,
  };
}

/** Every .ts/.tsx under a directory. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** SAP: a CSRF token on the service root, 201 on the create. */
const sap = vi.fn(async (url: string | URL, init?: RequestInit) => {
  if ((init?.method ?? "GET") === "GET") {
    return new Response("", { status: 200, headers: { "x-csrf-token": "csrf-from-sap" } });
  }
  return new Response(JSON.stringify({ d: { PurchaseOrder: "4500000099" } }), {
    status: 201,
    headers: { "content-type": "application/json", location: `${String(url)}('4500000099')` },
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("a create interface reaches its first audited 201 from the screens (P0.3)", () => {
  let solutionId = "";
  let interfaceId = "";
  let token = "";
  let writeKey = "";

  beforeAll(async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "");
    vi.stubGlobal("fetch", sap);

    await prisma.organization.create({ data: { id: ORG, name: "Create from screens", type: "client" } });
    for (const u of [...OWNERS, COLLEAGUE]) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
    }
    const solution = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Purchase order intake",
        slug: `${RUN}-intake`,
        classification: "CLIENT_APP",
        businessProblem: "Raises purchase orders from the supplier portal.",
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
    await prisma.northboundIdempotencyKey.deleteMany({ where: { organizationId: ORG } });
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    // Cascades: solutions, interfaces, grants, clients, connections, journey events.
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: [...OWNERS, COLLEAGUE].map((u) => u.id) } } });
  });

  it("0 · every Studio route this journey uses is one a screen calls", () => {
    const components = sources(path.resolve(__dirname, "../../src/components"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    for (const route of ROUTES_USED) {
      expect(components, `no screen calls ${route}`).toMatch(new RegExp(`["'\`]${route.replace(/\//g, "\\/")}["'\`?]`));
    }
  });

  it("1 · the builder registers the create interface (Interfaces screen)", async () => {
    session.user = DEVELOPER;
    const created = await ok<{ id: string }>(
      await registerInterface(
        req({
          solutionId,
          name: "Raise purchase order",
          sapProduct: "s4hana",
          externalId: "purchase-orders",
          operation: "CREATE",
          entitySet: "A_PurchaseOrder",
        }),
      ),
    );
    interfaceId = created.id;
  });

  it("2 · the builder saves the DEV system with writes allowed (Connections form)", async () => {
    session.user = DEVELOPER;
    const saved = await ok<{ connection: { id: string; writeEnabled: boolean } }>(
      await saveConnection(req(connectionSaveBody(form({ allowWrites: true, writeSecret: "a-write-secret" })))),
    );
    expect(saved.connection.writeEnabled).toBe(true);
    // Recorded as the governance action it is.
    const audit = await prisma.configAudit.findFirst({
      where: { organizationId: ORG, entityType: "Connection", entityId: saved.connection.id },
      orderBy: { at: "desc" },
      select: { after: true },
    });
    expect(audit?.after).toMatchObject({ writeEnabled: true, writesEnabled: true });
  });

  it("3 · the builder asks for DEV write access; a colleague approves it with the checklist (API Access ledger)", async () => {
    session.user = DEVELOPER;
    const requested = await ok<{ id: string }>(
      await requestGrant(
        req({
          solutionId,
          interfaceId,
          externalId: "purchase-orders",
          operation: "CREATE",
          environment: "DEV",
          justification: "The portal raises purchase orders in DEV for the pilot.",
          expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
        }),
      ),
    );
    session.user = COLLEAGUE;
    await ok(await decideGrant(req({ grantId: requested.id, decision: "APPROVED", writeChecklistAcknowledged: true }, "PATCH")));
  });

  it("4 · the colleague issues the DEV credential and then its write key (API Access, Runtime credentials)", async () => {
    session.user = COLLEAGUE;
    const issued = await ok<{ id: string; token: string }>(
      await issueKey(req({ solutionId, environment: "DEV", label: "Purchase order intake · DEV" })),
    );
    token = issued.token;

    // What the row offers the colleague: the action, enabled, with nothing to explain.
    expect(
      writeKeyAction(
        { state: "active", environment: "DEV", writeKeyIssued: false, writeGrantLive: true, writeKeyNeedsExpiry: false },
        false,
      ),
    ).toEqual({ enabled: true, label: "Issue write key", reason: null });

    const minted = await ok<{ writeKey: string; clientId: string; environment: string }>(
      await issueWriteKey(req({ solutionId, environment: "DEV" })),
    );
    expect(minted).toMatchObject({ clientId: issued.id, environment: "DEV" });
    writeKey = minted.writeKey;
  });

  it("5 · the builder activates the interface: the write chain is complete in DEV (Interfaces screen)", async () => {
    session.user = DEVELOPER;
    const activated = await ok<{ status: string }>(
      await editInterface(req({ id: interfaceId, status: "ACTIVE" }, "PATCH")),
    );
    expect(activated.status).toBe("ACTIVE");
  });

  const write = (key: string) =>
    northboundWrite(
      new NextRequest(`http://localhost/api/northbound/interfaces/${interfaceId}/data/write`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "x-coreedge-write-key": writeKey,
          "idempotency-key": key,
          "content-type": "application/json",
        },
        body: JSON.stringify({ record: { CompanyCode: "1010", Supplier: "17300001" } }),
      }),
      { params: Promise.resolve({ id: interfaceId }) },
    );

  it("6 · the application's create reaches SAP and is audited as a 201", async () => {
    const res = await write(`${RUN}-first-create`);
    expect(res.status, await res.clone().text()).toBe(201);

    const posted = sap.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "POST");
    expect(posted).toHaveLength(1);
    expect(String(posted[0]![0])).toContain("/A_PurchaseOrder");

    const audited = await prisma.northboundAuditEvent.findMany({
      where: { organizationId: ORG, interfaceId, operation: "WRITE" },
      select: { status: true, connectionId: true, environment: true },
    });
    expect(audited).toEqual([expect.objectContaining({ status: 201, environment: "DEV" })]);
    expect(audited[0]!.connectionId).not.toBeNull();
  });

  it("7 · re-saving the connection from the form to rotate its password keeps writes on", async () => {
    session.user = DEVELOPER;
    // The form starts with Allow writes ticked over a writing connection; the
    // builder re-enters the secrets, as every save requires.
    const saved = await ok<{ connection: { writeEnabled: boolean }; writesTurnedOff?: boolean }>(
      await saveConnection(
        req(connectionSaveBody(form({ password: "a-rotated-password", allowWrites: true, writeSecret: "a-write-secret" }))),
      ),
    );
    expect(saved.connection.writeEnabled).toBe(true);
    expect(saved.writesTurnedOff).toBeUndefined();

    const res = await write(`${RUN}-after-rotation`);
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it("8 · a save that does not keep writes on says so, and the broker then refuses the create", async () => {
    session.user = DEVELOPER;
    const saved = await ok<{ connection: { writeEnabled: boolean }; writesTurnedOff?: boolean; writesNotice?: string }>(
      await saveConnection(req(connectionSaveBody(form({ allowWrites: false })))),
    );
    expect(saved.connection.writeEnabled).toBe(false);
    expect(saved.writesTurnedOff).toBe(true);
    expect(saved.writesNotice).toMatch(/Writes are now OFF/);

    const res = await write(`${RUN}-after-writes-off`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/Writes are not enabled/);
  });
});
