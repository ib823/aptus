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
 */
import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";

import { getKeyProvider } from "./key-provider";

/** AES-256: the data key is 32 random bytes. */
export const DATA_KEY_BYTES = 32;
export const DATA_KEY_CACHE_TTL_MS = 10 * 60 * 1000;

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
  readonly key: Buffer;
  readonly expiresAt: number;
}

const cache = new Map<string, CachedKey>();

function cacheKey(organizationId: string, version: number): string {
  return `${organizationId}\u0000${version}`;
}

function cached(organizationId: string, version: number, now = Date.now()): Buffer | null {
  const hit = cache.get(cacheKey(organizationId, version));
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(cacheKey(organizationId, version));
    return null;
  }
  return hit.key;
}

function remember(organizationId: string, version: number, key: Buffer): void {
  cache.set(cacheKey(organizationId, version), { key, expiresAt: Date.now() + DATA_KEY_CACHE_TTL_MS });
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
} as const;

/** The data key a `ce2:<version>:` blob of this organisation was sealed under. */
export async function dataKeyForOpen(organizationId: string, version: number): Promise<Buffer> {
  const hit = cached(organizationId, version);
  if (hit) return hit;
  const row = await prisma.orgDataKey.findFirst({
    where: { organizationId, version },
    select: ROW_SELECT,
  });
  if (!row) throw new DataKeyMissingError(organizationId, version);
  const key = await unwrapOrgDataKey(row);
  remember(organizationId, version, key);
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
  const hit = cached(organizationId, latest.version);
  if (hit) return { version: latest.version, key: hit };
  const key = await unwrapOrgDataKey(latest);
  remember(organizationId, latest.version, key);
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
  try {
    await prisma.orgDataKey.create({
      data: {
        organizationId,
        version,
        provider: provider.name,
        keyVersion: wrapped.keyVersion,
        wrappedKey: wrapped.wrappedKey,
      },
      select: { id: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { version, key: await dataKeyForOpen(organizationId, version) };
    }
    throw err;
  }
  remember(organizationId, version, key);
  return { version, key };
}
