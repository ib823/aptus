-- AlterTable: add per-assessment client brand-accent override (spec §5.7).
-- Hex color (e.g. "#003DA5") used by the report bundle for chart accents only.
-- The Aptus solution brand identity (mark, cover band, table headers) is locked
-- and never inherits this override.
ALTER TABLE "Assessment" ADD COLUMN "clientAccent" TEXT;
