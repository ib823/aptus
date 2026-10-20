/**
 * Key maintenance for sealed SAP secrets: rotate, reseal, verify, retire (P0.10).
 *
 * The library behind `pnpm keys:rotate`, `pnpm keys:reseal`, `pnpm keys:verify`
 * and `pnpm keys:retire` (scripts/ce-keys.ts). Kept here, not in the script, so it
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
 * ALL ARE DRY RUNS UNLESS TOLD OTHERWISE. A dry run reads and decrypts — so
 * it reports exactly what would fail — and writes nothing, not even a new data
 * key. Every write is conditional on the row still holding the value that was
 * read, so a person saving a connection mid-run is never overwritten, and a
 * re-run picks up exactly what is left: rotate, reseal and retire are
 * idempotent, and resumable by simply running them again. `rotate --rekey` is
 * resumable with the cutoff its report prints (`rekeyBefore`), which a re-run
 * must be given so organisations rekeyed by the first run are not rekeyed
 * again.
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

import { ENV_KEY_PROVIDER, envelopeSealingEnabled, getKeyProvider } from "./key-provider";
import {
  ENV_ACCEPT_LEGACY_FORMAT,
  ENV_ACTIVE_KEY,
  ENV_KEYRING,
  ENV_LEGACY_KEY,
  KeyringConfigError,
  LEGACY_KEY_VERSION,
  legacyFormatPolicy,
  preEnvelopeLegacyKeyConfigured,
  readKeyring,
} from "./keyring";
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

/** What every command reads: how many rows at a time, and whose. */
export interface MaintenanceScope {
  readonly batchSize?: number;
  /**
   * Only these organisations' rows — sealed blobs and data keys alike, so a
   * rekey mints, a retire withdraws and a verify reports for these alone.
   * Default: every organisation in the database. `--org` on the command line;
   * also what keeps a test that shares a database with other rows to its own.
   */
  readonly organizationIds?: readonly string[];
}

/** The `where` fragment a scope adds; nothing for the whole database. */
function orgFilter(scope: MaintenanceScope): { organizationId?: { in: string[] } } {
  return scope.organizationIds ? { organizationId: { in: [...scope.organizationIds] } } : {};
}

/** Every sealed blob in scope, in id order, one batch at a time. */
export async function* sealedRows(scope: MaintenanceScope = {}): AsyncGenerator<SealedRow[]> {
  const batchSize = scope.batchSize ?? DEFAULT_BATCH_SIZE;
  let after = "";
  for (;;) {
    const rows = await prisma.sapConnection.findMany({
      where: { id: { gt: after }, ...orgFilter(scope) },
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
      where: { id: { gt: after }, secretsCiphertext: { not: null }, ...orgFilter(scope) },
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

/** The newest data-key version of each organisation in scope, read once per run. */
async function latestDataKeyVersions(scope: MaintenanceScope): Promise<Map<string, number>> {
  const rows = await prisma.orgDataKey.groupBy({
    by: ["organizationId"],
    where: orgFilter(scope),
    _max: { version: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (r._max.version !== null) out.set(r.organizationId, r._max.version);
  return out;
}

/* ── reseal ─────────────────────────────────────────────────────────────── */

export interface ResealOptions extends MaintenanceScope {
  /** Write. Without it nothing is changed. */
  readonly apply?: boolean;
  /** The format every blob should end in. Default: the deployment's active format. */
  readonly to?: SealedFormat;
}

/**
 * The rollback gate's own check of the legacy key: is it set the way the code
 * being rolled back TO will read it?
 *
 * Code older than P0.10 reads SAP_CONNECTION_ENCRYPTION_KEY and never the
 * ring. A deployment that moved its old key into the ring as `v1` and dropped
 * the variable reseals to legacy and verifies cleanly here — both read `v1`
 * from the ring — and the rolled-back code then throws on every SAP
 * connection and write key. So the way back refuses to start (exit 2) until
 * the variable itself is set, to the same key as `v1` (readKeyring refuses
 * two different keys under that name).
 */
function assertRollbackLegacyKey(): void {
  if (!preEnvelopeLegacyKeyConfigured()) {
    throw new KeyringConfigError(
      `Code older than P0.10 reads ${ENV_LEGACY_KEY} and never ${ENV_KEYRING}. Set ${ENV_LEGACY_KEY} itself to the ${LEGACY_KEY_VERSION} key (64 hex characters) before resealing to legacy or rolling back; without it the rolled-back deployment fails every SAP connection and write key.`,
    );
  }
  readKeyring();
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
 * under the legacy key (v1). It refuses to write while envelope sealing is
 * on: the running deployment would keep sealing new saves as `ce2` behind the
 * reseal, and the rolled-back code could not open them. Switch sealing off
 * and redeploy first; the ring stays configured so `ce2` blobs still open.
 * It also refuses, dry run or not, while SAP_CONNECTION_ENCRYPTION_KEY itself
 * is unset (assertRollbackLegacyKey), and while legacy blobs are refused
 * outright (SAP_CONNECTION_ACCEPT_LEGACY_FORMAT=none).
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
  if (to === "legacy" && apply && envelopeSealingEnabled()) {
    throw new KeyringConfigError(
      `Resealing to legacy while envelope sealing is on would race the deployment: every save after this run is written as ce2 again. Unset ${ENV_ACTIVE_KEY} and set ${ENV_KEY_PROVIDER} to env (keep SAP_CONNECTION_ENCRYPTION_KEYS so ce2 blobs still open), redeploy, then reseal with the same settings here.`,
    );
  }
  if (to === "legacy") {
    assertRollbackLegacyKey();
    if (legacyFormatPolicy() === "none") {
      throw new KeyringConfigError(
        `${ENV_ACCEPT_LEGACY_FORMAT}=none refuses every legacy blob, so a reseal to legacy would leave nothing that opens. Unset it (or set it to bound) with ${ENV_ACTIVE_KEY}, redeploy, then reseal.`,
      );
    }
  }

  const tables: Record<SealedTable, TableCounts> = {
    SapConnection: emptyCounts(),
    SolutionClient: emptyCounts(),
  };
  const failures: RowFailure[] = [];
  const latest = to === "ce2" ? await latestDataKeyVersions(options) : new Map<string, number>();

  for await (const batch of sealedRows(options)) {
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
  /**
   * ce2 blobs on a data-key version older than their organisation's newest —
   * after a rekey, what `keys:reseal --apply` has still to move before
   * `keys:retire` can withdraw the old version.
   */
  onOlderDataKey: number;
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
    /** Versions withdrawn by `keys:retire`: they still unwrap (custody) but open no blob. */
    retired: number;
  };
  readonly tables: Record<SealedTable, VerifyTableCounts>;
  readonly failures: RowFailure[];
}

function emptyVerifyCounts(): VerifyTableCounts {
  return { total: 0, opened: 0, failed: 0, legacyBound: 0, legacyUnbound: 0, ce2ByVersion: {}, onOlderDataKey: 0 };
}

export interface VerifyOptions extends MaintenanceScope {
  /**
   * Every blob must be in this format; any other is a failure. `legacy` gates
   * a rollback to code older than P0.10, which cannot open `ce2` — and so
   * refuses to run (exit 2) unless SAP_CONNECTION_ENCRYPTION_KEY itself is
   * set, the only key that code reads (assertRollbackLegacyKey).
   */
  readonly expectFormat?: SealedFormat;
  /**
   * Every data key must be wrapped by the active provider and master version;
   * any other is a failure. Gates removing the previous master version after
   * `keys:rotate`: an instance of the previous deployment can still wrap an
   * organisation's first data key under the old version after the rotate has
   * scanned past it, and only a failing verify stops that version leaving the
   * ring with the key still under it.
   */
  readonly expectActiveMaster?: boolean;
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
 *
 * A blob that names a retired data-key version does not open, so it fails
 * here — that is either a blob the reseal missed or one forged with the
 * retired key.
 */
export async function verifyAll(options: VerifyOptions = {}): Promise<VerifyReport> {
  permitCrossTenantReads("keys:verify: platform key maintenance");
  if (options.expectFormat === "legacy") assertRollbackLegacyKey();
  const master = activeMaster();
  if (options.expectActiveMaster && !master) {
    throw new KeyringConfigError(
      `Expecting every data key on the active master key needs one: set ${ENV_ACTIVE_KEY} (or select a KMS provider).`,
    );
  }
  clearDataKeyCache();
  const failures: RowFailure[] = [];
  const latest = await latestDataKeyVersions(options);

  const dataKeys = {
    total: 0,
    unwrapped: 0,
    failed: 0,
    byMasterKey: {} as Record<string, number>,
    notOnActiveMaster: 0,
    retired: 0,
  };
  for await (const row of orgDataKeyRows(options)) {
    dataKeys.total++;
    if (row.retiredAt) dataKeys.retired++;
    const label = `${row.provider}:${row.keyVersion}`;
    dataKeys.byMasterKey[label] = (dataKeys.byMasterKey[label] ?? 0) + 1;
    const notOnActive = master !== null && (row.provider !== master.provider || row.keyVersion !== master.keyVersion);
    if (notOnActive) dataKeys.notOnActiveMaster++;
    try {
      await unwrapOrgDataKey(row);
      dataKeys.unwrapped++;
      if (notOnActive && options.expectActiveMaster) {
        failures.push({
          table: "OrgDataKey",
          id: row.id,
          organizationId: row.organizationId,
          reason: `Wrapped by ${label}, not the active ${master.provider}:${master.keyVersion}. Run keys:rotate --apply (again) before removing the master key that wraps it.`,
        });
      }
    } catch (err) {
      dataKeys.failed++;
      failures.push({ table: "OrgDataKey", id: row.id, organizationId: row.organizationId, reason: reasonOf(err) });
    }
  }

  const tables: Record<SealedTable, VerifyTableCounts> = {
    SapConnection: emptyVerifyCounts(),
    SolutionClient: emptyVerifyCounts(),
  };
  for await (const batch of sealedRows(options)) {
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
          const newest = latest.get(row.organizationId);
          if (newest !== undefined && description.dataKeyVersion < newest) counts.onOlderDataKey++;
        } else if (isBoundLegacyBlob(row.blob, row.aad)) {
          counts.legacyBound++;
        } else {
          counts.legacyUnbound++;
        }
        if (options.expectFormat && description.format !== options.expectFormat) {
          throw new Error(
            `Sealed as ${description.format}, but every blob is expected to be ${options.expectFormat} (keys:reseal --to ${options.expectFormat} --apply).`,
          );
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

async function* orgDataKeyRows(scope: MaintenanceScope) {
  const batchSize = scope.batchSize ?? DEFAULT_BATCH_SIZE;
  let after = "";
  for (;;) {
    const rows = await prisma.orgDataKey.findMany({
      where: { id: { gt: after }, ...orgFilter(scope) },
      orderBy: { id: "asc" },
      take: batchSize,
      select: {
        id: true,
        organizationId: true,
        version: true,
        provider: true,
        keyVersion: true,
        wrappedKey: true,
        createdAt: true,
        retiredAt: true,
      },
    });
    if (rows.length === 0) return;
    after = rows[rows.length - 1]!.id;
    yield* rows;
  }
}

export interface RotateOptions extends MaintenanceScope {
  readonly apply?: boolean;
  /**
   * Also mint a NEW data key for every organisation that has one, so a
   * following `keys:reseal` moves every blob onto fresh key material. For a
   * suspected data-key exposure; a routine master rotation does not need it.
   */
  readonly rekey?: boolean;
  /**
   * With `rekey`: only organisations whose newest data key was created before
   * this moment get a new one. Defaults to the start of the run. A re-run
   * after a partial failure passes the first run's value (its report's
   * `rekeyBefore`), so organisations that run already rekeyed are skipped.
   */
  readonly rekeyBefore?: Date;
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
  /** With rekey: organisations whose newest data key is already newer than `rekeyBefore`. */
  alreadyRekeyed: number;
  /** With rekey: the cutoff used — pass it back as --rekey-before to resume. */
  readonly rekeyBefore: string | null;
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
  const rekeyBefore = options.rekey ? (options.rekeyBefore ?? new Date()) : null;
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
    alreadyRekeyed: 0,
    rekeyBefore: rekeyBefore ? rekeyBefore.toISOString() : null,
    failures: [],
  };
  const newestByOrg = new Map<string, { readonly version: number; readonly createdAt: Date }>();

  for await (const row of orgDataKeyRows(options)) {
    report.scanned++;
    const newest = newestByOrg.get(row.organizationId);
    if (!newest || row.version > newest.version) {
      newestByOrg.set(row.organizationId, { version: row.version, createdAt: row.createdAt });
    }
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

  if (rekeyBefore) {
    for (const [organizationId, newest] of newestByOrg) {
      // Rekeyed already — by an earlier run with this cutoff, or by a first
      // seal since — so its newest key is fresh material.
      if (newest.createdAt >= rekeyBefore) {
        report.alreadyRekeyed++;
        continue;
      }
      const next = newest.version + 1;
      try {
        if (apply) await createOrgDataKey(organizationId, next);
        report.rekeyed++;
      } catch (err) {
        report.failed++;
        report.failures.push({ table: "OrgDataKey", id: `${organizationId}#${next}`, organizationId, reason: reasonOf(err) });
      }
    }
  }
  return report;
}

/* ── retire ─────────────────────────────────────────────────────────────── */

export interface RetireOptions extends MaintenanceScope {
  readonly apply?: boolean;
}

export interface RetireReport {
  readonly apply: boolean;
  /** Data-key rows read. */
  scanned: number;
  /** Older than their organisation's newest version and retired (apply) or would be (dry run). */
  retired: number;
  /** Retired by an earlier run. */
  alreadyRetired: number;
  /** The newest version of each organisation: never retired. */
  newest: number;
  /** Still named by a sealed blob, so left open — reseal first. */
  stillInUse: number;
  changedUnderneath: number;
  readonly failures: RowFailure[];
}

/** One (organisation, data-key version) pair as a map key. */
function versionSlot(organizationId: string, version: number): string {
  return `${organizationId}:${version}`;
}

/**
 * Withdraw every data-key version older than its organisation's newest, so it
 * opens nothing — the last step after a suspected data-key exposure: rekey,
 * reseal, verify, retire. Until a version is retired, anyone holding it (and
 * write access to the database) can seal a blob the application accepts.
 *
 * A version still named by any sealed blob is left alone and reported as a
 * failure: retiring it would strand that secret. Run `keys:reseal --apply`
 * and retire again. The newest version is never retired, and new seals only
 * ever use the newest, so no blob can move onto a version between the scan
 * and the write.
 *
 * The row and its wrapped key stay: a backup taken before the reseal still
 * needs them, and the restore drill un-retires them in its scratch database.
 * Warm application instances that cached a version before it was retired keep
 * it for at most DATA_KEY_CACHE_TTL_MS.
 */
export async function retireDataKeys(options: RetireOptions = {}): Promise<RetireReport> {
  permitCrossTenantReads("keys:retire: platform key maintenance");
  const apply = options.apply ?? false;
  const report: RetireReport = {
    apply,
    scanned: 0,
    retired: 0,
    alreadyRetired: 0,
    newest: 0,
    stillInUse: 0,
    changedUnderneath: 0,
    failures: [],
  };

  // How many sealed blobs still name each (organisation, version).
  const inUse = new Map<string, number>();
  for await (const batch of sealedRows(options)) {
    for (const row of batch) {
      try {
        const description = describeSealedBlob(row.blob);
        if (description.format !== "ce2") continue;
        const slot = versionSlot(row.organizationId, description.dataKeyVersion);
        inUse.set(slot, (inUse.get(slot) ?? 0) + 1);
      } catch {
        // A malformed blob names no version; keys:verify reports it.
      }
    }
  }

  const latest = await latestDataKeyVersions(options);
  const retiredAt = new Date();
  for await (const row of orgDataKeyRows(options)) {
    report.scanned++;
    if (row.version >= (latest.get(row.organizationId) ?? row.version)) {
      report.newest++;
      continue;
    }
    if (row.retiredAt) {
      report.alreadyRetired++;
      continue;
    }
    const blobs = inUse.get(versionSlot(row.organizationId, row.version)) ?? 0;
    if (blobs > 0) {
      report.stillInUse++;
      report.failures.push({
        table: "OrgDataKey",
        id: row.id,
        organizationId: row.organizationId,
        reason: `Data key version ${row.version} still seals ${blobs} blob(s); run keys:reseal --apply first. Not retired.`,
      });
      continue;
    }
    if (!apply) {
      report.retired++;
      continue;
    }
    const result = await prisma.orgDataKey.updateMany({
      where: { id: row.id, organizationId: row.organizationId, retiredAt: null },
      data: { retiredAt },
    });
    if (result.count === 1) report.retired++;
    else report.changedUnderneath++;
  }
  if (apply) clearDataKeyCache();
  return report;
}
