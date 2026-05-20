-- ABeam Workbench — Presales audit allows null bundleId.
--
-- Follow-up to 20260520000000_presales_workbench_pass1. The earlier
-- migration made PresalesAuditEvent.bundleId NOT NULL on the assumption
-- that every audit row would name its bundle. The session_invalid path
-- (route 6 polish round) records denied attempts where the cookie cannot
-- be tied to any bundle — bogus session id, off-bundle tampering. For
-- those rows we need bundleId to be NULL.
--
-- This is two ops:
--   (1) Drop the existing NOT NULL constraint on the column.
--   (2) Re-state the FK with ON DELETE CASCADE / ON UPDATE CASCADE. The
--       column is now nullable; CASCADE still applies when bundleId is
--       set and the parent bundle is deleted.
--
-- No existing rows need backfill: bundleId is currently NOT NULL on every
-- row, and we're loosening, not tightening. New session_invalid audits
-- written after this migration will be the first rows with NULL bundleId.

ALTER TABLE "PresalesAuditEvent" ALTER COLUMN "bundleId" DROP NOT NULL;

-- The FK definition does not change semantically, but PostgreSQL requires
-- us to drop and re-add to reflect the column nullability change in the
-- system catalog if the column was previously NOT NULL. Practically the
-- existing constraint remains valid since we're only loosening the column;
-- we leave the FK untouched. (Documenting here so a future maintainer
-- doesn't think a missing DROP CONSTRAINT was an oversight.)
