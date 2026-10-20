/**
 * One data key per organisation, stored once and only in wrapped form (P0.10).
 *
 * The data key is what actually encrypts an organisation's sealed SAP secrets
 * in the `ce2` format (secret-envelope.ts). It is generated here, wrapped by the
 * active KeyProvider, written to `OrgDataKey`, and from then on read back and
 * unwrapped on demand. A master-key rotation re-wraps the row; the data key —
 * and therefore every blob sealed under it — does not change.
 *
 * THE PER-PROCESS CACHE. Opening a connection happens on every broker call, and
 * unwrapping costs a database read (and, behind a cloud KMS, a network call).
 * Unwrapped keys are kept in memory for DATA_KEY_CACHE_TTL_MS. The TTL bounds
 * how long a revoked master key keeps working in a warm process: after a KMS
 * grant is withdrawn, the longest any instance can still open secrets is the
 * TTL. A re-wrap never invalidates the cache, because the key it holds is the
 * same key.
 *
 * An entry remembers WHICH ROW it was unwrapped from, not just (organisation,
 * version). After a database restore the same version can name a different
 * row and key; a seal must never use a key the database no longer holds (the
 * blob would never open again), so the seal path, which reads the row anyway,
 * only takes a cached key for the row it just read. The open path does not
 * read the row on a hit; secret-envelope.ts retries a failed open once with
 * `refresh` instead.
 *
 * RETIRED VERSIONS OPEN NOTHING. After a rekey and reseal, `pnpm keys:retire`
 * sets `retiredAt` on the older versions. A retired row is refused here and is
 * never cached, so a leaked old data key cannot forge a blob the application
 * accepts. A warm instance that cached the version before it was retired keeps
 * it for at most the TTL.
 */
import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";

import { getKeyProvider } from "./key-provider";

/** AES-256: the data key is 32 random bytes. */
export const DATA_KEY_BYTES = 32;
export const DATA_KEY_CACHE_TTL_MS = 10 * 60 * 1000;

/** The data key a blob names was retired after a rekey (`pnpm keys:retire`). */
export class DataKeyRetiredError extends Error {
  constructor(organizationId: string, version: number) {
    super(
      `Data key version ${version} of organization ${organizationId} is retired and opens nothing. A blob that names it was either sealed before the rekey and missed by keys:reseal, or forged with the retired key.`,
    );
    this.name = "DataKeyRetiredError";
  }
}

/** The organisation holds no data key with the version a blob names. */
export class DataKeyMissingError extends Error {
  constructor(organizationId: string, version: number) {
    super(
      `No data key version ${version} is stored for organization ${organizationId}. The blob was sealed against a database other than this one (a restore from a different backup?), or the key row was deleted.`,
    );
    this.name = "DataKeyMissingError";
  }
}

export interface OrgDataKeyRow {
  readonly id: string;
  readonly organizationId: string;
  readonly version: number;
  readonly provider: string;
  readonly keyVersion: string;
  readonly wrappedKey: string;
}

interface CachedKey {
  /** The OrgDataKey row the key was unwrapped from. */
  readonly rowId: string;
  readonly key: Buffer;
  readonly expiresAt: number;
}

const cache = new Map<string, CachedKey>();

function cacheKey(organizationId: string, version: number): string {
  return `${organizationId}\u0000${version}`;
}

function cached(organizationId: string, version: number, now = Date.now()): CachedKey | null {
  const hit = cache.get(cacheKey(organizationId, version));
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(cacheKey(organizationId, version));
    return null;
  }
  return hit;
}

function remember(organizationId: string, version: number, rowId: string, key: Buffer): void {
  cache.set(cacheKey(organizationId, version), { rowId, key, expiresAt: Date.now() + DATA_KEY_CACHE_TTL_MS });
}

/** Forget every unwrapped key in this process. Tests, and an operator hook after revoking a key. */
export function clearDataKeyCache(): void {
  cache.clear();
}

/** Unwrap one stored row with the provider that wrapped it. */
export async function unwrapOrgDataKey(row: OrgDataKeyRow): Promise<Buffer> {
  const key = await getKeyProvider(row.provider).unwrapDataKey(
    { keyVersion: row.keyVersion, wrappedKey: row.wrappedKey },
    { organizationId: row.organizationId, dataKeyVersion: row.version },
  );
  if (key.length !== DATA_KEY_BYTES) {
    throw new Error(`Data key ${row.version} of organization ${row.organizationId} did not unwrap to ${DATA_KEY_BYTES} bytes.`);
  }
  return key;
}

const ROW_SELECT = {
  id: true,
  organizationId: true,
  version: true,
  provider: true,
  keyVersion: true,
  wrappedKey: true,
  retiredAt: true,
} as const;

/**
 * The data key a `ce2:<version>:` blob of this organisation was sealed under.
 *
 * `refresh` skips the cache and reads the row again — for a retry after a
 * cached key failed to open a blob (the row may have changed underneath, as
 * after a restore).
 */
export async function dataKeyForOpen(
  organizationId: string,
  version: number,
  options: { readonly refresh?: boolean } = {},
): Promise<Buffer> {
  if (!options.refresh) {
    const hit = cached(organizationId, version);
    if (hit) return hit.key;
  }
  cache.delete(cacheKey(organizationId, version));
  const row = await prisma.orgDataKey.findFirst({
    where: { organizationId, version },
    select: ROW_SELECT,
  });
  if (!row) throw new DataKeyMissingError(organizationId, version);
  if (row.retiredAt) throw new DataKeyRetiredError(organizationId, version);
  const key = await unwrapOrgDataKey(row);
  remember(organizationId, version, row.id, key);
  return key;
}

/**
 * The data key a NEW blob of this organisation is sealed under: its newest
 * version, minted (as version 1) on the organisation's first seal.
 *
 * Reads the newest version from the database every time rather than caching
 * it, so a `keys:rotate --rekey` in another process is picked up by the next
 * seal. Seals are rare (a person saving a form); opens are the hot path.
 */
export async function dataKeyForSeal(
  organizationId: string,
): Promise<{ readonly version: number; readonly key: Buffer }> {
  const latest = await prisma.orgDataKey.findFirst({
    where: { organizationId },
    orderBy: { version: "desc" },
    select: ROW_SELECT,
  });
  if (!latest) return createOrgDataKey(organizationId, 1);
  // keys:retire never retires the newest version; should one be retired all
  // the same, the next seal moves on rather than sealing under it.
  if (latest.retiredAt) return createOrgDataKey(organizationId, latest.version + 1);
  // Only a key unwrapped from THIS row: after a restore the same version can
  // name a different row, and a blob sealed under the old key never opens.
  const hit = cached(organizationId, latest.version);
  if (hit && hit.rowId === latest.id) return { version: latest.version, key: hit.key };
  const key = await unwrapOrgDataKey(latest);
  remember(organizationId, latest.version, latest.id, key);
  return { version: latest.version, key };
}

/** Prisma's unique-constraint violation, without importing the runtime error class. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * Mint and store data key `version` for an organisation, wrapped by the
 * configured provider's active master key.
 *
 * TWO CONCURRENT FIRST SEALS both try to create version 1. The unique key on
 * (organizationId, version) lets exactly one win; the loser reads the winner's
 * key back and uses it, so both blobs open under the one stored key. Never the
 * other way round: a key that lost the race was never stored, and a blob sealed
 * under it could never be opened again.
 */
export async function createOrgDataKey(
  organizationId: string,
  version: number,
): Promise<{ readonly version: number; readonly key: Buffer }> {
  const provider = getKeyProvider();
  const key = randomBytes(DATA_KEY_BYTES);
  const wrapped = await provider.wrapDataKey(key, { organizationId, dataKeyVersion: version });
  let rowId: string;
  try {
    ({ id: rowId } = await prisma.orgDataKey.create({
      data: {
        organizationId,
        version,
        provider: provider.name,
        keyVersion: wrapped.keyVersion,
        wrappedKey: wrapped.wrappedKey,
      },
      select: { id: true },
    }));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { version, key: await dataKeyForOpen(organizationId, version, { refresh: true }) };
    }
    throw err;
  }
  remember(organizationId, version, rowId, key);
  return { version, key };
}
