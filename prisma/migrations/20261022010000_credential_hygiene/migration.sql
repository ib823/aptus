-- Credential hygiene (P0.11): key prefixes and the rotation overlap.
--
-- tokenPrefix records which prefix the row's current token was minted with:
-- `ce_live_` (PROD) or `ce_test_` (every other environment) from P0.11 on.
-- Every existing row was minted as a plain `ce_` key, which is exactly what
-- the default says, so the column needs no backfill and is never wrong.
--
-- previousTokenHash and previousValidUntil hold the key a rotation replaced,
-- for the overlap window. Both start NULL on every row: no existing key has a
-- previous key, which is the truth. The unique index is what lets
-- authentication look a row up by the previous hash in one indexed equality,
-- the same way it looks up the current one.
--
-- NOTHING STOPS ON DEPLOY. Adding a column with a constant default is a
-- metadata-only change in PostgreSQL 11+, and the index is built over a column
-- that is NULL on every row. The running code never reads the new columns:
-- existing keys, including those with no expiry, keep authenticating exactly
-- as before. Mandatory expiry applies only to keys issued or rotated after
-- the deploy (COREEDGE_KEY_EXPIRY, docs/runbooks/coreedge-credential-hygiene.md).

-- AlterTable
ALTER TABLE "SolutionClient" ADD COLUMN     "previousTokenHash" TEXT,
ADD COLUMN     "previousValidUntil" TIMESTAMP(3),
ADD COLUMN     "tokenPrefix" TEXT NOT NULL DEFAULT 'ce_';

-- CreateIndex
CREATE UNIQUE INDEX "SolutionClient_previousTokenHash_key" ON "SolutionClient"("previousTokenHash");
