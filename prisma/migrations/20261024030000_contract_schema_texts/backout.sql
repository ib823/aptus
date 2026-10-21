-- Backout for 20261024030000_contract_schema_texts (P1.3).
--
-- In this file, not in migration.sql, because an applied migration is never
-- edited (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code that never reads
-- the columns or the table. What it loses: the rendered /schema texts (a
-- re-verify renders them again) and the organisations' compiler time for
-- the day (the allowance starts again from zero).
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261024030000_contract_schema_texts
DROP TABLE "ContractTime";
ALTER TABLE "ContractSnapshot" DROP COLUMN "schemasText", DROP COLUMN "createBodyText", DROP COLUMN "updateBodyText", DROP COLUMN "schemaTextsVersion";
