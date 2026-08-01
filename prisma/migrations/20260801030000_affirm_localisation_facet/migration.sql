-- Country and industry facets for affirm-set selection.
--
-- A Malaysia-scoped bundle (company codes 5410/5430, MYR, step lists headed
-- "Mandatory Malaysia process steps") asked the client to affirm L2-115
-- ("This is CZ specific requirement" — Czech MT940 mapping) and L2-113/L2-114
-- ("Localized for AT"), where L2-114's SSCUI is actually the Uruguayan D.G.I.
-- document-type mapping. There was no country facet to filter on.
--
-- EMPTY ARRAY MEANS UNIVERSAL. Only 3 of 150 questions carry a country marker,
-- so exceptions are tagged rather than the bank being curated end to end.

ALTER TABLE "AffirmQuestion"
  ADD COLUMN "countryScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "industryScope" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "AffirmBundle"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "industry" TEXT;

-- The three known localisation-bound questions, sourced from their own text:
--   L2-113  aboutText "Localized for AT(...)"                    -> AT
--   L2-114  aboutText says "Localized for AT (... Austrian ...)" but the SSCUI
--           is "Assign Official D.G.I. Document Types", which is Uruguayan.
--           Tagged to BOTH so it stops reaching every other country while a
--           human resolves which it really is. The CI detector flags it.
--   L2-115  aboutText "This is CZ specific requirement ..."      -> CZ
UPDATE "AffirmQuestion" SET "countryScope" = ARRAY['AT']       WHERE "id" = 'L2-113';
UPDATE "AffirmQuestion" SET "countryScope" = ARRAY['AT', 'UY'] WHERE "id" = 'L2-114';
UPDATE "AffirmQuestion" SET "countryScope" = ARRAY['CZ']       WHERE "id" = 'L2-115';

-- Every existing bundle is Malaysian: the shipped process-flow dataset is
-- meta.country = "MY" throughout, and the tenant data is MYR / 5410 / 5430.
UPDATE "AffirmBundle" SET "country" = 'MY' WHERE "country" IS NULL;
