-- Tenant service discovery and registration from EDMX (roadmap P1.2).
--
-- Three additive changes:
--
--   TenantServiceListing      the services a connection's SAP Gateway catalogue
--                             listed when a builder last read it from Discover
--                             (lib/sap-public/tenant-discovery.ts). One row per
--                             organisation and connection, replaced by each
--                             listing, removed with its connection. It holds no
--                             credential, host or URL.
--   ContractSnapshot.origin   how a contract's description reached CoreEdge:
--                             VERIFY, CAPTURE or UPLOAD (lib/contracts/upload.ts).
--                             Null on rows recorded before this migration.
--   Interface.apiPolicySignOff
--                             the SAP API Policy §1.2 sign-off for a customer-built
--                             service on S/4HANA Cloud Public Edition
--                             (lib/studio/api-policy.ts). Null: none recorded.
--
-- NOTHING STOPS ON DEPLOY: a new, empty table and two nullable columns with no
-- default (catalogue changes, no table rewrite). No backfill: a snapshot
-- recorded before this has no origin and is shown as it always was; no
-- interface has a sign-off until a builder records one, and the default mode
-- (COREEDGE_API_POLICY_SIGNOFF=observe) refuses nothing without one.
--
-- Backout: backout.sql beside this file.

-- AlterTable
ALTER TABLE "ContractSnapshot" ADD COLUMN     "origin" TEXT;

-- AlterTable
ALTER TABLE "Interface" ADD COLUMN     "apiPolicySignOff" JSONB;

-- CreateTable
CREATE TABLE "TenantServiceListing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "connectionRevision" INTEGER NOT NULL,
    "product" TEXT NOT NULL,
    "listedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listedById" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "catalogueStatus" TEXT NOT NULL,
    "v4Status" TEXT,
    "entryCount" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "entries" JSONB NOT NULL,

    CONSTRAINT "TenantServiceListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantServiceListing_organizationId_connectionId_key" ON "TenantServiceListing"("organizationId", "connectionId");

-- AddForeignKey
ALTER TABLE "TenantServiceListing" ADD CONSTRAINT "TenantServiceListing_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SapConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
