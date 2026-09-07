-- 2608 WS15 — persist the country matrix the parser has always read.
--
-- sap-references/2608/Availability_Dependencies_EN_XX.xlsx, sheet "Scope",
-- header row 2, carries SIXTY ISO country columns. Since WS1.2,
-- parseAvailabilityDependencies() has read every one of them into
-- AdScopeItem.countries. load-2608-scope.ts then persisted exactly one:
--
--   country: r.ad?.availableInMy ? "MY" : "XX",
--   availableInMy: r.ad ? r.ad.availableInMy : null,
--
-- Fifty-nine countries' availability was parsed and discarded one statement
-- before the database. Measured on the file in this repository:
--
--   distinct scope items   679
--   available in MY        623   (exactly what aptus persisted)
--   available in PH        625
--   PH but not MY            7   1WQ 2OO 5VX 5VY 5VZ 5YU 5YV
--   MY but not PH            5   3F7 7EZ 7G4 7G5 BH3
--
-- Additive. availableInMy and myAvailableSince are untouched, so every
-- pre-WS15 consumer keeps working; a RECON fact holds availableInMy equal to
-- countries @> ARRAY['MY'] so the two cannot drift apart.
--
-- The GIN index is what makes `countries has 'PH'` use an index at all.
-- Prisma's `has` emits @>, which GIN serves; = ANY() would not.

ALTER TABLE "ScopeItem" ADD COLUMN "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ScopeItem" ADD COLUMN "countryAvailability" JSONB;

CREATE INDEX "ScopeItem_countries_idx" ON "ScopeItem" USING GIN ("countries");

-- Seed the list from what is already known, so a database that is not
-- re-loaded still answers "is this available in MY?" from the new column.
-- The other 59 countries need `pnpm sap:2608:load-scope` to be re-run; until
-- then a row carries MY or nothing, which is the truth about what was stored.
UPDATE "ScopeItem"
   SET "countries" = ARRAY['MY']
 WHERE "availableInMy" IS TRUE
   AND cardinality("countries") = 0;
