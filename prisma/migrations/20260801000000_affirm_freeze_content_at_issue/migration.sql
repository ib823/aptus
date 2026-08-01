-- Freeze question content onto the bundle at issue.
--
-- Question wording lives on the global AffirmQuestion bank, so an edit in any
-- bundle's editor rewrote that question for every bundle using it — including
-- bundles already issued and already answered by a client. These columns give
-- each bundle its own copy from the moment it is issued.
--
-- NULL means "not frozen" (still a draft, reads live from the bank).

ALTER TABLE "AffirmBundleQuestion"
  ADD COLUMN "frozenWording" TEXT,
  ADD COLUMN "frozenAboutText" TEXT,
  ADD COLUMN "frozenStandardMeans" TEXT,
  ADD COLUMN "frozenAt" TIMESTAMP(3);

-- Back-fill bundles that are ALREADY past draft. Their content is currently
-- whatever the bank happens to say today, which is the best evidence available
-- — but leaving them NULL would keep them exposed to every future bank edit,
-- and these are exactly the bundles a client has already answered.
UPDATE "AffirmBundleQuestion" AS bq
SET
  "frozenWording" = COALESCE(q."consultantWording", q."plainLanguageSuggested"),
  "frozenAboutText" = q."aboutText",
  "frozenStandardMeans" = q."standardMeans",
  "frozenAt" = COALESCE(b."issuedAt", b."updatedAt")
FROM "AffirmQuestion" AS q, "AffirmBundle" AS b
WHERE bq."questionId" = q."id"
  AND bq."bundleId" = b."id"
  AND b."state" <> 'draft';
