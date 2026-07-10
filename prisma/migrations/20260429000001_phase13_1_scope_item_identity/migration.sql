-- =====================================================================
-- Phase 13.1 — ScopeItem identity refactor + curation join tables
-- =====================================================================
-- Adds scopeCode column to ScopeItem with composite unique
-- (scopeCode, catalogVersionId), so the same SAP code can exist in
-- multiple catalog editions (Public 2602's J60 vs Private 2025-FPS1 MY's J60).
--
-- Strategy: existing 582 Public 2602 rows keep id = "J60" (TEXT primary key).
-- New rows from Private ingest will get id = <cuid> + scopeCode = "J60".
-- No mass UPDATE of existing IDs; no FK repointing.
--
-- Replaces the String[] curation columns (ScopePreset.{default,optional}ScopeItemIds,
-- GapProneArea.scopeItemIds, ProcessChain.scopeItemIdsOrdered) with FK
-- join tables (ScopePresetItem / GapProneAreaItem / ProcessChainItem)
-- so curation refs are catalog-scoped and FK-enforced.
--
-- 14 dangling refs in ProcessChain.scopeItemIdsOrdered (codes that no
-- longer exist in ScopeItem) are dropped and listed in NOTICE output.
--
-- Single transaction. Verifies invariants at start and end. If any
-- check fails, rolls back the entire migration.
-- =====================================================================

BEGIN;

-- ----------------------------------------------------------------------
-- Pre-flight invariants (must match Phase 13.0 baseline fixture)
-- ----------------------------------------------------------------------
DO $$
DECLARE
  scope_count INT;
  null_catalog_count INT;
BEGIN
  SELECT COUNT(*) INTO scope_count FROM "ScopeItem";
  -- Fresh-provision guard: on an empty DB (new environment, CI, or the
  -- `migrate diff` shadow DB) the Phase 13.0 baseline fixture is absent, so
  -- these fixture-specific regression asserts don't apply. Skip them; the data
  -- transforms below are all no-ops on zero rows and produce the identical end
  -- schema. On a populated DB the asserts run unchanged.
  IF scope_count = 0 THEN
    RAISE NOTICE 'Fresh/empty DB (0 ScopeItem rows) — skipping Phase 13.0 pre-flight asserts';
    RETURN;
  END IF;
  IF scope_count <> 582 THEN
    RAISE EXCEPTION 'Pre-flight failed: expected 582 ScopeItem rows, found %', scope_count;
  END IF;

  SELECT COUNT(*) INTO null_catalog_count FROM "ScopeItem" WHERE "catalogVersionId" IS NULL;
  IF null_catalog_count <> 0 THEN
    RAISE EXCEPTION 'Pre-flight failed: % ScopeItem rows have NULL catalogVersionId; expected 0', null_catalog_count;
  END IF;

  RAISE NOTICE 'Pre-flight ok: 582 ScopeItem rows, all catalog-pinned';
END $$;

-- ----------------------------------------------------------------------
-- 1. Add scopeCode column (nullable initially; backfill; flip NOT NULL)
-- ----------------------------------------------------------------------
ALTER TABLE "ScopeItem" ADD COLUMN "scopeCode" TEXT;
UPDATE "ScopeItem" SET "scopeCode" = id;
ALTER TABLE "ScopeItem" ALTER COLUMN "scopeCode" SET NOT NULL;

-- ----------------------------------------------------------------------
-- 2. Flip catalogVersionId NOT NULL (verified safe in pre-flight)
-- ----------------------------------------------------------------------
ALTER TABLE "ScopeItem" DROP CONSTRAINT "ScopeItem_catalogVersionId_fkey";
ALTER TABLE "ScopeItem" ALTER COLUMN "catalogVersionId" SET NOT NULL;
ALTER TABLE "ScopeItem"
  ADD CONSTRAINT "ScopeItem_catalogVersionId_fkey"
  FOREIGN KEY ("catalogVersionId") REFERENCES "ScopeCatalogVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 3. Composite unique + scopeCode index
-- ----------------------------------------------------------------------
CREATE UNIQUE INDEX "ScopeItem_scopeCode_catalogVersionId_key"
  ON "ScopeItem"("scopeCode", "catalogVersionId");
CREATE INDEX "ScopeItem_scopeCode_idx" ON "ScopeItem"("scopeCode");

-- ----------------------------------------------------------------------
-- 4. Create curation join tables
-- ----------------------------------------------------------------------
CREATE TABLE "ScopePresetItem" (
  "presetId"    TEXT NOT NULL,
  "scopeItemId" TEXT NOT NULL,
  "role"        TEXT NOT NULL,
  CONSTRAINT "ScopePresetItem_pkey" PRIMARY KEY ("presetId", "scopeItemId", "role")
);
CREATE INDEX "ScopePresetItem_scopeItemId_idx" ON "ScopePresetItem"("scopeItemId");

CREATE TABLE "GapProneAreaItem" (
  "areaId"      TEXT NOT NULL,
  "scopeItemId" TEXT NOT NULL,
  CONSTRAINT "GapProneAreaItem_pkey" PRIMARY KEY ("areaId", "scopeItemId")
);
CREATE INDEX "GapProneAreaItem_scopeItemId_idx" ON "GapProneAreaItem"("scopeItemId");

CREATE TABLE "ProcessChainItem" (
  "chainId"     TEXT NOT NULL,
  "scopeItemId" TEXT NOT NULL,
  "sortOrder"   INTEGER NOT NULL,
  CONSTRAINT "ProcessChainItem_pkey" PRIMARY KEY ("chainId", "scopeItemId")
);
CREATE UNIQUE INDEX "ProcessChainItem_chainId_sortOrder_key" ON "ProcessChainItem"("chainId", "sortOrder");
CREATE INDEX "ProcessChainItem_scopeItemId_idx" ON "ProcessChainItem"("scopeItemId");

-- ----------------------------------------------------------------------
-- 5. Backfill ScopePresetItem from defaultScopeItemIds + optionalScopeItemIds
-- ----------------------------------------------------------------------
INSERT INTO "ScopePresetItem" ("presetId", "scopeItemId", "role")
SELECT p.id, code, 'default'
FROM "ScopePreset" p, UNNEST(p."defaultScopeItemIds") AS code
WHERE EXISTS (SELECT 1 FROM "ScopeItem" si WHERE si.id = code)
ON CONFLICT DO NOTHING;

INSERT INTO "ScopePresetItem" ("presetId", "scopeItemId", "role")
SELECT p.id, code, 'optional'
FROM "ScopePreset" p, UNNEST(p."optionalScopeItemIds") AS code
WHERE EXISTS (SELECT 1 FROM "ScopeItem" si WHERE si.id = code)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------
-- 6. Backfill GapProneAreaItem (currently 0 refs across 3 areas; future-proof)
-- ----------------------------------------------------------------------
INSERT INTO "GapProneAreaItem" ("areaId", "scopeItemId")
SELECT g.id, code
FROM "GapProneArea" g, UNNEST(g."scopeItemIds") AS code
WHERE EXISTS (SELECT 1 FROM "ScopeItem" si WHERE si.id = code)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------
-- 7. Backfill ProcessChainItem with orphan filter + NOTICE on dropped refs
-- ----------------------------------------------------------------------
DO $$
DECLARE
  total_refs INT := 0;
  orphan_refs INT := 0;
  orphan_record RECORD;
BEGIN
  -- Count totals
  SELECT COALESCE(SUM(array_length("scopeItemIdsOrdered", 1)), 0) INTO total_refs FROM "ProcessChain" WHERE "scopeItemIdsOrdered" IS NOT NULL AND array_length("scopeItemIdsOrdered", 1) > 0;

  -- Count and log orphans
  FOR orphan_record IN
    SELECT pc.name AS chain_name, code
    FROM "ProcessChain" pc, UNNEST(pc."scopeItemIdsOrdered") WITH ORDINALITY AS u(code, ord)
    WHERE NOT EXISTS (SELECT 1 FROM "ScopeItem" si WHERE si.id = u.code)
  LOOP
    orphan_refs := orphan_refs + 1;
    RAISE NOTICE 'Dropping orphan ProcessChain ref: chain=% code=%', orphan_record.chain_name, orphan_record.code;
  END LOOP;

  RAISE NOTICE 'ProcessChain backfill: % total refs, % orphans dropped, % migrated', total_refs, orphan_refs, total_refs - orphan_refs;
END $$;

INSERT INTO "ProcessChainItem" ("chainId", "scopeItemId", "sortOrder")
SELECT pc.id, u.code, u.ord::INT
FROM "ProcessChain" pc,
     UNNEST(pc."scopeItemIdsOrdered") WITH ORDINALITY AS u(code, ord)
WHERE EXISTS (SELECT 1 FROM "ScopeItem" si WHERE si.id = u.code)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------
-- 8. Add FK constraints on join tables (after backfill so they don't fail mid-insert)
-- ----------------------------------------------------------------------
ALTER TABLE "ScopePresetItem"
  ADD CONSTRAINT "ScopePresetItem_presetId_fkey"
  FOREIGN KEY ("presetId") REFERENCES "ScopePreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScopePresetItem"
  ADD CONSTRAINT "ScopePresetItem_scopeItemId_fkey"
  FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GapProneAreaItem"
  ADD CONSTRAINT "GapProneAreaItem_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "GapProneArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GapProneAreaItem"
  ADD CONSTRAINT "GapProneAreaItem_scopeItemId_fkey"
  FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProcessChainItem"
  ADD CONSTRAINT "ProcessChainItem_chainId_fkey"
  FOREIGN KEY ("chainId") REFERENCES "ProcessChain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessChainItem"
  ADD CONSTRAINT "ProcessChainItem_scopeItemId_fkey"
  FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------
-- 9. Drop the legacy String[] columns
-- ----------------------------------------------------------------------
ALTER TABLE "ScopePreset"
  DROP COLUMN "defaultScopeItemIds",
  DROP COLUMN "optionalScopeItemIds";
ALTER TABLE "GapProneArea" DROP COLUMN "scopeItemIds";
ALTER TABLE "ProcessChain" DROP COLUMN "scopeItemIdsOrdered";

-- ----------------------------------------------------------------------
-- Post-migration invariants (Bursa baseline regression check)
-- ----------------------------------------------------------------------
DO $$
DECLARE
  bursa_req_count INT;
  bursa_verdict_count INT;
  bursa_citation_count INT;
  scope_count INT;
  scope_with_code INT;
  preset_item_count INT;
  chain_item_count INT;
BEGIN
  -- Fresh-provision guard (see pre-flight block): skip the fixture regression
  -- asserts on an empty DB; enforced verbatim when the baseline data is present.
  SELECT COUNT(*) INTO scope_count FROM "ScopeItem";
  IF scope_count = 0 THEN
    RAISE NOTICE 'Fresh/empty DB — skipping Phase 13.0 post-migration asserts';
    RETURN;
  END IF;

  -- Bursa invariants
  SELECT COUNT(*) INTO bursa_req_count
    FROM "ClientRequirement" WHERE "assessmentId" = 'cmofk3zql000163ubn43nkhqy';
  IF bursa_req_count <> 981 THEN
    RAISE EXCEPTION 'Post-migration: Bursa requirements count drifted (expected 981, got %)', bursa_req_count;
  END IF;

  SELECT COUNT(*) INTO bursa_verdict_count
    FROM "ClassificationVerdict" v
    JOIN "ClientRequirement" r ON r.id = v."requirementId"
    WHERE r."assessmentId" = 'cmofk3zql000163ubn43nkhqy' AND v."isCurrent" = true;
  IF bursa_verdict_count <> 981 THEN
    RAISE EXCEPTION 'Post-migration: Bursa current-verdict count drifted (expected 981, got %)', bursa_verdict_count;
  END IF;

  SELECT COUNT(*) INTO bursa_citation_count
    FROM "VerdictScopeItem" vs
    JOIN "ClassificationVerdict" v ON v.id = vs."verdictId"
    JOIN "ClientRequirement" r ON r.id = v."requirementId"
    WHERE r."assessmentId" = 'cmofk3zql000163ubn43nkhqy';
  IF bursa_citation_count <> 241 THEN
    RAISE EXCEPTION 'Post-migration: Bursa citation count drifted (expected 241, got %)', bursa_citation_count;
  END IF;

  -- ScopeItem invariants
  SELECT COUNT(*) INTO scope_count FROM "ScopeItem";
  IF scope_count <> 582 THEN
    RAISE EXCEPTION 'Post-migration: ScopeItem count drifted (expected 582, got %)', scope_count;
  END IF;

  SELECT COUNT(*) INTO scope_with_code FROM "ScopeItem" WHERE "scopeCode" = id;
  IF scope_with_code <> 582 THEN
    RAISE EXCEPTION 'Post-migration: scopeCode backfill incomplete (expected 582 with scopeCode=id, got %)', scope_with_code;
  END IF;

  -- Curation backfill invariants
  SELECT COUNT(*) INTO preset_item_count FROM "ScopePresetItem";
  IF preset_item_count <> 7 THEN
    RAISE EXCEPTION 'Post-migration: ScopePresetItem count wrong (expected 7, got %)', preset_item_count;
  END IF;

  SELECT COUNT(*) INTO chain_item_count FROM "ProcessChainItem";
  IF chain_item_count <> 24 THEN
    RAISE EXCEPTION 'Post-migration: ProcessChainItem count wrong (expected 24 = 38 total - 14 orphans, got %)', chain_item_count;
  END IF;

  RAISE NOTICE '✓ Post-migration invariants pass: Bursa 981 reqs / 981 current verdicts / 241 citations; ScopeItem 582 with scopeCode backfilled; ScopePresetItem 7; ProcessChainItem 24';
END $$;

COMMIT;
