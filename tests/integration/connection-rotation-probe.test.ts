// @vitest-environment node
/**
 * P0.14 acceptance: a mistyped rotated secret never replaces a working one.
 *
 * Through the real Connections route (POST /api/studio/connections), against
 * real PostgreSQL: a connection is saved and proven (its Test passes), then
 * re-saved with a mistyped password. SAP — stood in for by `fetch` — accepts
 * only the right password. The re-save is refused, the stored secret is
 * byte-for-byte the working one, and the broker's own resolver still opens the
 * old password. Then the right new password is saved, and replaces it.
 *
 * And the cases the probe must not touch: a new connection, and one that has
 * never passed a test, save exactly as before.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
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
import { resolveSapConnection } from "@/lib/sap-public/connection-resolver";

const RUN = `p014r-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const USER = { id: `${RUN}-dev`, email: `${RUN}-dev@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG, authMethod: "session" };

/** The one password this SAP system accepts, as it changes over the test. */
const sap = { password: "Working-Password-1" };
const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

const fakeSap = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`COMM_USER:${sap.password}`).toString("base64")}`;
  if (auth !== expected) return new Response("", { status: 401 });
  return new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } });
});

const save = (key: string, password: string, environment = "DEV") =>
  saveConnection(
    new NextRequest("http://localhost/api/studio/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product: "s4hana",
        key,
        label: "S/4HANA DEV",
        baseUrl: "https://my000001-api.s4hana.cloud.sap",
        authType: "basic",
        username: "COMM_USER",
        password,
        environment,
      }),
    }),
  );

const stored = (key: string) =>
  prisma.sapConnection.findFirst({ where: { organizationId: ORG, product: "s4hana", key }, select: { id: true, secretsCiphertext: true } });

describe.skipIf(!process.env.TEST_DATABASE_URL)("probe before swap on the connection save path (P0.14)", () => {
  beforeAll(async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubGlobal("fetch", fakeSap);
    await prisma.organization.create({ data: { id: ORG, name: "Rotation probe", type: "client" } });
    await prisma.user.create({ data: { id: USER.id, email: USER.email, name: USER.name, role: USER.role, organizationId: ORG } });
    session.user = USER;
  });
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.delete({ where: { id: USER.id } });
  });

  it("a mistyped rotated secret never replaces a working one", async () => {
    const key = `${RUN}-dev`;
    expect((await save(key, "Working-Password-1")).status).toBe(200);
    const row = await stored(key);
    // Proven: the Test passes, so the secret is working by the system's own record.
    const tested = await testConnection(new NextRequest("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: row!.id }),
    });
    expect(((await tested.json()) as { data: { validated: boolean } }).data.validated).toBe(true);
    const before = await stored(key);

    // The rotation, mistyped.
    const refused = await save(key, "Working-Pasword-2");
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("Nothing was changed");
    expect(body.error.message).not.toContain("Working-Pasword-2");

    // Nothing was written, and the broker still opens the working password.
    expect((await stored(key))!.secretsCiphertext).toBe(before!.secretsCiphertext);
    const resolved = await resolveSapConnection(ORG, "s4hana", key);
    expect(resolved?.secrets.password).toBe("Working-Password-1");
    // The attempt is on the record, without the secret.
    const audit = await prisma.configAudit.findFirst({
      where: { organizationId: ORG, entityId: row!.id, action: "TEST_CONNECT" },
      orderBy: { at: "desc" },
    });
    expect(JSON.stringify(audit?.after)).toContain("connection_rotation_refused");
    expect(JSON.stringify(audit?.after)).not.toContain("Pasword");

    // SAP's password really is changed, and the right one is typed: it swaps.
    sap.password = "Working-Password-2";
    expect((await save(key, "Working-Password-2")).status).toBe(200);
    expect((await resolveSapConnection(ORG, "s4hana", key))?.secrets.password).toBe("Working-Password-2");
  });

  it("does not probe a new connection, or one that has never passed a test", async () => {
    fakeSap.mockClear();
    const key = `${RUN}-new`;
    // SAP would refuse this password; a first save is not a rotation, and saves as it always has.
    expect((await save(key, "not-the-password", "SANDBOX")).status).toBe(200);
    expect((await save(key, "still-not-it", "SANDBOX")).status).toBe(200);
    expect(fakeSap).not.toHaveBeenCalled();
    expect((await resolveSapConnection(ORG, "s4hana", key))?.secrets.password).toBe("still-not-it");
  });

  it("COREEDGE_ROTATION_PROBE=off saves as before", async () => {
    vi.stubEnv("COREEDGE_ROTATION_PROBE", "off");
    const key = `${RUN}-dev`;
    expect((await save(key, "typo")).status).toBe(200);
    expect((await resolveSapConnection(ORG, "s4hana", key))?.secrets.password).toBe("typo");
  });
});
