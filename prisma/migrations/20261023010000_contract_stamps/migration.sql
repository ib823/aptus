-- Stamp every capture with the contract it was read under (P0.4, audit A38).
--
-- Changing an interface's entity set (or its operation, or your own API's
-- service) bumps its contract version, and left the captured response schema
-- and the mock fixtures as they were. Neither said which contract it came
-- from, so the northbound /schema endpoint served the new version with the
-- old shape and the starter kit's mock served the old entity set's rows.
--
-- ADDITIVE. Two nullable columns on "MockFixture"; the schema's stamp lives in
-- its own JSON (x-captured.interfaceVersion / .entitySet). The running code
-- neither reads nor writes either, so this is safe ahead of the deploy.
--
-- BACKFILL. Readers now publish a capture only when its stamp matches the
-- interface (src/lib/studio/contract-provenance.ts); an unstamped one is
-- withheld as unverified. The statements below stamp every capture whose
-- contract the audit trail establishes: an interface still at version 1 has
-- never changed contract, and otherwise the Studio PATCH audit dates each
-- version change. A capture made after the latest change is stamped current;
-- one made before it is stamped with the earlier version it belongs to, so it
-- is kept (a re-capture replaces it) but never served. Anything whose contract
-- cannot be established stays unstamped. Nothing is deleted. The statements
-- are CONTRACT_STAMP_BACKFILL_SQL in src/lib/studio/contract-stamp-backfill.ts
-- (a test keeps the two identical); they cast nothing whose shape a CASE has
-- not checked, so they cannot fail on existing data, and they touch only rows
-- still unstamped, so a re-run changes nothing.

-- AlterTable
ALTER TABLE "MockFixture" ADD COLUMN     "entitySet" TEXT,
ADD COLUMN     "interfaceVersion" INTEGER;

WITH "changes" AS MATERIALIZED (
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
)
UPDATE "Interface" AS i
SET "responseSchema" = jsonb_set(
      i."responseSchema",
      '{x-captured}',
      (i."responseSchema"->'x-captured') || jsonb_build_object('interfaceVersion', i."version", 'entitySet', i."entitySet")
    )
WHERE jsonb_typeof(i."responseSchema"->'x-captured') = 'object'
  AND (i."responseSchema"->'x-captured'->'interfaceVersion') IS NULL
  AND (i."responseSchema"->'x-captured'->>'capturedAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  AND (
    (i."version" = 1
      AND NOT EXISTS (SELECT 1 FROM "changes" c WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id"))
    OR EXISTS (
      SELECT 1 FROM "latest" l
      WHERE l."organizationId" = i."organizationId" AND l."interfaceId" = i."id"
        AND l."toVersion" = i."version"
        AND (i."responseSchema"->'x-captured'->>'capturedAt') > to_char(l."at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );

WITH "changes" AS MATERIALIZED (
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
)
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
                AND to_char(c."at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') < (i."responseSchema"->'x-captured'->>'capturedAt')
              ORDER BY c."at" DESC LIMIT 1),
            (SELECT c."fromVersion" FROM "changes" c
              WHERE c."organizationId" = i."organizationId" AND c."interfaceId" = i."id"
              ORDER BY c."at" ASC LIMIT 1),
            i."version" - 1
          )
        )
      )
    )
WHERE jsonb_typeof(i."responseSchema"->'x-captured') = 'object'
  AND (i."responseSchema"->'x-captured'->'interfaceVersion') IS NULL
  AND (i."responseSchema"->'x-captured'->>'capturedAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  AND EXISTS (
    SELECT 1 FROM "latest" l
    WHERE l."organizationId" = i."organizationId" AND l."interfaceId" = i."id"
      AND l."toVersion" = i."version"
      AND (i."responseSchema"->'x-captured'->>'capturedAt') <= to_char(l."at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

WITH "changes" AS MATERIALIZED (
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
)
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
  );

WITH "changes" AS MATERIALIZED (
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
)
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
  );
