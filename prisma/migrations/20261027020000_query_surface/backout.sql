-- Backout for 20261027020000_query_surface (P1.4).
--
-- In this file, not in migration.sql, because an applied migration is never edited
-- (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to a build from before this migration merged.
-- The guard deployment and every later one reference these columns, with COREEDGE_QUERY_SURFACE
-- on or off: the access-load statement names "queryPolicyCompiled" and "queryPolicy" on every
-- call, and the audit insert returns every audit column. Run against such a build, every /data,
-- /schema, write and console call fails with "column does not exist". So a backout also gives up
-- the N14 guard: on a build from before this migration, query parameters are ignored, not refused.
-- What it loses: every interface's query policy, basis and compiled form (builders save the policy
-- again; a re-verify rewrites the basis), and the query metadata of audit rows written since the
-- deploy (the rows themselves stay).
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261027020000_query_surface
ALTER TABLE "NorthboundAuditEvent" DROP COLUMN "queryKind", DROP COLUMN "queryShape", DROP COLUMN "queryHash",
  DROP COLUMN "requestedFields", DROP COLUMN "queryPolicyRev", DROP COLUMN "cursorChainId", DROP COLUMN "pageIndex",
  DROP COLUMN "chainRows", DROP COLUMN "responseBytes", DROP COLUMN "queryRule", DROP COLUMN "queryFlags";
ALTER TABLE "Interface" DROP COLUMN "queryPolicy", DROP COLUMN "queryBasis", DROP COLUMN "queryPolicyCompiled",
  DROP COLUMN "queryPolicyRevision";
