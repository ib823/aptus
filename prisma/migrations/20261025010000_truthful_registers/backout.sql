-- Backout for 20261025010000_truthful_registers (P0.3).
--
-- In this file, not in migration.sql, because an applied migration is never
-- edited (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code before P0.3, which
-- never reads or writes these columns. What it loses: the import time of each
-- catalogue row (Catalogue Health before P0.3 judges from "updatedAt" again,
-- as it did) and the last four characters of each key minted since the deploy
-- (the console before P0.3 shows the label's tail again, as it did). Neither
-- is a credential, and no call path reads either. Dropping them is never
-- needed for safety: the code before P0.3 ignores both columns.
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261025010000_truthful_registers
ALTER TABLE "SolutionClient" DROP COLUMN "tokenTail";
ALTER TABLE "SapHubContent" DROP COLUMN "importedAt";
