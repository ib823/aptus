-- 2608 WS1 — scope-item lifecycle + A&D attributes, and the Process-Steps master
-- (docs/2608/BUILD-LOG.md).
--
-- ADDITIVE ONLY.
--  * ScopeItem gains lifecycleStatus (DEFAULT 'ACTIVE' — every existing row keeps
--    ACTIVE), successorScopeCodes, lifecycleNote and the Availability &
--    Dependencies attributes (provisioning, MY availability, LOBs, business
--    areas, required scope items, component, licence). All nullable or defaulted.
--  * SapProcessStep: one row per line of the SAP "Process Steps, Business Roles"
--    workbook, scoped to a SapContentRelease (cascade on release delete).
-- Nothing is dropped, renamed, backfilled or made NOT NULL without a default.
-- AlterTable
ALTER TABLE "ScopeItem" ADD COLUMN     "availableInMy" BOOLEAN,
ADD COLUMN     "businessAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "licenseRequired" TEXT,
ADD COLUMN     "lifecycleNote" TEXT,
ADD COLUMN     "lifecycleStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "lobs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "myAvailableSince" TEXT,
ADD COLUMN     "provisioning" TEXT,
ADD COLUMN     "requiredScopeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sapComponent" TEXT,
ADD COLUMN     "successorScopeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "SapProcessStep" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "scopeItemCode" TEXT NOT NULL,
    "scopeItemName" TEXT NOT NULL,
    "lob" TEXT NOT NULL,
    "businessArea" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "activity" TEXT NOT NULL,
    "fioriAppTitle" TEXT,
    "fioriAppId" TEXT,
    "fioriSemanticObject" TEXT,
    "fioriSemanticAction" TEXT,
    "businessRoleDescription" TEXT,
    "businessRoleId" TEXT,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availableInMy" BOOLEAN NOT NULL DEFAULT false,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SapProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SapProcessStep_releaseId_scopeItemCode_idx" ON "SapProcessStep"("releaseId", "scopeItemCode");

-- CreateIndex
CREATE INDEX "SapProcessStep_scopeItemCode_idx" ON "SapProcessStep"("scopeItemCode");

-- CreateIndex
CREATE INDEX "SapProcessStep_fioriAppId_idx" ON "SapProcessStep"("fioriAppId");

-- CreateIndex
CREATE INDEX "SapProcessStep_businessRoleId_idx" ON "SapProcessStep"("businessRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "SapProcessStep_releaseId_scopeItemCode_sequence_key" ON "SapProcessStep"("releaseId", "scopeItemCode", "sequence");

-- CreateIndex
CREATE INDEX "ScopeItem_lifecycleStatus_idx" ON "ScopeItem"("lifecycleStatus");

-- AddForeignKey
ALTER TABLE "SapProcessStep" ADD CONSTRAINT "SapProcessStep_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

