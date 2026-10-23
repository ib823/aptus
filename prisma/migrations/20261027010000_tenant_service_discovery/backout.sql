-- Backout for 20261027010000_tenant_service_discovery (P1.2).
--
-- In this file, not in migration.sql, because an applied migration is never
-- edited (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code that never reads
-- the table or the columns. What it loses: every stored tenant service listing
-- (Discover reads the tenant again on the next "Read the service list"), which
-- snapshots were recorded from an uploaded file (they read as compiled from a
-- description, as before P1.2), and every recorded §1.2 sign-off (their
-- POLICY_SIGN_OFF ConfigAudit rows stay, so who signed what is not lost).
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261027010000_tenant_service_discovery
DROP TABLE IF EXISTS "TenantServiceListing";
ALTER TABLE "Interface" DROP COLUMN IF EXISTS "apiPolicySignOff";
ALTER TABLE "ContractSnapshot" DROP COLUMN IF EXISTS "origin";
