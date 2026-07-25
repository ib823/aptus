-- CoreEdge runtime (Phase D) — the northbound broker's spine.
--
-- SolutionClient       the runtime identity the broker authenticates. Only the
--                      SHA-256 hash of the token is stored; the raw value is
--                      shown once at issue and never persisted, so a database
--                      dump yields no usable credential.
-- NorthboundAuditEvent per-call audit. Append-only by construction — the
--                      application exposes no update or delete path.
-- MockFixture          recorded responses from Test Console runs, so a
--                      developer's own suite can replay every honest state
--                      offline.
--
-- Non-destructive: three new tables + one FK to Organization. No existing table
-- is altered.

-- CreateTable
CREATE TABLE "SolutionClient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "secretsCiphertext" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolutionClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NorthboundAuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "interfaceId" TEXT,
    "operation" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "rowCount" INTEGER,
    "correlationId" TEXT NOT NULL,
    "clientTokenId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NorthboundAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockFixture" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockFixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SolutionClient_solutionId_key" ON "SolutionClient"("solutionId");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionClient_tokenHash_key" ON "SolutionClient"("tokenHash");

-- CreateIndex
CREATE INDEX "SolutionClient_organizationId_idx" ON "SolutionClient"("organizationId");

-- CreateIndex
CREATE INDEX "SolutionClient_tokenHash_idx" ON "SolutionClient"("tokenHash");

-- CreateIndex
CREATE INDEX "NorthboundAuditEvent_organizationId_solutionId_at_idx" ON "NorthboundAuditEvent"("organizationId", "solutionId", "at");

-- CreateIndex
CREATE INDEX "NorthboundAuditEvent_organizationId_clientTokenId_at_idx" ON "NorthboundAuditEvent"("organizationId", "clientTokenId", "at");

-- CreateIndex
CREATE INDEX "MockFixture_organizationId_interfaceId_scenario_idx" ON "MockFixture"("organizationId", "interfaceId", "scenario");

-- AddForeignKey
ALTER TABLE "SolutionClient" ADD CONSTRAINT "SolutionClient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
