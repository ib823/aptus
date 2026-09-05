-- 2608 WS2 — Hub artefact lifecycle fields (docs/2608/BUILD-LOG.md).
--
-- ADDITIVE ONLY. SapHubContent and SapApiReference gain the Hub's own
-- lifecycle fields, all nullable: hubState (ACTIVE | DEPRECATED | …),
-- hubVersion, hubModifiedAt, hubSubType, catalogueRelease (the owning
-- package's Version, e.g. "2608") and successorExternalId (from the
-- checked-in successor map). Existing rows keep NULLs until re-imported.
-- Nothing is dropped, renamed or made NOT NULL.
-- AlterTable
ALTER TABLE "SapApiReference" ADD COLUMN     "catalogueRelease" TEXT,
ADD COLUMN     "hubModifiedAt" TIMESTAMP(3),
ADD COLUMN     "hubState" TEXT,
ADD COLUMN     "hubSubType" TEXT,
ADD COLUMN     "hubVersion" TEXT,
ADD COLUMN     "successorExternalId" TEXT;

-- AlterTable
ALTER TABLE "SapHubContent" ADD COLUMN     "catalogueRelease" TEXT,
ADD COLUMN     "hubModifiedAt" TIMESTAMP(3),
ADD COLUMN     "hubState" TEXT,
ADD COLUMN     "hubSubType" TEXT,
ADD COLUMN     "hubVersion" TEXT,
ADD COLUMN     "successorExternalId" TEXT;

-- CreateIndex
CREATE INDEX "SapApiReference_hubState_idx" ON "SapApiReference"("hubState");

-- CreateIndex
CREATE INDEX "SapApiReference_catalogueRelease_idx" ON "SapApiReference"("catalogueRelease");

-- CreateIndex
CREATE INDEX "SapHubContent_hubState_idx" ON "SapHubContent"("hubState");

-- CreateIndex
CREATE INDEX "SapHubContent_catalogueRelease_idx" ON "SapHubContent"("catalogueRelease");

