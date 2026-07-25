-- SAP Operations middleware — per-Organization SAP connection keystone.
-- Adds the SapConnection table so the middleware can point at each client's own
-- SAP tenant instead of the single shared {PREFIX}_* env connection. Secrets are
-- sealed application-side (AES-256-GCM); only ciphertext is stored here.
--
-- Non-destructive: creates one new table + FK to Organization. No existing table
-- is altered. Equivalent to `prisma migrate dev --name sap_connection_keystone`.

-- CreateTable
CREATE TABLE "SapConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "oauthTokenUrl" TEXT,
    "secretsCiphertext" TEXT NOT NULL,
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "apiPath" TEXT,
    "timeoutMs" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SapConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SapConnection_organizationId_product_idx" ON "SapConnection"("organizationId", "product");

-- CreateIndex
CREATE INDEX "SapConnection_organizationId_isActive_idx" ON "SapConnection"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SapConnection_organizationId_product_key_key" ON "SapConnection"("organizationId", "product", "key");

-- AddForeignKey
ALTER TABLE "SapConnection" ADD CONSTRAINT "SapConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
