-- P0.3 Truthful registers and screens.
--
-- SapHubContent.importedAt (A29): when an IMPORT last wrote the row. Catalogue
-- Health judged freshness from MAX("updatedAt"), and every capability probe
-- stamps "updatedAt", so one "Probe all" made a years-old catalogue read
-- CURRENT. Only importers write this column from now on.
--
-- SolutionClient.tokenTail (A45): the last four characters of the current
-- token, so the masked reference the claim page shows is the one the console
-- shows. Written by every mint from now on; a key minted before this reads
-- "ending not recorded" until its next rotation (only its hash is stored, so
-- there is nothing to backfill from).
--
-- Additive: two nullable columns and a backfill of the first. No call path
-- reads either column; nothing that works today can be refused by them.

-- AlterTable
ALTER TABLE "SapHubContent" ADD COLUMN     "importedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SolutionClient" ADD COLUMN     "tokenTail" TEXT;

-- Backfill importedAt, most trustworthy source first:
--   1. the importer's own stamp, `rawMetadataJson.importedAt` (an ISO instant
--      the seed's bundled import, the harvest import and the import script
--      write on every row they touch);
--   2. `updatedAt` on a row no probe has written (no `probes` entry): only an
--      import writes such a row, so its last write IS its last import;
--   3. `createdAt` otherwise: the row's first import. It can only make the
--      catalogue read OLDER than it is, never fresher, so the worst case is a
--      STALE verdict that the next import clears.
--
-- The stamp is free text in a JSON column, so it is parsed by a function that
-- answers NULL for a value Postgres cannot read as a time (an impossible date
-- such as 2024-02-31 would otherwise fail the cast and the whole deploy). The
-- function lives in pg_temp: it is gone when the migration's session ends and
-- never becomes part of the schema.
CREATE FUNCTION pg_temp.p03_imported_at(stamp text) RETURNS TIMESTAMP(3)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF stamp IS NULL OR stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' THEN
    RETURN NULL;
  END IF;
  RETURN (stamp::timestamptz AT TIME ZONE 'UTC');
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$$;

UPDATE "SapHubContent"
SET "importedAt" = COALESCE(
  CASE WHEN jsonb_typeof("rawMetadataJson") = 'object'
       THEN pg_temp.p03_imported_at("rawMetadataJson"->>'importedAt') END,
  CASE WHEN jsonb_typeof("rawMetadataJson") = 'object'
            AND jsonb_typeof("rawMetadataJson"->'probes') = 'object'
            AND "rawMetadataJson"->'probes' <> '{}'::jsonb
       THEN "createdAt"
       ELSE "updatedAt" END
);
