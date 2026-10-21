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
  /** Entity sets the arrangement does not release: 403 to every user. */
  forbidden: new Set<string>(),
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
  const entitySet = decodeURIComponent(target.pathname.split("/").pop() ?? "");
  if (sap.forbidden.has(entitySet)) return new Response("", { status: 403 });
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

interface LaneOptions {
  /** The app's status: ACTIVE unless said. */
  solutionStatus?: "ACTIVE" | "RESTRICTED" | "RETIRED";
  /** When the read was proven: now unless said. */
  readAt?: Date;
  /** Stamp the row with the dataset and feed version it read (P0.2): true unless said. */
  keyed?: boolean;
}

/** An interface on `product` with a lane that has proven a read through the connection. */
async function provenLane(
  org: string,
  key: string,
  product: string,
  iface: Record<string, unknown>,
  options: LaneOptions = {},
): Promise<{ interfaceId: string }> {
  const row = await stored(org, key, product);
  const solution = await prisma.solution.create({
    data: {
      organizationId: org,
      name: "Rotation lane",
      slug: `${key}-app-${randomUUID().slice(0, 6)}`,
      classification: "CLIENT_APP",
      businessProblem: "Rotation proof test.",
      dataClass: "INTERNAL",
      status: options.solutionStatus ?? "ACTIVE",
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
    select: { id: true, entitySet: true, version: true },
  });
  await prisma.laneCheck.create({
    data: {
      organizationId: org,
      solutionId: solution.id,
      interfaceId: created.id,
      environment: "DEV",
      connectionId: row!.id,
      ...(options.keyed === false ? {} : { entitySet: created.entitySet, interfaceVersion: created.version }),
      readStatus: "OK",
      readAt: options.readAt ?? new Date(),
      readRowCount: 1,
    },
  });
  return { interfaceId: created.id };
}

/** A builder's edit of the feed: a new dataset, and the version bump every such edit makes. */
async function editFeed(org: string, interfaceId: string, entitySet: string): Promise<void> {
  const edited = await prisma.interface.updateMany({
    where: { id: interfaceId, organizationId: org },
    data: { entitySet, version: { increment: 1 } },
  });
  expect(edited.count).toBe(1);
}

/** A probe status written after the save, by the nightly sweep or a Test. */
async function statusWritten(org: string, key: string, status: string): Promise<void> {
  const row = await stored(org, key);
  await prisma.sapConnection.updateMany({ where: { id: row!.id, organizationId: org }, data: { lastValidationStatus: status } });
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
    sap.forbidden.clear();
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

  /*
   * WHAT COUNTS AS A PROVEN READ (wave 2 integration review round 2). The
   * gate held the newest OK lane row against the new secret whatever the row
   * proved: a read of a dataset the feed no longer reads, a retired app's row
   * no sweep refreshes, a read months old. It now counts a read only while
   * P0.2's board would: same feed version and dataset, fresh, still served.
   */
  it("a lane read of a feed edited since is not held against a correct rotation", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    const lane = await provenLane(org, key, "s4hana", { externalId: "purchase-orders", entitySet: "A_PurchaseOrder" });
    // The builder moves the feed to a dataset the arrangement does not release.
    await editFeed(org, lane.interfaceId, "A_PurchaseOrderItem");
    sap.forbidden.add("A_PurchaseOrderItem");
    sap.password = "Pw-2";
    fakeSap.mockClear();
    const rotated = await save(key, "Pw-2");
    expect(rotated.status).toBe(200);
    expect(fakeSap.mock.calls.some(([url]) => String(url).includes("A_PurchaseOrderItem"))).toBe(false);
    expect((await resolveSapConnection(org, "s4hana", key))?.secrets.password).toBe("Pw-2");
  });

  it("a retired app's lane read is not held against a correct rotation", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await provenLane(org, key, "s4hana", { externalId: "purchase-orders", entitySet: "A_PurchaseOrder" }, { solutionStatus: "RETIRED" });
    // Since retired, the arrangement stopped releasing the dataset; no sweep reads it any more.
    sap.forbidden.add("A_PurchaseOrder");
    sap.password = "Pw-2";
    expect((await save(key, "Pw-2")).status).toBe(200);
    expect((await resolveSapConnection(org, "s4hana", key))?.secrets.password).toBe("Pw-2");
  });

  it("a lane read older than the lane TTL is not held against a correct rotation", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await provenLane(
      org,
      key,
      "s4hana",
      { externalId: "purchase-orders", entitySet: "A_PurchaseOrder" },
      { readAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    );
    sap.forbidden.add("A_PurchaseOrder");
    sap.password = "Pw-2";
    expect((await save(key, "Pw-2")).status).toBe(200);
    expect((await resolveSapConnection(org, "s4hana", key))?.secrets.password).toBe("Pw-2");
  });

  it("a lane row written before checks recorded their dataset (pre-P0.2) proves nothing", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await provenLane(org, key, "s4hana", { externalId: "purchase-orders", entitySet: "A_PurchaseOrder" }, { keyed: false });
    sap.forbidden.add("A_PurchaseOrder");
    sap.password = "Pw-2";
    expect((await save(key, "Pw-2")).status).toBe(200);
  });

  it("walks past a set-aside lane row to an older one that still counts", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    // The metadata is not released: only the reads prove the secret.
    sap.metadataStatus = 404;
    await provenLane(
      org,
      key,
      "s4hana",
      { externalId: "purchase-orders", entitySet: "A_PurchaseOrder" },
      { readAt: new Date(Date.now() - 60 * 60 * 1000) },
    );
    const newest = await provenLane(org, key, "s4hana", { externalId: "purchase-orders", entitySet: "A_PurchaseOrderItem" });
    await editFeed(org, newest.interfaceId, "A_Restricted");
    sap.forbidden.add("A_Restricted");
    // A correct rotation is judged on the older lane's read, which still describes its feed.
    sap.password = "Pw-2";
    fakeSap.mockClear();
    expect((await save(key, "Pw-2")).status).toBe(200);
    expect(fakeSap.mock.calls.some(([url]) => String(url).includes("/A_PurchaseOrder?"))).toBe(true);
    expect(fakeSap.mock.calls.some(([url]) => String(url).includes("A_Restricted"))).toBe(false);
    // And that read is what protects the secret now.
    await expectTypoRefused(org, key, "Pw-2-typo", "Pw-2");
  });

  it("a carried read is not held against the next rotation once the feed has moved on", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    const lane = await provenLane(org, key, "s4hana", { externalId: "purchase-orders", entitySet: "A_PurchaseOrder" });
    sap.metadataStatus = 404;
    // A probed rotation: its proof carries the read of A_PurchaseOrder at v1.
    sap.password = "Pw-2";
    expect((await save(key, "Pw-2")).status).toBe(200);
    // The feed then moves to a dataset nobody was proven on.
    await editFeed(org, lane.interfaceId, "A_Restricted");
    sap.forbidden.add("A_Restricted");
    sap.password = "Pw-3";
    expect((await save(key, "Pw-3")).status).toBe(200);
    expect((await resolveSapConnection(org, "s4hana", key))?.secrets.password).toBe("Pw-3");
  });

  /*
   * A STATUS THAT SAYS NOTHING ABOUT THE CREDENTIAL KEEPS THE PROOF (review
   * round 2). A sweep's one TIMEOUT, a 5xx, or the group marker a sibling's
   * unopenable secret stamps on this row replaced the carried proof as the
   * only metadata evidence, so the next typo replaced the working secret.
   */
  it.each(["TIMEOUT", "ERROR", "GROUP_UNREADABLE"])(
    "after a probed rotation, a %s written by a probe does not unprotect the next save",
    async (status) => {
      const org = await freshOrg();
      const key = "dev";
      expect((await save(key, "Pw-1")).status).toBe(200);
      await testedOk(org, key);
      sap.password = "Pw-2";
      expect((await save(key, "Pw-2")).status).toBe(200);
      await statusWritten(org, key, status);
      await expectTypoRefused(org, key, "Pw-2-typo", "Pw-2");
    },
  );

  it("after a Test that answered OK, a later TIMEOUT does not unprotect the next save", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await testedOk(org, key);
    await statusWritten(org, key, "TIMEOUT");
    await expectTypoRefused(org, key, "Pw-typo", "Pw-1");
  });

  it("a $metadata the working secret no longer reads (NOT_FOUND) is not demanded of a correct new one", async () => {
    const org = await freshOrg();
    const key = "dev";
    expect((await save(key, "Pw-1")).status).toBe(200);
    await testedOk(org, key);
    // The arrangement stops releasing the probe path; the next Test says so.
    sap.metadataStatus = 404;
    await statusWritten(org, key, "NOT_FOUND");
    sap.password = "Pw-2";
    expect((await save(key, "Pw-2")).status).toBe(200);
    expect((await resolveSapConnection(org, "s4hana", key))?.secrets.password).toBe("Pw-2");
  });
});
