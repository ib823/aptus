-- Probe history (append-only) so connection health has a trend and a drift
-- signal, and a cron run log so scheduled sweeps are observable at all.

CREATE TABLE "SapConnectionProbeEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "source" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapConnectionProbeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SapConnectionProbeEvent_organizationId_connectionId_at_idx" ON "SapConnectionProbeEvent"("organizationId", "connectionId", "at");
CREATE INDEX "SapConnectionProbeEvent_connectionId_at_idx" ON "SapConnectionProbeEvent"("connectionId", "at");

CREATE TABLE "CronRunLog" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "summaryJson" JSONB,

    CONSTRAINT "CronRunLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronRunLog_job_startedAt_idx" ON "CronRunLog"("job", "startedAt");
