-- 2608 WS14 — an engagement's country footprint is a list, not a country.
--
-- AffirmBundle.country (singular) stays exactly as it is: it drives the
-- AffirmQuestion.countryScope filter and nothing here touches that. This adds
-- the footprint the To-Be pack needs, because SAP publishes process steps per
-- country and a group with entities in two countries has two footprints:
--
--   steps reaching MY   14,365 over 477 scope items
--   steps reaching PH   13,988 over 478 scope items
--
-- Additive. No column is dropped, no default changed, and the backfill below
-- seeds the list from the singular column so existing bundles keep meaning
-- what they meant.

ALTER TABLE "AffirmBundle" ADD COLUMN "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "AffirmBundle"
   SET "countries" = ARRAY["country"]
 WHERE "country" IS NOT NULL
   AND "country" <> ''
   AND cardinality("countries") = 0;
