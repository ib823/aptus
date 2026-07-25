-- Idempotency for northbound writes.
--
-- A write into a client's production SAP must survive being retried. Networks
-- drop responses, clients retry, load balancers replay — and without this a
-- single logical write becomes two records in a customer's ledger.
--
-- The unique constraint on (organizationId, solutionId, key) is what actually
-- enforces it: two concurrent requests carrying the same key cannot both insert,
-- so the loser is detected as a duplicate rather than proceeding to SAP.
--
-- Non-destructive: one new table.

-- CreateTable
CREATE TABLE "NorthboundIdempotencyKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NorthboundIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NorthboundIdempotencyKey_organizationId_solutionId_key_key" ON "NorthboundIdempotencyKey"("organizationId", "solutionId", "key");

-- CreateIndex
CREATE INDEX "NorthboundIdempotencyKey_expiresAt_idx" ON "NorthboundIdempotencyKey"("expiresAt");
