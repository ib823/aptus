-- Credential hygiene (P0.11): key prefixes and the rotation overlap.
--
-- tokenPrefix records which prefix the row's current token was minted with:
-- `ce_live_` (PROD) or `ce_test_` (every other environment) from P0.11 on.
-- Every existing row was minted as a plain `ce_` key, which is exactly what
-- the default says, so the column needs no backfill. It can go stale in one
-- case: after a code rollback, the code before P0.11 re-keys a row (a plain
-- `ce_` token) without writing this column, so the screens show the old
-- `ce_live_`/`ce_test_` prefix until the next rotation. Authentication never
-- reads it. The runbook's Rollback section has the tidy-up
-- (docs/runbooks/coreedge-credential-hygiene.md).
--
-- previousTokenHash and previousValidUntil hold the key a rotation replaced,
-- for the overlap window. Both start NULL on every row: no existing key has a
-- previous key, which is the truth. The unique index is what lets
-- authentication look a row up by the previous hash in one indexed equality,
-- the same way it looks up the current one.
--
-- overlapForTokenHash binds the overlap to the key change that opened it: it
-- is the tokenHash written in the same update, and the previous key is
-- accepted only while it still equals tokenHash. That is what makes a code
-- rollback safe in both directions: the code before P0.11 never writes these
-- columns, so a rotation or a revoke-then-reissue made under it changes
-- tokenHash beside a window it cannot see, and the roll-forward then finds
-- the window unbound and refuses the replaced key (ROTATED_OUT) instead of
-- bringing it back.
--
-- NOTHING STOPS ON DEPLOY. Adding a column with a constant default is a
-- metadata-only change in PostgreSQL 11+, and the index is built over a column
-- that is NULL on every row. The code running before the deploy never reads
-- the new columns: existing keys, including those with no expiry, keep
-- authenticating exactly as before. Mandatory expiry applies only to keys
-- issued or rotated after the deploy (COREEDGE_KEY_EXPIRY,
-- docs/runbooks/coreedge-credential-hygiene.md).

-- AlterTable
ALTER TABLE "SolutionClient" ADD COLUMN     "overlapForTokenHash" TEXT,
ADD COLUMN     "previousTokenHash" TEXT,
ADD COLUMN     "previousValidUntil" TIMESTAMP(3),
ADD COLUMN     "tokenPrefix" TEXT NOT NULL DEFAULT 'ce_';

-- CreateIndex
CREATE UNIQUE INDEX "SolutionClient_previousTokenHash_key" ON "SolutionClient"("previousTokenHash");

-- RetiredClientToken (wave 1a final review): the hash of every key a row
-- drops from tokenHash and previousTokenHash, written in the same update, so
-- a call with a key that was revoked and re-issued, or rotated twice, resolves
-- to its row and is refused as REVOKED or ROTATED_OUT instead of UNKNOWN_TOKEN
-- (an unknown key spends its caller address's failed-lookup bucket, and one
-- tenant's dead key behind a shared egress then locked every other tenant's
-- valid key out). A new, empty table: nothing existing reads or changes. Keys
-- the code before this deploy dropped were not recorded and stay unknown.
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
