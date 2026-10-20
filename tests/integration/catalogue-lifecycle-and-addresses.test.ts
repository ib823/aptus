// @vitest-environment node
/**
 * P0.8 against real PostgreSQL: the deploy-time lifecycle stamp, and the
 * per-tenant record of a V4 address that answered 200.
 *
 * THE STAMP (applyHubLifecycle) runs on every deploy, so what it must never do
 * matters as much as what it does:
 *   A  an existing API row with no lifecycle  → stamped, in both tables
 *   B  a row already current                  → not written (second run: 0)
 *   C  a row stamped from a LATER Hub change  → left alone, not reverted
 *   D  a recorded successor                   → kept; a missing one filled
 *   E  an id the snapshot names but no row has → no row created
 *   F  a non-API row with the same externalId → untouched
 *   G  rawMetadataJson (every tenant's probes) and updatedAt → untouched
 *
 * THE RECORD (catalogue-address-verification.ts), through the tenant guard in
 * throw mode, so a query that forgets its organization fails here.
 *
 * Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import {
  addressVerificationScope,
  currentAddressVerification,
  readAddressVerifications,
  recordAddressProbe,
} from "@/lib/sap-public/catalogue-address-verification";
import { applyHubLifecycle, type HubLifecycleRecord } from "@/lib/sap-public/hub-lifecycle-snapshot";

const RUN = `p08-${randomUUID().slice(0, 8)}`;
const id = (s: string) => `${RUN}_${s}`;
const OLD = new Date("2026-01-01T00:00:00.000Z");
const SNAPSHOT_AT = "2026-08-01T00:00:00.000Z";
const LATER = new Date("2026-09-30T00:00:00.000Z");
const PROBES = { probes: { "org:x:s4hana:k": { http: 200, at: "2026-10-01T00:00:00.000Z" } }, source: "SapApiReference" };

const record = (externalId: string, over: Partial<HubLifecycleRecord> = {}): HubLifecycleRecord => ({
  externalId,
  hubState: "DEPRECATED",
  hubVersion: "1.2.0",
  hubModifiedAt: SNAPSHOT_AT,
  hubSubType: "ODATA",
  catalogueRelease: "2608",
  successorExternalId: null,
  ...over,
});

async function hubRow(externalId: string, data: Record<string, unknown> = {}, contentType: "API" | "EVENT" = "API") {
  return prisma.sapHubContent.create({
    data: {
      contentType,
      externalId,
      title: externalId,
      description: "",
      status: "Released",
      hubUrl: "u",
      rawMetadataJson: PROBES,
      ...data,
    },
  });
}

async function refRow(apiId: string, data: Record<string, unknown> = {}) {
  return prisma.sapApiReference.create({
    data: { apiId, apiName: apiId, description: "", status: "Released", apiHubUrl: "u", ...data },
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the deploy-time lifecycle stamp, against real PostgreSQL", () => {
  beforeAll(async () => {
    await refRow(id("A"));
    await hubRow(id("A"), { updatedAt: OLD });
    await hubRow(id("C"), { hubState: "ACTIVE", hubModifiedAt: LATER, hubVersion: "2.0.0" });
    await hubRow(id("D1"), { successorExternalId: "SAP_NAMED_EARLIER" });
    await hubRow(id("D2"));
    await hubRow(id("F"), {}, "EVENT");
  });

  afterAll(async () => {
    await prisma.sapHubContent.deleteMany({ where: { externalId: { startsWith: RUN } } });
    await prisma.sapApiReference.deleteMany({ where: { apiId: { startsWith: RUN } } });
  });

  it("stamps, leaves what it must, and changes nothing on the second run", async () => {
    const records = [
      record(id("A")),
      record(id("C")),
      record(id("D1"), { successorExternalId: "FROM_MAP" }),
      record(id("D2"), { successorExternalId: "FROM_MAP" }),
      record(id("E")),
      record(id("F")),
    ];
    const before = await prisma.sapHubContent.findFirstOrThrow({ where: { externalId: id("A"), contentType: "API" } });

    const first = await applyHubLifecycle(prisma, records);
    // A (reference) · A, D1, D2 (catalogue). C is newer, E has no row, F is an event.
    expect(first).toEqual({ apiReferenceRows: 1, hubContentRows: 3 });

    const a = await prisma.sapHubContent.findFirstOrThrow({ where: { externalId: id("A"), contentType: "API" } });
    expect(a).toMatchObject({ hubState: "DEPRECATED", hubVersion: "1.2.0", hubSubType: "ODATA", catalogueRelease: "2608" });
    expect(a.hubModifiedAt?.toISOString()).toBe(SNAPSHOT_AT);
    // G — the probes and the import time are not the stamp's to change.
    expect(a.rawMetadataJson).toEqual(PROBES);
    expect(a.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    const aRef = await prisma.sapApiReference.findUniqueOrThrow({ where: { apiId: id("A") } });
    expect(aRef.hubState).toBe("DEPRECATED");

    // C — a fresher stamp stands.
    const c = await prisma.sapHubContent.findFirstOrThrow({ where: { externalId: id("C") } });
    expect(c).toMatchObject({ hubState: "ACTIVE", hubVersion: "2.0.0" });

    // D — kept, and filled.
    expect((await prisma.sapHubContent.findFirstOrThrow({ where: { externalId: id("D1") } })).successorExternalId).toBe(
      "SAP_NAMED_EARLIER",
    );
    expect((await prisma.sapHubContent.findFirstOrThrow({ where: { externalId: id("D2") } })).successorExternalId).toBe("FROM_MAP");

    // E — nothing created; F — the event row is untouched.
    expect(await prisma.sapHubContent.count({ where: { externalId: id("E") } })).toBe(0);
    expect(await prisma.sapApiReference.count({ where: { apiId: id("E") } })).toBe(0);
    expect((await prisma.sapHubContent.findFirstOrThrow({ where: { externalId: id("F") } })).hubState).toBeNull();

    // B — idempotent.
    expect(await applyHubLifecycle(prisma, records)).toEqual({ apiReferenceRows: 0, hubContentRows: 0 });
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("the V4 address record, against real PostgreSQL", () => {
  const ORG = `${RUN}-org`;
  const PATH = "/sap/opu/odata4/sap/ce_bank/srvd_a2x/sap/ce_bank/0003";
  const service = { key: "CE_BANK_0003", hubApiId: "CE_BANK_0003", path: PATH, protocol: "ODATAV4" as const };
  const scope = addressVerificationScope({
    source: "connection",
    organizationId: ORG,
    product: "s4hana",
    tenantKey: "x5m-dev",
    connectionId: "conn-dev",
    baseUrl: "https://x5m.example/",
  })!;
  const deployment = addressVerificationScope({
    source: "deployment",
    organizationId: ORG, // ignored: a deployment tenant belongs to no organization
    product: "s4hana",
    tenantKey: `${RUN}-default`,
    connectionId: null,
    baseUrl: "https://demo.example",
  })!;

  afterAll(async () => {
    await prisma.catalogueAddressVerification.deleteMany({ where: { organizationId: ORG } });
    await prisma.catalogueAddressVerification.deleteMany({ where: { organizationId: "-deployment-", tenantKey: `${RUN}-default` } });
    await prisma.$disconnect();
  });

  it("a 200 files it, a renewed 200 updates it, a 403 leaves it, a 404 at the path removes it", async () => {
    const at = new Date("2026-10-20T10:00:00.000Z");
    await recordAddressProbe(scope, { service, status: 200, actorUserId: "u1", method: "probe-all", at });
    let stored = await readAddressVerifications(scope);
    expect(currentAddressVerification(stored.get("CE_BANK_0003"), { path: PATH, scope })?.toISOString()).toBe(at.toISOString());

    const renewed = new Date("2026-10-21T10:00:00.000Z");
    await recordAddressProbe(scope, { service, status: 200, actorUserId: "u2", method: "detail-probe", at: renewed });
    expect(await prisma.catalogueAddressVerification.count({ where: { organizationId: ORG } })).toBe(1);
    const row = await prisma.catalogueAddressVerification.findFirstOrThrow({ where: { organizationId: ORG } });
    expect(row).toMatchObject({ verifiedByUserId: "u2", method: "detail-probe", baseUrl: "https://x5m.example" });

    await recordAddressProbe(scope, { service, status: 403, actorUserId: "u1", method: "probe-all" });
    expect(await prisma.catalogueAddressVerification.count({ where: { organizationId: ORG } })).toBe(1);

    // A 404 at ANOTHER path is not about this proof.
    await recordAddressProbe(scope, { service: { ...service, path: "/other" }, status: 404, actorUserId: "u1", method: "probe-all" });
    expect(await prisma.catalogueAddressVerification.count({ where: { organizationId: ORG } })).toBe(1);

    await recordAddressProbe(scope, { service, status: 404, actorUserId: "u1", method: "probe-all" });
    stored = await readAddressVerifications(scope);
    expect(stored.size).toBe(0);
  });

  it("one organization's proof is not another's, and a deployment tenant's is filed under -deployment-", async () => {
    await recordAddressProbe(deployment, { service, status: 200, actorUserId: "admin", method: "probe-all" });
    const other = { ...scope, organizationId: `${RUN}-other-org` };
    expect((await readAddressVerifications(other)).size).toBe(0);
    const filed = await prisma.catalogueAddressVerification.findFirstOrThrow({
      where: { organizationId: "-deployment-", tenantKey: `${RUN}-default` },
    });
    expect(filed.connectionId).toBeNull();
  });

  it("a V2 address is never recorded, and a failed write never throws", async () => {
    await recordAddressProbe(scope, {
      service: { ...service, protocol: "ODATAV2", path: "/sap/opu/odata/sap/API_X" },
      status: 200,
      actorUserId: "u1",
      method: "probe-all",
    });
    expect(await prisma.catalogueAddressVerification.count({ where: { organizationId: ORG } })).toBe(0);
    await expect(
      recordAddressProbe({ ...scope, organizationId: "x".repeat(10) }, {
        service: { ...service, path: null as unknown as string },
        status: 200,
        actorUserId: null,
        method: "probe-all",
      }),
    ).resolves.toBeUndefined();
  });

  it("the tenant guard refuses an unscoped read of the record", async () => {
    await expect(prisma.catalogueAddressVerification.findMany({ where: { externalId: "CE_BANK_0003" } })).rejects.toThrow(
      /without an organizationId/,
    );
  });
});
