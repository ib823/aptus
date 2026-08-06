-- Commercial identity, engineering only: per-product-line subscriptions and
-- the nightly CoreEdge usage rollup. No payment processor is wired.
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productLine" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'TRIAL',
    "status" TEXT NOT NULL DEFAULT 'TRIALING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_organizationId_productLine_key" ON "Subscription"("organizationId", "productLine");
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");

CREATE TABLE "CoreEdgeUsageRollup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "writes" INTEGER NOT NULL DEFAULT 0,
    "refusals" INTEGER NOT NULL DEFAULT 0,
    "distinctInterfaces" INTEGER NOT NULL DEFAULT 0,
    "distinctCredentials" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoreEdgeUsageRollup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoreEdgeUsageRollup_organizationId_day_key" ON "CoreEdgeUsageRollup"("organizationId", "day");
CREATE INDEX "CoreEdgeUsageRollup_day_idx" ON "CoreEdgeUsageRollup"("day");
