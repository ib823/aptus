-- ABeam Workbench — Value-Stream Affirm-Set.
--
-- Pre-onboarding Fit-to-Standard affirmation tool. Independent of the
-- existing PresalesBundle path (paid-engagement flow). Adds nine tables:
--
--   AffirmValueStream        — 8 SAP e2e streams + Foundation
--   AffirmSubProcess         — 55 sub-processes positioned on streams
--   AffirmScopeItem          — 672 SAP scope items, parented by sub-process
--   AffirmQuestion           — 150 BDC Level-2 questions (incl. 15 excluded,
--                              13 flagged config-how-to)
--   AffirmBundle             — engagement root, state machine
--   AffirmBundleScopeItem    — m:n bundle ↔ scope items
--   AffirmBundleQuestion     — m:n bundle ↔ snapshot questions
--   AffirmResponse           — one row per answered question
--   AffirmEvent              — append-only audit log
--
-- CASCADE rationale, in brief:
--   The value-stream tree (streams / sub-processes / scope items /
--   questions) is reference data — the seed owns it. ON DELETE CASCADE
--   on the structural FKs (stream → sub-process → scope-item) keeps
--   re-seed scenarios sane.
--
--   The bundle is the engagement root. Every child (scope-item link,
--   question link, response, event) CASCADEs on bundle delete. The
--   bundle itself uses SET NULL on actor FKs (createdById, releasedById,
--   AffirmEvent.actorId) so the audit row survives the actor's deletion.

-- 1. CreateTable ───────────────────────────────────────────────────────

CREATE TABLE "AffirmValueStream" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "isFoundation" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "AffirmValueStream_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffirmSubProcess" (
  "id"           TEXT NOT NULL,
  "streamId"     TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "type"         TEXT NOT NULL DEFAULT 'functional',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "AffirmSubProcess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffirmScopeItem" (
  "id"                  TEXT NOT NULL,
  "subProcessId"        TEXT NOT NULL,
  "streamId"            TEXT NOT NULL,
  "description"         TEXT NOT NULL,
  "sapBusinessArea"     TEXT,
  "hasBdcCoverage"      BOOLEAN NOT NULL DEFAULT false,
  "placementReviewFlag" TEXT,

  CONSTRAINT "AffirmScopeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffirmQuestion" (
  "id"                     TEXT NOT NULL,
  "streamId"               TEXT NOT NULL,
  "subProcessId"           TEXT NOT NULL,
  "scopeItemRefs"          TEXT[],
  "sapVerbatim"            TEXT,
  "plainLanguageSuggested" TEXT,
  "consultantWording"      TEXT,
  "sapArea"                TEXT,
  "sapTopic"               TEXT,
  "sscuiRef"               TEXT,
  "sourceQuestionnaire"    TEXT,
  "placementBasis"         TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'suggested',
  "flag"                   TEXT,
  "statusNote"             TEXT,
  "displayOrder"           INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "AffirmQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffirmBundle" (
  "id"                   TEXT NOT NULL,
  "client"               TEXT NOT NULL,
  "state"                TEXT NOT NULL DEFAULT 'draft',
  "createdById"          TEXT,
  "releasedById"         TEXT,
  "issuedAt"             TIMESTAMP(3),
  "submittedAt"          TIMESTAMP(3),
  "releasedAt"           TIMESTAMP(3),
  "signedRecordJson"     JSONB,
  "agendaJson"           JSONB,
  "questionSnapshotJson" JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AffirmBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffirmBundleScopeItem" (
  "bundleId"    TEXT NOT NULL,
  "scopeItemId" TEXT NOT NULL,

  CONSTRAINT "AffirmBundleScopeItem_pkey" PRIMARY KEY ("bundleId", "scopeItemId")
);

CREATE TABLE "AffirmBundleQuestion" (
  "bundleId"   TEXT NOT NULL,
  "questionId" TEXT NOT NULL,

  CONSTRAINT "AffirmBundleQuestion_pkey" PRIMARY KEY ("bundleId", "questionId")
);

CREATE TABLE "AffirmResponse" (
  "id"         TEXT NOT NULL,
  "bundleId"   TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "choice"     TEXT NOT NULL,
  "reason"     TEXT,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffirmResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffirmEvent" (
  "id"        TEXT NOT NULL,
  "bundleId"  TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "actorId"   TEXT,
  "payload"   JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffirmEvent_pkey" PRIMARY KEY ("id")
);

-- 2. CreateIndex ───────────────────────────────────────────────────────

CREATE UNIQUE INDEX "AffirmValueStream_name_key" ON "AffirmValueStream"("name");
CREATE INDEX        "AffirmValueStream_displayOrder_idx" ON "AffirmValueStream"("displayOrder");

CREATE INDEX        "AffirmSubProcess_streamId_idx" ON "AffirmSubProcess"("streamId");
CREATE UNIQUE INDEX "AffirmSubProcess_streamId_name_key" ON "AffirmSubProcess"("streamId", "name");

CREATE INDEX "AffirmScopeItem_streamId_idx" ON "AffirmScopeItem"("streamId");
CREATE INDEX "AffirmScopeItem_subProcessId_idx" ON "AffirmScopeItem"("subProcessId");
CREATE INDEX "AffirmScopeItem_hasBdcCoverage_idx" ON "AffirmScopeItem"("hasBdcCoverage");
CREATE INDEX "AffirmScopeItem_placementReviewFlag_idx" ON "AffirmScopeItem"("placementReviewFlag");

CREATE INDEX "AffirmQuestion_streamId_idx" ON "AffirmQuestion"("streamId");
CREATE INDEX "AffirmQuestion_subProcessId_idx" ON "AffirmQuestion"("subProcessId");
CREATE INDEX "AffirmQuestion_status_idx" ON "AffirmQuestion"("status");
CREATE INDEX "AffirmQuestion_flag_idx" ON "AffirmQuestion"("flag");

CREATE INDEX "AffirmBundle_state_idx" ON "AffirmBundle"("state");
CREATE INDEX "AffirmBundle_createdAt_idx" ON "AffirmBundle"("createdAt");

CREATE INDEX "AffirmBundleScopeItem_scopeItemId_idx" ON "AffirmBundleScopeItem"("scopeItemId");

CREATE INDEX "AffirmBundleQuestion_questionId_idx" ON "AffirmBundleQuestion"("questionId");

CREATE UNIQUE INDEX "AffirmResponse_bundleId_questionId_key" ON "AffirmResponse"("bundleId", "questionId");
CREATE INDEX        "AffirmResponse_bundleId_idx"   ON "AffirmResponse"("bundleId");
CREATE INDEX        "AffirmResponse_choice_idx"     ON "AffirmResponse"("choice");

CREATE INDEX "AffirmEvent_bundleId_createdAt_idx" ON "AffirmEvent"("bundleId", "createdAt");
CREATE INDEX "AffirmEvent_type_createdAt_idx"     ON "AffirmEvent"("type", "createdAt");

-- 3. AddForeignKey ─────────────────────────────────────────────────────

-- Reference-data tree: stream → sub-process → scope-item → question.
-- CASCADE keeps re-seed flows clean (drop a stream, the sub-tree goes).

ALTER TABLE "AffirmSubProcess" ADD CONSTRAINT "AffirmSubProcess_streamId_fkey"
  FOREIGN KEY ("streamId") REFERENCES "AffirmValueStream"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmScopeItem" ADD CONSTRAINT "AffirmScopeItem_streamId_fkey"
  FOREIGN KEY ("streamId") REFERENCES "AffirmValueStream"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmScopeItem" ADD CONSTRAINT "AffirmScopeItem_subProcessId_fkey"
  FOREIGN KEY ("subProcessId") REFERENCES "AffirmSubProcess"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmQuestion" ADD CONSTRAINT "AffirmQuestion_streamId_fkey"
  FOREIGN KEY ("streamId") REFERENCES "AffirmValueStream"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmQuestion" ADD CONSTRAINT "AffirmQuestion_subProcessId_fkey"
  FOREIGN KEY ("subProcessId") REFERENCES "AffirmSubProcess"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Bundle root and actor FKs.

ALTER TABLE "AffirmBundle" ADD CONSTRAINT "AffirmBundle_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffirmBundle" ADD CONSTRAINT "AffirmBundle_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Bundle joins (m:n).

ALTER TABLE "AffirmBundleScopeItem" ADD CONSTRAINT "AffirmBundleScopeItem_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "AffirmBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmBundleScopeItem" ADD CONSTRAINT "AffirmBundleScopeItem_scopeItemId_fkey"
  FOREIGN KEY ("scopeItemId") REFERENCES "AffirmScopeItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmBundleQuestion" ADD CONSTRAINT "AffirmBundleQuestion_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "AffirmBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmBundleQuestion" ADD CONSTRAINT "AffirmBundleQuestion_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "AffirmQuestion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Responses + Events.

ALTER TABLE "AffirmResponse" ADD CONSTRAINT "AffirmResponse_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "AffirmBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmResponse" ADD CONSTRAINT "AffirmResponse_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "AffirmQuestion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmEvent" ADD CONSTRAINT "AffirmEvent_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "AffirmBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffirmEvent" ADD CONSTRAINT "AffirmEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
