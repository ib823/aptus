-- TenantGuardViolation: the durable count of unscoped queries the tenant-scope
-- guard let through in log mode.
--
-- Switching TENANT_SCOPE_GUARD to throw needs seven days with zero violations,
-- and runtime logs are kept for one to three days. One row per model,
-- operation and call site, incremented and sampled per process, written
-- through the unextended client so the write is not itself guarded.
--
-- Additive. The code already deployed neither reads nor writes it, and the
-- guard's behaviour is unchanged: log mode still lets the query run.

-- CreateTable
CREATE TABLE "TenantGuardViolation" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "callSite" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantGuardViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantGuardViolation_lastSeenAt_idx" ON "TenantGuardViolation"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantGuardViolation_model_operation_callSite_key" ON "TenantGuardViolation"("model", "operation", "callSite");
