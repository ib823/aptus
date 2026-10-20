-- PlatformGovernanceAudit: the governance trail of an actor with no tenant.
--
-- ConfigAudit rows belong to an organization, so the passkey and step-up
-- events of platform admins and of accounts an admin created without an
-- organization reached only the log, including the trust-on-first-use
-- enrolment of a first passkey that the governance step-up relies on being
-- visible. Same shape as ConfigAudit minus the tenant; append-only.
--
-- Not to be confused with PlatformAuditEvent/PlatformAuditOutcome
-- (20261021000000_platform_audit_event), which hold Workbench writes to SAP.
--
-- Additive. The code already deployed neither reads nor writes it.

-- CreateTable
CREATE TABLE "PlatformGovernanceAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformGovernanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformGovernanceAudit_entityType_entityId_idx" ON "PlatformGovernanceAudit"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PlatformGovernanceAudit_actorId_at_idx" ON "PlatformGovernanceAudit"("actorId", "at");

-- CreateIndex
CREATE INDEX "PlatformGovernanceAudit_at_idx" ON "PlatformGovernanceAudit"("at");
