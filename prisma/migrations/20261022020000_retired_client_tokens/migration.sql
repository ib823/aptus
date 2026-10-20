-- RetiredClientToken (P0.11, wave 1a final review).
--
-- Its own migration because 20261022010000_credential_hygiene had already been
-- applied to a preview database, and Prisma never re-runs an applied migration.
--
-- The hash of every key a SolutionClient row drops from tokenHash and
-- previousTokenHash, written in the same update. A call with a key that was
-- revoked and re-issued, or rotated twice, then resolves to its row and is
-- refused as REVOKED or ROTATED_OUT instead of UNKNOWN_TOKEN. An unknown key
-- spends its caller address's failed-lookup bucket, so one tenant's dead key
-- behind a shared egress used to lock every other tenant's valid key out.
--
-- NOTHING STOPS ON DEPLOY: a new, empty table that nothing existing reads.
-- Keys the code before this deploy dropped were not recorded and stay unknown.
--
-- Backout: DROP TABLE "RetiredClientToken";

-- CreateTable
CREATE TABLE "RetiredClientToken" (
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredClientToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "RetiredClientToken_clientId_idx" ON "RetiredClientToken"("clientId");

-- CreateIndex
CREATE INDEX "RetiredClientToken_organizationId_idx" ON "RetiredClientToken"("organizationId");

-- AddForeignKey
ALTER TABLE "RetiredClientToken" ADD CONSTRAINT "RetiredClientToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "SolutionClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
