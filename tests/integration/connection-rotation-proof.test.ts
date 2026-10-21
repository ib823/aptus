// @vitest-environment node
/**
 * P0.14 acceptance across re-saves: a mistyped rotated secret never replaces a
 * working one, however many saves came before it (wave 2 integration review
 * round 1).
 *
 * P0.2 made every re-save drop the evidence the probe gate reads (the probe
 * status and the connection's lane checks), so the save AFTER any re-save was
 * not probed, and a typo there replaced a secret the previous save had just
 * proven. What the stored credentials are proven to do is now carried on the
 * save's own audit row, keyed by the revision it wrote (rotation-probe.ts
 * `carriedRotationProof`).
 *
 * And the saves the probe must not refuse: an ECC connection with no probe
 * path whose lane reads a custom service (the read is the proof), a re-save
 * that does not change the credentials (a SAP outage is no reason to refuse
 * it), and a re-point to another system (the old system's proof says nothing
 * about the new one).
 *
 * Through the real Connections route against real PostgreSQL, SAP stood in for
 * by `fetch`. Opt-in like the other integration tests: skipped without
 * TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const RUN = `p014p-${randomUUID().slice(0, 8)}`;
const orgs: string[] = [];

/** What each SAP host accepts, as it changes over a test. */
const sap = {
  password: "Pw-1",
  metadataStatus: 200,
  /** Hosts whose $metadata answers 404 whatever the password: a re-point target. */
  metadataMissingOn: new Set<string>(),
};
const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

const fakeSap = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`COMM_USER:${sap.password}`).toString("base64")}`;
  if (auth !== expected) return new Response("", { status: 401 });
  const target = new URL(String(url));
  if (target.pathname.includes("$metadata")) {
    if (sap.metadataMissingOn.has(target.host)) return new Response("", { status: 404 });
    return sap.metadataStatus === 200
      ? new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } })
      : new Response("", { status: sap.metadataStatus });
  }
  return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

/** A fresh organization and builder per test, so no two tests' connections are twins. */
async function freshOrg(): Promise<string> {
  const org = `${RUN}-${orgs.length}`;
  orgs.push(org);
  await prisma.organization.create({ data: { id: org, name: "Rotation proof", type: "client" } });
  const user = { id: `${org}-dev`, email: `${org}-dev@abeam.com`, name: "Dev", role: "consultant", organizationId: org };
  await prisma.user.create({ data: user });
  session.user = { ...user, authMethod: "session" };
  return org;
}

interface SaveFields {
  product?: string;
  baseUrl?: string;
  environment?: string;
  writeEnabled?: boolean;
  writeSecret?: string;
  label?: string;
}

const save = (key: string, password: string, fields: SaveFields = {}) =>
  saveConnection(
    new NextRequest("http://localhost/api/studio/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product: fields.product ?? "s4hana",
        key,
        label: fields.label ?? "S/4HANA DEV",
        baseUrl: fields.baseUrl ?? "https://my000001-api.s4hana.cloud.sap",
        authType: "basic",
        username: "COMM_USER",
        password,
        environment: fields.environment ?? "DEV",
        ...(fields.writeEnabled ? { writeEnabled: true, writeSecret: fields.writeSecret } : {}),
      }),
    }),
  );

const stored = (org: string, key: string, product = "s4hana") =>
  prisma.sapConnection.findFirst({
    where: { organizationId: org, product, key },
    select: { id: true, secretsCiphertext: true },
  });

async function testedOk(org: string, key: string): Promise<void> {
  const row = await stored(org, key);
  const tested = await testConnection(new NextRequest("http://localhost/x", { method: "POST" }), {
    params: Promise.resolve({ id: row!.id }),
  });
  expect(((await tested.json()) as { data: { validated: boolean } }).data.validated).toBe(true);
}

async function expectTypoRefused(org: string, key: string, typo: string, working: string, fields: SaveFields = {}) {
  const before = await stored(org, key, fields.product);
  fakeSap.mockClear();
  const refused = await save(key, typo, fields);
  expect(refused.status).toBe(400);
  expect(((await refused.json()) as { error: { message: string } }).error.message).toContain("Nothing was changed");
  expect(fakeSap).toHaveBeenCalled();
  expect((await stored(org, key, fields.product))!.secretsCiphertext).toBe(before!.secretsCiphertext);
  expect((await resolveSapConnection(org, fields.product ?? "s4hana", key))?.secrets.password).toBe(working);
}

/** An interface on `product` with a lane that has proven a read through the connection. */
async function provenLane(org: string, key: string, product: string, iface: Record<string, unknown>) {
  const row = await stored(org, key, product);
  const solution = await prisma.solution.create({
    data: {
      organizationId: org,
      name: "Rotation lane",
      slug: `${key}-app`,
      classification: "CLIENT_APP",
      businessProblem: "Rotation proof test.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const created = await prisma.interface.create({
    data: {
      organizationId: org,
      solutionId: solution.id,
      name: "Orders",
      sapProduct: product,
      operation: "READ",
      mode: "READ",
      status: "ACTIVE",
      ...(iface as { externalId: string; entitySet: string }),
    },
    select: { id: true },
  });
  await prisma.laneCheck.create({
    data: {
      organizationId: org,
      solutionId: solution.id,
      interfaceId: created.id,
      environment: "DEV",
      connectionId: row!.id,
      readStatus: "OK",
      readAt: new Date(),
      readRowCount: 1,
    },
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the rotation probe across re-saves (P0.14, wave 2 review round 1)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubGlobal("fetch", fakeSap);
    sap.password = "Pw-1";
    sap.metadataStatus = 200;
    sap.metadataMissingOn.clear();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    for (const org of orgs) {
      const where = { organizationId: org };
      await prisma.laneCheck.deleteMany({ where });
      await prisma.interface.deleteMany({ where });
      await prisma.solution.deleteMany({ where });
      await prisma.sapConnectionProbeEvent.deleteMany({ where });
      await prisma.configAudit.deleteMany({ where });
      await prisma.sapConnection.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organization.delete({ where: { id: org } });
    }
  });

  it("after a probed rotation, a typo in the very next save is still refused", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await testedOk(org, key);

    // A correct rotation: SAP's password changes, the right one is typed, the probe passes.
    sap.password = "Pw-2";
    expect((await save(key, "Pw-2")).status).toBe(200);
    expect((await resolveSapConnection(org, "s4hana", key))?.secrets.password).toBe("Pw-2");

    // Minutes later, no Test in between: a typo.
    await expectTypoRefused(org, key, "Pw-2-typo", "Pw-2");
    // And a second correct rotation still goes through, and is still protected after.
    sap.password = "Pw-3";
    expect((await save(key, "Pw-3")).status).toBe(200);
    await expectTypoRefused(org, key, "Pw-3-typo", "Pw-3");
  });

  it("a lane-proven read survives a probed rotation too (no metadata proof)", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await provenLane(org, key, "s4hana", { externalId: "purchase-orders", entitySet: "A_PurchaseOrder" });
    // The probe path's $metadata is not in the arrangement: only the read proves the secret.
    sap.metadataStatus = 404;
    sap.password = "Pw-2";
    expect((await save(key, "Pw-2")).status).toBe(200);
    await expectTypoRefused(org, key, "Pw-2-typo", "Pw-2");
  });

  it("P0.3's form flow: a save that switches writes on, then a typo, is refused", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await testedOk(org, key);
    // Tick Allow writes, enter the write secret, retype the (unchanged) password.
    expect((await save(key, "Pw-1", { writeEnabled: true, writeSecret: "write-1" })).status).toBe(200);
    await expectTypoRefused(org, key, "Pw-1-typo", "Pw-1", { writeEnabled: true, writeSecret: "write-1" });
  });

  it("ECC with no probe path: a correct secret swaps on the proven read, a typo is refused", async () => {
    const org = await freshOrg();
    const key = "ecc-dev";
    const ecc = { product: "ecc", baseUrl: "https://ecc-gw.s4hana.cloud.sap", label: "ECC DEV" };
    sap.password = "Ecc-Pw-1";
    expect((await save(key, "Ecc-Pw-1", ecc)).status).toBe(200);
    await provenLane(org, key, "ecc", {
      externalId: "zorders",
      entitySet: "ZOrderSet",
      servicePath: "/sap/opu/odata/sap/ZORDERS_SRV",
      odataVersion: "V2",
    });

    // The same, correct secret (a label fix): saved.
    expect((await save(key, "Ecc-Pw-1", { ...ecc, label: "ECC DEV (orders)" })).status).toBe(200);
    // A real rotation: the read with the new secret is the proof.
    sap.password = "Ecc-Pw-2";
    fakeSap.mockClear();
    const rotated = await save(key, "Ecc-Pw-2", ecc);
    expect(rotated.status).toBe(200);
    expect(fakeSap.mock.calls.some(([url]) => String(url).includes("ZOrderSet"))).toBe(true);
    expect((await resolveSapConnection(org, "ecc", key))?.secrets.password).toBe("Ecc-Pw-2");
    // And a typo, with the lane checks gone since that save, is refused on the carried proof.
    await expectTypoRefused(org, key, "Ecc-Pw-typo", "Ecc-Pw-2", ecc);
  });

  it("a re-save that does not change the credentials is not refused during a SAP outage", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await testedOk(org, key);
    sap.metadataStatus = 503;
    fakeSap.mockClear();
    const relabelled = await save(key, "Pw-1", { label: "S/4HANA DEV (renamed)" });
    expect(relabelled.status).toBe(200);
    // Nothing to prove: the credentials did not change, so SAP was not asked.
    expect(fakeSap).not.toHaveBeenCalled();
    // The proof carries over: a typo after it is still refused.
    await expectTypoRefused(org, key, "Pw-typo", "Pw-1");
  });

  it("a rotation during a SAP outage is refused as SAP not answering, not as a bad credential", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await testedOk(org, key);
    // The password really changed at SAP, and SAP then answers 503.
    sap.password = "Pw-2";
    sap.metadataStatus = 503;
    const refused = await save(key, "Pw-2");
    expect(refused.status).toBe(400);
    const message = ((await refused.json()) as { error: { message: string } }).error.message;
    expect(message).toContain("SAP did not answer");
    expect(message).not.toContain("could not read the service metadata");
    expect((await resolveSapConnection(org, "s4hana", key))?.secrets.password).toBe("Pw-1");
  });

  it("re-pointing a proven connection to another system saves as before", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await testedOk(org, key);
    // The new tenant's arrangement does not release the probe path's $metadata.
    const other = "my000002-api.s4hana.cloud.sap";
    sap.metadataMissingOn.add(other);
    const moved = await save(key, "Pw-1", { baseUrl: `https://${other}` });
    expect(moved.status).toBe(200);
    const resolved = await resolveSapConnection(org, "s4hana", key);
    expect(resolved?.baseUrl).toBe(`https://${other}`);
  });
});
