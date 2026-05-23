-- ABeam Workbench v2.1: per-question SAP default format.
--
-- Seeded from Standard-Answer-Layer.xlsx (137 Decision + 13
-- Information today). Materialised onto AffirmBundleQuestion.format
-- at editor-first-render so the consultant can override per bundle
-- without touching the question bank.

ALTER TABLE "AffirmQuestion"
  ADD COLUMN "format" TEXT NOT NULL DEFAULT 'decision';
