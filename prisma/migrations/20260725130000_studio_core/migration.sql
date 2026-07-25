-- CoreEdge Developer Studio — the governed design-time spine.
--
-- Adds the five Studio tables on top of the SapConnection keystone. Studio
-- governs the INTEGRATION between an ABeam-built solution and a client's SAP
-- tenant; the solution's own application code lives in the developer's own repo
-- (Solution.repoUrl) and never in these tables.
--
-- Non-destructive: creates five new tables + three enums. No existing table is
-- altered. Equivalent to `prisma migrate dev --name studio_core`.

-- CreateEnum
CREATE TYPE "SolutionKind" AS ENUM ('INTERNAL_ACCELERATOR', 'PRESALES_DEMO', 'CLIENT_APP', 'REUSABLE', 'EXPERIMENT');

-- CreateEnum
CREATE TYPE "SolutionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESTRICTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "GrantDecision" AS ENUM ('REQUESTED', 'APPROVED', 'SANDBOX_ONLY', 'READ_ONLY', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Solution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "classification" "SolutionKind" NOT NULL,
    "businessProblem" TEXT NOT NULL,
    "status" "SolutionStatus" NOT NULL DEFAULT 'DRAFT',
    "dataClass" TEXT NOT NULL,
    "technicalOwnerId" TEXT,
    "businessOwnerId" TEXT,
    "supportOwnerId" TEXT,
    "repoUrl" TEXT,
    "packagingNote" TEXT,
    "reuseIntent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Solution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interface" (
    "id" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sapProduct" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entitySet" TEXT,
    "mode" TEXT NOT NULL,
    "requestSchema" JSONB,
    "responseSchema" JSONB,
    "mappingVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiAccessGrant" (
    "id" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "decision" "GrantDecision" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "expectation" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "lastOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Solution_organizationId_idx" ON "Solution"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Solution_organizationId_slug_key" ON "Solution"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Interface_organizationId_externalId_idx" ON "Interface"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "Interface_solutionId_idx" ON "Interface"("solutionId");

-- CreateIndex
CREATE INDEX "ApiAccessGrant_organizationId_solutionId_idx" ON "ApiAccessGrant"("organizationId", "solutionId");

-- CreateIndex
CREATE INDEX "TestCase_organizationId_interfaceId_idx" ON "TestCase"("organizationId", "interfaceId");

-- CreateIndex
CREATE INDEX "ConfigAudit_organizationId_entityType_entityId_idx" ON "ConfigAudit"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ConfigAudit_organizationId_at_idx" ON "ConfigAudit"("organizationId", "at");

-- AddForeignKey
ALTER TABLE "Solution" ADD CONSTRAINT "Solution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interface" ADD CONSTRAINT "Interface_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "Solution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiAccessGrant" ADD CONSTRAINT "ApiAccessGrant_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "Solution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "Interface"("id") ON DELETE CASCADE ON UPDATE CASCADE;
