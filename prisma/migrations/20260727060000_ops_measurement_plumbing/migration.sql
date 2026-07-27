-- How long a northbound call took, and an index the write ledger can actually use.
--
-- 1. NorthboundAuditEvent.durationMs
--
-- The Operations Center's broker-traffic view shows latency. There was no
-- duration anywhere in the audit row, so that number could only ever have been
-- estimated -- which is precisely the fabricated metric this product exists not
-- to ship. The design was annotated "omit this card rather than estimate it";
-- this column is what lets it be shown instead of omitted.
--
-- NULLABLE, permanently. Rows written before this migration do not know their
-- duration, and a backfilled 0 would read as "instant" rather than "unmeasured"
-- -- turning a gap in the record into a false claim about it. Null also covers
-- every call refused before an upstream request was made: no SAP call happened,
-- so there is no duration to report.
--
-- 2. NorthboundIdempotencyKey @@index([organizationId, createdAt])
--
-- The write ledger reads this table per organization, newest first. Nothing
-- served that scan: the unique constraint leads with organizationId but then
-- continues into solutionId + key, so it cannot order by time, and the expiresAt
-- index is not partitioned by tenant. This front introduces the first query
-- against the table, so it introduces the index with it rather than leaving a
-- sequential scan to be discovered under load.
--
-- Non-destructive: one nullable column, one additive index.

-- AlterTable
ALTER TABLE "NorthboundAuditEvent" ADD COLUMN     "durationMs" INTEGER;

-- CreateIndex
CREATE INDEX "NorthboundIdempotencyKey_organizationId_createdAt_idx" ON "NorthboundIdempotencyKey"("organizationId", "createdAt");
