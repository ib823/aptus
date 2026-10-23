-- ContractSnapshot (P1.3, Contract Compiler).
--
-- One immutable, compiled contract of an interface: the Contract IR slice of
-- its dataset, its content hash and semantic version, and whether it came from
-- the service's own $metadata or from sampled rows. Written by the
-- verify-service route and by a schema capture; read by the starter kit, the
-- per-solution OpenAPI and the northbound /schema route.
--
-- NOTHING STOPS ON DEPLOY: a new, empty table. Every reader treats "no
-- snapshot" as today's behaviour (the sampled schema, or the open shape), so
-- interfaces verified before this deploy keep their current contract until
-- they are verified again.
--
-- Backout: DROP TABLE "ContractSnapshot";

-- CreateTable
CREATE TABLE "ContractSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "interfaceVersion" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "entitySet" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "odataVersion" TEXT NOT NULL,
    "semver" TEXT NOT NULL,
    "semverMajor" INTEGER NOT NULL,
    "semverMinor" INTEGER NOT NULL,
    "semverPatch" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "ir" JSONB NOT NULL,
    "irVersion" INTEGER NOT NULL,
    "diff" JSONB,
    "environment" TEXT,
    "connectionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractSnapshot_organizationId_interfaceId_createdAt_idx" ON "ContractSnapshot"("organizationId", "interfaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSnapshot_interfaceId_semverMajor_semverMinor_semver_key" ON "ContractSnapshot"("interfaceId", "semverMajor", "semverMinor", "semverPatch");

-- AddForeignKey
ALTER TABLE "ContractSnapshot" ADD CONSTRAINT "ContractSnapshot_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "Interface"("id") ON DELETE CASCADE ON UPDATE CASCADE;

