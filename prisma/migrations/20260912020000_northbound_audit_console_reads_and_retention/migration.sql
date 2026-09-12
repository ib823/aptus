-- NorthboundAuditEvent: audit the console reads, and make the trail findable and bounded.
--
-- THREE CHANGES, ONE TABLE.
--
-- 1. solutionId and clientTokenId become nullable, and actorUserId is added.
--    `/api/sap/tdd/preview`, `/entities` and `/operations` reach a customer's SAP
--    system on a signed-in human's behalf. There is no solution and no credential
--    in those requests, so under NOT NULL there was no honest row to write — which
--    is precisely why those reads were unaudited. A machine call names its
--    solution and its credential; a console read names its actor; every row names
--    one or the other.
--
-- 2. An index on (organizationId, correlationId). Every northbound response hands
--    back a correlationId and the manual tells callers to quote it, but no query
--    path could find the row again. Organization-scoped because every read of this
--    table is, and because an unscoped equality on a shared id is a cross-tenant
--    lookup waiting to be written.
--
-- 3. An index on (at). The retention sweep deletes by age, oldest first; without
--    this it is a sequential scan of the whole table on every run.
--
-- ADDITIVE AND NON-DESTRUCTIVE. Dropping NOT NULL never rejects an existing row,
-- the new column is nullable with no default, and no data is rewritten. Existing
-- rows keep their solutionId and clientTokenId exactly as they were, so every
-- query that assumed them present still sees them present on all historical rows.

ALTER TABLE "NorthboundAuditEvent" ALTER COLUMN "solutionId" DROP NOT NULL;
ALTER TABLE "NorthboundAuditEvent" ALTER COLUMN "clientTokenId" DROP NOT NULL;
ALTER TABLE "NorthboundAuditEvent" ADD COLUMN "actorUserId" TEXT;

CREATE INDEX "NorthboundAuditEvent_organizationId_correlationId_idx"
  ON "NorthboundAuditEvent" ("organizationId", "correlationId");

CREATE INDEX "NorthboundAuditEvent_organizationId_actorUserId_at_idx"
  ON "NorthboundAuditEvent" ("organizationId", "actorUserId", "at");

CREATE INDEX "NorthboundAuditEvent_at_idx"
  ON "NorthboundAuditEvent" ("at");
