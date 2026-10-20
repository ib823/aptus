// @vitest-environment node
/**
 * P0.10 against a real PostgreSQL database: the whole key lifecycle.
 *
 * The acceptance, one step at a time:
 *   - with only the legacy key set, writes are legacy and OrgDataKey stays empty;
 *   - once an active master key is named, new writes are `ce2` and every blob
 *     carries a key version;
 *   - reseal migrates 100% of rows, is a dry run without --apply, and is
 *     idempotent;
 *   - every connection and write key opens after a master rotation, with the
 *     old master key and the legacy key both gone;
 *   - rekey + reseal moves every blob to fresh key material;
 *   - reseal --to legacy is the way back for a rollback;
 *   - verify fails, and the script exits non-zero, on a row that will not open.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { setWriteCredential, verifyWriteCredential } from "@/lib/northbound/write-credential";
import { connectionAad, openSecrets, sealSecrets } from "@/lib/sap-public/connection-crypto";
import { resolveSapConnections, upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { clearDataKeyCache } from "@/lib/sap-public/keys/org-data-key";
import { resealAll, rotateMasterKey, verifyAll } from "@/lib/sap-public/keys/maintenance";
import { describeSealedBlob, openSecretsForOrg } from "@/lib/sap-public/secret-envelope";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const ROOT = path.resolve(__dirname, "../..");
const VARS = [
  "SAP_CONNECTION_ENCRYPTION_KEY",
  "SAP_CONNECTION_ENCRYPTION_KEYS",
  "SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY",
  "SAP_CONNECTION_KEY_PROVIDER",
] as const;
type KeyEnv = Partial<Record<(typeof VARS)[number], string>>;

const LEGACY = randomBytes(32).toString("hex");
const V2 = randomBytes(32).toString("hex");
const V3 = randomBytes(32).toString("hex");
const NAME_PREFIX = "p010-envelope-test";

function useKeys(values: KeyEnv): void {
  for (const k of VARS) {
    const v = values[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // A new configuration is a new process, as far as the key cache knows.
  clearDataKeyCache();
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("envelope keys against a real database", () => {
  const run = randomUUID().slice(0, 8);
  const orgA = `org_p010_a_${run}`;
  const orgB = `org_p010_b_${run}`;
  const ORGS = [orgA, orgB];
  const WRITE_KEY = "cew_p010_write_key_value";
  const saved: Record<string, string | undefined> = {};
  let clientId = "";

  /** Every sealed blob this test owns, from the database. */
  async function blobs(): Promise<{ table: string; id: string; blob: string }[]> {
    const conns = await prisma.sapConnection.findMany({
      where: { organizationId: { in: ORGS } },
      orderBy: { id: "asc" },
      select: { id: true, secretsCiphertext: true },
    });
    const clients = await prisma.solutionClient.findMany({
      where: { organizationId: { in: ORGS }, secretsCiphertext: { not: null } },
      orderBy: { id: "asc" },
      select: { id: true, secretsCiphertext: true },
    });
    return [
      ...conns.map((c) => ({ table: "SapConnection", id: c.id, blob: c.secretsCiphertext })),
      ...clients.map((c) => ({ table: "SolutionClient", id: c.id, blob: c.secretsCiphertext ?? "" })),
    ];
  }

  async function dataKeys() {
    return prisma.orgDataKey.findMany({
      where: { organizationId: { in: ORGS } },
      orderBy: [{ organizationId: "asc" }, { version: "asc" }],
    });
  }

  /** The application's own read paths, from cold. */
  async function everythingOpens(): Promise<void> {
    clearDataKeyCache();
    const a = await resolveSapConnections(orgA, "s4hana");
    expect(a.map((c) => [c.key, c.secrets.password])).toEqual([
      ["prod", "pw-a-prod"],
      ["dev", "pw-a-dev"],
      ["unbound", "pw-a-unbound"],
    ]);
    expect(a[0]!.secrets.samlPrivateKey).toBe("-----BEGIN PRIVATE KEY-----a");
    const b = await resolveSapConnections(orgB, "s4hana");
    expect(b.map((c) => c.secrets.password)).toEqual(["pw-b-prod"]);
    expect(await verifyWriteCredential(tenantScopeOf(orgA), clientId, WRITE_KEY)).toBe(true);
    expect(await verifyWriteCredential(tenantScopeOf(orgA), clientId, "cew_wrong")).toBe(false);
  }

  /** The report's failures, for this test's rows only. */
  const ours = (failures: readonly { organizationId: string }[]) =>
    failures.filter((f) => ORGS.includes(f.organizationId));

  beforeAll(async () => {
    for (const k of VARS) saved[k] = process.env[k];
    await prisma.organization.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    for (const id of ORGS) {
      await prisma.organization.create({ data: { id, name: `${NAME_PREFIX} ${id}`, type: "client" } });
    }
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: ORGS } } });
    for (const k of VARS) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await prisma.$disconnect();
  });

  beforeEach(() => clearDataKeyCache());

  it("with only the legacy key: legacy writes, no data keys, everything opens", async () => {
    useKeys({ SAP_CONNECTION_ENCRYPTION_KEY: LEGACY });
    const base = { product: "s4hana", label: "S/4", baseUrl: "https://my1-api.s4hana.cloud.sap", authType: "basic" as const };
    await upsertSapConnection({
      ...base,
      organizationId: orgA,
      key: "prod",
      secrets: { username: "u", password: "pw-a-prod", samlPrivateKey: "-----BEGIN PRIVATE KEY-----a" },
    });
    await upsertSapConnection({ ...base, organizationId: orgA, key: "dev", secrets: { username: "u", password: "pw-a-dev" } });
    await upsertSapConnection({ ...base, organizationId: orgB, key: "prod", secrets: { username: "u", password: "pw-b-prod" } });
    // A row from before AAD existed: sealed with no binding at all.
    await prisma.sapConnection.create({
      data: {
        ...base,
        organizationId: orgA,
        key: "unbound",
        secretsCiphertext: sealSecrets({ username: "u", password: "pw-a-unbound" }),
      },
    });
    const client = await prisma.solutionClient.create({
      data: {
        organizationId: orgA,
        solutionId: `sol_${run}`,
        label: "DEV credential",
        tokenHash: `hash_${run}`,
        environment: "DEV",
        createdById: "user_p010",
      },
    });
    clientId = client.id;
    expect(await setWriteCredential(tenantScopeOf(orgA), clientId, WRITE_KEY)).toBe(true);

    for (const b of await blobs()) expect(describeSealedBlob(b.blob)).toEqual({ format: "legacy" });
    expect(await dataKeys()).toEqual([]);
    await everythingOpens();
  });

  it("refuses to reseal to ce2 before an active key is named", async () => {
    await expect(resealAll({ to: "ce2" })).rejects.toThrow(/ACTIVE_KEY/);
    await expect(rotateMasterKey()).rejects.toThrow(/active master key/);
  });

  it("once an active key is named, new writes carry a key version", async () => {
    useKeys({
      SAP_CONNECTION_ENCRYPTION_KEY: LEGACY,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${V2}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2",
    });
    await upsertSapConnection({
      organizationId: orgA,
      product: "s4hana",
      key: "dev",
      label: "S/4",
      baseUrl: "https://my1-api.s4hana.cloud.sap",
      authType: "basic",
      secrets: { username: "u", password: "pw-a-dev" },
    });
    const dev = await prisma.sapConnection.findFirst({ where: { organizationId: orgA, key: "dev" } });
    expect(dev!.secretsCiphertext).toMatch(/^ce2:1:/);
    expect((await dataKeys()).map((k) => [k.organizationId, k.version, k.keyVersion])).toEqual([[orgA, 1, "v2"]]);
    await everythingOpens();
  });

  it("reseal is a dry run by default: it reports and writes nothing", async () => {
    const before = await blobs();
    const report = await resealAll();
    expect(report.apply).toBe(false);
    expect(report.to).toBe("ce2");
    expect(ours(report.failures)).toEqual([]);
    // Four legacy blobs (three connections, one write key) would move.
    expect(report.tables.SapConnection.resealed + report.tables.SolutionClient.resealed).toBeGreaterThanOrEqual(4);
    expect(await blobs()).toEqual(before);
    expect((await dataKeys()).map((k) => k.organizationId)).toEqual([orgA]); // no key minted for B
  });

  it("reseal --apply migrates 100% of rows, re-binding the unbound one", async () => {
    const report = await resealAll({ apply: true });
    expect(ours(report.failures)).toEqual([]);
    const after = await blobs();
    expect(after).toHaveLength(5);
    for (const b of after) expect(describeSealedBlob(b.blob)).toEqual({ format: "ce2", dataKeyVersion: 1 });
    expect((await dataKeys()).map((k) => [k.organizationId, k.version])).toEqual(
      [[orgA, 1], [orgB, 1]].sort(),
    );

    // The formerly unbound row is now bound to its own row and nothing else.
    const unbound = await prisma.sapConnection.findFirst({ where: { organizationId: orgA, key: "unbound" } });
    await expect(
      openSecretsForOrg(orgA, unbound!.secretsCiphertext, connectionAad(orgA, "s4hana", "prod")),
    ).rejects.toThrow();
    await everythingOpens();
  });

  it("reseal is idempotent: a second run changes nothing", async () => {
    const before = await blobs();
    const report = await resealAll({ apply: true });
    expect(ours(report.failures)).toEqual([]);
    expect(await blobs()).toEqual(before);
  });

  it("verify passes, with every blob counted by key version", async () => {
    const report = await verifyAll();
    expect(report.ok).toBe(true);
    expect(report.tables.SapConnection.ce2ByVersion["1"]).toBeGreaterThanOrEqual(4);
    expect(report.dataKeys.failed).toBe(0);
  });

  it("rotate re-wraps every data key, and every connection opens with the old keys gone", async () => {
    useKeys({
      SAP_CONNECTION_ENCRYPTION_KEY: LEGACY,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${V2},v3:${V3}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3",
    });
    const blobsBefore = await blobs();
    const keysBefore = await dataKeys();

    const dry = await rotateMasterKey();
    expect(ours(dry.failures)).toEqual([]);
    expect(dry.rewrapped).toBeGreaterThanOrEqual(2);
    expect(await dataKeys()).toEqual(keysBefore);

    const applied = await rotateMasterKey({ apply: true });
    expect(ours(applied.failures)).toEqual([]);
    const keysAfter = await dataKeys();
    expect(keysAfter.map((k) => k.keyVersion)).toEqual(["v3", "v3"]);
    expect(keysAfter.every((k) => k.rotatedAt instanceof Date)).toBe(true);
    expect(keysAfter.map((k) => k.wrappedKey)).not.toEqual(keysBefore.map((k) => k.wrappedKey));
    // The envelope's point: not one sealed blob was touched.
    expect(await blobs()).toEqual(blobsBefore);

    // v2 retired and the legacy key gone: only v3 remains.
    useKeys({ SAP_CONNECTION_ENCRYPTION_KEYS: `v3:${V3}`, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3" });
    await everythingOpens();
    expect((await verifyAll()).ok).toBe(true);
    expect((await rotateMasterKey({ apply: true })).current).toBeGreaterThanOrEqual(2);
  });

  it("rekey + reseal moves every blob onto a new data key", async () => {
    const rekey = await rotateMasterKey({ apply: true, rekey: true });
    expect(ours(rekey.failures)).toEqual([]);
    expect((await dataKeys()).map((k) => [k.organizationId, k.version])).toEqual(
      [[orgA, 1], [orgA, 2], [orgB, 1], [orgB, 2]].sort(),
    );
    const report = await resealAll({ apply: true });
    expect(ours(report.failures)).toEqual([]);
    for (const b of await blobs()) expect(describeSealedBlob(b.blob)).toEqual({ format: "ce2", dataKeyVersion: 2 });
    await everythingOpens();
  });

  it("reseal --to legacy is the way back before a rollback", async () => {
    useKeys({
      SAP_CONNECTION_ENCRYPTION_KEY: LEGACY,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v3:${V3}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3",
    });
    const report = await resealAll({ apply: true, to: "legacy" });
    expect(report.to).toBe("legacy");
    expect(ours(report.failures)).toEqual([]);
    const conns = await prisma.sapConnection.findMany({ where: { organizationId: { in: ORGS } } });
    for (const c of conns) {
      // Readable by the pre-P0.10 codec — what a rolled-back deployment runs.
      expect(openSecrets(c.secretsCiphertext, connectionAad(c.organizationId, c.product, c.key)).password).toMatch(/^pw-/);
    }
    // And back again to ce2 for the rest of the journey.
    expect(ours((await resealAll({ apply: true })).failures)).toEqual([]);
    await everythingOpens();
  });

  it("verify fails on a row that will not open — and the script exits non-zero", async () => {
    const env = {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      SKIP_NODE_VERSION_CHECK: "1",
    };
    const cli = (...args: string[]) =>
      spawnSync(path.join(ROOT, "node_modules/.bin/tsx"), [path.join(ROOT, "scripts/ce-keys.ts"), ...args], {
        cwd: ROOT,
        env,
        encoding: "utf8",
      });

    const ok = cli("verify");
    expect(ok.stdout).toContain("VERIFY OK");
    expect(ok.status).toBe(0);

    const prod = await prisma.sapConnection.findFirst({ where: { organizationId: orgB, key: "prod" } });
    // Sealed for ANOTHER row: a ciphertext lifted onto this one.
    const foreign = await prisma.sapConnection.findFirst({ where: { organizationId: orgA, key: "prod" } });
    await prisma.sapConnection.updateMany({
      where: { id: prod!.id, organizationId: orgB },
      data: { secretsCiphertext: foreign!.secretsCiphertext },
    });

    const report = await verifyAll();
    expect(report.ok).toBe(false);
    expect(report.failures.map((f) => f.id)).toEqual([prod!.id]);
    expect(JSON.stringify(report)).not.toContain("pw-");

    const failed = cli("verify");
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain(prod!.id);
    expect(failed.stdout).not.toContain("pw-");

    // A reseal reports the row and leaves it alone rather than "fixing" it.
    const reseal = cli("reseal", "--apply");
    expect(reseal.status).toBe(1);

    expect(cli("verify", "--apply").status).toBe(2);
    expect(cli("rotate", "--to=legacy").status).toBe(2);
  }, 120_000);
});
