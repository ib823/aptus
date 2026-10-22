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
// And whether the gateway answers at all (`down`: 503 to everything).
const sap = { password: "Working-Password-1", metadataStatus: 200, metadataOnlyAt: null as string | null, down: false };
const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

const fakeSap = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  if (sap.down) return new Response("", { status: 503 });
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`COMM_USER:${sap.password}`).toString("base64")}`;
  if (auth !== expected) return new Response("", { status: 401 });
  if (String(url).includes("$metadata")) {
    // An arrangement that releases one service only: every other answers 403.
    if (sap.metadataOnlyAt && !String(url).includes(sap.metadataOnlyAt)) return new Response("", { status: 403 });
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
        // What the read proved, as P0.2's sweep stamps it: an unstamped row
        // proves nothing (wave 2 integration review round 2).
        entitySet: "A_PurchaseOrder",
        interfaceVersion: 1,
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

  /*
   * A ROTATION FROM THE FORM DROPS THE PROBE PATH (wave 2 final review).
   * Studio's form never pre-fills the API path, so the documented rotation
   * (type the key and the new password, save) sends none. The metadata proof
   * was made at the stored path; holding the new secret to S/4's default
   * service (403 here) or to no path at all (ECC) refused a correct password
   * and kept the dead one sealed. The metadata is demanded only at the path it
   * was proven at; a typo is still refused at sign-in. Its own organization,
   * whose DEV binding is free.
   *
   * Wave 2 final review round 2: "unopenable" is the same save after the
   * stored row stopped decrypting (a keyring mix-up, a restore). The path is
   * judged from the row's plaintext column, so the correct password still
   * replaces it.
   */
  it.each([
    ["s4hana", "openable", "https://my000001-api.s4hana.cloud.sap", null],
    ["ecc", "openable", "https://ecc.example.com", "100"],
    ["s4hana", "unopenable", "https://my000001-api.s4hana.cloud.sap", null],
    ["ecc", "unopenable", "https://ecc.example.com", "100"],
  ] as const)("%s (%s row): a correct password re-saved without its probe path replaces the dead one", async (product, variant, baseUrl, client) => {
    const tag = `${product}-${variant}`;
    const org = `${RUN}-path-${tag}-org`;
    const builder = { ...USER, id: `${RUN}-path-${tag}-dev`, email: `${RUN}-path-${tag}@abeam.com`, organizationId: org };
    await prisma.organization.create({ data: { id: org, name: "Rotation probe path", type: "client" } });
    await prisma.user.create({ data: { id: builder.id, email: builder.email, name: builder.name, role: builder.role, organizationId: org } });
    session.user = builder;
    vi.stubEnv("SAP_HOST_ALLOWLIST_EXTRA", "example.com");
    const key = `${RUN}-path-${tag}`;
    const body = (password: string, apiPath?: string) =>
      saveConnection(
        new NextRequest("http://localhost/api/studio/connections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            product,
            key,
            label: `${product} DEV`,
            baseUrl,
            authType: "basic",
            username: "COMM_USER",
            password,
            environment: "DEV",
            ...(client ? { client } : {}),
            ...(apiPath ? { apiPath } : {}),
          }),
        }),
      );
    const secret = async () => (await resolveSapConnection(org, product, key))?.secrets.password;
    sap.password = "Old-Password-1";
    sap.metadataOnlyAt = "/ZCUSTOM_SRV/";
    try {
      const first = await body("Old-Password-1", "/sap/opu/odata/sap/ZCUSTOM_SRV");
      expect(first.status, JSON.stringify(await first.clone().json())).toBe(200);
      const row = await prisma.sapConnection.findFirst({ where: { organizationId: org, product, key }, select: { id: true } });
      const tested = await testConnection(new NextRequest("http://localhost/x", { method: "POST" }), {
        params: Promise.resolve({ id: row!.id }),
      });
      expect(((await tested.json()) as { data: { status: string } }).data.status).toBe("OK");

      // SAP Basis rotates the password: the stored one is dead.
      sap.password = "New-Password-2";
      if (variant === "unopenable") {
        // The stored row no longer opens: the key it was sealed with is gone.
        vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "d".repeat(64));
        await expect(resolveSapConnection(org, product, key)).rejects.toThrow();
      }
      // A typo, re-saved from the form (no probe path), is still refused.
      if (product === "s4hana") {
        expect((await body("New-Pasword-2")).status).toBe(400);
        if (variant === "openable") expect(await secret()).toBe("Old-Password-1");
      }
      // Wave 2 final review round 2: while SAP does not answer (a 503 from
      // the gateway), a re-save is not judged on a sign-in SAP never made,
      // whether or not it keeps the path. Nothing is changed.
      if (product === "s4hana" && variant === "openable") {
        sap.down = true;
        try {
          for (const apiPath of [undefined, "/sap/opu/odata/sap/ZCUSTOM_SRV"]) {
            const unanswered = await body("New-Pasword-2", apiPath);
            expect(unanswered.status).toBe(400);
            expect(((await unanswered.json()) as { error: { message: string } }).error.message).toContain("SAP did not answer");
            expect(await secret()).toBe("Old-Password-1");
          }
        } finally {
          sap.down = false;
        }
      }
      // The right one, re-saved from the form, replaces it.
      const resaved = await body("New-Password-2");
      expect(resaved.status, JSON.stringify(await resaved.clone().json())).toBe(200);
      expect(await secret()).toBe("New-Password-2");
    } finally {
      sap.metadataOnlyAt = null;
      sap.down = false;
      vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
      session.user = USER;
      await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: org } });
      await prisma.configAudit.deleteMany({ where: { organizationId: org } });
      await prisma.organization.delete({ where: { id: org } });
      await prisma.user.delete({ where: { id: builder.id } });
    }
  });

  /*
   * AN OK FROM SETTINGS THE ROW NO LONGER HAS (wave 2 final review round 2).
   * Before wave 2, a save never cleared the probe status, and the Studio form
   * never sent the API path, so a form re-save of an ECC connection dropped
   * its path and kept its OK. ECC has no default service and the sweep skips
   * a row with no probe path, so that OK stays. Counted as a metadata proof,
   * it refused every correct rotation without a call to SAP until someone
   * pressed Test. On S/4 the same OK held a correct rotation to the default
   * service's $metadata, which the arrangement does not release (403 here).
   * An OK observed before the last save on the record is no longer proof of
   * these settings.
   */
  it.each([
    ["ecc", "https://ecc.example.com", "100"],
    ["s4hana", "https://my000001-api.s4hana.cloud.sap", null],
  ] as const)("%s: an OK left by a pre-deploy form save that dropped the path does not refuse a correct rotation", async (product, baseUrl, client) => {
    const org = `${RUN}-stale-ok-${product}-org`;
    const builder = { ...USER, id: `${RUN}-stale-ok-${product}-dev`, email: `${RUN}-stale-ok-${product}@abeam.com`, organizationId: org };
    await prisma.organization.create({ data: { id: org, name: "Rotation stale OK", type: "client" } });
    await prisma.user.create({ data: { id: builder.id, email: builder.email, name: builder.name, role: builder.role, organizationId: org } });
    session.user = builder;
    vi.stubEnv("SAP_HOST_ALLOWLIST_EXTRA", "example.com");
    const key = `${RUN}-stale-ok-${product}`;
    const body = (password: string, apiPath?: string) =>
      saveConnection(
        new NextRequest("http://localhost/api/studio/connections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            product,
            key,
            label: `${product} DEV`,
            baseUrl,
            authType: "basic",
            username: "COMM_USER",
            password,
            environment: "DEV",
            ...(client ? { client } : {}),
            ...(apiPath ? { apiPath } : {}),
          }),
        }),
      );
    sap.password = "Old-1";
    sap.metadataOnlyAt = "/ZCUSTOM_SRV/";
    try {
      expect((await body("Old-1", "/sap/opu/odata/sap/ZCUSTOM_SRV")).status).toBe(200);
      const row = await prisma.sapConnection.findFirst({ where: { organizationId: org, product, key }, select: { id: true } });
      const tested = await testConnection(new NextRequest("http://localhost/x", { method: "POST" }), {
        params: Promise.resolve({ id: row!.id }),
      });
      expect(((await tested.json()) as { data: { status: string } }).data.status).toBe("OK");
      const proven = await prisma.sapConnection.findFirst({ where: { id: row!.id, organizationId: org }, select: { lastValidatedAt: true } });

      // A main-era form save: the path dropped, the status left as it was,
      // and its connection_replaced audit row on the record.
      await prisma.sapConnection.updateMany({ where: { id: row!.id, organizationId: org }, data: { apiPath: null } });
      await prisma.configAudit.create({
        data: {
          organizationId: org,
          actorId: builder.id,
          entityType: "Connection",
          entityId: row!.id,
          action: "UPDATE",
          after: { event: "connection_replaced", product, key },
          at: new Date(proven!.lastValidatedAt!.getTime() + 1000),
        },
      });

      // SAP Basis rotates the password, and the right one is typed into the form.
      sap.password = "New-2";
      const resaved = await body("New-2");
      expect(resaved.status, JSON.stringify(await resaved.clone().json())).toBe(200);
      expect((await resolveSapConnection(org, product, key))?.secrets.password).toBe("New-2");
    } finally {
      sap.metadataOnlyAt = null;
      session.user = USER;
      await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: org } });
      await prisma.configAudit.deleteMany({ where: { organizationId: org } });
      await prisma.organization.delete({ where: { id: org } });
      await prisma.user.delete({ where: { id: builder.id } });
    }
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
