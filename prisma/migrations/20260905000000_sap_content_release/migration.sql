-- 2608 WS0 — SAP content release record (docs/2608/BUILD-LOG.md).
--
-- ADDITIVE ONLY. Creates SapContentRelease (one row per landed SAP content
-- drop: release, localisation, loadedAt, sha256 of the drop's MANIFEST.json)
-- and adds a NULLABLE "releaseId" pointer on every SAP-content table:
-- ScopeItem, ProcessStep, ConfigActivity (SSCUI), AffirmQuestion (BDC),
-- AffirmProcessStep (BPD), SapHubContent and SapApiReference (Hub artefacts).
-- No backfill: null means "loaded before release tracking" (2602-era content).
-- Nothing is dropped, renamed, or made NOT NULL.
-- AlterTable
ALTER TABLE "SapApiReference" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "SapHubContent" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "ScopeItem" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "ProcessStep" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "ConfigActivity" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "AffirmQuestion" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "AffirmProcessStep" ADD COLUMN     "releaseId" TEXT;

-- CreateTable
CREATE TABLE "SapContentRelease" (
    "id" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "localisation" TEXT NOT NULL DEFAULT 'MY',
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manifestHash" TEXT,
    "manifestPath" TEXT,
    "fileCount" INTEGER,
    "notes" TEXT,
    "catalogVersionId" TEXT,

    CONSTRAINT "SapContentRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SapContentRelease_release_idx" ON "SapContentRelease"("release");

-- CreateIndex
CREATE UNIQUE INDEX "SapContentRelease_release_localisation_key" ON "SapContentRelease"("release", "localisation");

-- CreateIndex
CREATE INDEX "SapApiReference_releaseId_idx" ON "SapApiReference"("releaseId");

-- CreateIndex
CREATE INDEX "SapHubContent_releaseId_idx" ON "SapHubContent"("releaseId");

-- CreateIndex
CREATE INDEX "ScopeItem_releaseId_idx" ON "ScopeItem"("releaseId");

-- CreateIndex
CREATE INDEX "ProcessStep_releaseId_idx" ON "ProcessStep"("releaseId");

-- CreateIndex
CREATE INDEX "ConfigActivity_releaseId_idx" ON "ConfigActivity"("releaseId");

-- CreateIndex
CREATE INDEX "AffirmQuestion_releaseId_idx" ON "AffirmQuestion"("releaseId");

-- CreateIndex
CREATE INDEX "AffirmProcessStep_releaseId_idx" ON "AffirmProcessStep"("releaseId");

-- AddForeignKey
ALTER TABLE "SapContentRelease" ADD CONSTRAINT "SapContentRelease_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "ScopeCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapApiReference" ADD CONSTRAINT "SapApiReference_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapHubContent" ADD CONSTRAINT "SapHubContent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigActivity" ADD CONSTRAINT "ConfigActivity_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmQuestion" ADD CONSTRAINT "AffirmQuestion_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmProcessStep" ADD CONSTRAINT "AffirmProcessStep_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

