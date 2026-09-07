-- 2608 WS13 — the 2026-09-07 data-acquisition harvest.
--
-- Four new tables and two enum values. Purely additive: zero DROP, zero
-- ALTER TABLE ... DROP, so a rollback is a DROP of these four plus the two
-- enum values and nothing else.
--
-- ScopeItemCommScenario is the one that matters. docs/2608/WS10-SCOPE.md
-- recorded that "which APIs does scope item X need?" has NO evidence path, and
-- measured it: 0 of 5,419 API rows carry a scope code, 0 carry a communication
-- scenario, 0 of 4,502 iFlows name any of the 822 scope codes. Every one of
-- those measurements is correct about the Business Accelerator Hub, and the
-- conclusion drawn from them was wrong — SAP publishes the mapping as an
-- ordinary table ("Available Interfaces for Your Selected Scope") that aptus
-- had simply never read. 1,149 rows, every one PUBLISHED.
--
-- scopeItemCode there is deliberately NOT a foreign key, unlike
-- VerdictScopeItem.scopeItemId. 21 of the 354 ids SAP publishes on that page do
-- not exist in PUBLIC/2608 and 8 source rows carry a blank id; an FK would force
-- those rows to be dropped and hide a real disagreement between two SAP
-- publications. resolvesInCatalogue records the answer instead.

-- This migration adds more than one value to an enum.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SapHubContentType" ADD VALUE 'DATA_PRODUCT';
ALTER TYPE "SapHubContentType" ADD VALUE 'INTEGRATION_ADAPTER';

-- CreateTable
CREATE TABLE "SapFioriApp" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "appType" TEXT,
    "lob" TEXT,
    "businessCatalogIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "businessRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "odataServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopeItemCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productVersion" TEXT,
    "availability" TEXT,
    "deviceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appHubUrl" TEXT,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapFioriApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapCommScenario" (
    "id" TEXT NOT NULL,
    "commScenarioId" TEXT NOT NULL,
    "name" TEXT,
    "direction" TEXT,
    "authMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inboundServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outboundServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "apiIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nameSourceUrl" TEXT,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapCommScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeItemCommScenario" (
    "id" TEXT NOT NULL,
    "scopeItemCode" TEXT NOT NULL,
    "commScenarioId" TEXT NOT NULL,
    "mandatory" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "linkSource" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "resolvesInCatalogue" BOOLEAN NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScopeItemCommScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapNotSupported" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "scopeItemCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT,
    "whatIsNotSupported" TEXT NOT NULL,
    "statementVerbatim" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "releasedOn" TEXT,
    "futureSupportStated" TEXT,
    "sourceRow" INTEGER NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapNotSupported_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SapFioriApp_releaseId_idx" ON "SapFioriApp"("releaseId");

-- CreateIndex
CREATE INDEX "SapFioriApp_appId_idx" ON "SapFioriApp"("appId");

-- CreateIndex
CREATE INDEX "SapFioriApp_scopeItemCodes_idx" ON "SapFioriApp" USING GIN ("scopeItemCodes");

-- CreateIndex
CREATE INDEX "SapFioriApp_businessCatalogIds_idx" ON "SapFioriApp" USING GIN ("businessCatalogIds");

-- CreateIndex
CREATE INDEX "SapFioriApp_odataServices_idx" ON "SapFioriApp" USING GIN ("odataServices");

-- CreateIndex
CREATE UNIQUE INDEX "SapFioriApp_releaseId_appId_key" ON "SapFioriApp"("releaseId", "appId");

-- CreateIndex
CREATE INDEX "SapCommScenario_releaseId_idx" ON "SapCommScenario"("releaseId");

-- CreateIndex
CREATE INDEX "SapCommScenario_apiIds_idx" ON "SapCommScenario" USING GIN ("apiIds");

-- CreateIndex
CREATE UNIQUE INDEX "SapCommScenario_releaseId_commScenarioId_key" ON "SapCommScenario"("releaseId", "commScenarioId");

-- CreateIndex
CREATE INDEX "ScopeItemCommScenario_releaseId_idx" ON "ScopeItemCommScenario"("releaseId");

-- CreateIndex
CREATE INDEX "ScopeItemCommScenario_scopeItemCode_idx" ON "ScopeItemCommScenario"("scopeItemCode");

-- CreateIndex
CREATE INDEX "ScopeItemCommScenario_commScenarioId_idx" ON "ScopeItemCommScenario"("commScenarioId");

-- CreateIndex
CREATE INDEX "ScopeItemCommScenario_linkSource_idx" ON "ScopeItemCommScenario"("linkSource");

-- CreateIndex
CREATE INDEX "ScopeItemCommScenario_resolvesInCatalogue_idx" ON "ScopeItemCommScenario"("resolvesInCatalogue");

-- CreateIndex
CREATE UNIQUE INDEX "ScopeItemCommScenario_releaseId_scopeItemCode_commScenarioI_key" ON "ScopeItemCommScenario"("releaseId", "scopeItemCode", "commScenarioId");

-- CreateIndex
CREATE INDEX "SapNotSupported_releaseId_idx" ON "SapNotSupported"("releaseId");

-- CreateIndex
CREATE INDEX "SapNotSupported_country_idx" ON "SapNotSupported"("country");

-- CreateIndex
CREATE INDEX "SapNotSupported_sourceType_idx" ON "SapNotSupported"("sourceType");

-- CreateIndex
CREATE INDEX "SapNotSupported_scopeItemCodes_idx" ON "SapNotSupported" USING GIN ("scopeItemCodes");

-- CreateIndex
CREATE UNIQUE INDEX "SapNotSupported_releaseId_sourceRow_key" ON "SapNotSupported"("releaseId", "sourceRow");

-- AddForeignKey
ALTER TABLE "SapFioriApp" ADD CONSTRAINT "SapFioriApp_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapCommScenario" ADD CONSTRAINT "SapCommScenario_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItemCommScenario" ADD CONSTRAINT "ScopeItemCommScenario_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapNotSupported" ADD CONSTRAINT "SapNotSupported_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

