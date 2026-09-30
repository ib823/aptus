CREATE TABLE IF NOT EXISTS "ProductScopeItem" (
    "id" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "solutionKey" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'XX',
    "language" TEXT NOT NULL DEFAULT 'EN',
    "scopeCode" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceHash" TEXT,
    "processSteps" JSONB NOT NULL,
    "configQuestions" JSONB NOT NULL,
    "processSourceUrl" TEXT,
    "configSourceUrl" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductScopeItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductScopeItem_productKey_solutionKey_release_country_lan_key"
    ON "ProductScopeItem"("productKey", "solutionKey", "release", "country", "language", "scopeCode");
CREATE INDEX IF NOT EXISTS "ProductScopeItem_productKey_solutionKey_release_idx"
    ON "ProductScopeItem"("productKey", "solutionKey", "release");
CREATE INDEX IF NOT EXISTS "ProductScopeItem_scopeCode_idx" ON "ProductScopeItem"("scopeCode");
