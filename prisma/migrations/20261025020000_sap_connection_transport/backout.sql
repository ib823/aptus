-- Backout for 20261025020000_sap_connection_transport (P0.14).
--
-- In this file, not in migration.sql, because an applied migration is never
-- edited (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code before P0.14, which
-- never reads the column. What it loses: nothing anyone set, because nothing
-- in the product writes a value other than the default DIRECT. Dropping it is
-- never needed for safety: every row is DIRECT, which is today's behaviour.
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261025020000_sap_connection_transport
ALTER TABLE "SapConnection" DROP COLUMN "transport";
DROP TYPE "SapTransport";
