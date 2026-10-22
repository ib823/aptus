// @vitest-environment node
/**
 * Re-saving a DEACTIVATED connection that allows writes turns its writes back
 * on, and is recorded as exactly that (P0.3 review round 1) — against real
 * PostgreSQL, through the real route.
 *
 * THE DEFECT. POST upserts the row active (`isActive ?? true`), so re-saving a
 * connection an operator had deactivated during an incident makes it writable
 * again when the save keeps `writeEnabled`. The route decided whether the save
 * turned writes on from `writeEnabled` alone (`writeEnabled &&
 * !existing.writeEnabled`), never reading `isActive`, so the reactivation was
 * asked for, and audited as, a plain secret save: step-up action
 * `connection.save_secrets`, no `writesEnabled` on the audit row, nothing
 * saying the row came back. PATCH already judged the same transition over
 * `isActive && writeEnabled` and asked for `connection.enable_writes`.
 *
 * Now both doors use one rule: writes were live before when the row was
 * active AND allowed writes; a save that makes them live is
 * `connection.enable_writes`, and the audit row says what the row was.
 *
 * Opt-in on TEST_DATABASE_URL.
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
import { PATCH as patchConnection, POST as saveConnection } from "@/app/api/studio/connections/route";
import { connectionSaveBody, type ConnectionFormFields } from "@/lib/studio/connection-form";

const RUN = `p03resave-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const BUILDER = {
  id: `${RUN}-builder`,
  email: `${RUN}-builder@abeam.com`,
  name: "Builder",
  role: "consultant",
  organizationId: ORG,
  authMethod: "session",
};

function req(value: unknown, method = "POST") {
  return new NextRequest("http://localhost/api/studio/connections", {
    method,
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  });
}

function form(key: string, over: Partial<ConnectionFormFields> = {}): ConnectionFormFields {
  return {
    product: "s4hana",
    client: "",
    key,
    label: "S/4HANA DEV",
    baseUrl: "https://my000001-api.s4hana.cloud.sap",
    environment: "",
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
    ...over,
  };
}

const writing = (key: string) => form(key, { allowWrites: true });

/** A connection that allows writes, then deactivated (an incident). */
async function deactivatedWritingConnection(key: string): Promise<string> {
  vi.stubEnv("COREEDGE_STEP_UP", "off");
  const saved = await saveConnection(req(connectionSaveBody(writing(key))));
  expect(saved.status, await saved.clone().text()).toBe(200);
  const { data } = (await saved.json()) as { data: { connection: { id: string } } };
  const off = await patchConnection(req({ id: data.connection.id, isActive: false }, "PATCH"));
  expect(off.status, await off.clone().text()).toBe(200);
  return data.connection.id;
}

async function lastAudit(entityId: string, action: string) {
  return prisma.configAudit.findFirst({
    where: { organizationId: ORG, entityType: "Connection", entityId, action },
    orderBy: { at: "desc" },
    select: { after: true },
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("re-saving a deactivated writing connection (P0.3 review round 1)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "");
    session.user = BUILDER;
    await prisma.organization.create({ data: { id: ORG, name: "Resave reactivates", type: "client" } });
    await prisma.user.create({
      data: { id: BUILDER.id, email: BUILDER.email, name: BUILDER.name, role: BUILDER.role, organizationId: ORG },
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: BUILDER.id } });
  });

  it("asks for connection.enable_writes, as PATCH does for the same transition", async () => {
    const id = await deactivatedWritingConnection(`${RUN}-a`);
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");

    const viaPatch = await patchConnection(req({ id, isActive: true }, "PATCH"));
    expect(viaPatch.status).toBe(403);
    const patchAction = ((await viaPatch.json()) as { error: { stepUp: { action: string } } }).error.stepUp.action;

    const viaForm = await saveConnection(req(connectionSaveBody(writing(`${RUN}-a`))));
    expect(viaForm.status).toBe(403);
    const formAction = ((await viaForm.json()) as { error: { stepUp: { action: string } } }).error.stepUp.action;

    expect(patchAction).toBe("connection.enable_writes");
    expect(formAction).toBe("connection.enable_writes");
    // Refused, so nothing changed.
    expect(await prisma.sapConnection.findFirst({ where: { id, organizationId: ORG }, select: { isActive: true } })).toEqual({ isActive: false });
  });

  it("records the reactivation and the writes it switched on in the audit row", async () => {
    const id = await deactivatedWritingConnection(`${RUN}-b`);
    vi.stubEnv("COREEDGE_STEP_UP", "warn");

    const res = await saveConnection(req(connectionSaveBody(writing(`${RUN}-b`))));
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await prisma.sapConnection.findFirst({ where: { id, organizationId: ORG }, select: { isActive: true, writeEnabled: true } })).toEqual({
      isActive: true,
      writeEnabled: true,
    });

    const missing = await lastAudit(id, "STEP_UP_MISSING");
    expect(missing?.after).toMatchObject({ governanceAction: "connection.enable_writes" });
    const update = await lastAudit(id, "UPDATE");
    expect(update?.after).toMatchObject({
      writeEnabled: true,
      writeEnabledBefore: true,
      isActiveBefore: false,
      writesEnabled: true,
    });
  });

  it("a re-save that leaves writes off on a deactivated row does not claim to turn them off", async () => {
    const id = await deactivatedWritingConnection(`${RUN}-c`);

    const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-c`))));
    expect(res.status, await res.clone().text()).toBe(200);
    const { data } = (await res.json()) as { data: { writesTurnedOff?: boolean } };
    // Writes were not live (the row was deactivated), so none were turned off.
    expect(data.writesTurnedOff).toBeUndefined();
    const update = await lastAudit(id, "UPDATE");
    expect(update?.after).toMatchObject({ writeEnabled: false, isActiveBefore: false });
    expect(update?.after).not.toHaveProperty("writesDisabled");
  });

  it("rotating an ACTIVE writing connection stays a secret save", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    const first = await saveConnection(req(connectionSaveBody(writing(`${RUN}-d`))));
    expect(first.status).toBe(200);
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");

    const res = await saveConnection(req(connectionSaveBody(writing(`${RUN}-d`))));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { stepUp: { action: string } } }).error.stepUp.action).toBe(
      "connection.save_secrets",
    );
  });
});
