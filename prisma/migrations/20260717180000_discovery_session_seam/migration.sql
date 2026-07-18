-- ABeam Workbench — Neutral Process Discovery session seam (PR-5).
--
-- Additive columns on DiscoveryEngagement, a table this build introduced in
-- PR-2a. Every column is nullable or has a default, so this is non-destructive:
-- existing rows keep working and read as "unscoped, not projecting".
--
-- The invariant is "no migrations that ALTER EXISTING tables" — meaning the
-- shipped Affirm / presales / portal tables. DiscoveryEngagement is ours, and a
-- new column added by a later PR is the normal way to grow it. Amending PR-2a's
-- migration instead would rewrite an already-reviewed migration.

-- AlterTable
ALTER TABLE "DiscoveryEngagement" ADD COLUMN     "valueStreamIds" TEXT[],
ADD COLUMN     "liveAt" TIMESTAMP(3),
ADD COLUMN     "drivenProcessId" TEXT,
ADD COLUMN     "drivenAt" TIMESTAMP(3);
