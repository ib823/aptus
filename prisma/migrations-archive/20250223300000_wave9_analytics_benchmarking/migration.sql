-- Wave 9: Analytics, Benchmarking & Templates (Phase 26)
-- Creates: BenchmarkSnapshot, PortfolioMetric, AssessmentPhaseLink

-- ============================================================
-- BenchmarkSnapshot
-- ============================================================

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

CREATE UNIQUE INDEX "BenchmarkSnapshot_industry_companySize_key" ON "BenchmarkSnapshot"("industry", "companySize");
CREATE INDEX "BenchmarkSnapshot_industry_idx" ON "BenchmarkSnapshot"("industry");

-- ============================================================
-- PortfolioMetric
-- ============================================================

CREATE TABLE "PortfolioMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricValue" JSONB NOT NULL,
    "period" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioMetric_organizationId_metricType_period_key" ON "PortfolioMetric"("organizationId", "metricType", "period");
CREATE INDEX "PortfolioMetric_organizationId_metricType_idx" ON "PortfolioMetric"("organizationId", "metricType");
CREATE INDEX "PortfolioMetric_organizationId_period_idx" ON "PortfolioMetric"("organizationId", "period");

ALTER TABLE "PortfolioMetric" ADD CONSTRAINT "PortfolioMetric_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- AssessmentPhaseLink
-- ============================================================

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

CREATE UNIQUE INDEX "AssessmentPhaseLink_phase1AssessmentId_phase2AssessmentId_key" ON "AssessmentPhaseLink"("phase1AssessmentId", "phase2AssessmentId");
CREATE INDEX "AssessmentPhaseLink_clientIdentifier_idx" ON "AssessmentPhaseLink"("clientIdentifier");
CREATE INDEX "AssessmentPhaseLink_phase1AssessmentId_idx" ON "AssessmentPhaseLink"("phase1AssessmentId");
CREATE INDEX "AssessmentPhaseLink_phase2AssessmentId_idx" ON "AssessmentPhaseLink"("phase2AssessmentId");
