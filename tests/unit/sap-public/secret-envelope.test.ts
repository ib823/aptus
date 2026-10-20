/**
 * Envelope sealing (P0.10): the `ce2` format, per-organisation data keys, and
 * the guarantee that nothing changes until an operator switches it on.
 *
 * The data-key table is an in-memory stand-in for OrgDataKey; the database
 * version of the same journey (reseal 100%, rotate, every connection opens) is
 * tests/integration/sap-key-envelope.test.ts.
 */
import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StoredKey {
  id: string;
  organizationId: string;
  version: number;
  provider: string;
  keyVersion: string;
  wrappedKey: string;
}

const db = vi.hoisted(() => ({
  rows: [] as StoredKey[],
  reads: 0,
  creates: 0,
  /** When set, the next create fails as a lost race after this row is inserted. */
  raceWinner: null as StoredKey | null,
}));

vi.mock("@/lib/db/prisma", () => {
  const matches = (where: Partial<StoredKey>) => (r: StoredKey) =>
    (where.organizationId === undefined || r.organizationId === where.organizationId) &&
    (where.version === undefined || r.version === where.version);
  return {
    prisma: {
      orgDataKey: {
        findFirst: vi.fn(async (args: { where: Partial<StoredKey>; orderBy?: unknown }) => {
          db.reads++;
          const found = db.rows.filter(matches(args.where)).sort((a, b) => b.version - a.version);
          return found[0] ?? null;
        }),
        create: vi.fn(async (args: { data: Omit<StoredKey, "id"> }) => {
          db.creates++;
          if (db.raceWinner) {
            db.rows.push(db.raceWinner);
            db.raceWinner = null;
            throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
          }
          const row = { id: `dk_${db.rows.length + 1}`, ...args.data };
          db.rows.push(row);
          return { id: row.id };
        }),
      },
    },
  };
});

import {
  connectionAad,
  isConnectionEncryptionConfigured,
  openSecrets,
  sealSecrets,
} from "@/lib/sap-public/connection-crypto";
import { envKeyProvider } from "@/lib/sap-public/keys/key-provider";
import { clearDataKeyCache } from "@/lib/sap-public/keys/org-data-key";
import {
  describeSealedBlob,
  openSecretsForOrg,
  sealSecretsForOrg,
} from "@/lib/sap-public/secret-envelope";

const VARS = [
  "SAP_CONNECTION_ENCRYPTION_KEY",
  "SAP_CONNECTION_ENCRYPTION_KEYS",
  "SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY",
  "SAP_CONNECTION_KEY_PROVIDER",
] as const;
const saved: Partial<Record<(typeof VARS)[number], string | undefined>> = {};

const LEGACY = randomBytes(32).toString("hex");
const V2 = randomBytes(32).toString("hex");
const V3 = randomBytes(32).toString("hex");
const AAD = connectionAad("org_a", "s4hana", "prod");
const SECRETS = { username: "comm_user", password: "S3cr3t!pw", samlPrivateKey: "-----BEGIN PRIVATE KEY-----" };

function setEnv(values: Partial<Record<(typeof VARS)[number], string>>): void {
  for (const k of VARS) {
    const v = values[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  for (const k of VARS) saved[k] = process.env[k];
  db.rows = [];
  db.reads = 0;
  db.creates = 0;
  db.raceWinner = null;
  clearDataKeyCache();
});

afterEach(() => {
  for (const k of VARS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("with only the legacy key — exactly as before", () => {
  beforeEach(() => setEnv({ SAP_CONNECTION_ENCRYPTION_KEY: LEGACY }));

  it("seals in the legacy format and never touches the data-key table", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    expect(describeSealedBlob(blob)).toEqual({ format: "legacy" });
    expect(blob).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // Readable by the pre-P0.10 codec, so a rollback loses nothing.
    expect(openSecrets(blob, AAD)).toEqual(SECRETS);
    expect(await openSecretsForOrg("org_a", blob, AAD)).toEqual(SECRETS);
    expect(db.reads + db.creates).toBe(0);
  });

  it("opens rows sealed by the old helper, bound and unbound alike", async () => {
    expect(await openSecretsForOrg("org_a", sealSecrets(SECRETS, AAD), AAD)).toEqual(SECRETS);
    expect(await openSecretsForOrg("org_a", sealSecrets(SECRETS), AAD)).toEqual(SECRETS);
    expect(await openSecretsForOrg("org_a", null, AAD)).toEqual({});
  });

  it("reports configured as it always did", () => {
    expect(isConnectionEncryptionConfigured()).toBe(true);
    setEnv({});
    expect(isConnectionEncryptionConfigured()).toBe(false);
  });
});

describe("with an active master key — the ce2 envelope", () => {
  beforeEach(() =>
    setEnv({
      SAP_CONNECTION_ENCRYPTION_KEY: LEGACY,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${V2}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2",
    }),
  );

  it("seals a self-describing blob that names its data-key version", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    expect(blob).toMatch(/^ce2:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(describeSealedBlob(blob)).toEqual({ format: "ce2", dataKeyVersion: 1 });
    expect(blob).not.toContain("S3cr3t");
    expect(await openSecretsForOrg("org_a", blob, AAD)).toEqual(SECRETS);
  });

  it("stores ONE data key per organisation, wrapped by the active master version", async () => {
    await sealSecretsForOrg("org_a", SECRETS, AAD);
    await sealSecretsForOrg("org_a", { password: "x" }, connectionAad("org_a", "s4hana", "dev"));
    await sealSecretsForOrg("org_b", SECRETS, connectionAad("org_b", "s4hana", "prod"));
    expect(db.rows.map((r) => [r.organizationId, r.version, r.provider, r.keyVersion])).toEqual([
      ["org_a", 1, "env", "v2"],
      ["org_b", 1, "env", "v2"],
    ]);
    // Wrapped, never raw: no stored value is a 32-byte key in the clear.
    for (const r of db.rows) expect(Buffer.from(r.wrappedKey, "base64").length).toBe(12 + 32 + 16);
  });

  it("keeps the per-row binding, with no unbound fallback", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    await expect(
      openSecretsForOrg("org_a", blob, connectionAad("org_a", "s4hana", "dev")),
    ).rejects.toThrow();
  });

  it("does not open under another organisation's data key", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    await sealSecretsForOrg("org_b", SECRETS, AAD);
    await expect(openSecretsForOrg("org_b", blob, AAD)).rejects.toThrow();
  });

  it("authenticates the header: an edited version number does not open", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    // Version 2 holds the SAME key material, properly wrapped for its slot — so
    // only the authenticated header can tell the edited blob apart.
    const provider = envKeyProvider();
    const v1 = db.rows[0]!;
    const key = await provider.unwrapDataKey(v1, { organizationId: "org_a", dataKeyVersion: 1 });
    const wrapped = await provider.wrapDataKey(key, { organizationId: "org_a", dataKeyVersion: 2 });
    db.rows.push({ ...v1, id: "dk_copy", version: 2, ...wrapped });
    await expect(openSecretsForOrg("org_a", blob.replace(/^ce2:1:/, "ce2:2:"), AAD)).rejects.toThrow(
      /unable to authenticate|Unsupported state/,
    );
  });

  it("rejects tampered ciphertext and malformed envelopes", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    const parts = blob.split(":");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = (body[0] ?? 0) ^ 0xff;
    await expect(
      openSecretsForOrg("org_a", [parts[0], parts[1], parts[2], body.toString("base64url")].join(":"), AAD),
    ).rejects.toThrow();
    await expect(openSecretsForOrg("org_a", "ce2:0:aa:bb", AAD)).rejects.toThrow(/positive integer/);
    await expect(openSecretsForOrg("org_a", "ce2:1:only-three", AAD)).rejects.toThrow(/well-formed/);
  });

  it("says plainly when a blob names a data key this database does not hold", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    db.rows = [];
    clearDataKeyCache();
    await expect(openSecretsForOrg("org_a", blob, AAD)).rejects.toThrow(/No data key version 1/);
  });

  it("still opens every legacy row", async () => {
    expect(await openSecretsForOrg("org_a", sealSecrets(SECRETS, AAD), AAD)).toEqual(SECRETS);
  });

  it("gives a clear error when a ce2 blob reaches the legacy codec", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    expect(() => openSecrets(blob, AAD)).toThrow(/envelope \(ce2\) format/);
  });

  it("caches the unwrapped data key per process", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    const before = db.reads;
    await openSecretsForOrg("org_a", blob, AAD);
    await openSecretsForOrg("org_a", blob, AAD);
    expect(db.reads).toBe(before);
    clearDataKeyCache();
    await openSecretsForOrg("org_a", blob, AAD);
    expect(db.reads).toBe(before + 1);
  });

  it("opens after a master rotation: re-wrapped under v3, v2 removed", async () => {
    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    // What keys:rotate does to the row, by hand: unwrap under v2, wrap under v3.
    const row = db.rows[0]!;
    const ctx = { organizationId: row.organizationId, dataKeyVersion: row.version };
    const before = envKeyProvider({
      SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${V2}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2",
    });
    const after = envKeyProvider({
      SAP_CONNECTION_ENCRYPTION_KEYS: `v3:${V3}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3",
    });
    const rewrapped = await after.wrapDataKey(await before.unwrapDataKey(row, ctx), ctx);
    Object.assign(row, rewrapped);

    setEnv({
      SAP_CONNECTION_ENCRYPTION_KEY: LEGACY,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v3:${V3}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3",
    });
    clearDataKeyCache();
    expect(await openSecretsForOrg("org_a", blob, AAD)).toEqual(SECRETS);
  });

  it("two first seals racing for one organisation both seal under the stored key", async () => {
    // Another instance stores version 1 between our read and our create.
    const otherKey = randomBytes(32);
    const provider = envKeyProvider();
    const wrapped = await provider.wrapDataKey(otherKey, { organizationId: "org_a", dataKeyVersion: 1 });
    db.raceWinner = { id: "dk_winner", organizationId: "org_a", version: 1, provider: "env", ...wrapped };

    const blob = await sealSecretsForOrg("org_a", SECRETS, AAD);
    expect(db.rows).toHaveLength(1);
    clearDataKeyCache();
    // Opens from the database alone — so it was sealed under the winner's key.
    expect(await openSecretsForOrg("org_a", blob, AAD)).toEqual(SECRETS);
  });

  it("refuses to seal when the active key is not in the ring, rather than writing legacy", async () => {
    setEnv({ SAP_CONNECTION_ENCRYPTION_KEY: LEGACY, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2" });
    await expect(sealSecretsForOrg("org_a", SECRETS, AAD)).rejects.toThrow(/not a key in/);
    expect(isConnectionEncryptionConfigured()).toBe(false);
  });

  it("reports configured from the provider once envelope sealing is on", () => {
    expect(isConnectionEncryptionConfigured()).toBe(true);
    setEnv({ SAP_CONNECTION_KEY_PROVIDER: "unregistered-kms" });
    expect(isConnectionEncryptionConfigured()).toBe(false);
  });
});
