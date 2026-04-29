-- WAVE-5: Phase 20 (Process Visualization) + Phase 21 (Workshop Management)
-- Alters FunctionalAreaOverview model + updates foreign key cascades

-- FunctionalAreaOverview: drop old columns, add new ones
ALTER TABLE "FunctionalAreaOverview" DROP COLUMN "crossAreaDeps";
ALTER TABLE "FunctionalAreaOverview" DROP COLUMN "generatedAt";
ALTER TABLE "FunctionalAreaOverview" ADD COLUMN "crossAreaDeps" JSONB;
ALTER TABLE "FunctionalAreaOverview" ADD COLUMN "scopeItems" JSONB;
ALTER TABLE "FunctionalAreaOverview" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- FunctionalAreaOverview: add foreign key to Assessment with cascade delete
ALTER TABLE "FunctionalAreaOverview" ADD CONSTRAINT "FunctionalAreaOverview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update existing foreign keys to CASCADE on delete (IntegrationPoint, DataMigrationObject, OcmImpact)
ALTER TABLE "IntegrationPoint" DROP CONSTRAINT IF EXISTS "IntegrationPoint_assessmentId_fkey";
ALTER TABLE "IntegrationPoint" ADD CONSTRAINT "IntegrationPoint_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataMigrationObject" DROP CONSTRAINT IF EXISTS "DataMigrationObject_assessmentId_fkey";
ALTER TABLE "DataMigrationObject" ADD CONSTRAINT "DataMigrationObject_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OcmImpact" DROP CONSTRAINT IF EXISTS "OcmImpact_assessmentId_fkey";
ALTER TABLE "OcmImpact" ADD CONSTRAINT "OcmImpact_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
