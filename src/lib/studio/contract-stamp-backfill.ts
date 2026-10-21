/**
 * THE P0.4 BACKFILL: stamp each existing capture with the contract it was
 * read under, where the audit trail can establish it (audit A38).
 *
 * Captured response schemas and mock fixtures carried no contract identity, so
 * after an entity-set change nothing could tell a schema of the old entity set
 * from one of the new. Readers now publish only a capture whose stamp matches
 * the interface (contract-provenance.ts), and an unstamped one is withheld as
 * UNVERIFIED. These statements stamp the ones whose contract is a matter of
 * record, so that nothing provably current is withheld on deploy:
 *
 *   - An interface still at version 1 has never changed its contract, so
 *     every capture of it belongs to v1 → stamped CURRENT.
 *   - Otherwise the Studio PATCH audit (ConfigAudit, entityType "Interface",
 *     `before.version` ≠ `after.version`) dates each version change. When the
 *     latest such row reaches the interface's version (the trail is complete
 *     to now), a capture made after it is stamped CURRENT, and one made at or
 *     before it is stamped with the version in force at capture — capped
 *     below the current one, so it can never read as current. That is the
 *     stale A38 artifact, kept (re-capturing replaces it) but never served.
 *   - Anything else — a version above 1 with no audited change, or a trail
 *     that stops short of the current version — stays unstamped: its
 *     contract cannot be established, and it is withheld as UNVERIFIED.
 *
 * CANNOT FAIL ON EXISTING DATA. No value is cast unless a CASE has checked
 * its shape first (a jsonb version that is not a plain integer reads as NULL),
 * a schema's capturedAt is compared as text and only in the exact form
 * Date.toISOString() writes (anything else stays unstamped), and only rows
 * still unstamped are touched, so a re-run changes nothing. The migration
 * 20261023010000_contract_stamps holds this text; a test keeps them identical.
 */

/** Every audited contract-version change of an interface. */
const CHANGES = `WITH "changes" AS MATERIALIZED (
  SELECT a."organizationId",
         a."entityId" AS "interfaceId",
         a."at",
         CASE WHEN (a."after"->>'version') ~ '^[0-9]{1,9}$' THEN (a."after"->>'version')::int END AS "toVersion",
         CASE WHEN (a."before"->>'version') ~ '^[0-9]{1,9}$' THEN (a."before"->>'version')::int END AS "fromVersion"
  FROM "ConfigAudit" a
  WHERE a."entityType" = 'Interface'
    AND jsonb_typeof(a."after"->'version') = 'number'
    AND jsonb_typeof(a."before"->'version') = 'number'
    AND (a."after"->>'version') <> (a."before"->>'version')
),
"latest" AS (
  SELECT DISTINCT ON ("organizationId", "interfaceId") "organizationId", "interfaceId", "at", "toVersion"
  FROM "changes"
  ORDER BY "organizationId", "interfaceId", "at" DESC
)`;

/** A schema's capture time, in the only form it is compared in. */
const SCHEMA_CAPTURED_AT = `(i."responseSchema"->'x-captured'->>'capturedAt')`;
const ISO_MS = `'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'`;
const AS_ISO = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const UNSTAMPED_SCHEMA = `jsonb_typeof(i."responseSchema"->'x-captured') = 'object'
  AND (i."responseSchema"->'x-captured'->'interfaceVersion') IS NULL
  AND ${SCHEMA_CAPTURED_AT} ~ ${ISO_MS}`;

/** Schemas captured under the interface's current contract. */
export const CURRENT_SCHEMA_STAMP_SQL = `${CHANGES}
UPDATE "Interface" AS i
SET "responseSchema" = jsonb_set(
      i."responseSchema",
      '{x-captured}',
      (i."responseSchema"->'x-captured') || jsonb_build_object('interfaceVersion', i."version", 'entitySet', i."entitySet")
    )
WHERE ${UNSTAMPED_SCHEMA}
  AND (
    (i."version" = 1
      AND NOT EXISTS (SELECT 1 FROM "changes" c WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id"))
    OR EXISTS (
      SELECT 1 FROM "latest" l
      WHERE l."organizationId" = i."organizationId" AND l."interfaceId" = i."id"
        AND l."toVersion" = i."version"
        AND ${SCHEMA_CAPTURED_AT} > ${AS_ISO(`l."at"`)}
    )
  );`;

/** Schemas captured under an earlier contract: stamped with it, never current. */
export const STALE_SCHEMA_STAMP_SQL = `${CHANGES}
UPDATE "Interface" AS i
SET "responseSchema" = jsonb_set(
      i."responseSchema",
      '{x-captured}',
      (i."responseSchema"->'x-captured') || jsonb_build_object(
        'interfaceVersion',
        LEAST(
          i."version" - 1,
          COALESCE(
            (SELECT c."toVersion" FROM "changes" c
              WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id"
                AND ${AS_ISO(`c."at"`)} < ${SCHEMA_CAPTURED_AT}
              ORDER BY c."at" DESC LIMIT 1),
            (SELECT c."fromVersion" FROM "changes" c
              WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id"
              ORDER BY c."at" ASC LIMIT 1),
            i."version" - 1
          )
        )
      )
    )
WHERE ${UNSTAMPED_SCHEMA}
  AND EXISTS (
    SELECT 1 FROM "latest" l
    WHERE l."organizationId" = i."organizationId" AND l."interfaceId" = i."id"
      AND l."toVersion" = i."version"
      AND ${SCHEMA_CAPTURED_AT} <= ${AS_ISO(`l."at"`)}
  );`;

/** Fixtures recorded under the interface's current contract. */
export const CURRENT_FIXTURE_STAMP_SQL = `${CHANGES}
UPDATE "MockFixture" AS f
SET "interfaceVersion" = i."version", "entitySet" = i."entitySet"
FROM "Interface" i
WHERE i."id" = f."interfaceId" AND i."organizationId" = f."organizationId"
  AND f."interfaceVersion" IS NULL
  AND (
    (i."version" = 1
      AND NOT EXISTS (SELECT 1 FROM "changes" c WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id"))
    OR EXISTS (
      SELECT 1 FROM "latest" l
      WHERE l."organizationId" = i."organizationId" AND l."interfaceId" = i."id"
        AND l."toVersion" = i."version"
        AND f."capturedAt" > l."at"
    )
  );`;

/** Fixtures recorded under an earlier contract: stamped with it, never current. */
export const STALE_FIXTURE_STAMP_SQL = `${CHANGES}
UPDATE "MockFixture" AS f
SET "interfaceVersion" = LEAST(
      i."version" - 1,
      COALESCE(
        (SELECT c."toVersion" FROM "changes" c
          WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id" AND c."at" < f."capturedAt"
          ORDER BY c."at" DESC LIMIT 1),
        (SELECT c."fromVersion" FROM "changes" c
          WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id"
          ORDER BY c."at" ASC LIMIT 1),
        i."version" - 1
      )
    )
FROM "Interface" i
WHERE i."id" = f."interfaceId" AND i."organizationId" = f."organizationId"
  AND f."interfaceVersion" IS NULL
  AND EXISTS (
    SELECT 1 FROM "latest" l
    WHERE l."organizationId" = i."organizationId" AND l."interfaceId" = i."id"
      AND l."toVersion" = i."version"
      AND f."capturedAt" <= l."at"
  );`;

/** In the order the migration runs them: current first, so stale sees only what is left. */
export const CONTRACT_STAMP_BACKFILL_SQL = [
  CURRENT_SCHEMA_STAMP_SQL,
  STALE_SCHEMA_STAMP_SQL,
  CURRENT_FIXTURE_STAMP_SQL,
  STALE_FIXTURE_STAMP_SQL,
] as const;

/** How many captures one run of the backfill stamped, by statement. */
export interface ContractStampResult {
  readonly currentSchemas: number;
  readonly staleSchemas: number;
  readonly currentFixtures: number;
  readonly staleFixtures: number;
}

interface RawExecutor {
  $executeRawUnsafe(query: string): PromiseLike<number>;
}

/**
 * Run the backfill again, in one transaction (`pnpm contracts:stamp --apply`).
 *
 * The migration runs it once, at deploy; but the build that follows the
 * migration takes minutes, and a rollback can put the pre-P0.4 build back.
 * In both windows the old routes write captures with no stamp, which the new
 * readers withhold as unverified — although the audit trail can place every
 * one of them. Re-running the same statements stamps those, and only those:
 * each statement touches only rows still unstamped, so a capture the new
 * code stamped, or one an earlier run stamped, is never changed.
 */
export async function runContractStampBackfill(db: {
  $transaction<R>(fn: (tx: RawExecutor) => Promise<R>): Promise<R>;
}): Promise<ContractStampResult> {
  return db.$transaction(async (tx) => {
    const counts: number[] = [];
    for (const statement of CONTRACT_STAMP_BACKFILL_SQL) counts.push(await tx.$executeRawUnsafe(statement));
    const [currentSchemas = 0, staleSchemas = 0, currentFixtures = 0, staleFixtures = 0] = counts;
    return { currentSchemas, staleSchemas, currentFixtures, staleFixtures };
  });
}

/** Captures that carry no contract stamp (withheld as unverified): what a run could still place. */
export const UNSTAMPED_CAPTURES_SQL = `SELECT
  (SELECT count(*)::int FROM "Interface" i
    WHERE i."responseSchema" IS NOT NULL AND (i."responseSchema"->'x-captured'->'interfaceVersion') IS NULL) AS "schemas",
  (SELECT count(*)::int FROM "MockFixture" f WHERE f."interfaceVersion" IS NULL) AS "fixtures";`;
