-- ABeam Workbench — Layer-3 Process Flow (data-only landing).
--
-- Per scope item, the SAP "where this sits" mandatory MY process
-- flow from BP_CLD_ENTPR Process-Steps. Sourced from
-- Layer3-Process-Flow.xlsx Sheet 2. 655 of 672 scope items have
-- at least one step; 17 carry no MY-mandatory steps.
--
-- This migration only lands the data layer. The UI component
-- (<ProcessFlowStrip />) lands in a follow-up once the aligned
-- design ships through Claude design.
--
-- CASCADE policy:
--   - AffirmProcessFlow → AffirmScopeItem: CASCADE. Flows are
--     scope-item-owned reference data; re-seed scenarios drop
--     and re-create together.
--   - AffirmProcessStep → AffirmProcessFlow: CASCADE. Steps are
--     children of the flow; never orphaned.
--
-- SAP-verbatim discipline: AffirmProcessStep.activity is locked
-- at the application layer (same rule as
-- AffirmQuestion.sapVerbatim). No DB constraint enforces it;
-- the editor surfaces never expose it as editable.

-- 1. CreateTable

CREATE TABLE "AffirmProcessFlow" (
  "scopeItemId"   TEXT NOT NULL,
  "activityCount" INTEGER NOT NULL DEFAULT 0,
  "myStepCount"   INTEGER NOT NULL DEFAULT 0,
  "optionalCount" INTEGER NOT NULL DEFAULT 0,
  "country"       TEXT NOT NULL DEFAULT 'MY',
  "sapRelease"    TEXT NOT NULL DEFAULT '2602',
  "extractedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffirmProcessFlow_pkey" PRIMARY KEY ("scopeItemId")
);

CREATE TABLE "AffirmProcessStep" (
  "id"          TEXT NOT NULL,
  "scopeItemId" TEXT NOT NULL,
  "stepNumber"  INTEGER NOT NULL,
  "activity"    TEXT NOT NULL,
  "fioriApps"   TEXT[],
  CONSTRAINT "AffirmProcessStep_pkey" PRIMARY KEY ("id")
);

-- 2. CreateIndex

CREATE INDEX "AffirmProcessFlow_country_idx"      ON "AffirmProcessFlow"("country");
CREATE INDEX "AffirmProcessFlow_sapRelease_idx"   ON "AffirmProcessFlow"("sapRelease");
CREATE INDEX "AffirmProcessStep_scopeItemId_idx"  ON "AffirmProcessStep"("scopeItemId");
CREATE UNIQUE INDEX "AffirmProcessStep_scopeItemId_stepNumber_key"
  ON "AffirmProcessStep"("scopeItemId", "stepNumber");

-- 3. AddForeignKey

ALTER TABLE "AffirmProcessFlow" ADD CONSTRAINT "AffirmProcessFlow_scopeItemId_fkey"
  FOREIGN KEY ("scopeItemId") REFERENCES "AffirmScopeItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmProcessStep" ADD CONSTRAINT "AffirmProcessStep_scopeItemId_fkey"
  FOREIGN KEY ("scopeItemId") REFERENCES "AffirmProcessFlow"("scopeItemId")
  ON DELETE CASCADE ON UPDATE CASCADE;
