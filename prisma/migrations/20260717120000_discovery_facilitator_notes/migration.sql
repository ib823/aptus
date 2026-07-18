-- ABeam Workbench — Neutral Process Discovery facilitator notes (PR-3).
--
-- Purely additive: one CREATE TABLE plus its indexes and FKs. No existing table
-- is altered — the back-relations added to DiscoveryEngagement and
-- DiscoveryAccessGrant are virtual (Prisma emits no column for them).
--
-- These notes are consultant-visible only and must never reach a client
-- payload; the table is separate from DiscoveryDecision so that a client read
-- has to opt IN to leaking rather than remember to opt out.

-- CreateTable
CREATE TABLE "DiscoveryNote" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "grantId" TEXT,
    "processId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryNote_engagementId_processId_idx" ON "DiscoveryNote"("engagementId", "processId");

-- CreateIndex
CREATE INDEX "DiscoveryNote_engagementId_createdAt_idx" ON "DiscoveryNote"("engagementId", "createdAt");

-- AddForeignKey
ALTER TABLE "DiscoveryNote" ADD CONSTRAINT "DiscoveryNote_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "DiscoveryEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryNote" ADD CONSTRAINT "DiscoveryNote_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "DiscoveryAccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
