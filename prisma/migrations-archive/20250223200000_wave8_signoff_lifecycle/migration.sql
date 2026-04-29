-- Wave 8: Phase 30 (Sign-Off, Handoff & ALM) + Phase 31 (Lifecycle Continuity)

-- ============================================================
-- Phase 30: Assessment Snapshots
-- ============================================================

CREATE TABLE "AssessmentSnapshot" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "version" INT NOT NULL,
    "label" TEXT,
    "snapshotData" JSONB NOT NULL,
    "dataHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentSnapshot_assessmentId_version_key" ON "AssessmentSnapshot"("assessmentId", "version");
CREATE INDEX "AssessmentSnapshot_assessmentId_idx" ON "AssessmentSnapshot"("assessmentId");

ALTER TABLE "AssessmentSnapshot" ADD CONSTRAINT "AssessmentSnapshot_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: Sign-Off Process
-- ============================================================

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

CREATE UNIQUE INDEX "SignOffProcess_assessmentId_key" ON "SignOffProcess"("assessmentId");
CREATE UNIQUE INDEX "SignOffProcess_snapshotId_key" ON "SignOffProcess"("snapshotId");
CREATE UNIQUE INDEX "SignOffProcess_verificationToken_key" ON "SignOffProcess"("verificationToken");
CREATE INDEX "SignOffProcess_assessmentId_idx" ON "SignOffProcess"("assessmentId");
CREATE INDEX "SignOffProcess_status_idx" ON "SignOffProcess"("status");

ALTER TABLE "SignOffProcess" ADD CONSTRAINT "SignOffProcess_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignOffProcess" ADD CONSTRAINT "SignOffProcess_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: Area Validation
-- ============================================================

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

CREATE UNIQUE INDEX "AreaValidation_signOffId_functionalArea_key" ON "AreaValidation"("signOffId", "functionalArea");
CREATE INDEX "AreaValidation_signOffId_idx" ON "AreaValidation"("signOffId");

ALTER TABLE "AreaValidation" ADD CONSTRAINT "AreaValidation_signOffId_fkey"
    FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: Technical Validation
-- ============================================================

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

CREATE UNIQUE INDEX "TechnicalValidation_signOffId_key" ON "TechnicalValidation"("signOffId");

ALTER TABLE "TechnicalValidation" ADD CONSTRAINT "TechnicalValidation_signOffId_fkey"
    FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: Cross-Functional Validation
-- ============================================================

CREATE TABLE "CrossFunctionalValidation" (
    "id" TEXT NOT NULL,
    "signOffId" TEXT NOT NULL,
    "validatedById" TEXT NOT NULL,
    "validatorName" TEXT NOT NULL,
    "validatorEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "conflictsReviewed" BOOLEAN NOT NULL DEFAULT false,
    "conflictCount" INT NOT NULL DEFAULT 0,
    "conflictsResolved" INT NOT NULL DEFAULT 0,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrossFunctionalValidation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrossFunctionalValidation_signOffId_key" ON "CrossFunctionalValidation"("signOffId");

ALTER TABLE "CrossFunctionalValidation" ADD CONSTRAINT "CrossFunctionalValidation_signOffId_fkey"
    FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: Signature Records
-- ============================================================

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

CREATE INDEX "SignatureRecord_signOffId_idx" ON "SignatureRecord"("signOffId");

ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_signOffId_fkey"
    FOREIGN KEY ("signOffId") REFERENCES "SignOffProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: ALM Export Records
-- ============================================================

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

CREATE INDEX "AlmExportRecord_assessmentId_idx" ON "AlmExportRecord"("assessmentId");

ALTER TABLE "AlmExportRecord" ADD CONSTRAINT "AlmExportRecord_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: Handoff Packages
-- ============================================================

CREATE TABLE "HandoffPackage" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "snapshotVersion" INT NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT 'FULL',
    "contents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fileSize" INT,
    "blobUrl" TEXT,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoffPackage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HandoffPackage_assessmentId_idx" ON "HandoffPackage"("assessmentId");

ALTER TABLE "HandoffPackage" ADD CONSTRAINT "HandoffPackage_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 30: Assessment lifecycle columns
-- ============================================================

ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "parentAssessmentId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "phaseNumber" INT NOT NULL DEFAULT 1;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "currentSnapshotId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "clonedFromSnapshotId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "carryForwardConfig" JSONB;

-- ============================================================
-- Phase 31: Change Requests
-- ============================================================

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

CREATE INDEX "ChangeRequest_assessmentId_idx" ON "ChangeRequest"("assessmentId");
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_previousSnapshotId_fkey"
    FOREIGN KEY ("previousSnapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_newSnapshotId_fkey"
    FOREIGN KEY ("newSnapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Phase 31: Reassessment Triggers
-- ============================================================

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

CREATE INDEX "ReassessmentTrigger_assessmentId_idx" ON "ReassessmentTrigger"("assessmentId");
CREATE INDEX "ReassessmentTrigger_triggerType_idx" ON "ReassessmentTrigger"("triggerType");

ALTER TABLE "ReassessmentTrigger" ADD CONSTRAINT "ReassessmentTrigger_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 31: Snapshot Comparisons (cache)
-- ============================================================

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

CREATE UNIQUE INDEX "SnapshotComparison_baseSnapshotId_compareSnapshotId_key" ON "SnapshotComparison"("baseSnapshotId", "compareSnapshotId");
CREATE INDEX "SnapshotComparison_assessmentId_idx" ON "SnapshotComparison"("assessmentId");
