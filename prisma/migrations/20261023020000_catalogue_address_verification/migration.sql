-- Record which catalogue OData V4 addresses answered 200 on which system (P0.8).
--
-- Every non-curated V4 address the catalogue shows is derived from the Hub id,
-- and the one checked against a real system was wrong. The catalogue now labels
-- a V4 address "unverified" until a probe of exactly that address answers 200
-- on the system being viewed; this table is where that answer is kept, per
-- organization, product and tenant key, with the connection and host that
-- answered.
--
-- ADDITIVE. A new, empty table; the running code neither reads nor writes it,
-- so this is safe ahead of the deploy. Nothing is backfilled: no V4 address has
-- a recorded 200 yet, so every one starts "unverified", which is the truth.

-- CreateTable
CREATE TABLE "CatalogueAddressVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "connectionId" TEXT,
    "baseUrl" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "servicePath" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "verifiedByUserId" TEXT,
    "method" TEXT NOT NULL,

    CONSTRAINT "CatalogueAddressVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueAddressVerification_organizationId_product_tenantK_key" ON "CatalogueAddressVerification"("organizationId", "product", "tenantKey", "externalId");
