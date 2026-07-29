-- Provenance for recorded runs.
--
-- A fixture carried only {scenario, status, body}, so a genuine empty read and
-- one recorded while the Test Console was reporting a tenant's 403 as success
-- were byte-identical. Nothing could target the bad ones. Both columns are
-- NULLABLE and the null is meaningful: it marks a record written before the
-- product could evidence its own output, which is not the same as a record
-- known to be wrong.

ALTER TABLE "MockFixture" ADD COLUMN "sourceStatus" INTEGER;
ALTER TABLE "TestCase" ADD COLUMN "httpStatus" INTEGER;
