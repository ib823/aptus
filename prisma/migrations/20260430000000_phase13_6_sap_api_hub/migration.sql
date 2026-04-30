-- =====================================================================
-- Phase 13.6 — SAP API Business Hub live-knowledge library
-- =====================================================================
-- Adds SapApiReference table to cache api.sap.com metadata. The table is
-- populated by scripts/ingest-sap-api-hub.ts (run on-demand or via cron).
-- The classifier reads it at classification time to ground verdicts in
-- actual SAP API availability evidence.
--
-- Edition mapping is via three Boolean columns (appliesToPublic/Private/OnPrem)
-- rather than a junction table because SAP publishes API availability at
-- edition granularity, not version granularity.
--
-- Single transaction. Pre-flight: table does NOT yet exist. Post-flight:
-- table exists, indexes present, no SapApiReference rows (intentional —
-- ingest is a separate explicit step).
-- =====================================================================

BEGIN;

-- ----------------------------------------------------------------------
-- Pre-flight invariant
-- ----------------------------------------------------------------------
DO $$
DECLARE
  table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'SapApiReference'
  ) INTO table_exists;
  IF table_exists THEN
    RAISE EXCEPTION 'Pre-flight failed: SapApiReference table already exists. This migration is supposed to be a fresh add.';
  END IF;
  RAISE NOTICE 'Pre-flight ok: SapApiReference does not exist yet';
END $$;

-- ----------------------------------------------------------------------
-- 1. Create SapApiReference table
-- ----------------------------------------------------------------------
CREATE TABLE "SapApiReference" (
  "id"                     TEXT NOT NULL,
  "apiId"                  TEXT NOT NULL,
  "apiName"                TEXT NOT NULL,
  "description"            TEXT NOT NULL,
  "status"                 TEXT NOT NULL,
  "category"               TEXT,
  "appliesToPublic"        BOOLEAN NOT NULL DEFAULT false,
  "appliesToPrivate"       BOOLEAN NOT NULL DEFAULT false,
  "appliesToOnPrem"        BOOLEAN NOT NULL DEFAULT false,
  "scopeItemCodes"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "communicationScenarios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "apiHubUrl"              TEXT NOT NULL,
  "rawMetadataJson"        JSONB,
  "etag"                   TEXT,
  "lastFetchedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SapApiReference_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------
CREATE UNIQUE INDEX "SapApiReference_apiId_key"        ON "SapApiReference"("apiId");
CREATE        INDEX "SapApiReference_status_idx"       ON "SapApiReference"("status");
CREATE        INDEX "SapApiReference_apiId_idx"        ON "SapApiReference"("apiId");
CREATE        INDEX "SapApiReference_appliesToPublic_idx"  ON "SapApiReference"("appliesToPublic");
CREATE        INDEX "SapApiReference_appliesToPrivate_idx" ON "SapApiReference"("appliesToPrivate");
CREATE        INDEX "SapApiReference_appliesToOnPrem_idx"  ON "SapApiReference"("appliesToOnPrem");

-- ----------------------------------------------------------------------
-- 3. GIN index on scopeItemCodes (PostgreSQL-specific, not in Prisma DSL).
-- Speeds `WHERE scopeItemCodes && ARRAY['J60', 'BJ8']` lookups used by the
-- classifier at every batch.
-- ----------------------------------------------------------------------
CREATE INDEX "SapApiReference_scopeItemCodes_gin_idx"
  ON "SapApiReference" USING GIN ("scopeItemCodes");

-- ----------------------------------------------------------------------
-- Post-migration invariants
-- ----------------------------------------------------------------------
DO $$
DECLARE
  table_exists BOOLEAN;
  index_count INT;
  api_count INT;
  bursa_req_count INT;
  bursa_verdict_count INT;
  bursa_citation_count INT;
  scope_item_count INT;
BEGIN
  -- Table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'SapApiReference'
  ) INTO table_exists;
  IF NOT table_exists THEN
    RAISE EXCEPTION 'Post-migration: SapApiReference table not created';
  END IF;

  -- All 7 indexes present (pkey + 6 secondary + 1 unique)
  SELECT COUNT(*) INTO index_count FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'SapApiReference';
  IF index_count <> 8 THEN
    RAISE EXCEPTION 'Post-migration: expected 8 indexes on SapApiReference, found %', index_count;
  END IF;

  -- No rows yet (ingest is a separate explicit step)
  SELECT COUNT(*) INTO api_count FROM "SapApiReference";
  IF api_count <> 0 THEN
    RAISE EXCEPTION 'Post-migration: SapApiReference should be empty (ingest not yet run), found % rows', api_count;
  END IF;

  -- Bursa baseline must be unchanged
  SELECT COUNT(*) INTO bursa_req_count
    FROM "ClientRequirement" WHERE "assessmentId" = 'cmofk3zql000163ubn43nkhqy';
  IF bursa_req_count <> 981 THEN
    RAISE EXCEPTION 'Bursa requirement count drifted (expected 981, got %)', bursa_req_count;
  END IF;
  SELECT COUNT(*) INTO bursa_verdict_count
    FROM "ClassificationVerdict" v
    JOIN "ClientRequirement" r ON r.id = v."requirementId"
    WHERE r."assessmentId" = 'cmofk3zql000163ubn43nkhqy' AND v."isCurrent" = true;
  IF bursa_verdict_count <> 981 THEN
    RAISE EXCEPTION 'Bursa current-verdict count drifted (expected 981, got %)', bursa_verdict_count;
  END IF;
  SELECT COUNT(*) INTO bursa_citation_count
    FROM "VerdictScopeItem" vs
    JOIN "ClassificationVerdict" v ON v.id = vs."verdictId"
    JOIN "ClientRequirement" r ON r.id = v."requirementId"
    WHERE r."assessmentId" = 'cmofk3zql000163ubn43nkhqy';
  IF bursa_citation_count <> 241 THEN
    RAISE EXCEPTION 'Bursa citation count drifted (expected 241, got %)', bursa_citation_count;
  END IF;

  -- ScopeItem total preserved (582 Public 2602 + 258 Private 2025-FPS1 = 840)
  SELECT COUNT(*) INTO scope_item_count FROM "ScopeItem";
  IF scope_item_count <> 840 THEN
    RAISE EXCEPTION 'ScopeItem total drifted (expected 840, got %)', scope_item_count;
  END IF;

  RAISE NOTICE '✓ Post-migration ok: SapApiReference table created with 8 indexes; Bursa 981/981/241; ScopeItem 840 (no drift)';
END $$;

COMMIT;
