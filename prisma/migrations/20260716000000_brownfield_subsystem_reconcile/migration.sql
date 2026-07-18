-- Brownfield subsystem reconciliation — closes migration-history drift.
--
-- WHY THIS EXISTS
-- The Brownfield subsystem (Phase 14) plus a handful of Phase 13.6 columns
-- reached deployed environments via `prisma db push`, so no migration ever
-- captured them. A fresh `prisma migrate deploy` therefore built a database
-- the app could not boot against (first failure: Assessment.brownfieldCatalogVersionId
-- does not exist). This migration adds exactly the objects that db-push created,
-- reconciling the migration history with schema.prisma.
--
-- SAFETY MODEL — additive and idempotent, ZERO destructive statements.
-- Every statement is existence-guarded so this migration is a no-op on any
-- database that already has these objects (i.e. every already-pushed prod and
-- preview DB) and creates them on a fresh, migration-built database:
--   * CREATE TABLE / INDEX / UNIQUE INDEX  -> IF NOT EXISTS
--   * ALTER TABLE ... ADD COLUMN           -> ADD COLUMN IF NOT EXISTS
--   * ALTER TABLE ... ADD CONSTRAINT (FK)  -> guarded by a pg_constraint lookup
--     inside a DO block (ADD CONSTRAINT has no IF NOT EXISTS form in Postgres).
-- Primary keys are created inside their CREATE TABLE IF NOT EXISTS bodies.
--
-- There is NO manual production adoption step: the next `migrate deploy`
-- applies this migration, every guard no-ops on the already-pushed schema, and
-- the row is recorded in _prisma_migrations. No downtime, no data change.
--
-- The statements below were generated mechanically by
-- `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel`
-- and then guarded by a deterministic transform; a CI grep enforces that this
-- file contains no DROP / destructive statement. Do not edit by hand.

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS     "brownfieldCatalogVersionId" TEXT;

-- AlterTable
ALTER TABLE "ClientRequirement" ADD COLUMN IF NOT EXISTS     "crossCuttingTag" TEXT;

-- AlterTable
ALTER TABLE "SapApiReference" ADD COLUMN IF NOT EXISTS     "apiType" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldCatalogVersion" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "applicationVersion" TEXT,
    "sourceSystemId" TEXT,
    "label" TEXT,
    "sourceArchiveHash" TEXT NOT NULL,
    "sourceArchivePath" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,

    CONSTRAINT "BrownfieldCatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SimplificationItem" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "sapGuid" TEXT NOT NULL,
    "sitemId" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "applicationArea" TEXT NOT NULL,
    "procStatus" TEXT NOT NULL,
    "procStatusTextEn" TEXT NOT NULL,
    "checkCondition" TEXT,
    "impactNote" TEXT,
    "businessAreaGuid" TEXT,
    "lobTechnologyGuid" TEXT,
    "startRelValidFromPrdVer" TEXT,
    "startRelValidFromStack" TEXT,
    "startRelValidToPrdVer" TEXT,
    "startRelValidToStack" TEXT,
    "referGuid" TEXT,
    "copyGuid" TEXT,
    "copyStatus" TEXT,
    "createdBySap" TEXT,
    "changedBySap" TEXT,
    "affectedScopeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedScopeCatalogVersionId" TEXT,

    CONSTRAINT "SimplificationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SimplificationItemCheck" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "simplificationItemId" TEXT,
    "sitemGuid" TEXT NOT NULL,
    "checkGuid" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "checkIdentifier" TEXT NOT NULL,
    "checkSubIdentifier" TEXT,
    "sapNote" TEXT,
    "checkCountOption" TEXT,
    "checkCount" INTEGER DEFAULT 0,
    "checkClassUsage" TEXT,
    "bfChkState" TEXT,
    "checkCondition" TEXT,

    CONSTRAINT "SimplificationItemCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RelatedSapNote" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "simplificationItemId" TEXT,
    "sitemGuid" TEXT,
    "noteGuid" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "noteTypeTextEn" TEXT,
    "sapNote" TEXT NOT NULL,

    CONSTRAINT "RelatedSapNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldLineOfBusiness" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "sapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "owningContextId" TEXT,
    "parentSapId" TEXT,
    "status" TEXT,
    "lifecycleStatus" TEXT,
    "rank" INTEGER DEFAULT 0,

    CONSTRAINT "BrownfieldLineOfBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldApplicationArea" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "areaKey" TEXT NOT NULL,
    "areaName" TEXT NOT NULL,

    CONSTRAINT "BrownfieldApplicationArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PreCheckNote" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT,
    "sapNoteId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parentNoteId" TEXT,
    "title" TEXT,
    "component" TEXT,
    "softwareComponent" TEXT,
    "releaseFrom" TEXT,
    "releaseTo" TEXT,
    "url" TEXT,

    CONSTRAINT "PreCheckNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BusinessFunctionDisposition" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "businessFunctionId" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "sourceReleaseTag" TEXT NOT NULL,

    CONSTRAINT "BusinessFunctionDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldAssessment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "greenfieldAssessmentId" TEXT,
    "catalogVersionId" TEXT NOT NULL,
    "sourceSystemId" TEXT,
    "sourceProduct" TEXT,
    "sourceDatabase" TEXT,
    "sourceDatabaseVersion" TEXT,
    "sourceProductType" TEXT,
    "sourceCountry" TEXT,
    "sapInstallationNumber" TEXT,
    "sapCustomerNumber" TEXT,
    "targetRelease" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrownfieldAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SystemBaselineSnapshot" (
    "id" TEXT NOT NULL,
    "brownfieldAssessmentId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceFilePath" TEXT NOT NULL,
    "sourceFileHash" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "facts" JSONB,
    "rawText" TEXT,

    CONSTRAINT "SystemBaselineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EwaFinding" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recommendation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EwaFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SimplificationItemNarrative" (
    "id" TEXT NOT NULL,
    "simplificationItemId" TEXT NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "sourcePageStart" INTEGER,
    "sectionRef" TEXT,
    "applicationComponent" TEXT,
    "relatedNotesJson" JSONB,
    "symptomMd" TEXT,
    "descriptionMd" TEXT,
    "solutionMd" TEXT,
    "businessProcessImpactMd" TEXT,
    "requiredActionMd" TEXT,
    "relevancyMd" TEXT,
    "transportBehaviorMd" TEXT,
    "additionalSectionsMd" TEXT,
    "rawTextMd" TEXT NOT NULL,
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimplificationItemNarrative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldClassificationProtocol" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "bucketDefinitions" JSONB NOT NULL,
    "groundingRules" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "ruleEngineConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deprecatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrownfieldClassificationProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldClassificationPass" (
    "id" TEXT NOT NULL,
    "brownfieldAssessmentId" TEXT NOT NULL,
    "protocolVersionId" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "actor" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "summaryJson" JSONB,
    "parentPassId" TEXT,

    CONSTRAINT "BrownfieldClassificationPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldVerdict" (
    "id" TEXT NOT NULL,
    "brownfieldAssessmentId" TEXT NOT NULL,
    "simplificationItemId" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "protocolVersionId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "confidence" TEXT,
    "rationaleMd" TEXT NOT NULL,
    "relevantInputsJson" JSONB,
    "actor" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "frozenAt" TIMESTAMP(3),

    CONSTRAINT "BrownfieldVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldGuide" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT,
    "title" TEXT NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA,
    "blobUrl" TEXT,
    "industryTag" TEXT,
    "conversionPath" TEXT,
    "assetType" TEXT,
    "sourceProgram" TEXT,
    "sapPublishedDate" TIMESTAMP(3),
    "notes" TEXT,
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrownfieldGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrownfieldGuideSection" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "parentSectionId" TEXT,
    "sectionRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pageStart" INTEGER NOT NULL,
    "pageEnd" INTEGER,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BrownfieldGuideSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConversionMethodologyPhase" (
    "id" TEXT NOT NULL,
    "catalogVersionId" TEXT,
    "sourceMethodology" TEXT NOT NULL,
    "phaseName" TEXT NOT NULL,
    "phaseSequence" INTEGER NOT NULL,
    "phaseDescription" TEXT,
    "sourceUrl" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionMethodologyPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConversionMethodologyDeliverable" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "deliverableName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "responsibleRole" TEXT,
    "linkedSimplificationGuids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ConversionMethodologyDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerProcess" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "parentSection" TEXT,
    "pageRefs" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "asIsDescription" TEXT,
    "sourceSystems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customApps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "integrations" JSONB,
    "painPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractedFromGuideId" TEXT,
    "extractionConfidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerProcessRequirementLink" (
    "id" TEXT NOT NULL,
    "customerProcessId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProcessRequirementLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerProcessSapEvidenceLink" (
    "id" TEXT NOT NULL,
    "customerProcessId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "rationaleMd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProcessSapEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "App2bPageClassification" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "pageTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detectedProcessNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkedProcessIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pageTitle" TEXT,
    "textExcerpt" TEXT,
    "classificationConfidence" TEXT NOT NULL DEFAULT 'high',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "App2bPageClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerProcessOption" (
    "id" TEXT NOT NULL,
    "customerProcessId" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "optionNumber" INTEGER,
    "optionType" TEXT,
    "variantLabel" TEXT,
    "adoptionComplexity" TEXT,
    "priorityToImplement" TEXT,
    "implementationEffort" TEXT,
    "organizationChanges" TEXT,
    "scoringComments" JSONB,
    "proposedSolutionBullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyBenefitsBullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcePage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProcessOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerProcessReference" (
    "id" TEXT NOT NULL,
    "customerProcessId" TEXT,
    "guideId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProcessReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrownfieldCatalogVersion_sourceArchiveHash_key" ON "BrownfieldCatalogVersion"("sourceArchiveHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldCatalogVersion_isActive_idx" ON "BrownfieldCatalogVersion"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldCatalogVersion_snapshotDate_idx" ON "BrownfieldCatalogVersion"("snapshotDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItem_catalogVersionId_idx" ON "SimplificationItem"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItem_applicationArea_idx" ON "SimplificationItem"("applicationArea");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItem_procStatus_idx" ON "SimplificationItem"("procStatus");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SimplificationItem_sapGuid_catalogVersionId_key" ON "SimplificationItem"("sapGuid", "catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItemCheck_catalogVersionId_idx" ON "SimplificationItemCheck"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItemCheck_sitemGuid_idx" ON "SimplificationItemCheck"("sitemGuid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItemCheck_sapNote_idx" ON "SimplificationItemCheck"("sapNote");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItemCheck_simplificationItemId_idx" ON "SimplificationItemCheck"("simplificationItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RelatedSapNote_catalogVersionId_idx" ON "RelatedSapNote"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RelatedSapNote_sapNote_idx" ON "RelatedSapNote"("sapNote");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RelatedSapNote_simplificationItemId_idx" ON "RelatedSapNote"("simplificationItemId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RelatedSapNote_noteGuid_catalogVersionId_key" ON "RelatedSapNote"("noteGuid", "catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldLineOfBusiness_catalogVersionId_idx" ON "BrownfieldLineOfBusiness"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldLineOfBusiness_type_idx" ON "BrownfieldLineOfBusiness"("type");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrownfieldLineOfBusiness_sapId_catalogVersionId_key" ON "BrownfieldLineOfBusiness"("sapId", "catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldApplicationArea_catalogVersionId_idx" ON "BrownfieldApplicationArea"("catalogVersionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrownfieldApplicationArea_areaKey_catalogVersionId_key" ON "BrownfieldApplicationArea"("areaKey", "catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PreCheckNote_catalogVersionId_idx" ON "PreCheckNote"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PreCheckNote_sapNoteId_idx" ON "PreCheckNote"("sapNoteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PreCheckNote_role_idx" ON "PreCheckNote"("role");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PreCheckNote_sapNoteId_role_softwareComponent_releaseFrom_r_key" ON "PreCheckNote"("sapNoteId", "role", "softwareComponent", "releaseFrom", "releaseTo", "catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessFunctionDisposition_catalogVersionId_idx" ON "BusinessFunctionDisposition"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessFunctionDisposition_disposition_idx" ON "BusinessFunctionDisposition"("disposition");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessFunctionDisposition_businessFunctionId_sourceReleas_key" ON "BusinessFunctionDisposition"("businessFunctionId", "sourceReleaseTag", "catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldAssessment_catalogVersionId_idx" ON "BrownfieldAssessment"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldAssessment_status_idx" ON "BrownfieldAssessment"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SystemBaselineSnapshot_brownfieldAssessmentId_idx" ON "SystemBaselineSnapshot"("brownfieldAssessmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SystemBaselineSnapshot_sourceType_idx" ON "SystemBaselineSnapshot"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SystemBaselineSnapshot_sourceFileHash_brownfieldAssessmentI_key" ON "SystemBaselineSnapshot"("sourceFileHash", "brownfieldAssessmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EwaFinding_snapshotId_idx" ON "EwaFinding"("snapshotId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EwaFinding_category_idx" ON "EwaFinding"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EwaFinding_severity_idx" ON "EwaFinding"("severity");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SimplificationItemNarrative_simplificationItemId_key" ON "SimplificationItemNarrative"("simplificationItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SimplificationItemNarrative_sourceDocument_idx" ON "SimplificationItemNarrative"("sourceDocument");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldClassificationProtocol_catalogVersionId_idx" ON "BrownfieldClassificationProtocol"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldClassificationProtocol_isActive_idx" ON "BrownfieldClassificationProtocol"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrownfieldClassificationProtocol_name_version_key" ON "BrownfieldClassificationProtocol"("name", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldClassificationPass_brownfieldAssessmentId_idx" ON "BrownfieldClassificationPass"("brownfieldAssessmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldClassificationPass_brownfieldAssessmentId_started_idx" ON "BrownfieldClassificationPass"("brownfieldAssessmentId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldClassificationPass_parentPassId_idx" ON "BrownfieldClassificationPass"("parentPassId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldClassificationPass_protocolVersionId_idx" ON "BrownfieldClassificationPass"("protocolVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldVerdict_brownfieldAssessmentId_isCurrent_idx" ON "BrownfieldVerdict"("brownfieldAssessmentId", "isCurrent");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldVerdict_brownfieldAssessmentId_bucket_idx" ON "BrownfieldVerdict"("brownfieldAssessmentId", "bucket");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldVerdict_passId_idx" ON "BrownfieldVerdict"("passId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldVerdict_simplificationItemId_idx" ON "BrownfieldVerdict"("simplificationItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldVerdict_source_idx" ON "BrownfieldVerdict"("source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldVerdict_protocolVersionId_idx" ON "BrownfieldVerdict"("protocolVersionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrownfieldGuide_sha256_key" ON "BrownfieldGuide"("sha256");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuide_catalogVersionId_idx" ON "BrownfieldGuide"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuide_industryTag_idx" ON "BrownfieldGuide"("industryTag");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuide_conversionPath_idx" ON "BrownfieldGuide"("conversionPath");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuide_mimeType_idx" ON "BrownfieldGuide"("mimeType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuide_assetType_idx" ON "BrownfieldGuide"("assetType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuide_sourceProgram_idx" ON "BrownfieldGuide"("sourceProgram");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuideSection_guideId_idx" ON "BrownfieldGuideSection"("guideId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuideSection_parentSectionId_idx" ON "BrownfieldGuideSection"("parentSectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrownfieldGuideSection_depth_idx" ON "BrownfieldGuideSection"("depth");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConversionMethodologyPhase_catalogVersionId_idx" ON "ConversionMethodologyPhase"("catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConversionMethodologyPhase_sourceMethodology_idx" ON "ConversionMethodologyPhase"("sourceMethodology");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ConversionMethodologyPhase_sourceMethodology_phaseName_cata_key" ON "ConversionMethodologyPhase"("sourceMethodology", "phaseName", "catalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConversionMethodologyDeliverable_phaseId_idx" ON "ConversionMethodologyDeliverable"("phaseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcess_assessmentId_idx" ON "CustomerProcess"("assessmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcess_parentSection_idx" ON "CustomerProcess"("parentSection");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcess_extractedFromGuideId_idx" ON "CustomerProcess"("extractedFromGuideId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessRequirementLink_customerProcessId_idx" ON "CustomerProcessRequirementLink"("customerProcessId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessRequirementLink_requirementId_idx" ON "CustomerProcessRequirementLink"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProcessRequirementLink_customerProcessId_requiremen_key" ON "CustomerProcessRequirementLink"("customerProcessId", "requirementId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessSapEvidenceLink_customerProcessId_idx" ON "CustomerProcessSapEvidenceLink"("customerProcessId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessSapEvidenceLink_evidenceType_evidenceId_idx" ON "CustomerProcessSapEvidenceLink"("evidenceType", "evidenceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "App2bPageClassification_guideId_idx" ON "App2bPageClassification"("guideId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "App2bPageClassification_pageNumber_idx" ON "App2bPageClassification"("pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "App2bPageClassification_guideId_pageNumber_key" ON "App2bPageClassification"("guideId", "pageNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessOption_customerProcessId_idx" ON "CustomerProcessOption"("customerProcessId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessOption_optionType_idx" ON "CustomerProcessOption"("optionType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessReference_customerProcessId_idx" ON "CustomerProcessReference"("customerProcessId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessReference_referenceCode_idx" ON "CustomerProcessReference"("referenceCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProcessReference_referenceType_idx" ON "CustomerProcessReference"("referenceType");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProcessReference_guideId_pageNumber_referenceCode_r_key" ON "CustomerProcessReference"("guideId", "pageNumber", "referenceCode", "referenceType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assessment_brownfieldCatalogVersionId_idx" ON "Assessment"("brownfieldCatalogVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientRequirement_crossCuttingTag_idx" ON "ClientRequirement"("crossCuttingTag");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SapApiReference_apiType_idx" ON "SapApiReference"("apiType");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assessment_brownfieldCatalogVersionId_fkey') THEN
    ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_brownfieldCatalogVersionId_fkey" FOREIGN KEY ("brownfieldCatalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimplificationItem_catalogVersionId_fkey') THEN
    ALTER TABLE "SimplificationItem" ADD CONSTRAINT "SimplificationItem_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimplificationItemCheck_catalogVersionId_fkey') THEN
    ALTER TABLE "SimplificationItemCheck" ADD CONSTRAINT "SimplificationItemCheck_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimplificationItemCheck_simplificationItemId_fkey') THEN
    ALTER TABLE "SimplificationItemCheck" ADD CONSTRAINT "SimplificationItemCheck_simplificationItemId_fkey" FOREIGN KEY ("simplificationItemId") REFERENCES "SimplificationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelatedSapNote_catalogVersionId_fkey') THEN
    ALTER TABLE "RelatedSapNote" ADD CONSTRAINT "RelatedSapNote_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelatedSapNote_simplificationItemId_fkey') THEN
    ALTER TABLE "RelatedSapNote" ADD CONSTRAINT "RelatedSapNote_simplificationItemId_fkey" FOREIGN KEY ("simplificationItemId") REFERENCES "SimplificationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldLineOfBusiness_catalogVersionId_fkey') THEN
    ALTER TABLE "BrownfieldLineOfBusiness" ADD CONSTRAINT "BrownfieldLineOfBusiness_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldApplicationArea_catalogVersionId_fkey') THEN
    ALTER TABLE "BrownfieldApplicationArea" ADD CONSTRAINT "BrownfieldApplicationArea_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PreCheckNote_catalogVersionId_fkey') THEN
    ALTER TABLE "PreCheckNote" ADD CONSTRAINT "PreCheckNote_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessFunctionDisposition_catalogVersionId_fkey') THEN
    ALTER TABLE "BusinessFunctionDisposition" ADD CONSTRAINT "BusinessFunctionDisposition_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldAssessment_catalogVersionId_fkey') THEN
    ALTER TABLE "BrownfieldAssessment" ADD CONSTRAINT "BrownfieldAssessment_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SystemBaselineSnapshot_brownfieldAssessmentId_fkey') THEN
    ALTER TABLE "SystemBaselineSnapshot" ADD CONSTRAINT "SystemBaselineSnapshot_brownfieldAssessmentId_fkey" FOREIGN KEY ("brownfieldAssessmentId") REFERENCES "BrownfieldAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EwaFinding_snapshotId_fkey') THEN
    ALTER TABLE "EwaFinding" ADD CONSTRAINT "EwaFinding_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SystemBaselineSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimplificationItemNarrative_simplificationItemId_fkey') THEN
    ALTER TABLE "SimplificationItemNarrative" ADD CONSTRAINT "SimplificationItemNarrative_simplificationItemId_fkey" FOREIGN KEY ("simplificationItemId") REFERENCES "SimplificationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldClassificationProtocol_catalogVersionId_fkey') THEN
    ALTER TABLE "BrownfieldClassificationProtocol" ADD CONSTRAINT "BrownfieldClassificationProtocol_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldClassificationPass_brownfieldAssessmentId_fkey') THEN
    ALTER TABLE "BrownfieldClassificationPass" ADD CONSTRAINT "BrownfieldClassificationPass_brownfieldAssessmentId_fkey" FOREIGN KEY ("brownfieldAssessmentId") REFERENCES "BrownfieldAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldClassificationPass_protocolVersionId_fkey') THEN
    ALTER TABLE "BrownfieldClassificationPass" ADD CONSTRAINT "BrownfieldClassificationPass_protocolVersionId_fkey" FOREIGN KEY ("protocolVersionId") REFERENCES "BrownfieldClassificationProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldClassificationPass_parentPassId_fkey') THEN
    ALTER TABLE "BrownfieldClassificationPass" ADD CONSTRAINT "BrownfieldClassificationPass_parentPassId_fkey" FOREIGN KEY ("parentPassId") REFERENCES "BrownfieldClassificationPass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldVerdict_brownfieldAssessmentId_fkey') THEN
    ALTER TABLE "BrownfieldVerdict" ADD CONSTRAINT "BrownfieldVerdict_brownfieldAssessmentId_fkey" FOREIGN KEY ("brownfieldAssessmentId") REFERENCES "BrownfieldAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldVerdict_simplificationItemId_fkey') THEN
    ALTER TABLE "BrownfieldVerdict" ADD CONSTRAINT "BrownfieldVerdict_simplificationItemId_fkey" FOREIGN KEY ("simplificationItemId") REFERENCES "SimplificationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldVerdict_passId_fkey') THEN
    ALTER TABLE "BrownfieldVerdict" ADD CONSTRAINT "BrownfieldVerdict_passId_fkey" FOREIGN KEY ("passId") REFERENCES "BrownfieldClassificationPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldVerdict_protocolVersionId_fkey') THEN
    ALTER TABLE "BrownfieldVerdict" ADD CONSTRAINT "BrownfieldVerdict_protocolVersionId_fkey" FOREIGN KEY ("protocolVersionId") REFERENCES "BrownfieldClassificationProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldGuide_catalogVersionId_fkey') THEN
    ALTER TABLE "BrownfieldGuide" ADD CONSTRAINT "BrownfieldGuide_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldGuideSection_guideId_fkey') THEN
    ALTER TABLE "BrownfieldGuideSection" ADD CONSTRAINT "BrownfieldGuideSection_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "BrownfieldGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrownfieldGuideSection_parentSectionId_fkey') THEN
    ALTER TABLE "BrownfieldGuideSection" ADD CONSTRAINT "BrownfieldGuideSection_parentSectionId_fkey" FOREIGN KEY ("parentSectionId") REFERENCES "BrownfieldGuideSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConversionMethodologyPhase_catalogVersionId_fkey') THEN
    ALTER TABLE "ConversionMethodologyPhase" ADD CONSTRAINT "ConversionMethodologyPhase_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "BrownfieldCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConversionMethodologyDeliverable_phaseId_fkey') THEN
    ALTER TABLE "ConversionMethodologyDeliverable" ADD CONSTRAINT "ConversionMethodologyDeliverable_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ConversionMethodologyPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProcess_assessmentId_fkey') THEN
    ALTER TABLE "CustomerProcess" ADD CONSTRAINT "CustomerProcess_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProcessRequirementLink_customerProcessId_fkey') THEN
    ALTER TABLE "CustomerProcessRequirementLink" ADD CONSTRAINT "CustomerProcessRequirementLink_customerProcessId_fkey" FOREIGN KEY ("customerProcessId") REFERENCES "CustomerProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProcessRequirementLink_requirementId_fkey') THEN
    ALTER TABLE "CustomerProcessRequirementLink" ADD CONSTRAINT "CustomerProcessRequirementLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ClientRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProcessSapEvidenceLink_customerProcessId_fkey') THEN
    ALTER TABLE "CustomerProcessSapEvidenceLink" ADD CONSTRAINT "CustomerProcessSapEvidenceLink_customerProcessId_fkey" FOREIGN KEY ("customerProcessId") REFERENCES "CustomerProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProcessOption_customerProcessId_fkey') THEN
    ALTER TABLE "CustomerProcessOption" ADD CONSTRAINT "CustomerProcessOption_customerProcessId_fkey" FOREIGN KEY ("customerProcessId") REFERENCES "CustomerProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProcessReference_customerProcessId_fkey') THEN
    ALTER TABLE "CustomerProcessReference" ADD CONSTRAINT "CustomerProcessReference_customerProcessId_fkey" FOREIGN KEY ("customerProcessId") REFERENCES "CustomerProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

