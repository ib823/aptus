-- P0.10 envelope encryption for SAP secrets: one wrapped data key per
-- organization and data-key version.
--
-- Additive only: a new table and its indexes. No existing column, row or
-- constraint changes, so the code already running in production is unaffected.
-- The table stays empty until an operator names an active master key
-- (SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY); with only the legacy
-- SAP_CONNECTION_ENCRYPTION_KEY set, nothing reads or writes it.

-- CreateTable
CREATE TABLE "OrgDataKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'env',
    "keyVersion" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "OrgDataKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgDataKey_keyVersion_idx" ON "OrgDataKey"("keyVersion");

-- CreateIndex
CREATE UNIQUE INDEX "OrgDataKey_organizationId_version_key" ON "OrgDataKey"("organizationId", "version");

-- AddForeignKey
ALTER TABLE "OrgDataKey" ADD CONSTRAINT "OrgDataKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
