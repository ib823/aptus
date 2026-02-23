-- Wave 10: Production Hardening & PWA (Phase 27)
-- Creates: OfflineSyncQueue, PerformanceBaseline

-- ============================================================
-- OfflineSyncQueue
-- ============================================================

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

CREATE UNIQUE INDEX "OfflineSyncQueue_clientId_key" ON "OfflineSyncQueue"("clientId");
CREATE INDEX "OfflineSyncQueue_userId_status_idx" ON "OfflineSyncQueue"("userId", "status");
CREATE INDEX "OfflineSyncQueue_assessmentId_idx" ON "OfflineSyncQueue"("assessmentId");
CREATE INDEX "OfflineSyncQueue_status_queuedAt_idx" ON "OfflineSyncQueue"("status", "queuedAt");

ALTER TABLE "OfflineSyncQueue" ADD CONSTRAINT "OfflineSyncQueue_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfflineSyncQueue" ADD CONSTRAINT "OfflineSyncQueue_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- PerformanceBaseline
-- ============================================================

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

CREATE UNIQUE INDEX "PerformanceBaseline_route_metric_period_key" ON "PerformanceBaseline"("route", "metric", "period");
CREATE INDEX "PerformanceBaseline_route_metric_idx" ON "PerformanceBaseline"("route", "metric");
