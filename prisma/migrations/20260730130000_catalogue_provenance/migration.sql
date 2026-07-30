-- Catalogue provenance: two columns the importers held in memory and dropped.
--
-- SapHubContent.illustrative — the seed file flags all 36 of its rows
-- `illustrative: true`; the import dropped the flag, so repo-authored
-- placeholders rendered exactly like SAP-published catalogue content. Same
-- defect class already fixed for MockFixture.sourceStatus.
--
-- SapApiReference.productTags — SAP's product tag string, verbatim. The
-- importer derived the edition booleans from it and threw it away, leaving
-- the 321 Ariba/SuccessFactors rows (correctly no edition — they are not
-- S/4 editions) with no stored product identity: unreachable by any query.
--
-- Both NULLABLE ON PURPOSE, and NULL is the truth: a row imported before
-- these columns existed has UNRECORDED provenance, which is not the same as
-- "real" (illustrative false) or "no tags" (empty string). Re-running the
-- idempotent importers fills both with what the source files actually say.
ALTER TABLE "SapHubContent" ADD COLUMN "illustrative" BOOLEAN;
ALTER TABLE "SapApiReference" ADD COLUMN "productTags" TEXT;
