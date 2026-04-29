-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('HARD_SEQUENTIAL', 'PARENT_CHILD', 'GROUP', 'REQUIRES_DATA', 'ALTERNATIVE_PATH', 'SOFT_DEPENDENCY');

-- CreateEnum
CREATE TYPE "PropagationRule" AS ENUM ('IF_SOURCE_NA_THEN_TARGET_NA', 'IF_GROUP_NA_THEN_CHILDREN_NA', 'WARN_IF_ALL_SOURCES_NA', 'WARN_ONLY', 'NO_PROPAGATION');

-- CreateEnum
CREATE TYPE "FlowDirection" AS ENUM ('DOWNSTREAM', 'UPSTREAM', 'BIDIRECTIONAL');

-- CreateTable
CREATE TABLE "ScopeCatalogVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "edition" TEXT NOT NULL DEFAULT 'PUBLIC',
    "releaseDate" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceArchiveUrl" TEXT,
    "sourceArchiveHash" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,

    CONSTRAINT "ScopeCatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationProtocol" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "bucketDefinitions" JSONB NOT NULL,
    "groundingRules" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deprecatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassificationProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationPass" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "protocolVersionId" TEXT NOT NULL,
    "catalogVersionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "actor" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "summaryJson" JSONB,
    "parentPassId" TEXT,

    CONSTRAINT "ClassificationPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationVerdict" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "protocolVersionId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence" TEXT,
    "sapModule" TEXT,
    "remarksMd" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "frozenAt" TIMESTAMP(3),

    CONSTRAINT "ClassificationVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerdictScopeItem" (
    "verdictId" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "rationaleMd" TEXT,

    CONSTRAINT "VerdictScopeItem_pkey" PRIMARY KEY ("verdictId","scopeItemId")
);

-- CreateTable
CREATE TABLE "AssessmentShareLink" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "scopeJson" JSONB,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeItemCuration" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "summaryHtml" TEXT,
    "briefingMdSections" JSONB,
    "prereviewQuestions" JSONB,
    "modulesJson" JSONB,
    "masterDataJson" JSONB,
    "dependenciesJson" JSONB,
    "activityPatternsJson" JSONB,
    "implicationsJson" JSONB,
    "curatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "curatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeItemCuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessChain" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scopeItemIdsOrdered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopePreset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultScopeItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionalScopeItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modulesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopePreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapProneArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchPattern" TEXT NOT NULL,
    "rationaleMd" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "scopeItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GapProneArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSubmission" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceArchive" TEXT,
    "notes" TEXT,
    "importedBy" TEXT,

    CONSTRAINT "VendorSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorResponse" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "remarksMd" TEXT,
    "vendorMetaJson" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameClean" TEXT NOT NULL,
    "purposeHtml" TEXT NOT NULL,
    "overviewHtml" TEXT NOT NULL,
    "prerequisitesHtml" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'EN',
    "version" TEXT NOT NULL DEFAULT '2602',
    "catalogVersionId" TEXT,
    "totalSteps" INTEGER NOT NULL,
    "functionalArea" TEXT NOT NULL,
    "subArea" TEXT NOT NULL,
    "tutorialUrl" TEXT,
    "docxStored" BOOLEAN NOT NULL DEFAULT false,
    "xlsxStored" BOOLEAN NOT NULL DEFAULT false,
    "setupPdfStored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolutionProcess" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "guid" TEXT,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolutionProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessFlow" (
    "id" TEXT NOT NULL,
    "solutionProcessId" TEXT NOT NULL,
    "guid" TEXT,
    "name" TEXT NOT NULL,
    "flowDiagramGuid" TEXT,
    "flowDiagramName" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "processFlowId" TEXT NOT NULL,
    "guid" TEXT,
    "title" TEXT NOT NULL,
    "targetName" TEXT,
    "targetUrl" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "testCaseGuid" TEXT,
    "testCaseName" TEXT,
    "scopeGuid" TEXT,
    "scopeName" TEXT,
    "solutionProcessGuid" TEXT,
    "solutionProcessName" TEXT,
    "solutionProcessFlowGuid" TEXT,
    "solutionProcessFlowName" TEXT,
    "flowDiagramGuid" TEXT,
    "flowDiagramName" TEXT,
    "testCasePriority" TEXT,
    "testCaseOwner" TEXT,
    "testCaseStatus" TEXT,
    "activityGuid" TEXT,
    "activityTitle" TEXT,
    "activityTargetName" TEXT,
    "activityTargetUrl" TEXT,
    "actionGuid" TEXT,
    "actionTitle" TEXT NOT NULL,
    "actionInstructionsHtml" TEXT NOT NULL,
    "actionExpectedResult" TEXT,
    "stepType" TEXT NOT NULL,
    "processFlowGroup" TEXT,
    "stepCategory" TEXT,
    "parsedContent" JSONB,
    "isClassifiable" BOOLEAN NOT NULL DEFAULT true,
    "groupKey" TEXT,
    "groupLabel" TEXT,
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigActivity" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "scopeItemDescription" TEXT,
    "applicationArea" TEXT NOT NULL,
    "applicationSubarea" TEXT NOT NULL,
    "configItemName" TEXT NOT NULL,
    "configItemId" TEXT NOT NULL,
    "activityDescription" TEXT NOT NULL,
    "selfService" BOOLEAN NOT NULL,
    "configApproach" TEXT,
    "category" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "localizationScope" TEXT,
    "countrySpecific" TEXT,
    "alternateActivityId" TEXT,
    "componentId" TEXT,
    "redoInProduction" TEXT,
    "deleteCustomerRecords" TEXT,
    "additionalInfo" TEXT,
    "fileUploadEnabled" TEXT,
    "rawScopeItemIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImgActivity" (
    "id" TEXT NOT NULL,
    "businessCatalogId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "transactionCode" TEXT,
    "iamAppId" TEXT,
    "imgActivity" TEXT,
    "explanatoryText" TEXT,
    "sscuiId" TEXT,
    "businessCatalogComponentId" TEXT,
    "imgActivityAch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImgActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupGuide" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "pdfBlob" BYTEA,
    "blobUrl" TEXT,
    "pageCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneralFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "blob" BYTEA,
    "blobUrl" TEXT,
    "relatedScopeIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolutionLink" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolutionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertConfig" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpertConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "blob" BYTEA,
    "blobUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtherFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadmeFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "blob" BYTEA,
    "blobUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadmeFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryProfile" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "applicableScopeItems" TEXT[],
    "typicalScopeCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EffortBaseline" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "implementationDays" DOUBLE PRECISION NOT NULL,
    "configDays" DOUBLE PRECISION NOT NULL,
    "testDays" DOUBLE PRECISION NOT NULL,
    "dataMigrationDays" DOUBLE PRECISION NOT NULL,
    "trainingDays" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "source" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EffortBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensibilityPattern" (
    "id" TEXT NOT NULL,
    "gapPattern" TEXT NOT NULL,
    "resolutionType" TEXT NOT NULL,
    "resolutionDescription" TEXT NOT NULL,
    "effortDays" DOUBLE PRECISION NOT NULL,
    "recurringCostAnnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL,
    "sapSupported" BOOLEAN NOT NULL,
    "upgradeSafe" BOOLEAN NOT NULL,
    "examples" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensibilityPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdaptationPattern" (
    "id" TEXT NOT NULL,
    "commonGap" TEXT NOT NULL,
    "sapApproach" TEXT NOT NULL,
    "adaptEffort" TEXT NOT NULL,
    "extendEffort" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdaptationPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "operatingCountries" TEXT[],
    "companySize" TEXT NOT NULL,
    "revenueBand" TEXT,
    "currentErp" TEXT,
    "sapVersion" TEXT NOT NULL DEFAULT '2602',
    "catalogVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeCount" INTEGER,
    "annualRevenue" DOUBLE PRECISION,
    "currencyCode" TEXT DEFAULT 'USD',
    "targetGoLiveDate" TIMESTAMP(3),
    "deploymentModel" TEXT,
    "sapModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyProcesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languageRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regulatoryFrameworks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "itLandscapeSummary" TEXT,
    "currentErpVersion" TEXT,
    "migrationApproach" TEXT,
    "operationalSites" INTEGER,
    "profileCompletedAt" TIMESTAMP(3),
    "profileCompletedBy" TEXT,
    "granularityCoarse" INTEGER NOT NULL DEFAULT 0,
    "granularityMedium" INTEGER NOT NULL DEFAULT 0,
    "granularityFine" INTEGER NOT NULL DEFAULT 0,
    "clientAccent" TEXT,
    "parentAssessmentId" TEXT,
    "phaseNumber" INTEGER NOT NULL DEFAULT 1,
    "currentSnapshotId" TEXT,
    "clonedFromSnapshotId" TEXT,
    "carryForwardConfig" JSONB,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentStakeholder" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedAreas" TEXT[],
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedBy" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentStakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeSelection" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL,
    "relevance" TEXT NOT NULL,
    "currentState" TEXT,
    "notes" TEXT,
    "respondent" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "priority" TEXT,
    "businessJustification" TEXT,
    "estimatedComplexity" TEXT,
    "dependsOnScopeItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "granularity" TEXT NOT NULL DEFAULT 'coarse',
    "assessmentVerdict" TEXT,
    "upgradeSuggestedReason" TEXT,
    "upgradedAt" TIMESTAMP(3),
    "upgradedBy" TEXT,

    CONSTRAINT "ScopeSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigSelection" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "configActivityId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL,
    "excludeReason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepResponse" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "fitStatus" TEXT NOT NULL,
    "clientNote" TEXT,
    "currentProcess" TEXT,
    "respondent" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confidence" TEXT,
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isPropagated" BOOLEAN NOT NULL DEFAULT false,
    "propagatedFrom" TEXT,

    CONSTRAINT "StepResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepResponseHistory" (
    "id" TEXT NOT NULL,
    "stepResponseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "previousNote" TEXT,
    "newNote" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepResponseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapResolution" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "gapDescription" TEXT NOT NULL,
    "resolutionType" TEXT NOT NULL,
    "resolutionDescription" TEXT NOT NULL,
    "effortDays" DOUBLE PRECISION,
    "costEstimate" JSONB,
    "riskLevel" TEXT,
    "upgradeImpact" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "clientApproved" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "priority" TEXT,
    "oneTimeCost" DOUBLE PRECISION,
    "recurringCost" DOUBLE PRECISION,
    "costCurrency" TEXT DEFAULT 'USD',
    "implementationDays" DOUBLE PRECISION,
    "riskCategory" TEXT,
    "upgradeStrategy" TEXT,
    "clientApprovalNote" TEXT,
    "clientApprovedBy" TEXT,
    "clientApprovedAt" TIMESTAMP(3),
    "extensibilityPatternId" TEXT,
    "adaptationPatternId" TEXT,

    CONSTRAINT "GapResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapAlternative" (
    "id" TEXT NOT NULL,
    "gapResolutionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "resolutionType" TEXT NOT NULL,
    "resolutionDescription" TEXT NOT NULL,
    "oneTimeCost" DOUBLE PRECISION,
    "recurringCost" DOUBLE PRECISION,
    "costCurrency" TEXT DEFAULT 'USD',
    "implementationDays" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "riskCategory" TEXT,
    "upgradeStrategy" TEXT,
    "rationale" TEXT,
    "pros" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GapAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionLogEntry" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "DecisionLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSignOff" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryEmail" TEXT NOT NULL,
    "signatoryRole" TEXT NOT NULL,
    "signatoryTitle" TEXT,
    "acknowledgement" BOOLEAN NOT NULL DEFAULT true,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AssessmentSignOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessFlowDiagram" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "processFlowName" TEXT NOT NULL,
    "svgContent" TEXT NOT NULL,
    "pdfBlob" BYTEA,
    "diagramType" TEXT NOT NULL DEFAULT 'sequential',
    "stepCount" INTEGER NOT NULL,
    "fitCount" INTEGER NOT NULL,
    "configureCount" INTEGER NOT NULL,
    "gapCount" INTEGER NOT NULL,
    "naCount" INTEGER NOT NULL,
    "pendingCount" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "interactiveData" JSONB,
    "thumbnailSvg" TEXT,
    "riskOverlayData" JSONB,
    "layoutVersion" INTEGER NOT NULL DEFAULT 1,
    "processFlowId" TEXT,

    CONSTRAINT "ProcessFlowDiagram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionalAreaOverview" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "functionalArea" TEXT NOT NULL,
    "totalScopeItems" INTEGER NOT NULL DEFAULT 0,
    "selectedCount" INTEGER NOT NULL DEFAULT 0,
    "fitCount" INTEGER NOT NULL DEFAULT 0,
    "configureCount" INTEGER NOT NULL DEFAULT 0,
    "gapCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crossAreaDeps" JSONB,
    "scopeItems" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunctionalAreaOverview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemainingItem" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "scopeItemId" TEXT,
    "functionalArea" TEXT,
    "assignedTo" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "autoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemainingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequirement" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "section" TEXT,
    "code" TEXT NOT NULL,
    "requirementText" TEXT NOT NULL,
    "requirementType" TEXT,
    "clientRemarks" TEXT,
    "solutionProviderResponse" TEXT,
    "solutionProviderRemarks" TEXT,
    "erpModuleSupporting" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "requirementClass" TEXT,
    "subCriteria" TEXT,
    "requiredDocs" TEXT,
    "complianceStatus" TEXT,
    "submissionFolder" TEXT,
    "sapModule" TEXT,
    "scopeItemIds" TEXT,
    "scopeItemNames" TEXT,
    "currentVerdictId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationPoint" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "scopeItemId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "interfaceType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "middleware" TEXT,
    "dataVolume" TEXT,
    "complexity" TEXT,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'identified',
    "estimatedEffortDays" DOUBLE PRECISION,
    "dataObjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "functionalArea" TEXT,
    "technicalNotes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataMigrationObject" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "scopeItemId" TEXT,
    "objectName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceFormat" TEXT,
    "volumeEstimate" TEXT,
    "recordCount" INTEGER,
    "cleansingRequired" BOOLEAN NOT NULL DEFAULT false,
    "cleansingNotes" TEXT,
    "mappingComplexity" TEXT,
    "migrationApproach" TEXT,
    "migrationTool" TEXT,
    "validationRules" TEXT,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'identified',
    "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedEffortDays" DOUBLE PRECISION,
    "functionalArea" TEXT,
    "technicalNotes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataMigrationObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcmImpact" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "scopeItemId" TEXT,
    "functionalArea" TEXT,
    "impactedRole" TEXT NOT NULL,
    "impactedDepartment" TEXT,
    "changeType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "trainingRequired" BOOLEAN NOT NULL DEFAULT false,
    "trainingType" TEXT,
    "trainingDuration" DOUBLE PRECISION,
    "communicationPlan" TEXT,
    "resistanceRisk" TEXT,
    "readinessScore" DOUBLE PRECISION,
    "mitigationStrategy" TEXT,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'identified',
    "impactTitle" TEXT,
    "affectedUserCount" INTEGER,
    "relatedGapId" TEXT,
    "technicalNotes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcmImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT NOT NULL,
    "organizationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "invitedBy" TEXT,
    "invitedAt" TIMESTAMP(3),
    "displayRole" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedBy" TEXT,
    "deactivationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "type" TEXT NOT NULL,
    "orgType" TEXT NOT NULL DEFAULT 'client',
    "domain" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ssoProvider" TEXT,
    "ssoDomain" TEXT,
    "scimEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scimEndpoint" TEXT,
    "mfaPolicy" TEXT NOT NULL DEFAULT 'optional',
    "maxConcurrentSessions" INTEGER NOT NULL DEFAULT 3,
    "viewerCanExport" BOOLEAN NOT NULL DEFAULT false,
    "dataRetentionDays" INTEGER,
    "ssoExclusive" BOOLEAN NOT NULL DEFAULT false,
    "ssoEntityId" TEXT,
    "brandPrimaryColor" TEXT,
    "brandLogoUrl" TEXT,
    "reportLogoUrl" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "billingEmail" TEXT,
    "ssoMetadataUrl" TEXT,
    "ssoClientId" TEXT,
    "ssoClientSecret" TEXT,
    "scimBearerToken" TEXT,
    "maxActiveAssessments" INTEGER NOT NULL DEFAULT 1,
    "maxPartnerUsers" INTEGER NOT NULL DEFAULT 5,
    "primaryColor" TEXT DEFAULT '#1e40af',
    "reportFooterText" TEXT,
    "industryFocus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactEmail" TEXT,
    "websiteUrl" TEXT,
    "hasDemoAssessment" BOOLEAN NOT NULL DEFAULT false,
    "demoAssessmentId" TEXT,
    "aiConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "mfaVerifiedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceFingerprint" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceType" TEXT,
    "deviceName" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "assessmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpSession" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "consultantUserId" TEXT,
    "assessmentId" TEXT,
    "currentPage" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'open',
    "rating" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "HelpSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentPhaseProgress" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "blockedReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentPhaseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopSession" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sessionCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "facilitatorId" TEXT NOT NULL,
    "facilitatorName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attendeeCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "qrCodeUrl" TEXT,
    "facilitatorNotes" TEXT,
    "agenda" JSONB,
    "currentStepId" TEXT,
    "currentScopeItemId" TEXT,
    "duration" INTEGER,
    "recordingUrl" TEXT,

    CONSTRAINT "WorkshopSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopAttendee" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'attendee',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "deviceType" TEXT,
    "isFollowing" BOOLEAN NOT NULL DEFAULT true,
    "isPresenter" BOOLEAN NOT NULL DEFAULT false,
    "connectionStatus" TEXT NOT NULL DEFAULT 'connected',
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopVote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence" TEXT,
    "notes" TEXT,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopActionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedTo" TEXT,
    "assignedToName" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "relatedStepId" TEXT,
    "relatedScopeItemId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopMinutes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attendeesSummary" JSONB NOT NULL,
    "decisionsSummary" JSONB NOT NULL,
    "actionItemsSummary" JSONB NOT NULL,
    "agendaSummary" JSONB NOT NULL,
    "statisticsSummary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regeneratedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "exportFormat" TEXT,

    CONSTRAINT "WorkshopMinutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusTransitionLog" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "triggeredByRole" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusTransitionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "status" TEXT NOT NULL DEFAULT 'unread',
    "deepLink" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "channelEmail" BOOLEAN NOT NULL DEFAULT true,
    "channelInApp" BOOLEAN NOT NULL DEFAULT true,
    "channelPush" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentCommentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "classifications" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedClassification" TEXT,
    "resolutionNotes" TEXT,
    "escalatedToId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityFeedEntry" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "areaCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityFeedEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTemplate" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "questionFlow" JSONB NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "currentQuestionId" TEXT,
    "responses" JSONB NOT NULL DEFAULT '[]',
    "derivedClassifications" JSONB,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "settings" JSONB,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardDeadline" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedRole" TEXT,
    "assignedUser" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "skippedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTooltip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tooltipKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTooltip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportGeneration" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "fileName" TEXT,
    "generatedBy" TEXT NOT NULL,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "snapshotId" TEXT,
    "protocolVersionId" TEXT,
    "catalogVersionId" TEXT,
    "contentHash" TEXT,

    CONSTRAINT "ReportGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportBranding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "secondaryColor" TEXT NOT NULL DEFAULT '#16213e',
    "footerText" TEXT,
    "companyName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReportBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "scopeItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companySize" TEXT,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geography" TEXT,
    "scopeSelections" JSONB,
    "commonGapPatterns" JSONB,
    "integrationPatterns" JSONB,
    "dmPatterns" JSONB,
    "workshopTemplate" JSONB,
    "roleTemplate" JSONB,
    "sourceAssessmentId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "stripeSent" BOOLEAN NOT NULL DEFAULT false,
    "stripeError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSnapshot" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "snapshotData" JSONB NOT NULL,
    "dataHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignOffProcess" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALIDATION_NOT_STARTED',
    "rejectedToStatus" TEXT,
    "rejectionReason" TEXT,
    "certificatePdfUrl" TEXT,
    "certificateHash" TEXT,
    "verificationToken" TEXT,
    "initiatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SignOffProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaValidation" (
    "id" TEXT NOT NULL,
    "signOffId" TEXT NOT NULL,
    "functionalArea" TEXT NOT NULL,
    "validatedById" TEXT NOT NULL,
    "validatorName" TEXT NOT NULL,
    "validatorEmail" TEXT NOT NULL,
    "validatorRole" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "rejectionReason" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalValidation" (
    "id" TEXT NOT NULL,
    "signOffId" TEXT NOT NULL,
    "itLeadId" TEXT,
    "itLeadName" TEXT,
    "itLeadEmail" TEXT,
    "itLeadStatus" TEXT,
    "itLeadComments" TEXT,
    "itLeadAt" TIMESTAMP(3),
    "dmLeadId" TEXT,
    "dmLeadName" TEXT,
    "dmLeadEmail" TEXT,
    "dmLeadStatus" TEXT,
    "dmLeadComments" TEXT,
    "dmLeadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicalValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossFunctionalValidation" (
    "id" TEXT NOT NULL,
    "signOffId" TEXT NOT NULL,
    "validatedById" TEXT NOT NULL,
    "validatorName" TEXT NOT NULL,
    "validatorEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "conflictsReviewed" BOOLEAN NOT NULL DEFAULT false,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "conflictsResolved" INTEGER NOT NULL DEFAULT 0,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrossFunctionalValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRecord" (
    "id" TEXT NOT NULL,
    "signOffId" TEXT NOT NULL,
    "signatureType" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerOrganization" TEXT NOT NULL,
    "signerTitle" TEXT,
    "authorityStatement" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL,
    "documentHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,

    CONSTRAINT "SignatureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlmExportRecord" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "exportedById" TEXT NOT NULL,
    "exportConfig" JSONB NOT NULL,
    "exportMapping" JSONB,
    "resultSummary" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlmExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPackage" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT 'FULL',
    "contents" TEXT[],
    "fileSize" INTEGER,
    "blobUrl" TEXT,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impactSummary" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "changes" JSONB,
    "unlockedEntities" JSONB NOT NULL,
    "previousSnapshotId" TEXT NOT NULL,
    "newSnapshotId" TEXT,
    "expeditedSignOff" BOOLEAN NOT NULL DEFAULT true,
    "signOffCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReassessmentTrigger" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceReference" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "changeRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReassessmentTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotComparison" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "baseSnapshotId" TEXT NOT NULL,
    "compareSnapshotId" TEXT NOT NULL,
    "deltaReport" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkSnapshot" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "companySize" TEXT,
    "sampleSize" INTEGER NOT NULL,
    "avgFitRate" DOUBLE PRECISION NOT NULL,
    "avgGapRate" DOUBLE PRECISION NOT NULL,
    "avgConfigRate" DOUBLE PRECISION NOT NULL,
    "avgNaRate" DOUBLE PRECISION NOT NULL,
    "medianFitRate" DOUBLE PRECISION,
    "p25FitRate" DOUBLE PRECISION,
    "p75FitRate" DOUBLE PRECISION,
    "commonGaps" JSONB NOT NULL,
    "commonIntegrations" JSONB NOT NULL,
    "avgAssessmentDays" DOUBLE PRECISION,
    "avgScopeItemCount" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricValue" JSONB NOT NULL,
    "period" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentPhaseLink" (
    "id" TEXT NOT NULL,
    "clientIdentifier" TEXT NOT NULL,
    "phase1AssessmentId" TEXT NOT NULL,
    "phase2AssessmentId" TEXT NOT NULL,
    "linkedById" TEXT NOT NULL,
    "scopeDelta" JSONB,
    "classificationDelta" JSONB,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentPhaseLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditingLock" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "lockedById" TEXT NOT NULL,
    "lockedByName" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EditingLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenceRecord" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "userImage" TEXT,
    "currentPage" TEXT,
    "entityId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSyncQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OfflineSyncQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceBaseline" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p75" DOUBLE PRECISION NOT NULL,
    "p95" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityDependency" (
    "id" TEXT NOT NULL,
    "scopeItemCode" TEXT NOT NULL,
    "sourceActivityId" TEXT NOT NULL,
    "targetActivityId" TEXT NOT NULL,
    "dependencyType" "DependencyType" NOT NULL,
    "propagationRule" "PropagationRule" NOT NULL,
    "businessReason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossScopeDependency" (
    "id" TEXT NOT NULL,
    "sourceScopeCode" TEXT NOT NULL,
    "sourceActivityId" TEXT NOT NULL,
    "targetScopeCode" TEXT NOT NULL,
    "targetActivityId" TEXT NOT NULL,
    "direction" "FlowDirection" NOT NULL,
    "businessReason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrossScopeDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyManifestRecord" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "withinCount" INTEGER NOT NULL,
    "crossCount" INTEGER NOT NULL,
    "resolvedCount" INTEGER NOT NULL,
    "unresolvedCount" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedBy" TEXT NOT NULL,

    CONSTRAINT "DependencyManifestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyPropagationLog" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "triggerStepId" TEXT NOT NULL,
    "affectedStepId" TEXT NOT NULL,
    "dependencyId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL DEFAULT 'NA',
    "propagationType" TEXT NOT NULL,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "undoneAt" TIMESTAMP(3),
    "undoneBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "DependencyPropagationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScopeCatalogVersion_isActive_idx" ON "ScopeCatalogVersion"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ScopeCatalogVersion_version_edition_key" ON "ScopeCatalogVersion"("version", "edition");

-- CreateIndex
CREATE INDEX "ClassificationProtocol_catalogVersionId_idx" ON "ClassificationProtocol"("catalogVersionId");

-- CreateIndex
CREATE INDEX "ClassificationProtocol_isActive_idx" ON "ClassificationProtocol"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificationProtocol_name_version_key" ON "ClassificationProtocol"("name", "version");

-- CreateIndex
CREATE INDEX "ClassificationPass_assessmentId_idx" ON "ClassificationPass"("assessmentId");

-- CreateIndex
CREATE INDEX "ClassificationPass_assessmentId_startedAt_idx" ON "ClassificationPass"("assessmentId", "startedAt");

-- CreateIndex
CREATE INDEX "ClassificationPass_parentPassId_idx" ON "ClassificationPass"("parentPassId");

-- CreateIndex
CREATE INDEX "ClassificationVerdict_requirementId_isCurrent_idx" ON "ClassificationVerdict"("requirementId", "isCurrent");

-- CreateIndex
CREATE INDEX "ClassificationVerdict_passId_idx" ON "ClassificationVerdict"("passId");

-- CreateIndex
CREATE INDEX "ClassificationVerdict_requirementId_createdAt_idx" ON "ClassificationVerdict"("requirementId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassificationVerdict_source_idx" ON "ClassificationVerdict"("source");

-- CreateIndex
CREATE INDEX "ClassificationVerdict_sapModule_idx" ON "ClassificationVerdict"("sapModule");

-- CreateIndex
CREATE INDEX "VerdictScopeItem_scopeItemId_idx" ON "VerdictScopeItem"("scopeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentShareLink_token_key" ON "AssessmentShareLink"("token");

-- CreateIndex
CREATE INDEX "AssessmentShareLink_assessmentId_idx" ON "AssessmentShareLink"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentShareLink_token_idx" ON "AssessmentShareLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ScopeItemCuration_scopeItemId_key" ON "ScopeItemCuration"("scopeItemId");

-- CreateIndex
CREATE INDEX "ScopeItemCuration_scopeItemId_idx" ON "ScopeItemCuration"("scopeItemId");

-- CreateIndex
CREATE INDEX "ProcessChain_area_idx" ON "ProcessChain"("area");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessChain_area_name_key" ON "ProcessChain"("area", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ScopePreset_key_key" ON "ScopePreset"("key");

-- CreateIndex
CREATE INDEX "GapProneArea_isActive_idx" ON "GapProneArea"("isActive");

-- CreateIndex
CREATE INDEX "VendorSubmission_assessmentId_idx" ON "VendorSubmission"("assessmentId");

-- CreateIndex
CREATE INDEX "VendorSubmission_assessmentId_submittedAt_idx" ON "VendorSubmission"("assessmentId", "submittedAt");

-- CreateIndex
CREATE INDEX "VendorResponse_requirementId_idx" ON "VendorResponse"("requirementId");

-- CreateIndex
CREATE INDEX "VendorResponse_submissionId_idx" ON "VendorResponse"("submissionId");

-- CreateIndex
CREATE INDEX "VendorResponse_submissionId_requirementId_idx" ON "VendorResponse"("submissionId", "requirementId");

-- CreateIndex
CREATE INDEX "ScopeItem_functionalArea_idx" ON "ScopeItem"("functionalArea");

-- CreateIndex
CREATE INDEX "ScopeItem_subArea_idx" ON "ScopeItem"("subArea");

-- CreateIndex
CREATE INDEX "ScopeItem_country_idx" ON "ScopeItem"("country");

-- CreateIndex
CREATE INDEX "ScopeItem_catalogVersionId_idx" ON "ScopeItem"("catalogVersionId");

-- CreateIndex
CREATE INDEX "SolutionProcess_scopeItemId_idx" ON "SolutionProcess"("scopeItemId");

-- CreateIndex
CREATE INDEX "SolutionProcess_guid_idx" ON "SolutionProcess"("guid");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionProcess_scopeItemId_name_key" ON "SolutionProcess"("scopeItemId", "name");

-- CreateIndex
CREATE INDEX "ProcessFlow_solutionProcessId_idx" ON "ProcessFlow"("solutionProcessId");

-- CreateIndex
CREATE INDEX "ProcessFlow_guid_idx" ON "ProcessFlow"("guid");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessFlow_solutionProcessId_name_key" ON "ProcessFlow"("solutionProcessId", "name");

-- CreateIndex
CREATE INDEX "Activity_processFlowId_idx" ON "Activity"("processFlowId");

-- CreateIndex
CREATE INDEX "Activity_guid_idx" ON "Activity"("guid");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_processFlowId_title_key" ON "Activity"("processFlowId", "title");

-- CreateIndex
CREATE INDEX "ProcessStep_scopeItemId_idx" ON "ProcessStep"("scopeItemId");

-- CreateIndex
CREATE INDEX "ProcessStep_scopeItemId_sequence_idx" ON "ProcessStep"("scopeItemId", "sequence");

-- CreateIndex
CREATE INDEX "ProcessStep_stepType_idx" ON "ProcessStep"("stepType");

-- CreateIndex
CREATE INDEX "ProcessStep_solutionProcessName_idx" ON "ProcessStep"("solutionProcessName");

-- CreateIndex
CREATE INDEX "ProcessStep_stepCategory_idx" ON "ProcessStep"("stepCategory");

-- CreateIndex
CREATE INDEX "ProcessStep_groupKey_idx" ON "ProcessStep"("groupKey");

-- CreateIndex
CREATE INDEX "ProcessStep_scopeItemId_stepCategory_idx" ON "ProcessStep"("scopeItemId", "stepCategory");

-- CreateIndex
CREATE INDEX "ProcessStep_activityId_idx" ON "ProcessStep"("activityId");

-- CreateIndex
CREATE INDEX "ProcessStep_activityId_sequence_idx" ON "ProcessStep"("activityId", "sequence");

-- CreateIndex
CREATE INDEX "ConfigActivity_scopeItemId_idx" ON "ConfigActivity"("scopeItemId");

-- CreateIndex
CREATE INDEX "ConfigActivity_applicationArea_idx" ON "ConfigActivity"("applicationArea");

-- CreateIndex
CREATE INDEX "ConfigActivity_category_idx" ON "ConfigActivity"("category");

-- CreateIndex
CREATE INDEX "ConfigActivity_selfService_idx" ON "ConfigActivity"("selfService");

-- CreateIndex
CREATE INDEX "ImgActivity_sscuiId_idx" ON "ImgActivity"("sscuiId");

-- CreateIndex
CREATE INDEX "ImgActivity_businessCatalogId_idx" ON "ImgActivity"("businessCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupGuide_scopeItemId_key" ON "SetupGuide"("scopeItemId");

-- CreateIndex
CREATE INDEX "GeneralFile_fileType_idx" ON "GeneralFile"("fileType");

-- CreateIndex
CREATE INDEX "SolutionLink_entityId_idx" ON "SolutionLink"("entityId");

-- CreateIndex
CREATE INDEX "SolutionLink_type_idx" ON "SolutionLink"("type");

-- CreateIndex
CREATE INDEX "ExpertConfig_scopeItemId_idx" ON "ExpertConfig"("scopeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryProfile_code_key" ON "IndustryProfile"("code");

-- CreateIndex
CREATE INDEX "EffortBaseline_scopeItemId_idx" ON "EffortBaseline"("scopeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "EffortBaseline_scopeItemId_complexity_key" ON "EffortBaseline"("scopeItemId", "complexity");

-- CreateIndex
CREATE INDEX "ExtensibilityPattern_resolutionType_idx" ON "ExtensibilityPattern"("resolutionType");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");

-- CreateIndex
CREATE INDEX "Assessment_createdBy_idx" ON "Assessment"("createdBy");

-- CreateIndex
CREATE INDEX "Assessment_organizationId_idx" ON "Assessment"("organizationId");

-- CreateIndex
CREATE INDEX "Assessment_organizationId_deletedAt_updatedAt_idx" ON "Assessment"("organizationId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Assessment_deletedAt_idx" ON "Assessment"("deletedAt");

-- CreateIndex
CREATE INDEX "Assessment_parentAssessmentId_idx" ON "Assessment"("parentAssessmentId");

-- CreateIndex
CREATE INDEX "Assessment_phaseNumber_idx" ON "Assessment"("phaseNumber");

-- CreateIndex
CREATE INDEX "AssessmentStakeholder_assessmentId_idx" ON "AssessmentStakeholder"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentStakeholder_userId_idx" ON "AssessmentStakeholder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStakeholder_assessmentId_email_key" ON "AssessmentStakeholder"("assessmentId", "email");

-- CreateIndex
CREATE INDEX "ScopeSelection_assessmentId_idx" ON "ScopeSelection"("assessmentId");

-- CreateIndex
CREATE INDEX "ScopeSelection_assessmentId_selected_idx" ON "ScopeSelection"("assessmentId", "selected");

-- CreateIndex
CREATE INDEX "ScopeSelection_assessmentId_granularity_idx" ON "ScopeSelection"("assessmentId", "granularity");

-- CreateIndex
CREATE UNIQUE INDEX "ScopeSelection_assessmentId_scopeItemId_key" ON "ScopeSelection"("assessmentId", "scopeItemId");

-- CreateIndex
CREATE INDEX "ConfigSelection_assessmentId_idx" ON "ConfigSelection"("assessmentId");

-- CreateIndex
CREATE INDEX "ConfigSelection_assessmentId_included_idx" ON "ConfigSelection"("assessmentId", "included");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigSelection_assessmentId_configActivityId_key" ON "ConfigSelection"("assessmentId", "configActivityId");

-- CreateIndex
CREATE INDEX "StepResponse_assessmentId_idx" ON "StepResponse"("assessmentId");

-- CreateIndex
CREATE INDEX "StepResponse_assessmentId_createdAt_idx" ON "StepResponse"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "StepResponse_assessmentId_fitStatus_idx" ON "StepResponse"("assessmentId", "fitStatus");

-- CreateIndex
CREATE INDEX "StepResponse_processStepId_idx" ON "StepResponse"("processStepId");

-- CreateIndex
CREATE UNIQUE INDEX "StepResponse_assessmentId_processStepId_key" ON "StepResponse"("assessmentId", "processStepId");

-- CreateIndex
CREATE INDEX "StepResponseHistory_stepResponseId_idx" ON "StepResponseHistory"("stepResponseId");

-- CreateIndex
CREATE INDEX "StepResponseHistory_actorId_idx" ON "StepResponseHistory"("actorId");

-- CreateIndex
CREATE INDEX "StepResponseHistory_createdAt_idx" ON "StepResponseHistory"("createdAt");

-- CreateIndex
CREATE INDEX "GapResolution_assessmentId_idx" ON "GapResolution"("assessmentId");

-- CreateIndex
CREATE INDEX "GapResolution_assessmentId_resolutionType_idx" ON "GapResolution"("assessmentId", "resolutionType");

-- CreateIndex
CREATE INDEX "GapResolution_scopeItemId_idx" ON "GapResolution"("scopeItemId");

-- CreateIndex
CREATE INDEX "GapResolution_assessmentId_priority_idx" ON "GapResolution"("assessmentId", "priority");

-- CreateIndex
CREATE INDEX "GapResolution_assessmentId_riskCategory_idx" ON "GapResolution"("assessmentId", "riskCategory");

-- CreateIndex
CREATE INDEX "GapAlternative_gapResolutionId_idx" ON "GapAlternative"("gapResolutionId");

-- CreateIndex
CREATE INDEX "DecisionLogEntry_assessmentId_idx" ON "DecisionLogEntry"("assessmentId");

-- CreateIndex
CREATE INDEX "DecisionLogEntry_assessmentId_entityType_idx" ON "DecisionLogEntry"("assessmentId", "entityType");

-- CreateIndex
CREATE INDEX "DecisionLogEntry_assessmentId_actor_idx" ON "DecisionLogEntry"("assessmentId", "actor");

-- CreateIndex
CREATE INDEX "DecisionLogEntry_timestamp_idx" ON "DecisionLogEntry"("timestamp");

-- CreateIndex
CREATE INDEX "AssessmentSignOff_assessmentId_idx" ON "AssessmentSignOff"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSignOff_assessmentId_signatoryRole_key" ON "AssessmentSignOff"("assessmentId", "signatoryRole");

-- CreateIndex
CREATE INDEX "ProcessFlowDiagram_assessmentId_idx" ON "ProcessFlowDiagram"("assessmentId");

-- CreateIndex
CREATE INDEX "ProcessFlowDiagram_assessmentId_scopeItemId_idx" ON "ProcessFlowDiagram"("assessmentId", "scopeItemId");

-- CreateIndex
CREATE INDEX "ProcessFlowDiagram_processFlowId_idx" ON "ProcessFlowDiagram"("processFlowId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessFlowDiagram_assessmentId_scopeItemId_processFlowName_key" ON "ProcessFlowDiagram"("assessmentId", "scopeItemId", "processFlowName");

-- CreateIndex
CREATE INDEX "FunctionalAreaOverview_assessmentId_idx" ON "FunctionalAreaOverview"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FunctionalAreaOverview_assessmentId_functionalArea_key" ON "FunctionalAreaOverview"("assessmentId", "functionalArea");

-- CreateIndex
CREATE INDEX "RemainingItem_assessmentId_idx" ON "RemainingItem"("assessmentId");

-- CreateIndex
CREATE INDEX "RemainingItem_assessmentId_createdAt_idx" ON "RemainingItem"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "RemainingItem_assessmentId_category_idx" ON "RemainingItem"("assessmentId", "category");

-- CreateIndex
CREATE INDEX "RemainingItem_assessmentId_severity_idx" ON "RemainingItem"("assessmentId", "severity");

-- CreateIndex
CREATE INDEX "RemainingItem_assessmentId_severity_createdAt_idx" ON "RemainingItem"("assessmentId", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "RemainingItem_assessmentId_resolvedAt_idx" ON "RemainingItem"("assessmentId", "resolvedAt");

-- CreateIndex
CREATE INDEX "RemainingItem_scopeItemId_idx" ON "RemainingItem"("scopeItemId");

-- CreateIndex
CREATE INDEX "ClientRequirement_assessmentId_idx" ON "ClientRequirement"("assessmentId");

-- CreateIndex
CREATE INDEX "ClientRequirement_assessmentId_module_idx" ON "ClientRequirement"("assessmentId", "module");

-- CreateIndex
CREATE INDEX "ClientRequirement_assessmentId_module_sortOrder_idx" ON "ClientRequirement"("assessmentId", "module", "sortOrder");

-- CreateIndex
CREATE INDEX "ClientRequirement_assessmentId_requirementClass_idx" ON "ClientRequirement"("assessmentId", "requirementClass");

-- CreateIndex
CREATE INDEX "ClientRequirement_currentVerdictId_idx" ON "ClientRequirement"("currentVerdictId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequirement_assessmentId_module_code_key" ON "ClientRequirement"("assessmentId", "module", "code");

-- CreateIndex
CREATE INDEX "IntegrationPoint_assessmentId_idx" ON "IntegrationPoint"("assessmentId");

-- CreateIndex
CREATE INDEX "IntegrationPoint_assessmentId_status_idx" ON "IntegrationPoint"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "IntegrationPoint_assessmentId_direction_idx" ON "IntegrationPoint"("assessmentId", "direction");

-- CreateIndex
CREATE INDEX "DataMigrationObject_assessmentId_idx" ON "DataMigrationObject"("assessmentId");

-- CreateIndex
CREATE INDEX "DataMigrationObject_assessmentId_status_idx" ON "DataMigrationObject"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "DataMigrationObject_assessmentId_objectType_idx" ON "DataMigrationObject"("assessmentId", "objectType");

-- CreateIndex
CREATE INDEX "OcmImpact_assessmentId_idx" ON "OcmImpact"("assessmentId");

-- CreateIndex
CREATE INDEX "OcmImpact_assessmentId_status_idx" ON "OcmImpact"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "OcmImpact_assessmentId_changeType_idx" ON "OcmImpact"("assessmentId", "changeType");

-- CreateIndex
CREATE INDEX "OcmImpact_assessmentId_severity_idx" ON "OcmImpact"("assessmentId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE INDEX "User_organizationId_isActive_idx" ON "User"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_plan_idx" ON "Organization"("plan");

-- CreateIndex
CREATE INDEX "Organization_subscriptionStatus_idx" ON "Organization"("subscriptionStatus");

-- CreateIndex
CREATE INDEX "Organization_stripeCustomerId_idx" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_isRevoked_idx" ON "Session"("userId", "isRevoked");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_token_key" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_idx" ON "MagicLinkToken"("email");

-- CreateIndex
CREATE INDEX "MagicLinkToken_token_idx" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "HelpSession_clientUserId_idx" ON "HelpSession"("clientUserId");

-- CreateIndex
CREATE INDEX "HelpSession_consultantUserId_idx" ON "HelpSession"("consultantUserId");

-- CreateIndex
CREATE INDEX "HelpSession_status_idx" ON "HelpSession"("status");

-- CreateIndex
CREATE INDEX "HelpSession_assessmentId_idx" ON "HelpSession"("assessmentId");

-- CreateIndex
CREATE INDEX "HelpMessage_sessionId_createdAt_idx" ON "HelpMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "HelpMessage_senderId_idx" ON "HelpMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_token_key" ON "OrgInvitation"("token");

-- CreateIndex
CREATE INDEX "OrgInvitation_organizationId_idx" ON "OrgInvitation"("organizationId");

-- CreateIndex
CREATE INDEX "OrgInvitation_token_idx" ON "OrgInvitation"("token");

-- CreateIndex
CREATE INDEX "OrgInvitation_email_idx" ON "OrgInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_organizationId_email_status_key" ON "OrgInvitation"("organizationId", "email", "status");

-- CreateIndex
CREATE INDEX "AssessmentPhaseProgress_assessmentId_idx" ON "AssessmentPhaseProgress"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPhaseProgress_assessmentId_phase_key" ON "AssessmentPhaseProgress"("assessmentId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopSession_sessionCode_key" ON "WorkshopSession"("sessionCode");

-- CreateIndex
CREATE INDEX "WorkshopSession_assessmentId_idx" ON "WorkshopSession"("assessmentId");

-- CreateIndex
CREATE INDEX "WorkshopSession_sessionCode_idx" ON "WorkshopSession"("sessionCode");

-- CreateIndex
CREATE INDEX "WorkshopSession_assessmentId_status_idx" ON "WorkshopSession"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "WorkshopAttendee_sessionId_idx" ON "WorkshopAttendee"("sessionId");

-- CreateIndex
CREATE INDEX "WorkshopAttendee_userId_idx" ON "WorkshopAttendee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopAttendee_sessionId_userId_key" ON "WorkshopAttendee"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "WorkshopVote_sessionId_idx" ON "WorkshopVote"("sessionId");

-- CreateIndex
CREATE INDEX "WorkshopVote_sessionId_processStepId_idx" ON "WorkshopVote"("sessionId", "processStepId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopVote_sessionId_processStepId_userId_key" ON "WorkshopVote"("sessionId", "processStepId", "userId");

-- CreateIndex
CREATE INDEX "WorkshopActionItem_sessionId_idx" ON "WorkshopActionItem"("sessionId");

-- CreateIndex
CREATE INDEX "WorkshopActionItem_sessionId_status_idx" ON "WorkshopActionItem"("sessionId", "status");

-- CreateIndex
CREATE INDEX "WorkshopActionItem_assignedTo_idx" ON "WorkshopActionItem"("assignedTo");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopMinutes_sessionId_key" ON "WorkshopMinutes"("sessionId");

-- CreateIndex
CREATE INDEX "StatusTransitionLog_assessmentId_idx" ON "StatusTransitionLog"("assessmentId");

-- CreateIndex
CREATE INDEX "StatusTransitionLog_assessmentId_createdAt_idx" ON "StatusTransitionLog"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_sentAt_idx" ON "Notification"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "Notification_assessmentId_idx" ON "Notification"("assessmentId");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_notificationType_key" ON "NotificationPreference"("userId", "notificationType");

-- CreateIndex
CREATE INDEX "Comment_assessmentId_targetType_targetId_idx" ON "Comment"("assessmentId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Comment_assessmentId_authorId_idx" ON "Comment"("assessmentId", "authorId");

-- CreateIndex
CREATE INDEX "Comment_assessmentId_status_idx" ON "Comment"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

-- CreateIndex
CREATE INDEX "Conflict_assessmentId_status_idx" ON "Conflict"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "Conflict_assessmentId_entityType_entityId_idx" ON "Conflict"("assessmentId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Conflict_assessmentId_status_createdAt_idx" ON "Conflict"("assessmentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Conflict_status_createdAt_idx" ON "Conflict"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityFeedEntry_assessmentId_createdAt_idx" ON "ActivityFeedEntry"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityFeedEntry_assessmentId_actorId_idx" ON "ActivityFeedEntry"("assessmentId", "actorId");

-- CreateIndex
CREATE INDEX "ActivityFeedEntry_assessmentId_actionType_idx" ON "ActivityFeedEntry"("assessmentId", "actionType");

-- CreateIndex
CREATE INDEX "ActivityFeedEntry_assessmentId_areaCode_createdAt_idx" ON "ActivityFeedEntry"("assessmentId", "areaCode", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationTemplate_scopeItemId_idx" ON "ConversationTemplate"("scopeItemId");

-- CreateIndex
CREATE INDEX "ConversationTemplate_isActive_idx" ON "ConversationTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTemplate_scopeItemId_processStepId_language_key" ON "ConversationTemplate"("scopeItemId", "processStepId", "language");

-- CreateIndex
CREATE INDEX "ConversationSession_assessmentId_userId_idx" ON "ConversationSession"("assessmentId", "userId");

-- CreateIndex
CREATE INDEX "ConversationSession_assessmentId_scopeItemId_idx" ON "ConversationSession"("assessmentId", "scopeItemId");

-- CreateIndex
CREATE INDEX "ConversationSession_status_idx" ON "ConversationSession"("status");

-- CreateIndex
CREATE INDEX "DashboardWidget_userId_idx" ON "DashboardWidget"("userId");

-- CreateIndex
CREATE INDEX "DashboardWidget_userId_isVisible_idx" ON "DashboardWidget"("userId", "isVisible");

-- CreateIndex
CREATE INDEX "DashboardDeadline_assessmentId_idx" ON "DashboardDeadline"("assessmentId");

-- CreateIndex
CREATE INDEX "DashboardDeadline_dueDate_idx" ON "DashboardDeadline"("dueDate");

-- CreateIndex
CREATE INDEX "DashboardDeadline_assessmentId_status_dueDate_idx" ON "DashboardDeadline"("assessmentId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "DashboardDeadline_assignedRole_idx" ON "DashboardDeadline"("assignedRole");

-- CreateIndex
CREATE INDEX "DashboardDeadline_status_idx" ON "DashboardDeadline"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingTooltip_userId_idx" ON "OnboardingTooltip"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingTooltip_userId_tooltipKey_key" ON "OnboardingTooltip"("userId", "tooltipKey");

-- CreateIndex
CREATE INDEX "ReportGeneration_assessmentId_idx" ON "ReportGeneration"("assessmentId");

-- CreateIndex
CREATE INDEX "ReportGeneration_assessmentId_reportType_idx" ON "ReportGeneration"("assessmentId", "reportType");

-- CreateIndex
CREATE INDEX "ReportGeneration_assessmentId_reportType_snapshotId_idx" ON "ReportGeneration"("assessmentId", "reportType", "snapshotId");

-- CreateIndex
CREATE INDEX "ReportGeneration_expiresAt_idx" ON "ReportGeneration"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportBranding_organizationId_key" ON "ReportBranding"("organizationId");

-- CreateIndex
CREATE INDEX "AssessmentTemplate_organizationId_idx" ON "AssessmentTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "AssessmentTemplate_isDemo_idx" ON "AssessmentTemplate"("isDemo");

-- CreateIndex
CREATE INDEX "AssessmentTemplate_organizationId_industry_idx" ON "AssessmentTemplate"("organizationId", "industry");

-- CreateIndex
CREATE INDEX "AssessmentTemplate_organizationId_isPublished_idx" ON "AssessmentTemplate"("organizationId", "isPublished");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_idx" ON "UsageEvent"("organizationId");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_eventType_idx" ON "UsageEvent"("organizationId", "eventType");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_stripeSent_idx" ON "UsageEvent"("stripeSent");

-- CreateIndex
CREATE INDEX "AssessmentSnapshot_assessmentId_idx" ON "AssessmentSnapshot"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSnapshot_assessmentId_version_key" ON "AssessmentSnapshot"("assessmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SignOffProcess_assessmentId_key" ON "SignOffProcess"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SignOffProcess_snapshotId_key" ON "SignOffProcess"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "SignOffProcess_verificationToken_key" ON "SignOffProcess"("verificationToken");

-- CreateIndex
CREATE INDEX "SignOffProcess_assessmentId_idx" ON "SignOffProcess"("assessmentId");

-- CreateIndex
CREATE INDEX "SignOffProcess_status_idx" ON "SignOffProcess"("status");

-- CreateIndex
CREATE INDEX "AreaValidation_signOffId_idx" ON "AreaValidation"("signOffId");

-- CreateIndex
CREATE UNIQUE INDEX "AreaValidation_signOffId_functionalArea_key" ON "AreaValidation"("signOffId", "functionalArea");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalValidation_signOffId_key" ON "TechnicalValidation"("signOffId");

-- CreateIndex
CREATE UNIQUE INDEX "CrossFunctionalValidation_signOffId_key" ON "CrossFunctionalValidation"("signOffId");

-- CreateIndex
CREATE INDEX "SignatureRecord_signOffId_idx" ON "SignatureRecord"("signOffId");

-- CreateIndex
CREATE INDEX "AlmExportRecord_assessmentId_idx" ON "AlmExportRecord"("assessmentId");

-- CreateIndex
CREATE INDEX "HandoffPackage_assessmentId_idx" ON "HandoffPackage"("assessmentId");

-- CreateIndex
CREATE INDEX "ChangeRequest_assessmentId_idx" ON "ChangeRequest"("assessmentId");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE INDEX "ReassessmentTrigger_assessmentId_idx" ON "ReassessmentTrigger"("assessmentId");

-- CreateIndex
CREATE INDEX "ReassessmentTrigger_triggerType_idx" ON "ReassessmentTrigger"("triggerType");

-- CreateIndex
CREATE INDEX "SnapshotComparison_assessmentId_idx" ON "SnapshotComparison"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SnapshotComparison_baseSnapshotId_compareSnapshotId_key" ON "SnapshotComparison"("baseSnapshotId", "compareSnapshotId");

-- CreateIndex
CREATE INDEX "BenchmarkSnapshot_industry_idx" ON "BenchmarkSnapshot"("industry");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkSnapshot_industry_companySize_key" ON "BenchmarkSnapshot"("industry", "companySize");

-- CreateIndex
CREATE INDEX "PortfolioMetric_organizationId_metricType_idx" ON "PortfolioMetric"("organizationId", "metricType");

-- CreateIndex
CREATE INDEX "PortfolioMetric_organizationId_period_idx" ON "PortfolioMetric"("organizationId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMetric_organizationId_metricType_period_key" ON "PortfolioMetric"("organizationId", "metricType", "period");

-- CreateIndex
CREATE INDEX "AssessmentPhaseLink_clientIdentifier_idx" ON "AssessmentPhaseLink"("clientIdentifier");

-- CreateIndex
CREATE INDEX "AssessmentPhaseLink_phase1AssessmentId_idx" ON "AssessmentPhaseLink"("phase1AssessmentId");

-- CreateIndex
CREATE INDEX "AssessmentPhaseLink_phase2AssessmentId_idx" ON "AssessmentPhaseLink"("phase2AssessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPhaseLink_phase1AssessmentId_phase2AssessmentId_key" ON "AssessmentPhaseLink"("phase1AssessmentId", "phase2AssessmentId");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId", "endpoint");

-- CreateIndex
CREATE INDEX "EditingLock_assessmentId_isActive_idx" ON "EditingLock"("assessmentId", "isActive");

-- CreateIndex
CREATE INDEX "EditingLock_expiresAt_idx" ON "EditingLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EditingLock_assessmentId_entityType_entityId_key" ON "EditingLock"("assessmentId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "PresenceRecord_assessmentId_lastSeenAt_idx" ON "PresenceRecord"("assessmentId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceRecord_assessmentId_userId_key" ON "PresenceRecord"("assessmentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSyncQueue_clientId_key" ON "OfflineSyncQueue"("clientId");

-- CreateIndex
CREATE INDEX "OfflineSyncQueue_userId_status_idx" ON "OfflineSyncQueue"("userId", "status");

-- CreateIndex
CREATE INDEX "OfflineSyncQueue_assessmentId_idx" ON "OfflineSyncQueue"("assessmentId");

-- CreateIndex
CREATE INDEX "OfflineSyncQueue_status_queuedAt_idx" ON "OfflineSyncQueue"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "PerformanceBaseline_route_metric_idx" ON "PerformanceBaseline"("route", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceBaseline_route_metric_period_key" ON "PerformanceBaseline"("route", "metric", "period");

-- CreateIndex
CREATE INDEX "ActivityDependency_scopeItemCode_idx" ON "ActivityDependency"("scopeItemCode");

-- CreateIndex
CREATE INDEX "ActivityDependency_sourceActivityId_idx" ON "ActivityDependency"("sourceActivityId");

-- CreateIndex
CREATE INDEX "ActivityDependency_targetActivityId_idx" ON "ActivityDependency"("targetActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityDependency_sourceActivityId_targetActivityId_key" ON "ActivityDependency"("sourceActivityId", "targetActivityId");

-- CreateIndex
CREATE INDEX "CrossScopeDependency_sourceScopeCode_idx" ON "CrossScopeDependency"("sourceScopeCode");

-- CreateIndex
CREATE INDEX "CrossScopeDependency_targetScopeCode_idx" ON "CrossScopeDependency"("targetScopeCode");

-- CreateIndex
CREATE UNIQUE INDEX "CrossScopeDependency_sourceActivityId_targetActivityId_key" ON "CrossScopeDependency"("sourceActivityId", "targetActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "DependencyManifestRecord_version_key" ON "DependencyManifestRecord"("version");

-- CreateIndex
CREATE INDEX "DependencyPropagationLog_assessmentId_idx" ON "DependencyPropagationLog"("assessmentId");

-- CreateIndex
CREATE INDEX "DependencyPropagationLog_triggerStepId_idx" ON "DependencyPropagationLog"("triggerStepId");

-- CreateIndex
CREATE INDEX "DependencyPropagationLog_affectedStepId_idx" ON "DependencyPropagationLog"("affectedStepId");

-- CreateIndex
CREATE INDEX "DependencyPropagationLog_dependencyId_idx" ON "DependencyPropagationLog"("dependencyId");

-- AddForeignKey
ALTER TABLE "ClassificationProtocol" ADD CONSTRAINT "ClassificationProtocol_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "ScopeCatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationPass" ADD CONSTRAINT "ClassificationPass_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationPass" ADD CONSTRAINT "ClassificationPass_protocolVersionId_fkey" FOREIGN KEY ("protocolVersionId") REFERENCES "ClassificationProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationPass" ADD CONSTRAINT "ClassificationPass_parentPassId_fkey" FOREIGN KEY ("parentPassId") REFERENCES "ClassificationPass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationVerdict" ADD CONSTRAINT "ClassificationVerdict_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ClientRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationVerdict" ADD CONSTRAINT "ClassificationVerdict_passId_fkey" FOREIGN KEY ("passId") REFERENCES "ClassificationPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationVerdict" ADD CONSTRAINT "ClassificationVerdict_protocolVersionId_fkey" FOREIGN KEY ("protocolVersionId") REFERENCES "ClassificationProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerdictScopeItem" ADD CONSTRAINT "VerdictScopeItem_verdictId_fkey" FOREIGN KEY ("verdictId") REFERENCES "ClassificationVerdict"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerdictScopeItem" ADD CONSTRAINT "VerdictScopeItem_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentShareLink" ADD CONSTRAINT "AssessmentShareLink_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItemCuration" ADD CONSTRAINT "ScopeItemCuration_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSubmission" ADD CONSTRAINT "VendorSubmission_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorResponse" ADD CONSTRAINT "VendorResponse_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ClientRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorResponse" ADD CONSTRAINT "VendorResponse_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "VendorSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "ScopeCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolutionProcess" ADD CONSTRAINT "SolutionProcess_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessFlow" ADD CONSTRAINT "ProcessFlow_solutionProcessId_fkey" FOREIGN KEY ("solutionProcessId") REFERENCES "SolutionProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_processFlowId_fkey" FOREIGN KEY ("processFlowId") REFERENCES "ProcessFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupGuide" ADD CONSTRAINT "SetupGuide_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "ScopeCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_parentAssessmentId_fkey" FOREIGN KEY ("parentAssessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStakeholder" ADD CONSTRAINT "AssessmentStakeholder_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStakeholder" ADD CONSTRAINT "AssessmentStakeholder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeSelection" ADD CONSTRAINT "ScopeSelection_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigSelection" ADD CONSTRAINT "ConfigSelection_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepResponse" ADD CONSTRAINT "StepResponse_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepResponse" ADD CONSTRAINT "StepResponse_processStepId_fkey" FOREIGN KEY ("processStepId") REFERENCES "ProcessStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepResponseHistory" ADD CONSTRAINT "StepResponseHistory_stepResponseId_fkey" FOREIGN KEY ("stepResponseId") REFERENCES "StepResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapResolution" ADD CONSTRAINT "GapResolution_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapAlternative" ADD CONSTRAINT "GapAlternative_gapResolutionId_fkey" FOREIGN KEY ("gapResolutionId") REFERENCES "GapResolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLogEntry" ADD CONSTRAINT "DecisionLogEntry_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSignOff" ADD CONSTRAINT "AssessmentSignOff_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessFlowDiagram" ADD CONSTRAINT "ProcessFlowDiagram_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessFlowDiagram" ADD CONSTRAINT "ProcessFlowDiagram_processFlowId_fkey" FOREIGN KEY ("processFlowId") REFERENCES "ProcessFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionalAreaOverview" ADD CONSTRAINT "FunctionalAreaOverview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemainingItem" ADD CONSTRAINT "RemainingItem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequirement" ADD CONSTRAINT "ClientRequirement_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPoint" ADD CONSTRAINT "IntegrationPoint_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataMigrationObject" ADD CONSTRAINT "DataMigrationObject_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcmImpact" ADD CONSTRAINT "OcmImpact_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpMessage" ADD CONSTRAINT "HelpMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HelpSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInvitation" ADD CONSTRAINT "OrgInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPhaseProgress" ADD CONSTRAINT "AssessmentPhaseProgress_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopSession" ADD CONSTRAINT "WorkshopSession_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopAttendee" ADD CONSTRAINT "WorkshopAttendee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkshopSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopAttendee" ADD CONSTRAINT "WorkshopAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopVote" ADD CONSTRAINT "WorkshopVote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkshopSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopActionItem" ADD CONSTRAINT "WorkshopActionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkshopSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopMinutes" ADD CONSTRAINT "WorkshopMinutes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkshopSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusTransitionLog" ADD CONSTRAINT "StatusTransitionLog_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityFeedEntry" ADD CONSTRAINT "ActivityFeedEntry_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTooltip" ADD CONSTRAINT "OnboardingTooltip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportGeneration" ADD CONSTRAINT "ReportGeneration_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportBranding" ADD CONSTRAINT "ReportBranding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSnapshot" ADD CONSTRAINT "AssessmentSnapshot_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignOffProcess" ADD CONSTRAINT "SignOffProcess_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignOffProcess" ADD CONSTRAINT "SignOffProcess_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaValidation" ADD CONSTRAINT "AreaValidation_signOffId_fkey" FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalValidation" ADD CONSTRAINT "TechnicalValidation_signOffId_fkey" FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossFunctionalValidation" ADD CONSTRAINT "CrossFunctionalValidation_signOffId_fkey" FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_signOffId_fkey" FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlmExportRecord" ADD CONSTRAINT "AlmExportRecord_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPackage" ADD CONSTRAINT "HandoffPackage_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_newSnapshotId_fkey" FOREIGN KEY ("newSnapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReassessmentTrigger" ADD CONSTRAINT "ReassessmentTrigger_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioMetric" ADD CONSTRAINT "PortfolioMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditingLock" ADD CONSTRAINT "EditingLock_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditingLock" ADD CONSTRAINT "EditingLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceRecord" ADD CONSTRAINT "PresenceRecord_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceRecord" ADD CONSTRAINT "PresenceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncQueue" ADD CONSTRAINT "OfflineSyncQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncQueue" ADD CONSTRAINT "OfflineSyncQueue_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDependency" ADD CONSTRAINT "ActivityDependency_sourceActivityId_fkey" FOREIGN KEY ("sourceActivityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDependency" ADD CONSTRAINT "ActivityDependency_targetActivityId_fkey" FOREIGN KEY ("targetActivityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyPropagationLog" ADD CONSTRAINT "DependencyPropagationLog_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

