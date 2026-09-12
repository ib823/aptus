-- Exact-match lookup by correlation id (PR-5, capability 9).
--
-- The id was already generated, returned to the caller and stored on every row.
-- What was missing was the ability to FIND it: no index on correlationId (only
-- [organizationId, solutionId, at] and [organizationId, clientTokenId, at]), so
-- "a builder pastes one id and gets an answer" meant a sequential scan of the
-- whole audit table.
--
-- organizationId leads the key so the lookup is tenant-scoped by construction
-- rather than by a filter someone can forget to add.
--
-- CONCURRENTLY is deliberately NOT used: Prisma runs each migration inside a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run in one. On a table this
-- size the brief lock is acceptable; if it ever is not, this index should be
-- built out of band and the migration marked applied.
CREATE INDEX "NorthboundAuditEvent_organizationId_correlationId_idx"
    ON "NorthboundAuditEvent"("organizationId", "correlationId");
