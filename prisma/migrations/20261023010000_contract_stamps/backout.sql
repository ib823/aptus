-- Backout for 20261023010000_contract_stamps (P0.4), written by P0.17.
--
-- In this file, not in migration.sql, because an applied migration is never
-- edited (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code before P0.4, which
-- never reads these columns. The stamps the backfill wrote inside
-- "Interface"."responseSchema" (x-captured.interfaceVersion and .entitySet)
-- are left in place on purpose: the code before P0.4 ignores unknown keys in
-- x-captured, and after a roll-forward a stamp still names the contract the
-- capture was read under, which stays true. A capture the old code replaces
-- loses its stamp with it, and the re-applied migration stamps it again.
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261023010000_contract_stamps
ALTER TABLE "MockFixture" DROP COLUMN "entitySet",
DROP COLUMN "interfaceVersion";
