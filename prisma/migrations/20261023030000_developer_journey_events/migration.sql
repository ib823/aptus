-- Record the first occurrence of each milestone on a developer's way to a
-- first call (P2.12), so time to first call (TTFC) and time to first real call
-- (TTFRC) can be shown as median and p90 against the roadmap's targets.
--
-- ADDITIVE. A new, empty table with a foreign key to Organization (cascade,
-- so deleting an organization deletes its journey). The running code neither
-- reads nor writes it, so this is safe ahead of the deploy, and a rollback of
-- the code leaves it unread. Nothing is backfilled: a journey is measured only
-- from milestones recorded after the deploy, because the first call of an
-- existing app cannot be recovered once the audit retention has pruned it
-- (docs/runbooks/coreedge-time-to-first-call.md).
--
-- The unique key is what makes every write "first occurrence only": the
-- application inserts with ON CONFLICT DO NOTHING.

-- CreateTable
CREATE TABLE "DeveloperJourneyEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "solutionId" TEXT,
    "environment" TEXT,
    "subjectId" TEXT,
    "actorUserId" TEXT,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperJourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeveloperJourneyEvent_organizationId_at_idx" ON "DeveloperJourneyEvent"("organizationId", "at");

-- CreateIndex
CREATE INDEX "DeveloperJourneyEvent_at_idx" ON "DeveloperJourneyEvent"("at");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperJourneyEvent_organizationId_kind_scopeKey_key" ON "DeveloperJourneyEvent"("organizationId", "kind", "scopeKey");

-- AddForeignKey
ALTER TABLE "DeveloperJourneyEvent" ADD CONSTRAINT "DeveloperJourneyEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
