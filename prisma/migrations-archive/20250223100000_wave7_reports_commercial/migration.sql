-- Wave 7: Phase 25 (Report Generation & Branding) + Phase 29 (Commercial / Self-Service)

-- ============================================================
-- Phase 25: Report Generation & Branding
-- ============================================================

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
    CONSTRAINT "ReportGeneration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportGeneration_assessmentId_idx" ON "ReportGeneration"("assessmentId");
CREATE INDEX "ReportGeneration_assessmentId_reportType_idx" ON "ReportGeneration"("assessmentId", "reportType");
CREATE INDEX "ReportGeneration_expiresAt_idx" ON "ReportGeneration"("expiresAt");

ALTER TABLE "ReportGeneration" ADD CONSTRAINT "ReportGeneration_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

CREATE UNIQUE INDEX "ReportBranding_organizationId_key" ON "ReportBranding"("organizationId");

ALTER TABLE "ReportBranding" ADD CONSTRAINT "ReportBranding_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 29: Commercial fields on Organization
-- ============================================================

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIALING';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "billingEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "maxActiveAssessments" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "maxPartnerUsers" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "hasDemoAssessment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "demoAssessmentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "Organization_plan_idx" ON "Organization"("plan");
CREATE INDEX IF NOT EXISTS "Organization_subscriptionStatus_idx" ON "Organization"("subscriptionStatus");
CREATE INDEX IF NOT EXISTS "Organization_stripeCustomerId_idx" ON "Organization"("stripeCustomerId");

-- ============================================================
-- Phase 29: Assessment Templates
-- ============================================================

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

CREATE INDEX "AssessmentTemplate_organizationId_idx" ON "AssessmentTemplate"("organizationId");
CREATE INDEX "AssessmentTemplate_isDemo_idx" ON "AssessmentTemplate"("isDemo");
CREATE INDEX "AssessmentTemplate_organizationId_industry_idx" ON "AssessmentTemplate"("organizationId", "industry");
CREATE INDEX "AssessmentTemplate_organizationId_isPublished_idx" ON "AssessmentTemplate"("organizationId", "isPublished");

ALTER TABLE "AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Phase 29: Usage Events
-- ============================================================

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

CREATE INDEX "UsageEvent_organizationId_idx" ON "UsageEvent"("organizationId");
CREATE INDEX "UsageEvent_organizationId_eventType_idx" ON "UsageEvent"("organizationId", "eventType");
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");
CREATE INDEX "UsageEvent_stripeSent_idx" ON "UsageEvent"("stripeSent");

ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
