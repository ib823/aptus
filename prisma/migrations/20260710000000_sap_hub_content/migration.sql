-- =====================================================================
-- SAP Capability Catalogue — SapHubContent (all Business Accelerator Hub
-- content types for S/4HANA Cloud Public Edition).
-- =====================================================================
-- Additive and self-contained: creates only the new enum + table, guarded so
-- it is idempotent on a fresh DB AND on any environment already carrying the
-- table via `prisma db push`. Does NOT touch SapApiReference or any other
-- object, and does not depend on the pre-existing schema/migration drift.
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE "SapHubContentType" AS ENUM (
    'API', 'EVENT', 'CDS_VIEW', 'BADI', 'BO_INTERFACE', 'INTEGRATION',
    'BUILD', 'PROCESS_BLUEPRINT', 'LIVEPROCESS', 'SCENARIO', 'VPUC', 'ANALYTICS'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SapHubContent" (
  "id"                     TEXT NOT NULL,
  "contentType"            "SapHubContentType" NOT NULL,
  "externalId"             TEXT NOT NULL,
  "title"                  TEXT NOT NULL,
  "description"            TEXT NOT NULL,
  "packageId"              TEXT,
  "appliesToPublic"        BOOLEAN NOT NULL DEFAULT true,
  "appliesToPrivate"       BOOLEAN NOT NULL DEFAULT false,
  "appliesToOnPrem"        BOOLEAN NOT NULL DEFAULT false,
  "status"                 TEXT NOT NULL,
  "apiType"                TEXT,
  "communicationScenarios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "itemCount"              INTEGER,
  "hubUrl"                 TEXT NOT NULL,
  "rawMetadataJson"        JSONB,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SapHubContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SapHubContent_contentType_externalId_key"
  ON "SapHubContent" ("contentType", "externalId");
CREATE INDEX IF NOT EXISTS "SapHubContent_contentType_idx"    ON "SapHubContent" ("contentType");
CREATE INDEX IF NOT EXISTS "SapHubContent_appliesToPublic_idx" ON "SapHubContent" ("appliesToPublic");
CREATE INDEX IF NOT EXISTS "SapHubContent_status_idx"          ON "SapHubContent" ("status");
