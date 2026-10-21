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
// And whether the probe path's $metadata is released to it: a data service
// can work while its $metadata is not in the communication arrangement.
const sap = { password: "Working-Password-1", metadataStatus: 200 };
const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

const fakeSap = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`COMM_USER:${sap.password}`).toString("base64")}`;
  if (auth !== expected) return new Response("", { status: 401 });
  if (String(url).includes("$metadata")) {
    return sap.metadataStatus === 200
      ? new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } })
      : new Response("", { status: sap.metadataStatus });
  }
  return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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
    await prisma.laneCheck.deleteMany({ where: { organizationId: ORG } });
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

  /*
   * WORKING IS NOT ONLY "THE LAST TEST WAS OK" (review of P0.14). A sweep
   * that met a transient SAP timeout records TIMEOUT; a probe path whose
   * $metadata is not in the arrangement records NOT_FOUND while the data
   * service serves every lane. Either way the secret is working, as a lane's
   * proven read through this connection shows, and a typo must still not
   * replace it. The new secret must prove what the old one proved: the read,
   * and the metadata only where the old one passed it.
   */
  it.each([
    ["TIMEOUT", 200, "TEST"],
    ["NOT_FOUND", 404, "PROD"],
  ] as const)("a typo does not replace a working secret whose last probe read %s", async (lastStatus, metadataStatus, environment) => {
    sap.password = "Lane-Password-1";
    sap.metadataStatus = 200;
    const key = `${RUN}-lane-${environment.toLowerCase()}`;
    expect((await save(key, "Lane-Password-1", environment)).status).toBe(200);
    const row = await stored(key);
    const solution = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Rotation lane",
        slug: `${key}-app`,
        classification: "CLIENT_APP",
        businessProblem: "Rotation probe test.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    const iface = await prisma.interface.create({
      data: {
        organizationId: ORG,
        solutionId: solution.id,
        name: "Purchase orders",
        sapProduct: "s4hana",
        externalId: "purchase-orders",
        operation: "READ",
        entitySet: "A_PurchaseOrder",
        mode: "READ",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    // A lane has read through this connection: the secret is working...
    await prisma.laneCheck.create({
      data: {
        organizationId: ORG,
        solutionId: solution.id,
        interfaceId: iface.id,
        environment,
        connectionId: row!.id,
        readStatus: "OK",
        readAt: new Date(),
        readRowCount: 1,
      },
    });
    // ...though the connection's last probe did not read OK.
    await prisma.sapConnection.updateMany({
      where: { id: row!.id, organizationId: ORG },
      data: { isActive: true, lastValidationStatus: lastStatus, lastValidatedAt: new Date() },
    });
    sap.metadataStatus = metadataStatus;
    const before = await stored(key);

    const refused = await save(key, "Lane-Pasword-typo", environment);
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: { message: string } }).error.message).toContain("Nothing was changed");
    expect((await stored(key))!.secretsCiphertext).toBe(before!.secretsCiphertext);
    expect((await resolveSapConnection(ORG, "s4hana", key))?.secrets.password).toBe("Lane-Password-1");

    // The right new password still swaps, though (NOT_FOUND) it cannot read
    // a $metadata the working secret never read either.
    sap.password = "Lane-Password-2";
    expect((await save(key, "Lane-Password-2", environment)).status).toBe(200);
    expect((await resolveSapConnection(ORG, "s4hana", key))?.secrets.password).toBe("Lane-Password-2");
    sap.metadataStatus = 200;
  });

  it("does not probe a secret SAP last refused (UNAUTHORIZED): there is nothing working to protect", async () => {
    sap.password = "Other-Password";
    const key = `${RUN}-lane-test`;
    const row = await stored(key);
    await prisma.sapConnection.updateMany({ where: { id: row!.id, organizationId: ORG }, data: { isActive: true, lastValidationStatus: "UNAUTHORIZED" } });
    fakeSap.mockClear();
    expect((await save(key, "Whatever-1", "TEST")).status).toBe(200);
    expect(fakeSap).not.toHaveBeenCalled();
    expect((await resolveSapConnection(ORG, "s4hana", key))?.secrets.password).toBe("Whatever-1");
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
