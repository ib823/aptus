-- ABeam Workbench — Neutral Process Discovery guest infra (PR-2a).
--
-- Purely additive: every statement is a CREATE. No existing table is altered,
-- so rollback is unsetting NEUTRAL_DISCOVERY_ENABLED — these tables simply go
-- unread. The User back-relations added in schema.prisma are virtual (Prisma
-- emits no column), which is why no ALTER TABLE "User" appears here.
--
-- Mirrors 20260715120000_affirm_external_guest_infra on its own tables.

-- CreateTable
CREATE TABLE "DiscoveryEngagement" (
    "id" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryAccessGrant" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleLabel" TEXT,
    "tokenHash" TEXT NOT NULL,
    "valueStreamIds" TEXT[],
    "ackAt" TIMESTAMP(3),
    "pdpaVersion" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "otpVerifiedUaHashes" TEXT[],
    "lastAccessAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "supersededByGrantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryGuestSession" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "uaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,

    CONSTRAINT "DiscoveryGuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryEvent" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryDecision" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryEngagement_state_idx" ON "DiscoveryEngagement"("state");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryAccessGrant_tokenHash_key" ON "DiscoveryAccessGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "DiscoveryAccessGrant_engagementId_idx" ON "DiscoveryAccessGrant"("engagementId");

-- CreateIndex
CREATE INDEX "DiscoveryAccessGrant_email_idx" ON "DiscoveryAccessGrant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryGuestSession_tokenHash_key" ON "DiscoveryGuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DiscoveryGuestSession_grantId_idx" ON "DiscoveryGuestSession"("grantId");

-- CreateIndex
CREATE INDEX "DiscoveryEvent_engagementId_createdAt_idx" ON "DiscoveryEvent"("engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoveryEvent_type_createdAt_idx" ON "DiscoveryEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryDecision_engagementId_processId_key" ON "DiscoveryDecision"("engagementId", "processId");

-- CreateIndex
CREATE INDEX "DiscoveryDecision_engagementId_idx" ON "DiscoveryDecision"("engagementId");

-- CreateIndex
CREATE INDEX "DiscoveryDecision_grantId_idx" ON "DiscoveryDecision"("grantId");

-- AddForeignKey
ALTER TABLE "DiscoveryAccessGrant" ADD CONSTRAINT "DiscoveryAccessGrant_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "DiscoveryEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryAccessGrant" ADD CONSTRAINT "DiscoveryAccessGrant_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryAccessGrant" ADD CONSTRAINT "DiscoveryAccessGrant_supersededByGrantId_fkey" FOREIGN KEY ("supersededByGrantId") REFERENCES "DiscoveryAccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryGuestSession" ADD CONSTRAINT "DiscoveryGuestSession_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "DiscoveryAccessGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryEvent" ADD CONSTRAINT "DiscoveryEvent_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "DiscoveryEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryEvent" ADD CONSTRAINT "DiscoveryEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryDecision" ADD CONSTRAINT "DiscoveryDecision_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "DiscoveryEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryDecision" ADD CONSTRAINT "DiscoveryDecision_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "DiscoveryAccessGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
