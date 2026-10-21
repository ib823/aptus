-- Backout for 20261025000000_lane_check_evidence_key (P0.2).
--
-- In this file, not in migration.sql, because an applied migration is never
-- edited (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Run it only after the deployment is rolled back to code before P0.2, which
-- never reads or writes these columns. What it loses: which dataset and feed
-- version each lane check was made against, and each connection's settings
-- revision; the checks and the connections themselves stay. The code before
-- P0.2 does not compare them, so nothing it shows changes. Dropping them is
-- never needed for safety: the code before P0.2 ignores them, and the
-- revision's default lets that code insert connections without naming it.
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261025000000_lane_check_evidence_key
ALTER TABLE "LaneCheck" DROP COLUMN "interfaceVersion",
DROP COLUMN "entitySet";
ALTER TABLE "SapConnection" DROP COLUMN "revision";
