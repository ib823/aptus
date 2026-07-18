-- ABeam Workbench — P4 client-capture pipeline (PR-6).
--
-- Purely additive: two new tables. The committed library JSON is untouched and
-- stays hash-pinned; promotions live here and the consultant views compose
-- JSON + these rows.
--
-- P4 §4 mandates two records per promoted item. They are separate tables on
-- purpose: the register holds attribution (clientRef, rawText), the shared entry
-- holds none, and the FK points register -> entry, so a read of the shared table
-- cannot walk to attribution.

-- CreateTable
CREATE TABLE "DiscoveryCapture" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "clientRef" TEXT,
    "linkedProcessId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "promotedAs" TEXT,
    "capturedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryPromotedEntry" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "linkedProcessId" TEXT,
    "observedIndustry" TEXT NOT NULL,
    "observedCount" INTEGER NOT NULL DEFAULT 1,
    "completeness" TEXT NOT NULL DEFAULT 'variant-outline',
    "capturedQuarter" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "authoredById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "captureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryPromotedEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryCapture_engagementId_status_idx" ON "DiscoveryCapture"("engagementId", "status");

-- CreateIndex
CREATE INDEX "DiscoveryCapture_linkedProcessId_idx" ON "DiscoveryCapture"("linkedProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryPromotedEntry_scopeId_key" ON "DiscoveryPromotedEntry"("scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryPromotedEntry_captureId_key" ON "DiscoveryPromotedEntry"("captureId");

-- CreateIndex
CREATE INDEX "DiscoveryPromotedEntry_linkedProcessId_idx" ON "DiscoveryPromotedEntry"("linkedProcessId");

-- CreateIndex
CREATE INDEX "DiscoveryPromotedEntry_type_idx" ON "DiscoveryPromotedEntry"("type");

-- AddForeignKey
ALTER TABLE "DiscoveryCapture" ADD CONSTRAINT "DiscoveryCapture_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "DiscoveryEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryCapture" ADD CONSTRAINT "DiscoveryCapture_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryPromotedEntry" ADD CONSTRAINT "DiscoveryPromotedEntry_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "DiscoveryCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryPromotedEntry" ADD CONSTRAINT "DiscoveryPromotedEntry_authoredById_fkey" FOREIGN KEY ("authoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryPromotedEntry" ADD CONSTRAINT "DiscoveryPromotedEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
