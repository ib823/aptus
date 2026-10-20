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
 *   - rekey + reseal moves every blob to fresh key material, and a resumed
 *     rekey does not mint again;
 *   - retire withdraws the old data key, so a blob forged with it is refused;
 *   - reseal --to legacy is the way back for a rollback, and refuses to run
 *     while the deployment still seals ce2;
 *   - verify fails, and the script exits non-zero, on a row that will not open;
 *   - a data-key cache warmed before a database restore neither seals under,
 *     nor fails to open with, a key the database no longer holds.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */
import { spawnSync } from "node:child_process";
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
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
import {
  connectionAad,
  openSecrets,
  sealSecrets,
  solutionClientRowAad,
} from "@/lib/sap-public/connection-crypto";
import { resolveSapConnections, upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { getKeyProvider } from "@/lib/sap-public/keys/key-provider";
import { clearDataKeyCache, unwrapOrgDataKey } from "@/lib/sap-public/keys/org-data-key";
import { resealAll, retireDataKeys, rotateMasterKey, verifyAll } from "@/lib/sap-public/keys/maintenance";
import { describeSealedBlob, openSecretsForOrg, sealSecretsForOrg } from "@/lib/sap-public/secret-envelope";
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

/**
 * A `ce2` blob sealed directly under a raw data key — what anyone holding that
 * key (an attacker with a leaked key, or another instance) can produce. The
 * format is public: header, then the header plus the row's AAD as GCM AAD.
 */
function sealWithRawKey(key: Buffer, version: number, plaintext: string, aad: string): string {
  const header = `ce2:${version}:`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`${header}${aad}`, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${header}${iv.toString("base64url")}:${body.toString("base64url")}`;
}

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
  const ours = <T extends { organizationId: string }>(failures: readonly T[]) =>
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
    const afterRekey = [[orgA, 1], [orgA, 2], [orgB, 1], [orgB, 2]].sort();
    expect((await dataKeys()).map((k) => [k.organizationId, k.version])).toEqual(afterRekey);

    // Resuming the rekey with the cutoff it printed mints nothing more for
    // organisations it already rekeyed — and neither does its dry run.
    expect(rekey.rekeyBefore).not.toBeNull();
    const resumeFrom = new Date(rekey.rekeyBefore!);
    const resumedDry = await rotateMasterKey({ rekey: true, rekeyBefore: resumeFrom });
    expect(resumedDry.alreadyRekeyed).toBeGreaterThanOrEqual(2);
    const resumed = await rotateMasterKey({ apply: true, rekey: true, rekeyBefore: resumeFrom });
    expect(ours(resumed.failures)).toEqual([]);
    expect((await dataKeys()).map((k) => [k.organizationId, k.version])).toEqual(afterRekey);

    // Until the reseal, verify flags every blob still on the old data key, and
    // retire refuses to withdraw a version that blobs still name.
    const before = await verifyAll();
    expect(before.tables.SapConnection.onOlderDataKey).toBeGreaterThanOrEqual(4);
    expect(before.tables.SolutionClient.onOlderDataKey).toBeGreaterThanOrEqual(1);
    const early = await retireDataKeys({ apply: true });
    expect(ours(early.failures).map((f) => f.organizationId).sort()).toEqual([orgA, orgB].sort());
    expect((await dataKeys()).every((k) => k.retiredAt === null)).toBe(true);

    const report = await resealAll({ apply: true });
    expect(ours(report.failures)).toEqual([]);
    for (const b of await blobs()) expect(describeSealedBlob(b.blob)).toEqual({ format: "ce2", dataKeyVersion: 2 });
    await everythingOpens();
    const after = await verifyAll();
    expect(after.tables.SapConnection.onOlderDataKey + after.tables.SolutionClient.onOlderDataKey).toBe(0);
  });

  it("retire withdraws the old data key: a blob forged with the leaked key is refused", async () => {
    // The attacker's copy of org A's exposed data key v1.
    const v1Row = (await dataKeys()).find((k) => k.organizationId === orgA && k.version === 1)!;
    const leaked = await unwrapOrgDataKey(v1Row);
    const client = await prisma.solutionClient.findFirst({ where: { id: clientId, organizationId: orgA } });
    const genuine = client!.secretsCiphertext!;
    const forged = sealWithRawKey(
      leaked,
      1,
      JSON.stringify({ writeSecret: "cew_attacker" }),
      solutionClientRowAad(orgA, client!.solutionId, clientId),
    );
    const plant = (blob: string) =>
      prisma.solutionClient.updateMany({ where: { id: clientId, organizationId: orgA }, data: { secretsCiphertext: blob } });

    // Before retirement the forgery is accepted: this is the exposure.
    await plant(forged);
    clearDataKeyCache();
    expect(await verifyWriteCredential(tenantScopeOf(orgA), clientId, "cew_attacker")).toBe(true);
    await plant(genuine);

    const dry = await retireDataKeys();
    expect(ours(dry.failures)).toEqual([]);
    expect(dry.retired).toBeGreaterThanOrEqual(2);
    expect((await dataKeys()).every((k) => k.retiredAt === null)).toBe(true);

    const applied = await retireDataKeys({ apply: true });
    expect(ours(applied.failures)).toEqual([]);
    expect((await dataKeys()).map((k) => [k.organizationId, k.version, k.retiredAt !== null])).toEqual(
      [[orgA, 1, true], [orgA, 2, false], [orgB, 1, true], [orgB, 2, false]].sort(),
    );
    // Idempotent: a second run finds nothing left to retire.
    const again = await retireDataKeys({ apply: true });
    expect(again.alreadyRetired).toBeGreaterThanOrEqual(2);
    expect(ours(again.failures)).toEqual([]);

    await plant(forged);
    clearDataKeyCache();
    expect(await verifyWriteCredential(tenantScopeOf(orgA), clientId, "cew_attacker")).toBe(false);
    const verify = await verifyAll();
    expect(verify.ok).toBe(false);
    expect(ours(verify.failures).map((f) => [f.id, /retired/.test(f.reason)])).toEqual([[clientId, true]]);
    expect(verify.dataKeys.retired).toBeGreaterThanOrEqual(2);

    await plant(genuine);
    await everythingOpens();
    expect(ours((await verifyAll()).failures)).toEqual([]);
  });

  it("reseal --to legacy is the way back before a rollback — once ce2 writes are switched off", async () => {
    useKeys({
      SAP_CONNECTION_ENCRYPTION_KEY: LEGACY,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v3:${V3}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3",
    });
    // While the deployment still seals ce2, every save after the reseal would
    // be ce2 again, unreadable by the rolled-back code: refused, nothing written.
    const before = await blobs();
    await expect(resealAll({ apply: true, to: "legacy" })).rejects.toThrow(/ACTIVE_KEY/);
    expect(await blobs()).toEqual(before);

    // Step 1 of the rollback: active key unset, the ring kept so ce2 still opens.
    useKeys({ SAP_CONNECTION_ENCRYPTION_KEY: LEGACY, SAP_CONNECTION_ENCRYPTION_KEYS: `v3:${V3}` });
    expect(ours((await verifyAll({ expectFormat: "legacy" })).failures).length).toBe(before.length);
    const report = await resealAll({ apply: true, to: "legacy" });
    expect(report.to).toBe("legacy");
    expect(ours(report.failures)).toEqual([]);
    expect(ours((await verifyAll({ expectFormat: "legacy" })).failures)).toEqual([]);
    const conns = await prisma.sapConnection.findMany({ where: { organizationId: { in: ORGS } } });
    for (const c of conns) {
      // Readable by the pre-P0.10 codec — what a rolled-back deployment runs.
      expect(openSecrets(c.secretsCiphertext, connectionAad(c.organizationId, c.product, c.key)).password).toMatch(/^pw-/);
    }
    // And back again to ce2 for the rest of the journey.
    useKeys({
      SAP_CONNECTION_ENCRYPTION_KEY: LEGACY,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v3:${V3}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3",
    });
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
    expect(cli("verify", "--rekey-before=2026-01-01T00:00:00Z").status).toBe(2);
    expect(cli("rotate", "--rekey", "--rekey-before=yesterday").status).toBe(2);

    // Put the row back so a whole-database verify run later sees nothing of ours.
    await prisma.sapConnection.updateMany({
      where: { id: prod!.id, organizationId: orgB },
      data: { secretsCiphertext: prod!.secretsCiphertext },
    });
  }, 120_000);
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("the data-key cache across a database restore", () => {
  const orgC = `org_p010_c_${randomUUID().slice(0, 8)}`;
  const aad = connectionAad(orgC, "s4hana", "prod");
  const saved: Record<string, string | undefined> = {};

  /**
   * What a warm instance sees after an in-place restore to before the
   * organisation's first seal, followed by another instance's first seal: the
   * same version 1, on a new row, wrapping a different key.
   */
  async function restoreUnderneath(): Promise<Buffer> {
    await prisma.orgDataKey.deleteMany({ where: { organizationId: orgC } });
    const key = randomBytes(32);
    const wrapped = await getKeyProvider().wrapDataKey(key, { organizationId: orgC, dataKeyVersion: 1 });
    await prisma.orgDataKey.create({
      data: { organizationId: orgC, version: 1, provider: "env", keyVersion: wrapped.keyVersion, wrappedKey: wrapped.wrappedKey },
    });
    return key;
  }

  beforeAll(async () => {
    for (const k of VARS) saved[k] = process.env[k];
    await prisma.organization.create({ data: { id: orgC, name: `${NAME_PREFIX} ${orgC}`, type: "client" } });
    useKeys({ SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${V2}`, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2" });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgC } });
    for (const k of VARS) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearDataKeyCache();
  });

  it("a seal never uses a cached key for a row the database no longer holds", async () => {
    await sealSecretsForOrg(orgC, { password: "before-restore" }, aad); // mints and caches v1
    await restoreUnderneath();

    const blob = await sealSecretsForOrg(orgC, { password: "after-restore" }, aad);
    expect(describeSealedBlob(blob)).toEqual({ format: "ce2", dataKeyVersion: 1 });
    clearDataKeyCache(); // the instance restarts, or the TTL runs out
    expect((await openSecretsForOrg(orgC, blob, aad)).password).toBe("after-restore");
  });

  it("an open whose cached key fails retries once with the stored key", async () => {
    await sealSecretsForOrg(orgC, { password: "warm" }, aad); // caches the current v1
    const stored = await restoreUnderneath();
    // Sealed by another instance under the key the database now holds.
    const blob = sealWithRawKey(stored, 1, JSON.stringify({ password: "from-another-instance" }), aad);
    expect((await openSecretsForOrg(orgC, blob, aad)).password).toBe("from-another-instance");

    // A blob no stored key opens still fails — the retry is not a bypass.
    const stray = sealWithRawKey(randomBytes(32), 1, JSON.stringify({ password: "x" }), aad);
    await expect(openSecretsForOrg(orgC, stray, aad)).rejects.toThrow();
  });
});
