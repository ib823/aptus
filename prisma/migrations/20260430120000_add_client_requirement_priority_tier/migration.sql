-- Phase 13.8 — add priorityTier to ClientRequirement for SKM 4-tier taxonomy.
-- Nullable; existing Bursa rows remain unaffected.
BEGIN;

DO $$
DECLARE
  bursa_count INT;
BEGIN
  SELECT COUNT(*) INTO bursa_count FROM "ClientRequirement"
    WHERE "assessmentId" = 'cmofk3zql000163ubn43nkhqy';
  IF bursa_count <> 981 THEN
    RAISE EXCEPTION 'Pre-flight: Bursa requirement count drifted (expected 981, got %)', bursa_count;
  END IF;
  RAISE NOTICE 'Pre-flight ok: Bursa 981 reqs';
END $$;

ALTER TABLE "ClientRequirement" ADD COLUMN "priorityTier" TEXT;

DO $$
DECLARE
  bursa_count INT;
  bursa_priority_count INT;
BEGIN
  SELECT COUNT(*) INTO bursa_count FROM "ClientRequirement"
    WHERE "assessmentId" = 'cmofk3zql000163ubn43nkhqy';
  IF bursa_count <> 981 THEN
    RAISE EXCEPTION 'Post-migration: Bursa requirement count drifted (expected 981, got %)', bursa_count;
  END IF;

  SELECT COUNT(*) INTO bursa_priority_count FROM "ClientRequirement"
    WHERE "assessmentId" = 'cmofk3zql000163ubn43nkhqy' AND "priorityTier" IS NOT NULL;
  IF bursa_priority_count <> 0 THEN
    RAISE EXCEPTION 'Post-migration: Bursa rows should have priorityTier=NULL (got % non-null)', bursa_priority_count;
  END IF;

  RAISE NOTICE '✓ priorityTier column added; Bursa 981 reqs unchanged + all NULL';
END $$;

COMMIT;
