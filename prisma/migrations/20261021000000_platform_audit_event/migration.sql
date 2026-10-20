-- P0.7: a platform-scope audit trail for every Workbench write to a live SAP
-- system (`POST /api/sap/tdd/write`, `POST /api/sap/tdd/hub-content/write-test`).
--
-- `PlatformAuditEvent` is inserted BEFORE SAP is called, fail-closed: if the
-- insert fails, nothing is sent. `PlatformAuditOutcome` is inserted after,
-- at most once per event (unique `eventId`). Two inserts and no updates, so the
-- trail is append-only. A dedicated pair of tables because the existing audit
-- tables are tenant-anchored and these writes have no tenant: they target the
-- deployment's own `{PREFIX}_*` tenant and are made by a platform admin who may
-- have no organization. See the model comment in schema.prisma for the
-- alternatives that were rejected and why.
--
-- Generated with `prisma migrate diff`. Additive: two new tables and their
-- indexes, nothing the running code reads or writes, so it is safe to apply
-- before the code that uses it is deployed.
-- CreateTable
CREATE TABLE "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
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
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditOutcome" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "sapStatus" INTEGER,
    "reason" TEXT,
    "detail" JSONB,
    "durationMs" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_at_idx" ON "PlatformAuditEvent"("at");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_actorUserId_at_idx" ON "PlatformAuditEvent"("actorUserId", "at");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_correlationId_idx" ON "PlatformAuditEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAuditOutcome_eventId_key" ON "PlatformAuditOutcome"("eventId");

-- CreateIndex
CREATE INDEX "PlatformAuditOutcome_outcome_at_idx" ON "PlatformAuditOutcome"("outcome", "at");

-- AddForeignKey
ALTER TABLE "PlatformAuditOutcome" ADD CONSTRAINT "PlatformAuditOutcome_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PlatformAuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

