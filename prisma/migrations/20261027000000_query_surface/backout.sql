-- Backout for 20261027000000_query_surface (P1.4).
--
-- In this file, not in migration.sql, because an applied migration is never edited
-- (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code that never reads these columns.
-- What it loses: every interface's query policy, basis and compiled form (builders save the policy
-- again; a re-verify rewrites the basis), and the query metadata of audit rows written since the
-- deploy (the rows themselves stay).
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261027000000_query_surface
ALTER TABLE "NorthboundAuditEvent" DROP COLUMN "queryKind", DROP COLUMN "queryShape", DROP COLUMN "queryHash",
  DROP COLUMN "requestedFields", DROP COLUMN "queryPolicyRev", DROP COLUMN "cursorChainId", DROP COLUMN "pageIndex",
  DROP COLUMN "chainRows", DROP COLUMN "responseBytes", DROP COLUMN "queryRule", DROP COLUMN "queryFlags";
ALTER TABLE "Interface" DROP COLUMN "queryPolicy", DROP COLUMN "queryBasis", DROP COLUMN "queryPolicyCompiled",
  DROP COLUMN "queryPolicyRevision";
