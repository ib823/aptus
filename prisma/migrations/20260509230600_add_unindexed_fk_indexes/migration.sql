-- Add indexes for foreign-key columns that were not covered by an existing
-- single-column or leading-column composite index.
--
-- Postgres does NOT auto-index FK columns; Prisma only adds an index when a
-- @@index is declared. Without these, queries that filter or join by these
-- FKs degrade to sequential scans as the parent tables grow, and cascading
-- deletes on the parent walk the child without index support.
--
-- All ops are CREATE INDEX IF NOT EXISTS — safe to re-run, no data change,
-- no schema lock outside the brief catalog write. CONCURRENTLY is omitted
-- because Prisma's migration runner wraps the file in a transaction
-- (`CREATE INDEX CONCURRENTLY` cannot run inside a tx). For very large
-- tables, an operator may prefer to apply these manually with
-- `CREATE INDEX CONCURRENTLY` outside the migration runner and then
-- mark this migration as applied via `prisma migrate resolve`.

-- 1. ClassificationPass.protocolVersionId — joined on every verdict write/read
--    to fetch the active protocol text.
CREATE INDEX IF NOT EXISTS "ClassificationPass_protocolVersionId_idx"
  ON "ClassificationPass"("protocolVersionId");

-- 2. ClassificationVerdict.protocolVersionId — joined on every verdict
--    render to fetch the protocol the verdict was authored against.
CREATE INDEX IF NOT EXISTS "ClassificationVerdict_protocolVersionId_idx"
  ON "ClassificationVerdict"("protocolVersionId");

-- 3. Assessment.catalogVersionId — joined on every assessment listing,
--    classification path, and report render to resolve the frozen catalog.
CREATE INDEX IF NOT EXISTS "Assessment_catalogVersionId_idx"
  ON "Assessment"("catalogVersionId");

-- 4. Assessment.brownfieldCatalogVersionId — same as #3 for hybrid
--    (greenfield + brownfield) engagements.
-- Existence-guarded: the Brownfield subsystem (Phase 14) reached environments
-- via `db push` and is not yet captured by any migration, so on a fresh
-- `migrate deploy` this column/table may not exist yet. Create the index only
-- when the target exists; on a db-push'd/populated DB it exists and is indexed.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Assessment'
      AND column_name = 'brownfieldCatalogVersionId'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Assessment_brownfieldCatalogVersionId_idx"
      ON "Assessment"("brownfieldCatalogVersionId");
  ELSE
    RAISE NOTICE 'Skipping Assessment_brownfieldCatalogVersionId_idx — column not present (Brownfield subsystem not yet migrated)';
  END IF;
END $$;

-- 5. EditingLock.lockedById — joined to User to display the lock owner's
--    name in the collaborative editing UI.
CREATE INDEX IF NOT EXISTS "EditingLock_lockedById_idx"
  ON "EditingLock"("lockedById");

-- 6. BrownfieldClassificationPass.protocolVersionId — same join pattern as
--    #1 on the brownfield pathway. Existence-guarded (see #4).
DO $$ BEGIN
  IF to_regclass('"BrownfieldClassificationPass"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "BrownfieldClassificationPass_protocolVersionId_idx"
      ON "BrownfieldClassificationPass"("protocolVersionId");
  ELSE
    RAISE NOTICE 'Skipping BrownfieldClassificationPass index — table not present (Brownfield subsystem not yet migrated)';
  END IF;
END $$;

-- 7. BrownfieldVerdict.protocolVersionId — same join pattern as #2 on the
--    brownfield pathway. Existence-guarded (see #4).
DO $$ BEGIN
  IF to_regclass('"BrownfieldVerdict"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "BrownfieldVerdict_protocolVersionId_idx"
      ON "BrownfieldVerdict"("protocolVersionId");
  ELSE
    RAISE NOTICE 'Skipping BrownfieldVerdict index — table not present (Brownfield subsystem not yet migrated)';
  END IF;
END $$;
