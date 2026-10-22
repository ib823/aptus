-- PlatformConsoleRead: the Workbench console's platform-scope read rows
-- (P0.14b), in a table of their own (wave 2 integration review round 4).
--
-- They were PlatformAuditEvent rows (action SAP_CONSOLE_READ). The release
-- protocol's rollback is an Instant Rollback that keeps the additive
-- migrations, and the code before P0.14b reads every PlatformAuditEvent row
-- as a Workbench write: after a rollback its Operations > Workbench writes
-- ledger listed every console read since the deploy as a write-back into a
-- client's SAP, most of them SUCCEEDED. No build before this one reads this
-- table, so a rollback leaves that ledger true.
--
-- Additive: one new table and its indexes. No call path reads it; nothing
-- that works today can be refused by it.

-- CreateTable
CREATE TABLE "PlatformConsoleRead" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorOrganizationId" TEXT,
    "product" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "tenantLabel" TEXT,
    "serviceKey" TEXT NOT NULL,
    "servicePath" TEXT,
    "entitySet" TEXT NOT NULL,
    "payloadSha256" TEXT NOT NULL,
    "payloadFields" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "status" INTEGER,
    "reason" TEXT,
    "detail" JSONB NOT NULL,
    "durationMs" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformConsoleRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformConsoleRead_at_idx" ON "PlatformConsoleRead"("at");

-- CreateIndex
CREATE INDEX "PlatformConsoleRead_actorUserId_at_idx" ON "PlatformConsoleRead"("actorUserId", "at");

-- CreateIndex
CREATE INDEX "PlatformConsoleRead_actorOrganizationId_correlationId_idx" ON "PlatformConsoleRead"("actorOrganizationId", "correlationId");
