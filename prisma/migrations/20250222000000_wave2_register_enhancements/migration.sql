-- Wave 2: Register enhancements (Phases 14-16)
-- Adds new columns to IntegrationPoint, DataMigrationObject, and OcmImpact

-- IntegrationPoint: add estimatedEffortDays, dataObjects, functionalArea, updatedBy
ALTER TABLE "IntegrationPoint" ADD COLUMN "estimatedEffortDays" DOUBLE PRECISION;
ALTER TABLE "IntegrationPoint" ADD COLUMN "dataObjects" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "IntegrationPoint" ADD COLUMN "functionalArea" TEXT;
ALTER TABLE "IntegrationPoint" ADD COLUMN "updatedBy" TEXT;

-- DataMigrationObject: add estimatedEffortDays, functionalArea, updatedBy
ALTER TABLE "DataMigrationObject" ADD COLUMN "estimatedEffortDays" DOUBLE PRECISION;
ALTER TABLE "DataMigrationObject" ADD COLUMN "functionalArea" TEXT;
ALTER TABLE "DataMigrationObject" ADD COLUMN "updatedBy" TEXT;

-- OcmImpact: add impactTitle, affectedUserCount, relatedGapId, updatedBy
ALTER TABLE "OcmImpact" ADD COLUMN "impactTitle" TEXT;
ALTER TABLE "OcmImpact" ADD COLUMN "affectedUserCount" INTEGER;
ALTER TABLE "OcmImpact" ADD COLUMN "relatedGapId" TEXT;
ALTER TABLE "OcmImpact" ADD COLUMN "updatedBy" TEXT;
