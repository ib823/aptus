-- Northbound API versioning (roadmap P1.10).
--
-- Two nullable columns on the broker's call log: which dated version of the
-- northbound API served the call ("2026-10"), and which base path it came in
-- on ("/api/northbound/v1" or the original "/api/northbound", one
-- implementation). The route stamps them in the insert it already makes.
--
-- NOTHING STOPS ON DEPLOY: nullable, no default and no backfill, so the
-- ALTER is a catalogue change with no table rewrite. Rows written before it
-- stay NULL (no version had been named), and a build from before this
-- migration simply does not write the columns.
--
-- Backout: ALTER TABLE "NorthboundAuditEvent" DROP COLUMN "apiVersion", DROP COLUMN "apiBasePath";

-- AlterTable
ALTER TABLE "NorthboundAuditEvent" ADD COLUMN     "apiBasePath" TEXT,
ADD COLUMN     "apiVersion" TEXT;
