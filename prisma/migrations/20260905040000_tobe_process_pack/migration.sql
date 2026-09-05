-- 2608 WS6 — Client To-Be Process Pack (additive).
--
-- ProcessStepState: the state of one to-be step (STANDARD · CONFIGURED ·
-- VARIANT · GAP · NOT_IN_SCOPE). TobeGapType: why a GAP is a gap.
-- TobeRule: bdcQuestionId → effect, seeded from the BDC ↔ SSCUI cross-reference
-- and a curated set; applied only when the client's answer equals the trigger.
-- TobePack: one generated, hash-frozen document per affirm bundle.
--
-- No existing table or row is altered. All new FKs are nullable or cascade
-- from their parent (bundle / question), matching the affirm tables.

-- CreateEnum
CREATE TYPE "ProcessStepState" AS ENUM ('STANDARD', 'CONFIGURED', 'VARIANT', 'GAP', 'NOT_IN_SCOPE');

-- CreateEnum
CREATE TYPE "TobeGapType" AS ENUM ('EXTENSION', 'WORKAROUND', 'INTEGRATION', 'OUT_OF_SCOPE');

-- CreateTable
CREATE TABLE "TobeRule" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "scopeCode" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "state" "ProcessStepState" NOT NULL,
    "sscuiId" TEXT,
    "sscuiName" TEXT,
    "gapType" "TobeGapType",
    "alternatePathId" TEXT,
    "stepNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releaseId" TEXT,

    CONSTRAINT "TobeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TobePack" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "releaseId" TEXT,
    "scopeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopeHash" TEXT NOT NULL,
    "answerHash" TEXT NOT NULL,
    "rulesHash" TEXT NOT NULL,
    "inputsHash" TEXT NOT NULL,
    "packJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,

    CONSTRAINT "TobePack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TobeRule_questionId_idx" ON "TobeRule"("questionId");

-- CreateIndex
CREATE INDEX "TobeRule_scopeCode_idx" ON "TobeRule"("scopeCode");

-- CreateIndex
CREATE INDEX "TobeRule_releaseId_idx" ON "TobeRule"("releaseId");

-- CreateIndex
CREATE INDEX "TobePack_bundleId_generatedAt_idx" ON "TobePack"("bundleId", "generatedAt");

-- CreateIndex
CREATE INDEX "TobePack_releaseId_idx" ON "TobePack"("releaseId");

-- AddForeignKey
ALTER TABLE "TobeRule" ADD CONSTRAINT "TobeRule_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AffirmQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TobeRule" ADD CONSTRAINT "TobeRule_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TobePack" ADD CONSTRAINT "TobePack_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "AffirmBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TobePack" ADD CONSTRAINT "TobePack_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TobePack" ADD CONSTRAINT "TobePack_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

