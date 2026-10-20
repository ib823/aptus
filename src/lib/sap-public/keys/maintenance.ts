/**
 * Key maintenance for sealed SAP secrets: rotate, reseal, verify (P0.10).
 *
 * The library behind `pnpm keys:rotate`, `pnpm keys:reseal` and
 * `pnpm keys:verify` (scripts/ce-keys.ts). Kept here, not in the script, so it
 * runs against a real database in tests and so the one list of sealed columns
 * below is the list the application itself is held to.
 *
 * EVERY SEALED COLUMN, AND ONLY THESE. A secret the scripts do not know about
 * is a secret a rotation silently strands, so this list is the inventory:
 *
 *   SapConnection.secretsCiphertext  bound by connectionAad(org, product, key) —
 *                                    passwords, client secrets, bearer tokens,
 *                                    SAML private keys and assertions, API keys
 *   SolutionClient.secretsCiphertext bound by solutionClientRowAad(org, solution,
 *                                    row) — the per-credential write key
 *
 * Not here, deliberately: BYOAI provider keys (Organization.aiConfig.apiKey).
 * They are sealed by a different helper (intelligence/ai-key-crypto.ts) under a
 * different key (BYOAI_ENCRYPTION_KEY) and are not SAP secrets; moving them
 * onto this envelope is separate work.
 *
 * ALL THREE ARE DRY RUNS UNLESS TOLD OTHERWISE. A dry run reads and decrypts
 * — so it reports exactly what would fail — and writes nothing, not even a new
 * data key. Every write is conditional on the row still holding the value that
 * was read, so a person saving a connection mid-run is never overwritten, and a
 * re-run picks up exactly what is left: the operations are idempotent, and
 * resumable by simply running them again.
 *
 * NOTHING SECRET IS REPORTED. Failures carry the table, row id, organisation
 * and the error's message — crypto errors never contain plaintext.
 */
import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import {
  connectionAad,
  encryptSecret,
  isBoundLegacyBlob,
  solutionClientRowAad,
} from "@/lib/sap-public/connection-crypto";
import {
  decryptForOrg,
  describeSealedBlob,
  encryptEnvelope,
  type SealedFormat,
} from "@/lib/sap-public/secret-envelope";

import { envelopeSealingEnabled, getKeyProvider } from "./key-provider";
import { KeyringConfigError } from "./keyring";
import { clearDataKeyCache, createOrgDataKey, unwrapOrgDataKey } from "./org-data-key";

export type SealedTable = "SapConnection" | "SolutionClient";

export const SEALED_TABLES: readonly SealedTable[] = ["SapConnection", "SolutionClient"];

const DEFAULT_BATCH_SIZE = 200;

/** One sealed blob and the binding it must open under. */
export interface SealedRow {
  readonly table: SealedTable;
  readonly id: string;
  readonly organizationId: string;
  readonly blob: string;
  readonly aad: string;
}

export interface RowFailure {
  readonly table: SealedTable | "OrgDataKey";
  readonly id: string;
  readonly organizationId: string;
  readonly reason: string;
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Every sealed blob, in id order, one batch at a time. */
export async function* sealedRows(batchSize = DEFAULT_BATCH_SIZE): AsyncGenerator<SealedRow[]> {
  let after = "";
  for (;;) {
    const rows = await prisma.sapConnection.findMany({
      where: { id: { gt: after } },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, organizationId: true, product: true, key: true, secretsCiphertext: true },
    });
    if (rows.length === 0) break;
    after = rows[rows.length - 1]!.id;
    yield rows
      .filter((r) => r.secretsCiphertext.length > 0)
      .map((r) => ({
        table: "SapConnection" as const,
        id: r.id,
        organizationId: r.organizationId,
        blob: r.secretsCiphertext,
        aad: connectionAad(r.organizationId, r.product, r.key),
      }));
  }

  after = "";
  for (;;) {
    const rows = await prisma.solutionClient.findMany({
      where: { id: { gt: after }, secretsCiphertext: { not: null } },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, organizationId: true, solutionId: true, secretsCiphertext: true },
    });
    if (rows.length === 0) break;
    after = rows[rows.length - 1]!.id;
    yield rows.flatMap((r) =>
      r.secretsCiphertext
        ? [
            {
              table: "SolutionClient" as const,
              id: r.id,
              organizationId: r.organizationId,
              blob: r.secretsCiphertext,
              aad: solutionClientRowAad(r.organizationId, r.solutionId, r.id),
            },
          ]
        : [],
    );
  }
}

/**
 * Replace one blob, only if the row still holds the one that was read. Returns
 * false when the row changed underneath (someone re-saved it) — that row is
 * already in the active format, sealed by the application itself.
 */
async function replaceBlob(row: SealedRow, next: string): Promise<boolean> {
  const result =
    row.table === "SapConnection"
      ? await prisma.sapConnection.updateMany({
          where: { id: row.id, organizationId: row.organizationId, secretsCiphertext: row.blob },
          data: { secretsCiphertext: next },
        })
      : await prisma.solutionClient.updateMany({
          where: { id: row.id, organizationId: row.organizationId, secretsCiphertext: row.blob },
          data: { secretsCiphertext: next },
        });
  return result.count === 1;
}

/** The newest data-key version of each organisation, read once per run. */
async function latestDataKeyVersions(): Promise<Map<string, number>> {
  const rows = await prisma.orgDataKey.groupBy({
    by: ["organizationId"],
    _max: { version: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (r._max.version !== null) out.set(r.organizationId, r._max.version);
  return out;
}

/* ── reseal ─────────────────────────────────────────────────────────────── */

export interface ResealOptions {
  /** Write. Without it nothing is changed. */
  readonly apply?: boolean;
  /** The format every blob should end in. Default: the deployment's active format. */
  readonly to?: SealedFormat;
  readonly batchSize?: number;
}

export interface TableCounts {
  scanned: number;
  /** Already in the target format (and, for ce2, under the newest data key). */
  current: number;
  /** Re-sealed (apply) or would be (dry run). */
  resealed: number;
  /** Re-sealed by someone else between read and write — left as they made it. */
  changedUnderneath: number;
  failed: number;
}

export interface ResealReport {
  readonly apply: boolean;
  readonly to: SealedFormat;
  readonly tables: Record<SealedTable, TableCounts>;
  readonly failures: RowFailure[];
}

function emptyCounts(): TableCounts {
  return { scanned: 0, current: 0, resealed: 0, changedUnderneath: 0, failed: 0 };
}

/**
 * Re-encrypt every sealed blob into the target format and key.
 *
 * Target `ce2` (the default once envelope sealing is on): every blob ends up
 * under its organisation's NEWEST data key, minting version 1 for an
 * organisation that has none. Legacy blobs sealed before AAD existed are
 * re-bound to their row on the way — the unbound fallback stops applying to
 * them.
 *
 * Target `legacy` is the way BACK: before rolling a deployment back to code
 * older than P0.10, which cannot read `ce2`, reseal everything to legacy
 * under the legacy key (v1).
 *
 * Each new blob is decrypted again and compared with the plaintext before it is
 * written, so a reseal can never replace a working secret with a broken one.
 */
export async function resealAll(options: ResealOptions = {}): Promise<ResealReport> {
  permitCrossTenantReads("keys:reseal: platform key maintenance");
  const apply = options.apply ?? false;
  const to = options.to ?? (envelopeSealingEnabled() ? "ce2" : "legacy");
  if (to === "ce2" && !envelopeSealingEnabled()) {
    throw new KeyringConfigError(
      "Resealing to ce2 needs envelope sealing switched on: set SAP_CONNECTION_ENCRYPTION_KEYS and SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY (or select a KMS provider) first.",
    );
  }
  if (to === "ce2" && !getKeyProvider().isConfigured()) {
    throw new KeyringConfigError("The configured key provider cannot wrap a data key; check its settings.");
  }

  const tables: Record<SealedTable, TableCounts> = {
    SapConnection: emptyCounts(),
    SolutionClient: emptyCounts(),
  };
  const failures: RowFailure[] = [];
  const latest = to === "ce2" ? await latestDataKeyVersions() : new Map<string, number>();

  for await (const batch of sealedRows(options.batchSize)) {
    for (const row of batch) {
      const counts = tables[row.table];
      counts.scanned++;
      try {
        const description = describeSealedBlob(row.blob);
        const isCurrent =
          to === "ce2"
            ? description.format === "ce2" &&
              latest.get(row.organizationId) !== undefined &&
              description.dataKeyVersion === latest.get(row.organizationId)
            : description.format === "legacy" && isBoundLegacyBlob(row.blob, row.aad);
        // Every row is opened — current ones and dry runs included — so a
        // reseal that reports no failures has also proved every row opens. A
        // blob lifted onto the wrong row looks current by its header alone.
        const plaintext = await decryptForOrg(row.organizationId, row.blob, row.aad);
        if (isCurrent) {
          counts.current++;
          continue;
        }
        if (!apply) {
          counts.resealed++;
          continue;
        }

        const next =
          to === "ce2"
            ? await encryptEnvelope(row.organizationId, plaintext, row.aad)
            : encryptSecret(plaintext, row.aad);
        if ((await decryptForOrg(row.organizationId, next, row.aad)) !== plaintext) {
          throw new Error("The resealed blob did not decrypt to the original; nothing was written.");
        }
        if (to === "ce2" && !latest.has(row.organizationId)) {
          // encryptEnvelope minted version 1 for this organisation.
          const minted = describeSealedBlob(next);
          if (minted.format === "ce2") latest.set(row.organizationId, minted.dataKeyVersion);
        }
        if (await replaceBlob(row, next)) counts.resealed++;
        else counts.changedUnderneath++;
      } catch (err) {
        counts.failed++;
        failures.push({ table: row.table, id: row.id, organizationId: row.organizationId, reason: reasonOf(err) });
      }
    }
  }
  return { apply, to, tables, failures };
}

/* ── verify ─────────────────────────────────────────────────────────────── */

export interface VerifyTableCounts {
  total: number;
  opened: number;
  failed: number;
  legacyBound: number;
  /** Legacy blobs sealed before AAD existed — open, but still swappable until resealed. */
  legacyUnbound: number;
  /** ce2 blobs by data-key version. */
  ce2ByVersion: Record<string, number>;
}

export interface VerifyReport {
  readonly ok: boolean;
  readonly dataKeys: {
    total: number;
    unwrapped: number;
    failed: number;
    /** "provider:keyVersion" → rows. */
    byMasterKey: Record<string, number>;
    /** Rows not wrapped by the active provider and master key — `keys:rotate` moves them. */
    notOnActiveMaster: number;
  };
  readonly tables: Record<SealedTable, VerifyTableCounts>;
  readonly failures: RowFailure[];
}

function emptyVerifyCounts(): VerifyTableCounts {
  return { total: 0, opened: 0, failed: 0, legacyBound: 0, legacyUnbound: 0, ce2ByVersion: {} };
}

/** The active provider and master version, or null when envelope sealing is off. */
function activeMaster(): { provider: string; keyVersion: string } | null {
  if (!envelopeSealingEnabled()) return null;
  const provider = getKeyProvider();
  return { provider: provider.name, keyVersion: provider.activeKeyVersion() };
}

/**
 * Open every data key and every sealed blob, from cold. `ok` is false when any
 * one of them fails — the script exits non-zero on it, so a restore drill or a
 * rotation can be gated on it.
 *
 * The data-key cache is cleared first: a verify that hits warm keys proves the
 * process remembers them, not that the database and master keys still open.
 */
export async function verifyAll(options: { readonly batchSize?: number } = {}): Promise<VerifyReport> {
  permitCrossTenantReads("keys:verify: platform key maintenance");
  clearDataKeyCache();
  const failures: RowFailure[] = [];
  const master = activeMaster();

  const dataKeys = { total: 0, unwrapped: 0, failed: 0, byMasterKey: {} as Record<string, number>, notOnActiveMaster: 0 };
  for await (const row of orgDataKeyRows(options.batchSize)) {
    dataKeys.total++;
    const label = `${row.provider}:${row.keyVersion}`;
    dataKeys.byMasterKey[label] = (dataKeys.byMasterKey[label] ?? 0) + 1;
    if (master && (row.provider !== master.provider || row.keyVersion !== master.keyVersion)) {
      dataKeys.notOnActiveMaster++;
    }
    try {
      await unwrapOrgDataKey(row);
      dataKeys.unwrapped++;
    } catch (err) {
      dataKeys.failed++;
      failures.push({ table: "OrgDataKey", id: row.id, organizationId: row.organizationId, reason: reasonOf(err) });
    }
  }

  const tables: Record<SealedTable, VerifyTableCounts> = {
    SapConnection: emptyVerifyCounts(),
    SolutionClient: emptyVerifyCounts(),
  };
  for await (const batch of sealedRows(options.batchSize)) {
    for (const row of batch) {
      const counts = tables[row.table];
      counts.total++;
      try {
        const description = describeSealedBlob(row.blob);
        const plaintext = await decryptForOrg(row.organizationId, row.blob, row.aad);
        const parsed = JSON.parse(plaintext) as unknown;
        if (!parsed || typeof parsed !== "object") throw new Error("Opened, but is not a secrets object.");
        counts.opened++;
        if (description.format === "ce2") {
          const v = String(description.dataKeyVersion);
          counts.ce2ByVersion[v] = (counts.ce2ByVersion[v] ?? 0) + 1;
        } else if (isBoundLegacyBlob(row.blob, row.aad)) {
          counts.legacyBound++;
        } else {
          counts.legacyUnbound++;
        }
      } catch (err) {
        counts.failed++;
        failures.push({ table: row.table, id: row.id, organizationId: row.organizationId, reason: reasonOf(err) });
      }
    }
  }

  return { ok: failures.length === 0, dataKeys, tables, failures };
}

/* ── rotate ─────────────────────────────────────────────────────────────── */

async function* orgDataKeyRows(batchSize = DEFAULT_BATCH_SIZE) {
  let after = "";
  for (;;) {
    const rows = await prisma.orgDataKey.findMany({
      where: { id: { gt: after } },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, organizationId: true, version: true, provider: true, keyVersion: true, wrappedKey: true },
    });
    if (rows.length === 0) return;
    after = rows[rows.length - 1]!.id;
    yield* rows;
  }
}

export interface RotateOptions {
  readonly apply?: boolean;
  /**
   * Also mint a NEW data key for every organisation that has one, so a
   * following `keys:reseal` moves every blob onto fresh key material. For a
   * suspected data-key exposure; a routine master rotation does not need it.
   */
  readonly rekey?: boolean;
  readonly batchSize?: number;
}

export interface RotateReport {
  readonly apply: boolean;
  readonly provider: string;
  readonly keyVersion: string;
  scanned: number;
  /** Already wrapped by the active provider and master version. */
  current: number;
  /** Re-wrapped (apply) or would be (dry run). */
  rewrapped: number;
  changedUnderneath: number;
  failed: number;
  /** New data-key versions minted (apply) or that would be (dry run). */
  rekeyed: number;
  readonly failures: RowFailure[];
}

/**
 * Re-wrap every organisation data key under the ACTIVE master key.
 *
 * The routine rotation: add the new version to SAP_CONNECTION_ENCRYPTION_KEYS,
 * point SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY at it, deploy, then run this. No
 * sealed blob changes — each one names its data key, and the data key is the
 * same key, now wrapped differently. Also moves rows between providers (env →
 * a KMS adapter) when both are registered.
 *
 * Each re-wrap is unwrapped again and compared before it is written.
 */
export async function rotateMasterKey(options: RotateOptions = {}): Promise<RotateReport> {
  permitCrossTenantReads("keys:rotate: platform key maintenance");
  if (!envelopeSealingEnabled()) {
    throw new KeyringConfigError(
      "Rotation needs an active master key: set SAP_CONNECTION_ENCRYPTION_KEYS and SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY (or select a KMS provider).",
    );
  }
  const apply = options.apply ?? false;
  const provider = getKeyProvider();
  const keyVersion = provider.activeKeyVersion();
  const report: RotateReport = {
    apply,
    provider: provider.name,
    keyVersion,
    scanned: 0,
    current: 0,
    rewrapped: 0,
    changedUnderneath: 0,
    failed: 0,
    rekeyed: 0,
    failures: [],
  };
  const newestByOrg = new Map<string, number>();

  for await (const row of orgDataKeyRows(options.batchSize)) {
    report.scanned++;
    newestByOrg.set(row.organizationId, Math.max(newestByOrg.get(row.organizationId) ?? 0, row.version));
    if (row.provider === provider.name && row.keyVersion === keyVersion) {
      report.current++;
      continue;
    }
    try {
      const key = await unwrapOrgDataKey(row);
      if (!apply) {
        report.rewrapped++;
        continue;
      }
      const context = { organizationId: row.organizationId, dataKeyVersion: row.version };
      const wrapped = await provider.wrapDataKey(key, context);
      const check = await provider.unwrapDataKey(wrapped, context);
      if (!check.equals(key)) throw new Error("The re-wrapped key did not unwrap to the original; nothing was written.");
      const result = await prisma.orgDataKey.updateMany({
        where: { id: row.id, organizationId: row.organizationId, wrappedKey: row.wrappedKey },
        data: {
          provider: provider.name,
          keyVersion: wrapped.keyVersion,
          wrappedKey: wrapped.wrappedKey,
          rotatedAt: new Date(),
        },
      });
      if (result.count === 1) report.rewrapped++;
      else report.changedUnderneath++;
    } catch (err) {
      report.failed++;
      report.failures.push({ table: "OrgDataKey", id: row.id, organizationId: row.organizationId, reason: reasonOf(err) });
    }
  }

  if (options.rekey) {
    for (const [organizationId, newest] of newestByOrg) {
      try {
        if (apply) await createOrgDataKey(organizationId, newest + 1);
        report.rekeyed++;
      } catch (err) {
        report.failed++;
        report.failures.push({ table: "OrgDataKey", id: `${organizationId}#${newest + 1}`, organizationId, reason: reasonOf(err) });
      }
    }
  }
  return report;
}
