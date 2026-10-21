-- Backout for 20261022010000_credential_hygiene (P0.11), written by P0.17.
--
-- In this file, not in migration.sql, because that migration was already
-- applied to a preview database and an applied migration is never edited
-- (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code before P0.11: the
-- P0.11 code reads and writes every one of these columns. What it loses: the
-- prefix each key was minted with (the old code's screens never show it) and
-- any open rotation overlap (the old code never honours one). Keys keep
-- authenticating: tokenHash is untouched.
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261022010000_credential_hygiene
DROP INDEX "SolutionClient_previousTokenHash_key";
ALTER TABLE "SolutionClient" DROP COLUMN "overlapForTokenHash",
DROP COLUMN "previousTokenHash",
DROP COLUMN "previousValidUntil",
DROP COLUMN "tokenPrefix";
